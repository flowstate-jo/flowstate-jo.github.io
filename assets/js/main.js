/* ============================================================================
   FLOW STATE — main.js
   Runs on every page. It does four small things:
     1. Opens and closes the menu on phones
     2. Puts the current year in the footer
     3. Makes the FAQ questions glide open and shut
     4. Counts the open roles on the Careers page
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

  /* ---------- 3. FAQ: questions glide open and shut ----------
     Each question is a <details class="faq-item"> block. Browsers open and
     close these instantly, so this part animates the height of the box.
     If this script does not run, the questions still open and close normally.

     FAQ_SPEED is the length of the animation in milliseconds (300 = 0.3 seconds). */
  var FAQ_SPEED = 300;
  var prefersLessMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function animateFaqItem(item) {
    var summary = item.querySelector('summary');
    var answer = item.querySelector('.faq-answer');
    if (!summary || !answer || !item.animate) { return; }

    var heightAnimation = null;   // the box growing or shrinking
    var fadeOut = null;           // the answer fading away while closing
    var closing = false;

    // Height of the top and bottom border, which is part of the box's height
    function borders() {
      return item.offsetHeight - item.clientHeight;
    }

    function run(fromHeight, toHeight, openAtEnd) {
      if (heightAnimation) { heightAnimation.cancel(); }
      item.style.overflow = 'hidden';
      heightAnimation = item.animate(
        { height: [fromHeight + 'px', toHeight + 'px'] },
        { duration: FAQ_SPEED, easing: 'ease-out' }
      );
      heightAnimation.onfinish = function () {
        heightAnimation = null;
        closing = false;
        item.open = openAtEnd;
        item.classList.remove('is-closing');
        item.style.height = '';
        item.style.overflow = '';
        if (fadeOut) { fadeOut.cancel(); fadeOut = null; }
      };
    }

    function openItem() {
      var startHeight = item.offsetHeight;
      closing = false;
      item.classList.remove('is-closing');
      if (fadeOut) { fadeOut.cancel(); fadeOut = null; }
      item.style.height = startHeight + 'px';
      item.style.overflow = 'hidden';
      item.open = true;                                   // shows the answer
      run(startHeight, summary.offsetHeight + answer.offsetHeight + borders(), true);
    }

    function closeItem() {
      var startHeight = item.offsetHeight;
      closing = true;
      item.classList.add('is-closing');
      fadeOut = answer.animate({ opacity: [1, 0] }, { duration: FAQ_SPEED * 0.7, easing: 'ease-in', fill: 'forwards' });
      run(startHeight, summary.offsetHeight + borders(), false);
    }

    summary.addEventListener('click', function (event) {
      if (prefersLessMotion) { return; }                  // open and close instantly, as the visitor asked
      event.preventDefault();
      if (!item.open || closing) {
        openItem();
      } else {
        closeItem();
      }
    });
  }

  var faqItems = document.querySelectorAll('.faq-item');
  for (var j = 0; j < faqItems.length; j++) {
    animateFaqItem(faqItems[j]);
  }

  /* ---------- 4. Careers: count the open roles ----------
     The line above the list of jobs ("1 open role · 3 closed") counts the job
     boxes by itself, so it stays right when a job is added to, closed in or
     removed from careers.html. Closed roles are the boxes marked "is-closed". */
  var roleCount = document.querySelector('[data-role-count]');
  if (roleCount) {
    var closedRoles = document.querySelectorAll('.role-card.is-closed').length;
    var openRoles = document.querySelectorAll('.role-card').length - closedRoles;
    var countText;
    if (openRoles === 0) {
      countText = 'No open roles right now';
    } else {
      countText = openRoles + (openRoles === 1 ? ' open role' : ' open roles');
    }
    if (closedRoles > 0) {
      countText += ' · ' + closedRoles + ' closed';
    }
    roleCount.textContent = countText;
  }
})();
