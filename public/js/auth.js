/* GYM BUDS — login, register, forgot and reset password */
(function () {
  'use strict';
  const { api, todayStr, toast } = GB;
  const params = new URLSearchParams(location.search);
  const MODES = ['login', 'register', 'forgot', 'reset'];
  let mode = MODES.includes(params.get('mode')) ? params.get('mode') : 'login';
  if (mode === 'reset' && !params.get('token')) mode = 'forgot';

  const TITLES = { login: 'Log in', register: 'Create account', forgot: 'Reset password', reset: 'New password' };
  document.title = `${TITLES[mode]} — GYM BUDS`;
  MODES.forEach((m) => { document.getElementById('view-' + m).hidden = m !== mode; });
  document.querySelector('#form-reset [name=token]').value = params.get('token') || '';

  // Already signed in? Go straight to the dashboard (except when resetting a password).
  if (mode !== 'reset') {
    api('/auth/me').then(() => { location.replace('app.html'); }).catch(() => {});
  }

  /* helpers */
  function clearErrors(form) {
    form.querySelectorAll('[data-error-for]').forEach((s) => { s.textContent = ''; });
    form.querySelectorAll('.input').forEach((i) => i.removeAttribute('aria-invalid'));
    const fe = form.querySelector('[data-form-error]');
    if (fe) { fe.hidden = true; fe.textContent = ''; }
    const ok = form.querySelector('[data-form-ok]');
    if (ok) ok.hidden = true;
  }
  function showFieldErrors(form, errors, message) {
    let first = null;
    Object.entries(errors || {}).forEach(([name, msg]) => {
      const span = form.querySelector(`[data-error-for="${name}"]`);
      const input = form.querySelector(`[name="${name}"]`);
      if (span) span.textContent = msg;
      if (input) { input.setAttribute('aria-invalid', 'true'); first = first || input; }
    });
    const fe = form.querySelector('[data-form-error]');
    if (fe && (message && (!errors || !Object.keys(errors).length))) { fe.textContent = message; fe.hidden = false; }
    if (first) first.focus();
  }
  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    // passwords must not be trimmed
    form.querySelectorAll('input[type=password]').forEach((p) => { o[p.name] = p.value; });
    return o;
  }
  function handle(formId, validate, submit) {
    const form = document.getElementById(formId);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors(form);
      const data = formData(form);
      const errors = validate(data, form);
      if (Object.keys(errors).length) return showFieldErrors(form, errors);
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.classList.add('loading');
      try {
        await submit(data, form);
      } catch (err) {
        showFieldErrors(form, err.errors, err.message);
      } finally {
        btn.disabled = false; btn.classList.remove('loading');
      }
    });
  }
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  /* login */
  handle('form-login',
    (d) => {
      const e = {};
      if (!emailOk(d.email)) e.email = 'Enter a valid email address.';
      if (!d.password) e.password = 'Enter your password.';
      return e;
    },
    async (d, form) => {
      await api('/auth/login', { method: 'POST', body: { email: d.email, password: d.password, remember: !!form.remember.checked } });
      location.href = 'app.html';
    });

  /* register */
  handle('form-register',
    (d) => {
      const e = {};
      if (d.name.length < 2) e.name = 'Enter your full name.';
      if (!emailOk(d.email)) e.email = 'Enter a valid email address.';
      if (!d.password || d.password.length < 8) e.password = 'Use at least 8 characters.';
      if (d.confirm !== d.password) e.confirm = 'Passwords do not match.';
      const age = Number(d.age);
      if (!d.age || age < 10 || age > 100) e.age = 'Enter an age between 10 and 100.';
      const h = Number(d.height_cm);
      if (!d.height_cm || h < 100 || h > 250) e.height_cm = 'Enter your height in cm (100–250).';
      const w = Number(d.weight_kg);
      if (!d.weight_kg || w < 25 || w > 400) e.weight_kg = 'Enter your weight in kg (25–400).';
      if (!d.goal) e.goal = 'Choose a fitness goal.';
      return e;
    },
    async (d) => {
      await api('/auth/register', { method: 'POST', body: { ...d, date: todayStr() } });
      location.href = 'app.html';
    });

  /* forgot */
  handle('form-forgot',
    (d) => (emailOk(d.email) ? {} : { email: 'Enter a valid email address.' }),
    async (d, form) => {
      await api('/auth/forgot', { method: 'POST', body: { email: d.email } });
      const ok = form.querySelector('[data-form-ok]');
      ok.textContent = 'If an account exists for that email, a reset link has been generated. This local app has no email server, so the link is printed in the terminal where the server is running.';
      ok.hidden = false;
    });

  /* reset */
  handle('form-reset',
    (d) => {
      const e = {};
      if (!d.password || d.password.length < 8) e.password = 'Use at least 8 characters.';
      if (d.confirm !== d.password) e.confirm = 'Passwords do not match.';
      return e;
    },
    async (d) => {
      await api('/auth/reset', { method: 'POST', body: { token: d.token, password: d.password, confirm: d.confirm } });
      toast('Password updated. Log in with your new password.');
      setTimeout(() => { location.href = 'auth.html?mode=login'; }, 1200);
    });
})();
