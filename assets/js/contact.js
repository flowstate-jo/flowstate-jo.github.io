/* ============================================================================
   FLOW STATE — contact.js
   Runs the contact form on contact.html: checks the three fields, sends the
   message to Google Apps Script and shows the "Message sent" confirmation.
   You should not need to edit this file.
   ========================================================================== */
(function () {
  'use strict';

  var FS = window.FlowState;
  var form = document.getElementById('contact-form');
  if (!FS || !form) { return; }

  var statusBox = document.getElementById('contact-status');
  var submitButton = document.getElementById('contact-submit');
  var successPanel = document.getElementById('contact-success');
  var notConnectedBox = document.getElementById('form-not-connected');

  var triedToSubmit = false;
  var sending = false;

  // Tell the site owner straight away if the form has not been connected yet
  if (!FS.isFormConnected()) {
    notConnectedBox.textContent = FS.messages.notConnected;
    notConnectedBox.hidden = false;
  }

  function readValues() {
    return {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      message: form.elements.message.value.trim()
    };
  }

  // Returns a list of problems: [ { name, message, focus } ]
  function findProblems(values) {
    return [
      {
        name: 'name',
        message: values.name ? '' : 'Enter your name.',
        focus: form.elements.name
      },
      {
        name: 'email',
        message: !values.email ? 'Enter your email address.' :
          !FS.isValidEmail(values.email) ? 'Enter a valid email address, for example name@example.com.' : '',
        focus: form.elements.email
      },
      {
        name: 'message',
        message: !values.message ? 'Write your message.' :
          values.message.length < 10 ? 'Your message is very short. Please add a little more detail.' : '',
        focus: form.elements.message
      }
    ];
  }

  function showProblems(problems) {
    var remaining = [];
    problems.forEach(function (problem) {
      FS.setFieldError(form, problem.name, problem.message);
      if (problem.message) { remaining.push(problem); }
    });
    return remaining;
  }

  // After the first attempt, re-check while the visitor fixes things
  form.addEventListener('input', function () {
    if (!triedToSubmit || sending) { return; }
    if (!showProblems(findProblems(readValues())).length) {
      FS.setStatus(statusBox, null);
    }
  });

  function setSending(isSending) {
    sending = isSending;
    submitButton.disabled = isSending;
    submitButton.setAttribute('aria-busy', isSending ? 'true' : 'false');
    submitButton.innerHTML = isSending
      ? '<span class="spinner" aria-hidden="true"></span>Sending…'
      : 'Send message';
  }

  function showSuccess(name) {
    form.hidden = true;
    notConnectedBox.hidden = true;
    document.getElementById('success-name').textContent = name ? ', ' + name.split(' ')[0] : '';
    successPanel.hidden = false;
    successPanel.focus();
    successPanel.scrollIntoView({ block: 'center' });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (sending) { return; }

    triedToSubmit = true;
    var values = readValues();
    var problems = showProblems(findProblems(values));

    if (problems.length) {
      FS.setStatus(statusBox, 'error', problems.length === 1
        ? 'Please fix the field marked in red above, then send again.'
        : 'Please fix the ' + problems.length + ' fields marked in red above, then send again.');
      problems[0].focus.focus();
      return;
    }

    // Spam trap filled in = a robot. Pretend everything worked and send nothing.
    if (form.elements.favorite_color.value) {
      showSuccess(values.name);
      return;
    }

    if (!FS.isFormConnected()) {
      FS.setStatus(statusBox, 'error', FS.messages.notConnected);
      return;
    }

    setSending(true);
    FS.setStatus(statusBox, 'info', 'Sending your message…');

    FS.sendForm({
      formType: 'contact',
      name: values.name,
      email: values.email,
      message: values.message,
      favorite_color: form.elements.favorite_color.value,   // spam trap — real people leave it empty
      elapsedMs: FS.timeOnPage()                            // spam check — time spent on the page
    }).then(function (answer) {
      setSending(false);
      if (answer && answer.ok) {
        showSuccess(values.name);
      } else {
        FS.setStatus(statusBox, 'error', (answer && answer.error) || FS.messages.sendFailed());
      }
    }).catch(function () {
      setSending(false);
      FS.setStatus(statusBox, 'error', FS.messages.sendFailed());
    });
  });

})();
