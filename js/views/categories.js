import { store } from '../store.js';
import { formatMoney, dollarsToCents, centsToDollarsInput } from '../format.js';
import { openModal, closeModal, toast, EMOJI_CHOICES } from '../components.js';

export function renderCategories(container) {
  function draw() {
    const categories = store.listCategories();
    container.innerHTML = `
      <h1 class="page-title">Categories</h1>
      <div id="cat-list"></div>
      <button type="button" class="add-row-btn" id="add-cat">+ Add category</button>
    `;
    const list = container.querySelector('#cat-list');
    if (!categories.length) {
      list.innerHTML = `<div class="empty-state"><div class="emoji">🗂️</div><p>No categories yet.</p></div>`;
    } else {
      list.innerHTML = categories.map((c) => `
        <div class="list-item" data-id="${c.id}">
          <div class="cat-chip">${c.icon || '✨'}</div>
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(c.name)}</div>
            <div class="list-item-sub">${c.monthlyBudgetCents > 0 ? `Budget: ${formatMoney(c.monthlyBudgetCents)}/mo` : 'No monthly budget set'}</div>
          </div>
          <div class="list-item-actions">
            <button type="button" data-edit="${c.id}" aria-label="Edit ${escapeAttr(c.name)}">
              <svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
            </button>
          </div>
        </div>`).join('');
      list.querySelectorAll('[data-edit]').forEach((btn) => {
        btn.addEventListener('click', () => openCategoryForm({ id: btn.dataset.edit, onSaved: draw }));
      });
    }
    container.querySelector('#add-cat').addEventListener('click', () => openCategoryForm({ onSaved: draw }));
  }
  draw();
}

function openCategoryForm({ id = null, onSaved }) {
  const existing = id ? store.getCategory(id) : null;
  let selectedEmoji = existing ? existing.icon : EMOJI_CHOICES[0];

  openModal({
    title: existing ? 'Edit category' : 'Add category',
    bodyHtml: `
      <div class="field">
        <label for="cat-name">Name</label>
        <input type="text" id="cat-name" placeholder="e.g. Groceries" value="${existing ? escapeAttr(existing.name) : ''}">
      </div>
      <div class="field">
        <label for="cat-budget">Monthly budget (optional)</label>
        <input type="number" id="cat-budget" inputmode="decimal" step="0.01" min="0" placeholder="0.00" value="${existing && existing.monthlyBudgetCents ? centsToDollarsInput(existing.monthlyBudgetCents) : ''}">
      </div>
      <div class="field">
        <label>Icon</label>
        <div class="emoji-grid" id="emoji-grid">
          ${EMOJI_CHOICES.map((e) => `<button type="button" data-emoji="${e}" class="${e === selectedEmoji ? 'active' : ''}">${e}</button>`).join('')}
        </div>
      </div>
      <button type="button" class="btn btn-primary btn-block" id="cat-save">Save</button>
      ${existing ? '<button type="button" class="btn btn-danger btn-block" id="cat-delete" style="margin-top:8px;">Delete category</button>' : ''}
    `,
    onMount(root) {
      root.querySelectorAll('[data-emoji]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedEmoji = btn.dataset.emoji;
          root.querySelectorAll('[data-emoji]').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        });
      });
      root.querySelector('#cat-name').focus();
      root.querySelector('#cat-save').addEventListener('click', () => {
        const name = root.querySelector('#cat-name').value.trim();
        if (!name) { toast('Give the category a name.'); return; }
        const budgetVal = root.querySelector('#cat-budget').value;
        const monthlyBudgetCents = budgetVal ? dollarsToCents(budgetVal) : 0;
        store.upsertCategory({ id: existing ? existing.id : undefined, name, icon: selectedEmoji, monthlyBudgetCents });
        closeModal();
        toast('Category saved');
        if (onSaved) onSaved();
      });
      const delBtn = root.querySelector('#cat-delete');
      if (delBtn) {
        delBtn.addEventListener('click', () => {
          store.deleteCategory(existing.id);
          closeModal();
          toast('Category deleted');
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
