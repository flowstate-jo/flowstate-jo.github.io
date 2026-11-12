/* ============================================================================
   FLOW STATE — main.js
   Runs on every page. It does two small things:
     1. Opens and closes the menu on phones
     2. Puts the current year in the footer
   You should not need to edit this file.
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 1. Phone menu ---------- */
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

  function setMenu(open) {
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setMenu(!nav.classList.contains('is-open'));
    });

    // Close the menu with the Escape key
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) {
        setMenu(false);
        toggle.focus();
      }
    });

    // Close the menu after a link is chosen
    nav.addEventListener('click', function (event) {
      if (event.target.closest('a')) {
        setMenu(false);
      }
    });
  }

  /* ---------- 2. Footer year ---------- */
  var yearElements = document.querySelectorAll('[data-year]');
  for (var i = 0; i < yearElements.length; i++) {
    yearElements[i].textContent = new Date().getFullYear();
  }
})();
