/* ============================================================================
   FLOW STATE — voice-recorder.js
   The voice recorder on the application form:
       Start recording  ->  Stop  ->  Play  ->  Record again
   It uses the browser's built-in "MediaRecorder" feature, so it is free and
   nothing is sent anywhere until the candidate submits the form.

   The maximum length is set in assets/js/config.js (MAX_RECORDING_SECONDS).
   You should not need to edit this file.
   ========================================================================== */
window.FlowState = window.FlowState || {};

(function (FS) {
  'use strict';

  /* Can this browser record audio? (It needs a secure https:// page and a
     reasonably modern browser. If not, candidates can still upload a file.) */
  FS.canRecordAudio = function () {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  };

  // Work out the file ending from the format the browser recorded in
  function extensionFor(mimeType) {
    var type = String(mimeType || '').toLowerCase();
    if (type.indexOf('webm') !== -1) { return 'webm'; }   // Chrome, Edge, Android
    if (type.indexOf('ogg') !== -1) { return 'ogg'; }     // Firefox
    if (type.indexOf('mp4') !== -1 || type.indexOf('m4a') !== -1 || type.indexOf('aac') !== -1) { return 'm4a'; } // iPhone, Safari
    if (type.indexOf('wav') !== -1) { return 'wav'; }
    if (type.indexOf('mpeg') !== -1 || type.indexOf('mp3') !== -1) { return 'mp3'; }
    return 'webm';
  }

  // Turn a technical microphone error into a helpful sentence
  function microphoneProblem(error) {
    var name = error && error.name;
    var fallback = ' You can also choose “Upload a file” instead.';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone access was blocked. Allow the microphone for this site in your browser settings and try again. ' +
        'If you opened this page inside an app such as Instagram or LinkedIn, open it in Chrome or Safari.' + fallback;
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'No microphone was found on this device.' + fallback;
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      return 'Your microphone is being used by another app. Close that app and try again.' + fallback;
    }
    return 'Recording could not start in this browser. Try opening this page in Chrome or Safari.' + fallback;
  }

  /* Create the recorder.
       options.root         the <div class="recorder"> element on the page
       options.maxSeconds   the recording stops by itself at this length
       options.onStart      called when a recording begins
       options.onChange     called whenever a recording is saved or deleted */
  FS.createVoiceRecorder = function (options) {
    var root = options.root;
    var maxSeconds = options.maxSeconds || 120;
    var onStart = options.onStart || function () {};
    var onChange = options.onChange || function () {};

    var el = {
      time: root.querySelector('#recorder-time'),
      total: root.querySelector('#recorder-total'),
      bar: root.querySelector('#recorder-bar'),
      start: root.querySelector('#recorder-start'),
      stop: root.querySelector('#recorder-stop'),
      play: root.querySelector('#recorder-play'),
      playIcon: root.querySelector('#recorder-play-icon'),
      playLabel: root.querySelector('#recorder-play-label'),
      redo: root.querySelector('#recorder-redo'),
      status: root.querySelector('#recorder-status')
    };

    var state = 'idle';          // idle -> starting -> recording -> saving -> recorded
    var microphone = null;       // the live microphone stream
    var mediaRecorder = null;
    var chunks = [];             // pieces of audio collected while recording
    var startedAt = 0;
    var recordedSeconds = 0;
    var stoppedByLimit = false;
    var ticker = null;
    var recording = null;        // the finished recording: { blob, seconds, mimeType, extension }
    var player = new Audio();    // used for "Play"
    var playerUrl = '';

    /* ---------- Display ---------- */

    function setState(newState) {
      state = newState;
      root.setAttribute('data-state', newState);
      el.start.hidden = !(newState === 'idle' || newState === 'starting');
      el.start.disabled = (newState === 'starting');
      el.stop.hidden = (newState !== 'recording');
      el.play.hidden = (newState !== 'recorded');
      el.redo.hidden = (newState !== 'recorded');
    }

    function showTime(current, total) {
      el.time.textContent = FS.formatTime(current);
      el.total.textContent = FS.formatTime(total);
      el.bar.style.width = (total > 0 ? Math.min(100, (current / total) * 100) : 0) + '%';
    }

    function say(message, isError) {
      el.status.textContent = message;
      el.status.classList.toggle('is-error', !!isError);
    }

    function showPlayButton(isPlaying) {
      el.playLabel.textContent = isPlaying ? 'Pause' : 'Play';
      el.playIcon.className = 'btn-icon ' + (isPlaying ? 'btn-icon-pause' : 'btn-icon-play');
    }

    /* ---------- Recording ---------- */

    function releaseMicrophone() {
      if (microphone) {
        microphone.getTracks().forEach(function (track) { track.stop(); });
        microphone = null;
      }
    }

    function start() {
      if (state !== 'idle') { return; }
      setState('starting');
      say('Waiting for your microphone… If your browser asks for permission, choose “Allow”.');

      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        microphone = stream;
        chunks = [];
        stoppedByLimit = false;
        recordedSeconds = 0;

        // 64 kbps keeps the file small (about 1 MB for 2 minutes) and is plenty for speech
        try {
          mediaRecorder = new MediaRecorder(stream, { audioBitsPerSecond: 64000 });
        } catch (unsupportedOption) {
          mediaRecorder = new MediaRecorder(stream);
        }

        mediaRecorder.addEventListener('dataavailable', function (event) {
          if (event.data && event.data.size > 0) { chunks.push(event.data); }
        });
        mediaRecorder.addEventListener('stop', finish);
        mediaRecorder.start();

        startedAt = Date.now();
        setState('recording');
        showTime(0, maxSeconds);
        say('Recording… Read the paragraph out loud, then press “Stop”.');
        ticker = setInterval(tick, 200);
        el.stop.focus();
        onStart();
      }).catch(function (error) {
        releaseMicrophone();
        setState('idle');
        say(microphoneProblem(error), true);
      });
    }

    // Runs 5 times a second while recording: updates the timer and enforces the limit
    function tick() {
      var elapsed = (Date.now() - startedAt) / 1000;
      showTime(Math.min(elapsed, maxSeconds), maxSeconds);
      if (elapsed >= maxSeconds) {
        stoppedByLimit = true;
        stop();
      }
    }

    // Freeze the timer and remember how long the recording is
    function stopTimer() {
      clearInterval(ticker);
      recordedSeconds = Math.min((Date.now() - startedAt) / 1000, maxSeconds);
    }

    function stop() {
      if (state !== 'recording') { return; }
      stopTimer();
      setState('saving');
      if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();    // the browser then calls finish() below
      } else {
        finish();
      }
    }

    // Called by the browser once the recording has been fully saved
    function finish() {
      if (state === 'recording') {
        stopTimer();             // the browser ended the recording itself (e.g. microphone unplugged)
      } else if (state !== 'saving') {
        return;
      }

      var mimeType = (mediaRecorder && mediaRecorder.mimeType) || (chunks[0] && chunks[0].type) || 'audio/webm';
      var blob = new Blob(chunks, { type: mimeType });
      chunks = [];
      releaseMicrophone();

      if (!blob.size) {
        setState('idle');
        showTime(0, maxSeconds);
        say('Nothing was recorded. Please try again, or choose “Upload a file”.', true);
        return;
      }

      recording = {
        blob: blob,
        seconds: recordedSeconds,
        mimeType: mimeType.split(';')[0],
        extension: extensionFor(mimeType)
      };

      playerUrl = URL.createObjectURL(blob);
      player.src = playerUrl;
      showPlayButton(false);
      setState('recorded');
      showTime(recordedSeconds, recordedSeconds);
      say((stoppedByLimit ? 'You reached the maximum length, so the recording stopped. ' : '') +
        'Recording saved (' + FS.formatTime(recordedSeconds) + '). Press “Play” to listen, or “Record again” to replace it.');
      el.play.focus();
      onChange();
    }

    /* ---------- Play back ---------- */

    function togglePlay() {
      if (!recording) { return; }
      if (player.paused) {
        var started = player.play();
        if (started && started.catch) {
          started.catch(function () {
            say('Your browser could not play the recording. You can still send it, or record again.', true);
          });
        }
      } else {
        player.pause();
      }
    }

    player.addEventListener('play', function () { showPlayButton(true); });
    player.addEventListener('pause', function () { showPlayButton(false); });
    player.addEventListener('timeupdate', function () {
      if (recording && !player.paused) {
        showTime(Math.min(player.currentTime, recording.seconds), recording.seconds);
      }
    });
    player.addEventListener('ended', function () {
      showPlayButton(false);
      player.currentTime = 0;
      if (recording) { showTime(recording.seconds, recording.seconds); }
    });

    /* ---------- Record again ---------- */

    function discard() {
      player.pause();
      player.removeAttribute('src');
      player.load();
      if (playerUrl) {
        URL.revokeObjectURL(playerUrl);
        playerUrl = '';
      }
      recording = null;
      setState('idle');
      showTime(0, maxSeconds);
      say('Previous recording deleted. Press “Start recording” when you are ready.');
      el.start.focus();
      onChange();
    }

    /* ---------- Connect the buttons ---------- */
    el.start.addEventListener('click', start);
    el.stop.addEventListener('click', stop);
    el.play.addEventListener('click', togglePlay);
    el.redo.addEventListener('click', discard);

    // Switch the microphone off if the visitor leaves the page while recording
    window.addEventListener('pagehide', releaseMicrophone);

    setState('idle');
    showTime(0, maxSeconds);

    /* ---------- What the application form can use ---------- */
    return {
      getRecording: function () { return recording; },
      isBusy: function () { return state === 'starting' || state === 'recording' || state === 'saving'; },
      stop: stop,
      pausePlayback: function () { player.pause(); }
    };
  };

})(window.FlowState);
