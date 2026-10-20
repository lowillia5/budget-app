// charts.js — small dependency-free SVG donut chart for "spending by
// category", following the house rules: fixed categorical color order
// (never reassigned by rank), a legend, a native tooltip on each segment,
// and an accessible table fallback.

import { formatMoney } from './format.js';

const SERIES_VARS = ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6', '--series-7', '--series-8'];
const OTHER_COLOR = 'var(--text-muted)';

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || name;
}

/**
 * @param {HTMLElement} container
 * @param {Array<{id:string, label:string, icon:string, cents:number}>} entries - already sorted desc by cents, cents > 0 only
 */
export function renderCategoryDonut(container, entries) {
  const total = entries.reduce((s, e) => s + e.cents, 0);
  if (!entries.length || total <= 0) {
    container.innerHTML = '<div class="chart-empty">No expenses logged yet this month.</div>';
    return;
  }

  // Fold anything past the first 8 slots into "Other" so colors stay in the
  // validated fixed order (never generate a 9th hue).
  const TOP_N = 8;
  const top = entries.slice(0, TOP_N);
  const rest = entries.slice(TOP_N);
  const restTotal = rest.reduce((s, e) => s + e.cents, 0);
  const segments = top.map((e, i) => ({ ...e, colorVar: SERIES_VARS[i] }));
  if (restTotal > 0) segments.push({ id: '__other', label: 'Other', icon: '➕', cents: restTotal, colorVar: null });

  const r = 54, cx = 70, cy = 70, sw = 16;
  const circumference = 2 * Math.PI * r;
  const GAP = 2.5; // px, visual gap between adjacent segments

  let offset = 0;
  const paths = segments.map((seg) => {
    const frac = seg.cents / total;
    const rawLen = frac * circumference;
    const len = Math.max(rawLen - GAP, 0.001);
    const dasharray = `${len} ${circumference - len}`;
    const dashoffset = -offset;
    offset += rawLen;
    const color = seg.colorVar ? `var(${seg.colorVar})` : OTHER_COLOR;
    const pct = Math.round(frac * 100);
    return `
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}"
        stroke-width="${sw}" stroke-dasharray="${dasharray}" stroke-dashoffset="${dashoffset}"
        transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt">
        <title>${escapeXml(seg.icon || '')} ${escapeXml(seg.label)}: ${formatMoney(seg.cents)} (${pct}%)</title>
      </circle>`;
  }).join('');

  const svg = `
    <svg viewBox="0 0 140 140" width="180" height="180" role="img" aria-label="Spending by category donut chart">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--gridline)" stroke-width="${sw}"></circle>
      ${paths}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-center-value">${formatMoney(total)}</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle" class="donut-center-label">spent</text>
    </svg>`;

  const legendItems = segments.map((seg) => {
    const pct = Math.round((seg.cents / total) * 100);
    const color = seg.colorVar ? `var(${seg.colorVar})` : OTHER_COLOR;
    return `<li><span class="swatch" style="background:${color}"></span>
      <span>${escapeXml(seg.icon || '')} ${escapeXml(seg.label)}</span>
      <span class="amt">${formatMoney(seg.cents)} · ${pct}%</span></li>`;
  }).join('');

  const tableRows = segments.map((seg) => {
    const pct = ((seg.cents / total) * 100).toFixed(1);
    return `<tr><td>${escapeXml(seg.icon || '')} ${escapeXml(seg.label)}</td><td>${formatMoney(seg.cents)}</td><td>${pct}%</td></tr>`;
  }).join('');

  container.innerHTML = `
    <div class="donut-wrap">
      ${svg}
      <ul class="legend">${legendItems}</ul>
    </div>
    <details style="margin-top:10px;">
      <summary style="cursor:pointer; font-size:12.5px; color:var(--text-secondary);">View as table</summary>
      <table style="width:100%; margin-top:8px; font-size:13px; border-collapse:collapse;">
        <thead><tr style="text-align:left; color:var(--text-muted);"><th>Category</th><th>Amount</th><th>Share</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>
    </details>`;
}

function escapeXml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
