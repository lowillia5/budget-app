import { store } from '../store.js';
import { formatMoney, formatDayHeading, todayISO, dollarsToCents, centsToDollarsInput } from '../format.js';
import { openModal, closeModal, toast } from '../components.js';

export function renderTransactions(container, { month, refresh }) {
  const state = { accountId: '', categoryId: '' };

  function draw() {
    const txs = store.listTransactions({ month, accountId: state.accountId || null, categoryId: state.categoryId || null });
    const accounts = store.listAccounts();
    const categories = store.listCategories();

    const groups = new Map();
    for (const t of txs) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    }

    container.innerHTML = `
      <h1 class="page-title">Transactions</h1>
      <div class="filter-row">
        <select id="filter-account"><option value="">All accounts</option>
          ${accounts.map((a) => `<option value="${a.id}" ${a.id === state.accountId ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}
        </select>
        <select id="filter-category"><option value="">All categories</option>
          ${categories.map((c) => `<option value="${c.id}" ${c.id === state.categoryId ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div id="tx-list"></div>
    `;

    const listEl = container.querySelector('#tx-list');
    if (!txs.length) {
      listEl.innerHTML = `<div class="empty-state"><div class="emoji">🧾</div><p>No transactions this month.<br>Tap the + button to add one.</p></div>`;
    } else {
      const dates = Array.from(groups.keys()).sort().reverse();
      listEl.innerHTML = dates.map((date) => {
        const rows = groups.get(date).map((t) => rowHtml(t, accounts, categories)).join('');
        return `<div class="tx-day-heading">${formatDayHeading(date)}</div>${rows}`;
      }).join('');
      listEl.querySelectorAll('.tx-row').forEach((el) => {
        el.addEventListener('click', () => openTransactionForm({ id: el.dataset.id, month, onSaved: draw }));
      });
    }

    container.querySelector('#filter-account').addEventListener('change', (e) => { state.accountId = e.target.value; draw(); });
    container.querySelector('#filter-category').addEventListener('change', (e) => { state.categoryId = e.target.value; draw(); });
  }

  draw();
}

function rowHtml(t, accounts, categories) {
  const cat = categories.find((c) => c.id === t.categoryId);
  const acc = accounts.find((a) => a.id === t.accountId);
  const sign = t.type === 'income' ? '+' : '−';
  return `
    <div class="tx-row" data-id="${t.id}">
      <div class="cat-chip">${cat ? cat.icon : '✨'}</div>
      <div class="tx-main">
        <div class="tx-note">${escapeHtml(t.note || (cat ? cat.name : 'Transaction'))}</div>
        <div class="tx-meta">${cat ? escapeHtml(cat.name) : ''}${acc ? ' · ' + escapeHtml(acc.name) : ''}</div>
      </div>
      <div class="tx-amount ${t.type === 'income' ? 'income' : ''}">${sign}${formatMoney(t.amountCents)}</div>
    </div>`;
}

export function openTransactionForm({ id = null, month, onSaved }) {
  const existing = id ? store.getTransaction(id) : null;
  const accounts = store.listAccounts();
  const categories = store.listCategories();
  const type = existing ? existing.type : 'expense';

  if (!accounts.length) {
    toast('Add an account first (Accounts tab).');
    return;
  }

  openModal({
    title: existing ? 'Edit transaction' : 'Add transaction',
    bodyHtml: `
      <div class="segmented" id="type-seg">
        <button type="button" data-type="expense" class="${type === 'expense' ? 'active expense' : ''}">Expense</button>
        <button type="button" data-type="income" class="${type === 'income' ? 'active income' : ''}">Income</button>
      </div>
      <div class="hairline"></div>
      <div class="field">
        <label for="tx-amount">Amount</label>
        <input type="number" id="tx-amount" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${existing ? centsToDollarsInput(existing.amountCents) : ''}">
      </div>
      <div class="field">
        <label for="tx-date">Date</label>
        <input type="date" id="tx-date" value="${existing ? existing.date : (month === new Date().toISOString().slice(0,7) ? todayISO() : month + '-01')}">
      </div>
      <div class="field">
        <label for="tx-account">Account</label>
        <select id="tx-account">${accounts.map((a) => `<option value="${a.id}" ${existing && existing.accountId === a.id ? 'selected' : ''}>${escapeHtml(a.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label for="tx-category">Category</label>
        <select id="tx-category">${categories.map((c) => `<option value="${c.id}" ${existing && existing.categoryId === c.id ? 'selected' : ''}>${c.icon} ${escapeHtml(c.name)}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label for="tx-note">Note (optional)</label>
        <input type="text" id="tx-note" placeholder="e.g. Weekly groceries" value="${existing ? escapeAttr(existing.note || '') : ''}">
      </div>
      <div class="btn-group">
        <button type="button" class="btn btn-primary btn-block" id="tx-save">Save</button>
      </div>
      ${existing ? '<button type="button" class="btn btn-danger btn-block" id="tx-delete" style="margin-top:8px;">Delete</button>' : ''}
    `,
    onMount(root) {
      let currentType = type;
      const segBtns = root.querySelectorAll('#type-seg button');
      segBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
          currentType = btn.dataset.type;
          segBtns.forEach((b) => b.classList.remove('active', 'income', 'expense'));
          btn.classList.add('active', currentType);
        });
      });

      root.querySelector('#tx-amount').focus();

      root.querySelector('#tx-save').addEventListener('click', () => {
        const amountCents = dollarsToCents(root.querySelector('#tx-amount').value);
        const date = root.querySelector('#tx-date').value || todayISO();
        const accountId = root.querySelector('#tx-account').value;
        const categoryId = root.querySelector('#tx-category').value;
        const note = root.querySelector('#tx-note').value.trim();
        if (amountCents <= 0) { toast('Enter an amount greater than $0.'); return; }
        store.upsertTransaction({ id: existing ? existing.id : undefined, type: currentType, amountCents, date, accountId, categoryId, note });
        closeModal();
        toast('Transaction saved');
        if (onSaved) onSaved();
      });

      const delBtn = root.querySelector('#tx-delete');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          store.deleteTransaction(existing.id);
          closeModal();
          toast('Transaction deleted');
          if (onSaved) onSaved();
        });
      }
    },
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
