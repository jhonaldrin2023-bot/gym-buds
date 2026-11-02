/* GYM BUDS — tiny SVG charts (bar, line, ring). Colours come from CSS variables so they follow light/dark mode. */
(function () {
  'use strict';
  const { esc, fmtNum } = GB;
  const GRID = 'stroke:var(--grid)';
  const ACC_STROKE = 'stroke:var(--chart)';

  function empty(el, message) {
    el.innerHTML = `<div class="chart-empty">${esc(message)}</div>`;
  }

  /** bars(el, items, {goal, max, format, label}) — items: [{label, value, active}] */
  function bars(el, items, opts = {}) {
    const W = 560, H = 220, padT = 22, padB = 28, padX = 6;
    const values = items.map((i) => i.value);
    const top = Math.max(opts.max || 0, opts.goal || 0, ...values, 1) * 1.1;
    const innerH = H - padT - padB;
    const slot = (W - padX * 2) / items.length;
    const bw = Math.min(46, slot * 0.58);
    const fmt = opts.format || fmtNum;
    const y = (v) => padT + innerH - (v / top) * innerH;

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Bar chart')}">`;
    svg += `<line x1="0" x2="${W}" y1="${padT + innerH}" y2="${padT + innerH}" style="${GRID}"/>`;
    if (opts.goal) {
      svg += `<line x1="0" x2="${W}" y1="${y(opts.goal)}" y2="${y(opts.goal)}" style="${ACC_STROKE}" stroke-opacity=".6" stroke-dasharray="4 5"/>`;
      svg += `<text x="${W}" y="${y(opts.goal) - 5}" text-anchor="end">Goal ${fmt(opts.goal)}</text>`;
    }
    items.forEach((it, i) => {
      const x = padX + slot * i + (slot - bw) / 2;
      const h = Math.max(it.value > 0 ? 3 : 0, (it.value / top) * innerH);
      svg += `<rect class="b" style="--i:${i};fill:${it.active ? 'var(--chart)' : 'var(--chart-dim)'}" x="${x}" y="${padT + innerH - h}" width="${bw}" height="${h}" rx="6"/>`;
      if (it.value > 0) svg += `<text class="val" x="${x + bw / 2}" y="${padT + innerH - h - 6}" text-anchor="middle">${fmt(it.value)}</text>`;
      svg += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(it.label)}</text>`;
    });
    el.innerHTML = `<div class="chart">${svg}</svg></div>`;
  }

  /** line(el, points, {target, unit, label}) — points: [{label, value}] */
  function line(el, points, opts = {}) {
    if (points.length < 2) return empty(el, opts.emptyText || 'Log at least two weigh-ins to see your trend.');
    const W = 560, H = 220, padL = 40, padR = 12, padT = 18, padB = 28;
    const vals = points.map((p) => p.value);
    let lo = Math.min(...vals, opts.target ?? Infinity);
    let hi = Math.max(...vals, opts.target ?? -Infinity);
    if (hi - lo < 2) { hi += 1; lo -= 1; }
    const span = hi - lo;
    lo -= span * 0.1; hi += span * 0.1;
    const x = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
    const unit = opts.unit || '';

    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || 'Line chart')}">`;
    [0, 0.5, 1].forEach((t) => {
      const v = lo + (hi - lo) * t;
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" style="${GRID}"/>`;
      svg += `<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`;
    });
    if (opts.target != null) {
      svg += `<line x1="${padL}" x2="${W - padR}" y1="${y(opts.target)}" y2="${y(opts.target)}" style="${ACC_STROKE}" stroke-opacity=".6" stroke-dasharray="4 5"/>`;
      svg += `<text x="${W - padR}" y="${y(opts.target) - 5}" text-anchor="end">Target ${opts.target}${unit}</text>`;
    }
    const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`).join(' ');
    svg += `<path class="area" d="${d} L${x(points.length - 1)} ${H - padB} L${x(0)} ${H - padB} Z" style="fill:var(--chart)" fill-opacity=".1"/>`;
    svg += `<path class="line" pathLength="1" d="${d}" fill="none" style="${ACC_STROKE}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
    points.forEach((p, i) => {
      if (points.length <= 24 || i === points.length - 1) svg += `<circle class="dot" cx="${x(i)}" cy="${y(p.value)}" r="${i === points.length - 1 ? 4.5 : 3}" style="fill:var(--chart)"/>`;
    });
    svg += `<text x="${padL}" y="${H - 8}">${esc(points[0].label)}</text>`;
    svg += `<text x="${W - padR}" y="${H - 8}" text-anchor="end">${esc(points[points.length - 1].label)}</text>`;
    el.innerHTML = `<div class="chart">${svg}</svg></div>`;
  }

  /** ring(el, value, goal, {sub}) — circular progress, turns red when over goal */
  function ring(el, value, goal, opts = {}) {
    const R = 52, C = 2 * Math.PI * R;
    const pct = goal > 0 ? Math.min(value / goal, 1) : 0;
    const over = goal > 0 && value > goal;
    el.innerHTML = `
      <svg viewBox="0 0 130 130" role="img" aria-label="${fmtNum(value)} of ${fmtNum(goal)} calories">
        <circle cx="65" cy="65" r="${R}" fill="none" style="${GRID}" stroke-width="11"/>
        <circle class="ring-fill" cx="65" cy="65" r="${R}" fill="none" style="stroke:${over ? 'var(--danger)' : 'var(--chart)'}" stroke-width="11" stroke-linecap="round"
          stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${C.toFixed(1)}" transform="rotate(-90 65 65)"/>
      </svg>
      <div class="center"><strong>${fmtNum(value)}</strong><span>${esc(opts.sub || 'kcal')}</span></div>`;
    const arc = el.querySelector('.ring-fill');
    requestAnimationFrame(() => requestAnimationFrame(() => { arc.style.strokeDashoffset = (C * (1 - pct)).toFixed(1); }));
  }

  window.Charts = { bars, line, ring, empty };
})();
