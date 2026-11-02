/* GYM BUDS — landing page behavior */
(function () {
  'use strict';
  const { api, avatarHtml, esc } = GB;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Mobile menu */
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  function setMenu(open) {
    links.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  toggle.addEventListener('click', () => setMenu(!links.classList.contains('open')));
  links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* Active link while scrolling */
  const spyLinks = [...document.querySelectorAll('[data-spy]')];
  const sections = spyLinks.map((a) => document.getElementById(a.dataset.spy)).filter(Boolean);
  function updateSpy() {
    const y = window.scrollY + 120;
    let current = sections[0] && sections[0].id;
    sections.forEach((s) => { if (s.offsetTop <= y) current = s.id; });
    spyLinks.forEach((a) => a.classList.toggle('active', a.dataset.spy === current));
  }
  window.addEventListener('scroll', updateSpy, { passive: true });
  updateSpy();

  /* Smooth anchor offset for the sticky nav */
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const target = document.querySelector(a.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      const top = target.id === 'home' ? 0 : target.getBoundingClientRect().top + window.scrollY - 68;
      window.scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* Reveal on scroll (one gentle fade-in) */
  const revealEls = document.querySelectorAll('.reveal');
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealEls.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.12 });
    revealEls.forEach((el, i) => { el.style.transitionDelay = `${(i % 3) * 70}ms`; io.observe(el); });
  }

  /* Gentle parallax on the hero art (pointer devices only) */
  const art = document.getElementById('hero-art');
  if (art && !reduceMotion && window.matchMedia('(hover: hover)').matches) {
    const hero = document.getElementById('home');
    const layers = [...art.querySelectorAll('[data-depth]')];
    hero.addEventListener('mousemove', (e) => {
      const r = hero.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      layers.forEach((l) => { const d = Number(l.dataset.depth); l.style.transform = `translate(${x * d}px, ${y * d}px)`; });
    });
    hero.addEventListener('mouseleave', () => layers.forEach((l) => { l.style.transform = ''; }));
  }

  /* Show avatar + dashboard when logged in */
  const slots = document.querySelectorAll('[data-auth-slot]');
  const loggedOut = '<a class="btn btn-sm" href="auth.html">Login</a><a class="btn btn-sm btn-primary" href="auth.html?mode=register">Sign Up</a>';
  slots.forEach((s) => { s.innerHTML = loggedOut; });
  api('/auth/me').then(({ user }) => {
    slots.forEach((s) => {
      s.innerHTML = `<a class="avatar-link" href="app.html#profile" aria-label="Open profile">${avatarHtml(user)}<span>${esc(user.name.split(' ')[0])}</span></a>`;
    });
    document.querySelectorAll('[data-cta]').forEach((a) => { a.href = 'app.html'; a.textContent = 'OPEN DASHBOARD'; });
  }).catch(() => { /* not logged in: keep the default buttons */ });
})();
