/* ============================================================================
   FLOW STATE — apply.js
   Runs the application form on careers.html:
     1. Prepares the form (country codes, date limits, recorder)
     2. Checks every field and shows clear error messages
     3. Sends the application (with the CV and the recording) to Google Apps Script
     4. Shows the "Application received" message

   To change limits (file sizes, recording length, minimum age) edit
   assets/js/config.js — not this file.
   ========================================================================== */
(function () {
  'use strict';

  var FS = window.FlowState;
  var form = document.getElementById('application-form');
  if (!FS || !form) { return; }

  var config = FS.config;
  var statusBox = document.getElementById('application-status');
  var submitButton = document.getElementById('application-submit');
  var successPanel = document.getElementById('application-success');
  var notConnectedBox = document.getElementById('form-not-connected');
  var recordPanel = document.getElementById('audio-record-panel');
  var uploadPanel = document.getElementById('audio-upload-panel');

  var CV_TYPES = ['pdf', 'doc', 'docx'];
  var AUDIO_TYPES = ['mp3', 'm4a', 'wav', 'webm'];
  var MAX_CV_MB = config.MAX_CV_MB || 5;
  var MAX_AUDIO_MB = config.MAX_AUDIO_MB || 10;
  var MAX_RECORDING_SECONDS = config.MAX_RECORDING_SECONDS || 120;
  var MIN_RECORDING_SECONDS = config.MIN_RECORDING_SECONDS || 0;
  var MIN_AGE = config.MIN_AGE || 0;

  var triedToSubmit = false;   // error messages only appear after the first attempt
  var sending = false;
  var recorder = null;

  // Names: letters from any language, plus spaces, dots, hyphens and apostrophes
  var NAME_PATTERN;
  try {
    NAME_PATTERN = new RegExp("^[\\p{L}\\p{M}][\\p{L}\\p{M} .'’\\-]*$", 'u');
  } catch (oldBrowser) {
    NAME_PATTERN = /^[^\d@#$%^&*()_+=\[\]{};:"\\|<>\/?~`!,]+$/;
  }


  /* ==========================================================================
     1. PREPARE THE FORM
     ========================================================================== */

  // Put numbers from config.js into the page text (e.g. "up to 5 MB")
  var configText = {
    MAX_CV_MB: MAX_CV_MB,
    MAX_AUDIO_MB: MAX_AUDIO_MB,
    MAX_RECORDING_MINUTES: Math.max(1, Math.round(MAX_RECORDING_SECONDS / 60))
  };
  var configSpans = document.querySelectorAll('[data-config]');
  for (var i = 0; i < configSpans.length; i++) {
    var key = configSpans[i].getAttribute('data-config');
    if (configText[key] !== undefined) { configSpans[i].textContent = configText[key]; }
  }

  // Country codes for the phone field
  var countrySelect = form.elements.phoneCountry;
  var countries = FS.COUNTRY_CODES || [];
  if (countries.length) {
    var defaultCountry = config.DEFAULT_COUNTRY || 'JO';
    countrySelect.innerHTML = '';
    countries.forEach(function (country) {
      var option = document.createElement('option');
      option.value = country[0];
      option.setAttribute('data-dial', country[2]);
      option.textContent = country[1] + ' (+' + country[2] + ')';
      if (country[0] === defaultCountry) { option.selected = true; }
      countrySelect.appendChild(option);
    });
  }

  // Date of birth: sensible earliest and latest dates in the date picker
  var dobInput = form.elements.dateOfBirth;
  var today = new Date();
  function isoDate(year, month, day) {
    return year + '-' + (month < 10 ? '0' : '') + month + '-' + (day < 10 ? '0' : '') + day;
  }
  dobInput.max = isoDate(today.getFullYear() - MIN_AGE, today.getMonth() + 1, today.getDate());
  dobInput.min = isoDate(today.getFullYear() - 100, 1, 1);
  if (MIN_AGE) {
    document.getElementById('dateOfBirth-hint').textContent = 'You must be at least ' + MIN_AGE + ' years old to apply.';
  }

  // Voice recorder
  var recordChoice = form.querySelector('input[name="audioMethod"][value="record"]');
  var uploadChoice = form.querySelector('input[name="audioMethod"][value="upload"]');

  if (FS.canRecordAudio()) {
    recorder = FS.createVoiceRecorder({
      root: document.getElementById('recorder'),
      maxSeconds: MAX_RECORDING_SECONDS,
      onStart: function () { FS.setFieldError(form, 'audio', ''); },   // hide any old "please record" message
      onChange: recheck
    });
  } else {
    // This browser cannot record: switch to "Upload a file" and explain why
    recordChoice.disabled = true;
    uploadChoice.checked = true;
    document.getElementById('recorder-unavailable').hidden = false;
  }

  function showAudioMethod() {
    var method = form.elements.audioMethod.value;
    recordPanel.hidden = (method !== 'record');
    uploadPanel.hidden = (method !== 'upload');
    if (recorder && method === 'upload') {
      recorder.stop();           // stop (and keep) a recording that is still running
      recorder.pausePlayback();
    }
  }
  recordChoice.addEventListener('change', showAudioMethod);
  uploadChoice.addEventListener('change', showAudioMethod);
  showAudioMethod();

  // Tell the site owner straight away if the form has not been connected yet
  if (!FS.isFormConnected()) {
    notConnectedBox.textContent = FS.messages.notConnected;
    notConnectedBox.hidden = false;
  }


  /* ==========================================================================
     2. CHECK THE FIELDS
     ========================================================================== */

  // The phone number, cleaned up: "+962" + "079 123 4567" -> "+962791234567"
  function readPhone() {
    var option = countrySelect.options[countrySelect.selectedIndex];
    var dial = option ? (option.getAttribute('data-dial') || '') : '';
    var typed = form.elements.phoneNumber.value.trim();
    var digits = typed.replace(/[\s().\-]/g, '');

    // If they typed the country code as well, remove it so it is not doubled
    if (digits.indexOf('+' + dial) === 0) {
      digits = digits.slice(dial.length + 1);
    } else if (digits.indexOf('00' + dial) === 0) {
      digits = digits.slice(dial.length + 2);
    }
    digits = digits.replace(/^0+/, '');   // 079... -> 79...

    var valid = /^\d{6,12}$/.test(digits) && (dial.length + digits.length) <= 15;
    if (valid && countrySelect.value === 'JO') {
      valid = /^\d{8,9}$/.test(digits);   // Jordanian numbers have 8 or 9 digits after +962
    }
    return { typed: typed, country: countrySelect.value, full: '+' + dial + digits, valid: valid };
  }

  function readValues() {
    return {
      firstName: form.elements.firstName.value.trim(),
      lastName: form.elements.lastName.value.trim(),
      email: form.elements.email.value.trim(),
      phone: readPhone(),
      dateOfBirth: dobInput.value.trim(),
      usHours: form.elements.usHours.value,
      englishLevel: form.elements.englishLevel.value,
      cvFile: form.elements.cvFile.files[0] || null,
      audioMethod: form.elements.audioMethod.value,
      audioFile: form.elements.audioFile.files[0] || null,
      recording: recorder ? recorder.getRecording() : null,
      consent: form.elements.consent.checked
    };
  }

  function checkName(value, label) {
    if (!value) { return 'Enter your ' + label + '.'; }
    if (!NAME_PATTERN.test(value)) { return 'Your ' + label + ' should only contain letters.'; }
    return '';
  }

  function checkDateOfBirth(value) {
    if (!value) { return 'Enter your date of birth.'; }
    var parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) { return 'Enter your date of birth as year-month-day, for example 1998-04-23.'; }

    var year = Number(parts[1]);
    var month = Number(parts[2]);
    var day = Number(parts[3]);
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return 'That date does not exist. Please check it.';
    }

    var now = new Date();
    if (date > now) { return 'Your date of birth cannot be in the future.'; }

    var age = now.getFullYear() - year;
    var hadBirthdayThisYear = (now.getMonth() > month - 1) || (now.getMonth() === month - 1 && now.getDate() >= day);
    if (!hadBirthdayThisYear) { age -= 1; }

    if (age > 100) { return 'Please check the year of your date of birth.'; }
    if (MIN_AGE && age < MIN_AGE) { return 'You must be at least ' + MIN_AGE + ' years old to apply.'; }
    return '';
  }

  function checkFile(file, allowedTypes, maxMb, missingMessage, typeMessage) {
    if (!file) { return missingMessage; }
    if (allowedTypes.indexOf(FS.fileExtension(file.name)) === -1) { return typeMessage; }
    if (file.size === 0) { return 'This file is empty. Please choose a different file.'; }
    if (file.size > maxMb * 1024 * 1024) {
      return 'This file is too large (' + FS.formatBytes(file.size) + '). The maximum size is ' + maxMb + ' MB.';
    }
    return '';
  }

  function checkAudio(values) {
    if (recorder && recorder.isBusy()) {
      return 'You are still recording. Press “Stop” first.';
    }
    if (values.audioMethod === 'record') {
      if (!values.recording) {
        return 'Record yourself reading the paragraph — or choose “Upload a file”.';
      }
      if (values.recording.seconds < MIN_RECORDING_SECONDS) {
        return 'Your recording is very short (' + FS.formatTime(values.recording.seconds) + '). Please record yourself reading the whole paragraph.';
      }
      if (values.recording.blob.size > MAX_AUDIO_MB * 1024 * 1024) {
        return 'Your recording is too large to send. Please record it again.';
      }
      return '';
    }
    return checkFile(values.audioFile, AUDIO_TYPES, MAX_AUDIO_MB,
      'Choose an audio file — or choose “Record now”.',
      'This file type is not accepted. Please upload an MP3, M4A, WAV or WebM file.');
  }

  /* Returns a list of problems, in the order the fields appear on the page:
     [ { name: field name, message: what is wrong, focus: element to jump to } ] */
  function findProblems(values) {
    var problems = [];
    function add(name, message, focusElement) {
      problems.push({ name: name, message: message, focus: focusElement });
    }

    add('firstName', checkName(values.firstName, 'first name'), form.elements.firstName);
    add('lastName', checkName(values.lastName, 'last name'), form.elements.lastName);

    add('email',
      !values.email ? 'Enter your email address.' :
      !FS.isValidEmail(values.email) ? 'Enter a valid email address, for example name@example.com.' : '',
      form.elements.email);

    add('phoneNumber',
      !values.phone.typed ? 'Enter your phone number.' :
      !values.phone.valid ? 'Enter a valid phone number using digits only, for example 79 123 4567.' : '',
      form.elements.phoneNumber);

    add('dateOfBirth', checkDateOfBirth(values.dateOfBirth), dobInput);

    add('usHours', values.usHours ? '' : 'Choose Yes or No.', document.getElementById('usHours-yes'));

    add('englishLevel', values.englishLevel ? '' : 'Choose your English level.', form.elements.englishLevel);

    add('cvFile',
      checkFile(values.cvFile, CV_TYPES, MAX_CV_MB,
        'Upload your CV.',
        'This file type is not accepted. Please upload a PDF or Word document (.pdf, .doc or .docx).'),
      form.elements.cvFile);

    var audioFocus = form.elements.audioFile;
    if (values.audioMethod === 'record') {
      audioFocus = values.recording ? document.getElementById('recorder-redo') : document.getElementById('recorder-start');
    }
    add('audio', checkAudio(values), audioFocus);

    add('consent', values.consent ? '' : 'Tick the box to agree before you submit.', form.elements.consent);

    return problems;
  }

  // Show (or clear) the message under every field. Returns the fields that still have a problem.
  function showProblems(problems) {
    var remaining = [];
    problems.forEach(function (problem) {
      FS.setFieldError(form, problem.name, problem.message);
      if (problem.message) { remaining.push(problem); }
    });
    return remaining;
  }

  // After the first attempt, re-check as the candidate fixes things
  function recheck() {
    if (!triedToSubmit || sending) { return; }
    var remaining = showProblems(findProblems(readValues()));
    if (!remaining.length) {
      FS.setStatus(statusBox, null);
    }
  }
  form.addEventListener('input', recheck);
  form.addEventListener('change', recheck);

  // Check a file as soon as it is chosen, so problems show up immediately
  form.elements.cvFile.addEventListener('change', function () {
    var file = form.elements.cvFile.files[0];
    if (file) {
      FS.setFieldError(form, 'cvFile', checkFile(file, CV_TYPES, MAX_CV_MB, '',
        'This file type is not accepted. Please upload a PDF or Word document (.pdf, .doc or .docx).'));
    }
  });
  form.elements.audioFile.addEventListener('change', function () {
    var file = form.elements.audioFile.files[0];
    if (file) {
      FS.setFieldError(form, 'audio', checkFile(file, AUDIO_TYPES, MAX_AUDIO_MB, '',
        'This file type is not accepted. Please upload an MP3, M4A, WAV or WebM file.'));
    }
  });


  /* ==========================================================================
     3. SEND THE APPLICATION
     ========================================================================== */

  function setSending(isSending) {
    sending = isSending;
    submitButton.disabled = isSending;
    submitButton.setAttribute('aria-busy', isSending ? 'true' : 'false');
    submitButton.innerHTML = isSending
      ? '<span class="spinner" aria-hidden="true"></span>Sending…'
      : 'Submit application';
  }

  // Bundle everything into one message for Google Apps Script
  function buildMessage(values) {
    var recorded = (values.audioMethod === 'record');
    var audioSource = recorded ? values.recording.blob : values.audioFile;

    return Promise.all([
      FS.fileToBase64(values.cvFile),
      FS.fileToBase64(audioSource)
    ]).then(function (files) {
      return {
        formType: 'application',
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone.full,
        phoneCountry: values.phone.country,
        dateOfBirth: values.dateOfBirth,
        usHours: values.usHours,
        englishLevel: values.englishLevel,
        consent: true,
        cv: {
          name: values.cvFile.name,
          data: files[0]
        },
        audio: {
          name: recorded ? ('recording.' + values.recording.extension) : values.audioFile.name,
          data: files[1],
          source: recorded ? 'Recorded in the browser' : 'Uploaded file',
          seconds: recorded ? Math.round(values.recording.seconds) : null
        },
        favorite_color: form.elements.favorite_color.value,   // spam trap — real people leave it empty
        elapsedMs: FS.timeOnPage()                            // spam check — time spent on the page
      };
    });
  }

  function showSuccess(firstName) {
    form.hidden = true;
    notConnectedBox.hidden = true;
    document.getElementById('success-name').textContent = firstName ? ', ' + firstName : '';
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
        ? 'Please fix the field marked in red above, then submit again.'
        : 'Please fix the ' + problems.length + ' fields marked in red above, then submit again.');
      if (problems[0].focus) { problems[0].focus.focus(); }
      return;
    }

    // Spam trap filled in = a robot. Pretend everything worked and send nothing.
    if (form.elements.favorite_color.value) {
      showSuccess(values.firstName);
      return;
    }

    if (!FS.isFormConnected()) {
      FS.setStatus(statusBox, 'error', FS.messages.notConnected);
      return;
    }

    setSending(true);
    if (recorder) { recorder.pausePlayback(); }
    FS.setStatus(statusBox, 'info',
      'Sending your application… This can take up to a minute on a slow connection. Please keep this page open.');

    buildMessage(values)
      .then(FS.sendForm)
      .then(function (answer) {
        setSending(false);
        if (answer && answer.ok) {
          showSuccess(values.firstName);
        } else {
          FS.setStatus(statusBox, 'error', (answer && answer.error) || FS.messages.sendFailed());
        }
      })
      .catch(function () {
        setSending(false);
        FS.setStatus(statusBox, 'error', FS.messages.sendFailed());
      });
  });

  // Warn before leaving the page while an application is still uploading
  window.addEventListener('beforeunload', function (event) {
    if (sending) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

})();
