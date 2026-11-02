/* GYM BUDS — shared helpers (loaded on every page) */
(function () {
  'use strict';

  async function api(path, opts = {}) {
    const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch('/api' + path, init);
    } catch {
      const e = new Error('Cannot reach the server. Is it running?');
      e.errors = {};
      throw e;
    }
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const e = new Error((data && data.error) || 'Something went wrong. Please try again.');
      e.status = res.status;
      e.errors = (data && data.errors) || {};
      throw e;
    }
    return data;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const pad = (n) => String(n).padStart(2, '0');
  const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => toDateStr(new Date());
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return toDateStr(d); };
  const dayIndex = (s) => (parseDate(s).getDay() + 6) % 7; // Monday = 0
  const mondayOf = (s) => addDays(s, -dayIndex(s));
  const fmtDate = (s, opts) => parseDate(s).toLocaleDateString(undefined, opts || { weekday: 'short', month: 'short', day: 'numeric' });
  const fmtNum = (n) => Math.round(Number(n) || 0).toLocaleString();

  function initials(name) {
    return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  }
  function avatarHtml(user) {
    if (user && user.avatar) return `<span class="avatar"><img src="${esc(user.avatar)}" alt=""></span>`;
    return `<span class="avatar" aria-hidden="true">${esc(initials(user && user.name))}</span>`;
  }

  function toast(message, type) {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (type === 'error' ? ' error' : '');
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3800);
  }

  window.GB = { api, esc, todayStr, toDateStr, parseDate, addDays, dayIndex, mondayOf, fmtDate, fmtNum, initials, avatarHtml, toast };
})();
