import { store } from '../store.js';
import { formatMoney, dollarsToCents, centsToDollarsInput } from '../format.js';
import { openModal, closeModal, toast } from '../components.js';

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Checking', icon: '🏦' },
  { value: 'savings', label: 'Savings', icon: '🐖' },
  { value: 'credit', label: 'Credit card', icon: '💳' },
  { value: 'cash', label: 'Cash', icon: '💵' },
  { value: 'other', label: 'Other', icon: '📁' },
];

export function renderAccounts(container) {
  function draw() {
    const accounts = store.listAccounts();
    container.innerHTML = `
      <h1 class="page-title">Accounts</h1>
      <div id="acc-list"></div>
      <button type="button" class="add-row-btn" id="add-acc">+ Add account</button>
    `;
    const list = container.querySelector('#acc-list');
    if (!accounts.length) {
      list.innerHTML = `<div class="empty-state"><div class="emoji">🏦</div><p>No accounts yet.</p></div>`;
    } else {
      list.innerHTML = accounts.map((a) => {
        const meta = ACCOUNT_TYPES.find((t) => t.value === a.type) || ACCOUNT_TYPES[4];
        return `
        <div class="list-item">
          <div class="cat-chip">${meta.icon}</div>
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(a.name)}</div>
            <div class="list-item-sub">${meta.label}</div>
          </div>
          <div class="list-item-value tabular">${formatMoney(store.accountBalanceCents(a.id))}</div>
          <div class="list-item-actions">
            <button type="button" data-edit="${a.id}" aria-label="Edit ${escapeAttr(a.name)}">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
            </button>
          </div>
        </div>`;
      }).join('');
      list.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openAccountForm({ id: btn.dataset.edit, onSaved: draw }));
      });
    }
    container.querySelector('#add-acc').addEventListener('click', () => openAccountForm({ onSaved: draw }));
  }
  draw();
}

function openAccountForm({ id = null, onSaved }) {
  const existing = id ? store.getAccount(id) : null;

  openModal({
    title: existing ? 'Edit account' : 'Add account',
    bodyHtml: `
      <div class="field">
        <label for="acc-name">Name</label>
        <input type="text" id="acc-name" placeholder="e.g. Checking" value="${existing ? escapeAttr(existing.name) : ''}">
      </div>
      <div class="field">
        <label for="acc-type">Type</label>
        <select id="acc-type">${ACCOUNT_TYPES.map((t) => `<option value="${t.value}" ${existing && existing.type === t.value ? 'selected' : ''}>${t.icon} ${t.label}</option>`).join('')}</select>
      </div>
      <div class="field">
        <label for="acc-balance">Starting balance</label>
        <input type="number" id="acc-balance" inputmode="decimal" step="0.01" value="${existing ? centsToDollarsInput(existing.startingBalanceCents) : '0.00'}">
      </div>
      <button type="button" class="btn btn-primary btn-block" id="acc-save">Save</button>
      ${existing ? '<button type="button" class="btn btn-danger btn-block" id="acc-delete" style="margin-top:8px;">Delete account</button>' : ''}
    `,
    onMount(root) {
      root.querySelector('#acc-name').focus();
      root.querySelector('#acc-save').addEventListener('click', () => {
        const name = root.querySelector('#acc-name').value.trim();
        if (!name) { toast('Give the account a name.'); return; }
        const type = root.querySelector('#acc-type').value;
        const startingBalanceCents = dollarsToCents(root.querySelector('#acc-balance').value);
        store.upsertAccount({ id: existing ? existing.id : undefined, name, type, startingBalanceCents });
        closeModal();
        toast('Account saved');
        if (onSaved) onSaved();
      });
      const delBtn = root.querySelector('#acc-delete');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          store.deleteAccount(existing.id);
          closeModal();
          toast('Account deleted');
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
