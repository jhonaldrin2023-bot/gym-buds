/* GYM BUDS — light / dark theme. Loaded in <head> so there is no flash on page load. */
(function () {
  'use strict';
  var KEY = 'gb-theme';
  var root = document.documentElement;
  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked: fall back to system */ }
  var theme = saved === 'light' || saved === 'dark' ? saved
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  root.setAttribute('data-theme', theme);

  function apply(next, persist) {
    root.classList.add('theme-anim');
    root.setAttribute('data-theme', next);
    if (persist) { try { localStorage.setItem(KEY, next); } catch (e) { /* ignore */ } }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#F6F8F1' : '#0D0F0D');
    sync();
    setTimeout(function () { root.classList.remove('theme-anim'); }, 500);
  }

  function sync() {
    var t = root.getAttribute('data-theme');
    var label = t === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-label', label);
      b.setAttribute('title', label);
    });
    document.querySelectorAll('[data-theme-label]').forEach(function (s) {
      s.textContent = t === 'light' ? 'Dark mode' : 'Light mode';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-theme-toggle]').forEach(function (b) {
      b.addEventListener('click', function () {
        apply(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
      });
    });
    apply(root.getAttribute('data-theme'), false);
  });

  window.GBTheme = { get: function () { return root.getAttribute('data-theme'); } };
})();
