/**
 * In-extension bug reporting.
 *
 * The "Report a Bug" buttons open a small form page inside the extension
 * (src/bugreport/bugreport.html). Submitting posts the report straight to a Google Form,
 * so users don't need an account anywhere. A GitHub issue is offered as a second option.
 *
 * Only version numbers and yes/no flags are attached automatically — no API keys,
 * page URLs or card contents. The user can see the environment details before sending.
 */
(function () {
  'use strict';

  const FORM_ID = '1FAIpQLSeD260kecbctq2v9GUnL2ulVHWYhy-cZO_csyF8aY0f9RMkYA';
  const FORM_ACTION = `https://docs.google.com/forms/d/e/${FORM_ID}/formResponse`;
  // Google Form question IDs
  const ENTRY = {
    what: 'entry.2085178951',
    expected: 'entry.2040384228',
    steps: 'entry.938681144',
    where: 'entry.1771881633',
    environment: 'entry.362558335',
    email: 'entry.1864407208'
  };
  const GITHUB_ISSUES_URL = 'https://github.com/selfstudyhebrew/selfstudyhebrew/issues/new';
  const REPORT_PAGE = 'src/bugreport/bugreport.html';

  function describeBrowser() {
    const ua = navigator.userAgent || '';
    let m;
    if ((m = /Firefox\/([\d.]+)/.exec(ua))) return `Firefox ${m[1]}`;
    if ((m = /Edg\/([\d.]+)/.exec(ua))) return `Edge ${m[1]}`;
    if ((m = /Chrome\/([\d.]+)/.exec(ua))) return `Chrome ${m[1]}`;
    return ua || 'Unknown';
  }

  function describeOS() {
    return (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || 'Unknown';
  }

  const yesNo = value => (value ? 'yes' : 'no');

  /** Auto-collected environment details, one "- key: value" line each. */
  async function getEnvironment() {
    const lines = [
      `- Extension version: ${chrome.runtime.getManifest().version}`,
      `- Browser: ${describeBrowser()}`,
      `- OS: ${describeOS()}`
    ];
    try {
      const data = await chrome.storage.local.get('settings');
      const s = data.settings || {};
      lines.push(
        `- Word highlighting on: ${yesNo(s.highlightEnabled !== false)}`,
        `- Subtitle reader on: ${yesNo(s.subtitleReaderEnabled !== false)}`,
        `- Claude API key set: ${yesNo(s.claudeApiKey)}`,
        `- Claude model: ${s.claudeModel || 'auto'}`,
        `- ElevenLabs key set: ${yesNo(s.elevenLabsApiKey)}`
      );
    } catch (e) {
      lines.push('- Settings: could not be read');
    }
    try {
      const anki = await chrome.runtime.sendMessage({ action: 'checkAnkiConnect' });
      lines.push(`- AnkiConnect reachable: ${yesNo(anki && anki.available)}`);
    } catch (e) {
      lines.push('- AnkiConnect reachable: unknown');
    }
    return lines.join('\n');
  }

  /** Open the in-extension report form in a new tab. */
  function openBugReport() {
    chrome.tabs.create({ url: chrome.runtime.getURL(REPORT_PAGE) });
  }

  /**
   * Post a report to the Google Form. The browser can't read Google's reply (cross-origin),
   * so this only throws if the request itself fails (e.g. offline).
   */
  async function submitBugReport(fields) {
    const body = new URLSearchParams();
    body.set(ENTRY.what, fields.what || '');
    body.set(ENTRY.expected, fields.expected || '');
    body.set(ENTRY.steps, fields.steps || '');
    body.set(ENTRY.where, fields.where || '');
    body.set(ENTRY.environment, fields.environment || '');
    body.set(ENTRY.email, fields.email || '');
    await fetch(FORM_ACTION, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    });
  }

  /** Open a pre-filled GitHub issue (for users who prefer GitHub). */
  function openGitHubIssue(fields) {
    const body = [
      '## What went wrong?',
      fields.what || '',
      '',
      '## What did you expect to happen?',
      fields.expected || '',
      '',
      '## Steps to reproduce',
      fields.steps || '1. ',
      '',
      '## Where did it happen?',
      fields.where || '',
      '',
      '---',
      '<sub>Auto-filled environment details (no API keys, page URLs or card contents are included):</sub>',
      '',
      fields.environment || ''
    ].join('\n');
    const url = `${GITHUB_ISSUES_URL}?title=${encodeURIComponent('[Bug] ')}&labels=bug&body=${encodeURIComponent(body)}`;
    chrome.tabs.create({ url });
  }

  window.SSHBugReport = { getEnvironment, openBugReport, submitBugReport, openGitHubIssue };
  window.openBugReport = openBugReport;
})();
