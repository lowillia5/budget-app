import { store } from '../store.js';
import { formatMoney, monthLabel } from '../format.js';
import { renderCategoryDonut } from '../charts.js';

export function renderDashboard(container, { month, onMonthChange, onAddTransaction }) {
  const totals = store.monthTotals(month);
  const spendByCat = store.categorySpend(month);
  const categories = store.listCategories();
  const accounts = store.listAccounts();

  const catEntries = categories
    .map((c) => ({ id: c.id, label: c.name, icon: c.icon, cents: spendByCat.get(c.id) || 0 }))
    .filter((e) => e.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const budgetRows = categories
    .filter((c) => c.monthlyBudgetCents > 0 || (spendByCat.get(c.id) || 0) > 0)
    .map((c) => ({ c, spent: spendByCat.get(c.id) || 0 }))
    .sort((a, b) => {
      const aHas = a.c.monthlyBudgetCents > 0, bHas = b.c.monthlyBudgetCents > 0;
      if (aHas !== bHas) return aHas ? -1 : 1;
      return b.spent - a.spent;
    });

  container.innerHTML = `
    <h1 class="page-title">Dashboard</h1>
    <div class="month-switcher">
      <button type="button" id="month-prev" aria-label="Previous month">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <span class="month-label">${monthLabel(month)}</span>
      <button type="button" id="month-next" aria-label="Next month">
        <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>

    <div class="stat-row">
      <div class="stat-tile"><div class="label">Income</div><div class="value positive">${formatMoney(totals.income)}</div></div>
      <div class="stat-tile"><div class="label">Expenses</div><div class="value">${formatMoney(totals.expense)}</div></div>
      <div class="stat-tile"><div class="label">Net</div><div class="value ${totals.net >= 0 ? 'positive' : ''}">${formatMoney(totals.net)}</div></div>
    </div>

    <div class="card">
      <div class="card-title">Spending by category</div>
      <div id="donut-slot"></div>
    </div>

    <div class="card">
      <div class="card-title">Category budgets</div>
      <div id="budget-rows">
        ${budgetRows.length ? '' : '<div class="chart-empty">Set a monthly budget on any category to track it here.</div>'}
      </div>
    </div>

    <div class="card">
      <div class="card-title">Accounts</div>
      ${accounts.map((a) => `
        <div class="budget-row">
          <div class="cat-chip">🏦</div>
          <div class="budget-row-main">
            <div class="budget-row-top">
              <span class="name">${escapeHtml(a.name)}</span>
              <span class="amounts tabular">${formatMoney(store.accountBalanceCents(a.id))}</span>
            </div>
          </div>
        </div>`).join('') || '<div class="chart-empty">No accounts yet.</div>'}
    </div>
  `;

  renderCategoryDonut(container.querySelector('#donut-slot'), catEntries);

  const rowsEl = container.querySelector('#budget-rows');
  budgetRows.forEach(({ c, spent }) => {
    const row = document.createElement('div');
    row.className = 'budget-row';
    const hasBudget = c.monthlyBudgetCents > 0;
    const pct = hasBudget ? Math.min(Math.round((spent / c.monthlyBudgetCents) * 100), 999) : 0;
    let statusClass = '';
    let flag = '';
    if (hasBudget) {
      if (pct >= 100) { statusClass = 'status-critical'; flag = `<div class="budget-flag critical">⚠️ Over budget by ${formatMoney(spent - c.monthlyBudgetCents)}</div>`; }
      else if (pct >= 80) { statusClass = 'status-warning'; flag = `<div class="budget-flag warning">${pct}% of budget used</div>`; }
    }
    row.innerHTML = `
      <div class="cat-chip">${c.icon || '✨'}</div>
      <div class="budget-row-main">
        <div class="budget-row-top">
          <span class="name">${escapeHtml(c.name)}</span>
          <span class="amounts tabular">${formatMoney(spent)}${hasBudget ? ` / ${formatMoney(c.monthlyBudgetCents)}` : ''}</span>
        </div>
        ${hasBudget ? `<div class="bar-track"><div class="bar-fill ${statusClass}" style="width:${Math.min(pct, 100)}%"></div></div>` : ''}
        ${flag}
      </div>`;
    rowsEl.appendChild(row);
  });

  container.querySelector('#month-prev').addEventListener('click', () => onMonthChange(-1));
  container.querySelector('#month-next').addEventListener('click', () => onMonthChange(1));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
