// store.js — local data layer. All money amounts are stored as integer cents.
// Each record carries { id, updatedAt, deleted } so records can be merged
// safely (last-write-wins) when syncing between devices.

const STORAGE_KEY = 'budgetapp:data:v1';
const SCHEMA_VERSION = 1;

const DEFAULT_CATEGORIES = [
  { name: 'Groceries', icon: '🛒', monthlyBudget: 0 },
  { name: 'Dining Out', icon: '🍽️', monthlyBudget: 0 },
  { name: 'Transportation', icon: '⛽', monthlyBudget: 0 },
  { name: 'Housing', icon: '🏠', monthlyBudget: 0 },
  { name: 'Utilities', icon: '💡', monthlyBudget: 0 },
  { name: 'Health', icon: '💊', monthlyBudget: 0 },
  { name: 'Entertainment', icon: '🎬', monthlyBudget: 0 },
  { name: 'Shopping', icon: '🛍️', monthlyBudget: 0 },
  { name: 'Subscriptions', icon: '🔁', monthlyBudget: 0 },
  { name: 'Income', icon: '💰', monthlyBudget: 0 },
  { name: 'Other', icon: '✨', monthlyBudget: 0 },
];

function uuid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function nowISO() {
  return new Date().toISOString();
}

function emptyData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    accounts: [],
    categories: [],
    transactions: [],
    meta: { lastModified: nowISO(), deviceLabel: guessDeviceLabel() },
  };
}

function guessDeviceLabel() {
  const ua = navigator.userAgent || '';
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Mac/.test(ua)) return 'Mac';
  return 'Device';
}

function seedDefaults(data) {
  const t = nowISO();
  data.accounts.push({
    id: uuid(), name: 'My Account', type: 'checking', startingBalanceCents: 0,
    updatedAt: t, deleted: false,
  });
  DEFAULT_CATEGORIES.forEach((c) => {
    data.categories.push({
      id: uuid(), name: c.name, icon: c.icon, monthlyBudgetCents: c.monthlyBudget,
      updatedAt: t, deleted: false,
    });
  });
  return data;
}

