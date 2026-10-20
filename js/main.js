import { store } from './store.js';
import { currentMonthKey, shiftMonth } from './format.js';
import { initSync } from './sync.js';
import { renderDashboard } from './views/dashboard.js';
import { renderTransactions, openTransactionForm } from './views/transactions.js';
import { renderCategories } from './views/categories.js';
import { renderAccounts } from './views/accounts.js';
import { renderSettings } from './views/settings.js';

const THEME_KEY = 'budgetapp:theme';

function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}
function setTheme(t) {
  localStorage.setItem(THEME_KEY, t);
  applyTheme();
}
function applyTheme() {
  const t = getTheme();
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
applyTheme();

const routes = {
  dashboard: (el) => renderDashboard(el, {
    month: state.month,
    onMonthChange: (delta) => { state.month = shiftMonth(state.month, delta); render(); },
  }),
  transactions: (el) => renderTransactions(el, { month: state.month, refresh: render }),
  categories: (el) => renderCategories(el),
  accounts: (el) => renderAccounts(el),
  settings: (el) => renderSettings(el, { getTheme, setTheme }),
};

const state = {
  route: 'dashboard',
  month: currentMonthKey(),
  cleanupCurrentView: null,
};

const viewEl = document.getElementById('view');
const navButtons = Array.from(document.querySelectorAll('.nav-item'));

function render() {
  if (state.cleanupCurrentView) { state.cleanupCurrentView(); state.cleanupCurrentView = null; }
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.route === state.route));
  const result = routes[state.route](viewEl);
  if (typeof result === 'function') state.cleanupCurrentView = result;
  viewEl.scrollTop = 0;
  viewEl.focus({ preventScroll: true });
}

navButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    state.route = btn.dataset.route;
    render();
  });
});

document.getElementById('fab-add').addEventListener('click', () => {
  openTransactionForm({ month: state.month, onSaved: render });
});

document.getElementById('theme-toggle').addEventListener('click', () => {
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(getTheme()) + 1) % order.length];
  setTheme(next);
});

// Store changes from anywhere (sync merges included) re-render the active view
// so a change made on the other device shows up without a manual refresh.
store.addEventListener('change', () => {
  if (state.route === 'dashboard' || state.route === 'transactions') render();
});

render();
initSync();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch((e) => console.warn('SW registration failed', e));
  });
}
