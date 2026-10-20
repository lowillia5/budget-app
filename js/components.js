// components.js — shared small UI helpers: toasts and a bottom-sheet modal.

export const EMOJI_CHOICES = [
  '🛒', '🍽️', '⛽', '🏠', '💡', '💊', '🎬', '🛍️', '🔁', '💰', '✨', '🚗',
  '✈️', '🎓', '🐾', '👶', '🎁', '🏋️', '📱', '💻', '🧾', '🏦', '🍕', '☕',
  '🎮', '📚', '🧴', '🧹', '🚕', '🏥', '🧸', '🎵', '🖥️', '👕', '💳', '🌳',
  '🎨', '📷', '💼', '🧳', '🚌', '🏖️', '🍺', '🐶', '🧘', '🧑‍⚕️', '🛏️', '🧯',
];

let toastTimer = null;
export function toast(message) {
  const root = document.getElementById('toast-root');
  root.innerHTML = '';
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  root.appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.remove(); }, 2600);
}

/**
 * Opens a bottom-sheet modal.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.bodyHtml
 * @param {(root: HTMLElement) => void} [opts.onMount]
 */
export function openModal({ title, bodyHtml, onMount }) {
  closeModal();
  const root = document.getElementById('modal-root');
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'active-modal';
  backdrop.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <div class="modal-header">
        <h2>${title}</h2>
        <button type="button" id="modal-close-btn" aria-label="Close">
          <svg viewBox="0 0 24 24" width="22" height="22"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="modal-body">${bodyHtml}</div>
    </div>`;
  root.appendChild(backdrop);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  backdrop.querySelector('#modal-close-btn').addEventListener('click', closeModal);
  document.addEventListener('keydown', escListener);
  if (onMount) onMount(backdrop.querySelector('.modal-body'));
}

function escListener(e) {
  if (e.key === 'Escape') closeModal();
}

export function closeModal() {
  const el = document.getElementById('active-modal');
  if (el) el.remove();
  document.removeEventListener('keydown', escListener);
}

function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;');
}