class Store extends EventTarget {
  constructor() {
    super();
    this.data = this._load();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const seeded = seedDefaults(emptyData());
        this._persist(seeded);
        return seeded;
      }
      const parsed = JSON.parse(raw);
      if (!parsed.accounts) parsed.accounts = [];
      if (!parsed.categories) parsed.categories = [];
      if (!parsed.transactions) parsed.transactions = [];
      if (!parsed.meta) parsed.meta = { lastModified: nowISO() };
      return parsed;
    } catch (e) {
      console.error('Failed to load local data, starting fresh.', e);
      return seedDefaults(emptyData());
    }
  }

  _persist(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  /** Save current in-memory data to localStorage and notify listeners. */
  save({ silent = false } = {}) {
    this.data.meta.lastModified = nowISO();
    this._persist(this.data);
    if (!silent) this.dispatchEvent(new CustomEvent('change'));
  }

  // ---------- Accounts ----------
  listAccounts() { return this.data.accounts.filter((a) => !a.deleted); }
  getAccount(id) { return this.data.accounts.find((a) => a.id === id); }
  upsertAccount(fields) {
    let rec = fields.id ? this.data.accounts.find((a) => a.id === fields.id) : null;
    if (!rec) {
      rec = { id: uuid(), deleted: false };
      this.data.accounts.push(rec);
    }
    Object.assign(rec, fields, { updatedAt: nowISO() });
    this.save();
    return rec;
  }
  deleteAccount(id) {
    const rec = this.data.accounts.find((a) => a.id === id);
    if (rec) { rec.deleted = true; rec.updatedAt = nowISO(); this.save(); }
  }
  accountBalanceCents(id) {
    const acc = this.getAccount(id);
    if (!acc) return 0;
    let total = acc.startingBalanceCents || 0;
    for (const t of this.data.transactions) {
      if (t.deleted || t.accountId !== id) continue;
      total += t.type === 'income' ? t.amountCents : -t.amountCents;
    }
    return total;
  }

  // ---------- Categories ----------
  listCategories() { return this.data.categories.filter((c) => !c.deleted); }
  getCategory(id) { return this.data.categories.find((c) => c.id === id); }
  upsertCategory(fields) {
    let rec = fields.id ? this.data.categories.find((c) => c.id === fields.id) : null;
    if (!rec) {
      rec = { id: uuid(), deleted: false };
      this.data.categories.push(rec);
    }
    Object.assign(rec, fields, { updatedAt: nowISO() });
    this.save();
    return rec;
  }
  deleteCategory(id) {
    const rec = this.data.categories.find((c) => c.id === id);
    if (rec) { rec.deleted = true; rec.updatedAt = nowISO(); this.save(); }
  }

  // ---------- Transactions ----------
  listTransactions({ month = null, accountId = null, categoryId = null } = {}) {
    return this.data.transactions
      .filter((t) => !t.deleted)
      .filter((t) => !month || t.date.slice(0, 7) === month)
      .filter((t) => !accountId || t.accountId === accountId)
      .filter((t) => !categoryId || t.categoryId === categoryId)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.updatedAt || '').localeCompare(a.updatedAt || '')));
  }
  getTransaction(id) { return this.data.transactions.find((t) => t.id === id); }
  upsertTransaction(fields) {
    let rec = fields.id ? this.data.transactions.find((t) => t.id === fields.id) : null;
    if (!rec) {
      rec = { id: uuid(), deleted: false };
      this.data.transactions.push(rec);
    }
    Object.assign(rec, fields, { updatedAt: nowISO() });
    this.save();
    return rec;
  }
  deleteTransaction(id) {
    const rec = this.data.transactions.find((t) => t.id === id);
    if (rec) { rec.deleted = true; rec.updatedAt = nowISO(); this.save(); }
  }

  // ---------- Aggregates ----------
  monthTotals(month) {
    let income = 0, expense = 0;
    for (const t of this.data.transactions) {
      if (t.deleted || t.date.slice(0, 7) !== month) continue;
      if (t.type === 'income') income += t.amountCents; else expense += t.amountCents;
    }
    return { income, expense, net: income - expense };
  }
  categorySpend(month) {
    const byCat = new Map();
    for (const t of this.data.transactions) {
      if (t.deleted || t.type !== 'expense' || t.date.slice(0, 7) !== month) continue;
      byCat.set(t.categoryId, (byCat.get(t.categoryId) || 0) + t.amountCents);
    }
    return byCat;
  }

  // ---------- Export / Import (for sync) ----------
  exportSnapshot() {
    return {
      schemaVersion: SCHEMA_VERSION,
      accounts: this.data.accounts,
      categories: this.data.categories,
      transactions: this.data.transactions,
      meta: { ...this.data.meta, exportedAt: nowISO() },
    };
  }

  /**
   * Merge an incoming snapshot (from another device) into local data.
   * Last-write-wins per record id, by `updatedAt`. Returns true if anything changed.
   */
  mergeSnapshot(incoming) {
    if (!incoming || typeof incoming !== 'object') return false;
    let changed = false;
    for (const key of ['accounts', 'categories', 'transactions']) {
      const incomingList = Array.isArray(incoming[key]) ? incoming[key] : [];
      const localList = this.data[key];
      const localById = new Map(localList.map((r) => [r.id, r]));
      for (const rec of incomingList) {
        if (!rec || !rec.id) continue;
        const existing = localById.get(rec.id);
        if (!existing) {
          localList.push(rec);
          localById.set(rec.id, rec);
          changed = true;
        } else if ((rec.updatedAt || '') > (existing.updatedAt || '')) {
          Object.assign(existing, rec);
          changed = true;
        }
      }
    }
    if (changed) this.save();
    return changed;
  }

  resetAll() {
    this.data = seedDefaults(emptyData());
    this.save();
  }
}

export const store = new Store();
export { uuid, nowISO };
