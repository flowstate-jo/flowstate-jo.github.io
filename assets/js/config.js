/* ============================================================================
   FLOW STATE — SITE SETTINGS
   ============================================================================
   This is the only JavaScript file you normally need to edit.

   Rules when editing:
     - Only change the text between the "quotes", or the numbers.
     - Keep the quotes, commas and colons exactly as they are.
   ========================================================================== */
window.FLOWSTATE_CONFIG = {

  /* 1. WHERE THE FORMS ARE SENT
        Paste the "Web app URL" from Google Apps Script between the quotes.
        It looks like:  https://script.google.com/macros/s/AKfycb.........../exec
        Full instructions: google-apps-script/README.md
        Until you do this, the forms show a "not connected yet" message. */
  FORM_ENDPOINT: "https://script.google.com/macros/s/AKfycbyUFgVGDUFEiciJtUkDE7oDN2WSrx3zQc1aCjk6CnuQt4AP3vf-72twmornncVlMNjD2g/exec",

  /* 2. EMAIL SHOWN TO VISITORS if a form cannot be sent
        (This does NOT control where applications go — that is set in
        google-apps-script/Code.gs.) */
  CONTACT_EMAIL: "austin@velarya.com",

  /* 3. UPLOAD SIZE LIMITS, in megabytes (MB)
        If you change these, change the same two numbers at the top of
        google-apps-script/Code.gs as well. */
  MAX_CV_MB: 5,
  MAX_AUDIO_MB: 10,

  /* 4. VOICE RECORDING LENGTH, in seconds
        MAX: the recorder stops by itself at this point (120 = 2 minutes).
        MIN: shorter recordings are rejected as "too short". */
  MAX_RECORDING_SECONDS: 120,
  MIN_RECORDING_SECONDS: 10,

  /* 5. MINIMUM AGE to apply. Use 0 to switch the age check off.
        (Also change MIN_AGE in google-apps-script/Code.gs.) */
  MIN_AGE: 18,

  /* 6. COUNTRY CODE selected by default in the phone field ("JO" = Jordan, +962).
        Use the two-letter code from assets/js/country-codes.js. */
  DEFAULT_COUNTRY: "JO"
};
