/* ============================================================================
   FLOW STATE — form-helpers.js
   Small tools shared by the application form and the contact form:
   showing error messages, reading files, and sending data to Google Apps Script.
   You should not need to edit this file.
   ========================================================================== */
window.FlowState = window.FlowState || {};

(function (FS) {
  'use strict';

  var config = window.FLOWSTATE_CONFIG || {};
  FS.config = config;

  /* Time the page was opened. Used by the spam check: real people need more
     than a few seconds to fill in a form, robots usually do not. */
  var pageOpenedAt = Date.now();
  var hasSteadyClock = !!(window.performance && typeof performance.now === 'function');

  /* ---------- Small helpers ---------- */

  // Has the Google Apps Script address been pasted into config.js?
  FS.isFormConnected = function () {
    return /^https?:\/\/\S+$/i.test(String(config.FORM_ENDPOINT || '').trim());
  };

  FS.isValidEmail = function (value) {
    return value.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  };

  // "My CV.PDF" -> "pdf"
  FS.fileExtension = function (fileName) {
    var match = /\.([a-z0-9]+)$/i.exec(fileName || '');
    return match ? match[1].toLowerCase() : '';
  };

  // 1536000 -> "1.5 MB"
  FS.formatBytes = function (bytes) {
    if (bytes < 1024 * 1024) {
      return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // 75 -> "1:15"
  FS.formatTime = function (seconds) {
    var total = Math.max(0, Math.floor(seconds));
    var secs = total % 60;
    return Math.floor(total / 60) + ':' + (secs < 10 ? '0' : '') + secs;
  };

  // Milliseconds since the page was opened (sent with every form for the spam check).
  // performance.now() is used because it keeps counting correctly even if the
  // clock on the visitor's device is changed while the page is open.
  FS.timeOnPage = function () {
    return Math.round(hasSteadyClock ? performance.now() : Date.now() - pageOpenedAt);
  };

  /* ---------- Error messages under fields ----------
     Every field has an (empty, hidden) <p class="field-error" id="NAME-error">.
     setFieldError fills it in and marks the field as invalid for screen readers. */
  FS.setFieldError = function (form, name, message) {
    var errorElement = form.querySelector('#' + name + '-error');
    if (!errorElement) { return; }

    var controls = form.querySelectorAll('[aria-describedby~="' + name + '-error"]');
    errorElement.textContent = message || '';
    errorElement.hidden = !message;

    // Lets the stylesheet turn Yes/No boxes red as well
    var wrapper = errorElement.closest('.field');
    if (wrapper) { wrapper.classList.toggle('has-error', !!message); }

    for (var i = 0; i < controls.length; i++) {
      var control = controls[i];
      var canBeInvalid = control.matches('.input, .input-file, input[type="checkbox"]');
      if (message && canBeInvalid) {
        control.setAttribute('aria-invalid', 'true');
      } else {
        control.removeAttribute('aria-invalid');
      }
    }
  };

  /* ---------- Message box next to the submit button ----------
     type: "error", "success", "info" — or leave empty to hide the box. */
  FS.setStatus = function (element, type, message) {
    if (!element) { return; }
    if (!type) {
      element.hidden = true;
      element.textContent = '';
      return;
    }
    element.className = 'notice' +
      (type === 'error' ? ' notice-error' : '') +
      (type === 'success' ? ' notice-success' : '');
    element.setAttribute('role', type === 'error' ? 'alert' : 'status');
    element.textContent = message;
    element.hidden = false;
  };

  /* ---------- Read a file (or recording) as text that can be sent in the form ---------- */
  FS.fileToBase64 = function (fileOrBlob) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        // The result looks like "data:application/pdf;base64,AAAA..." — keep the part after the comma
        var text = String(reader.result || '');
        resolve(text.slice(text.indexOf(',') + 1));
      };
      reader.onerror = function () {
        reject(reader.error || new Error('Could not read the file.'));
      };
      reader.readAsDataURL(fileOrBlob);
    });
  };

  /* ---------- Send a form to Google Apps Script ----------
     Returns the answer from the script:  { ok: true }  or  { ok: false, error: "..." }
     Throws an error if the script could not be reached at all. */
  FS.sendForm = function (data) {
    var controller = ('AbortController' in window) ? new AbortController() : null;
    // Give up after 5 minutes (big uploads on slow phones can take a while)
    var timer = controller ? setTimeout(function () { controller.abort(); }, 5 * 60 * 1000) : null;

    return fetch(String(config.FORM_ENDPOINT).trim(), {
      method: 'POST',
      // "text/plain" is deliberate: it lets the browser send the form straight to
      // Google Apps Script without an extra permission check that Apps Script cannot answer.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(data),
      redirect: 'follow',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      if (!response.ok) {
        throw new Error('The form service answered with status ' + response.status);
      }
      return response.json();
    }).finally(function () {
      if (timer) { clearTimeout(timer); }
    });
  };

  /* ---------- Standard messages ---------- */
  FS.messages = {
    notConnected: 'This form is not connected yet, so nothing can be sent. ' +
      'Site owner: follow google-apps-script/README.md, then paste your Web App URL into assets/js/config.js.',
    sendFailed: function () {
      return 'Sorry, we could not send your form. Please check your internet connection and try again. ' +
        'If it keeps happening, email us at ' + (config.CONTACT_EMAIL || 'our HR team') + '.';
    }
  };

})(window.FlowState);
