(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const form = $('bug-form');
  const sendBtn = $('send-btn');
  const statusEl = $('status');

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = kind || '';
  }

  function readFields() {
    return {
      what: $('what').value.trim(),
      expected: $('expected').value.trim(),
      steps: $('steps').value.trim(),
      where: $('where').value.trim(),
      email: $('email').value.trim(),
      environment: $('environment').value.trim()
    };
  }

  window.SSHBugReport.getEnvironment().then(env => { $('environment').value = env; });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const fields = readFields();
    if (!fields.what) {
      setStatus('Please describe what went wrong.', 'err');
      $('what').focus();
      return;
    }
    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';
    setStatus('', '');
    try {
      await window.SSHBugReport.submitBugReport(fields);
      ['what', 'expected', 'steps', 'where'].forEach(id => { $(id).value = ''; });
      setStatus('✓ Thanks — your report was sent.', 'ok');
    } catch (error) {
      setStatus('Could not send the report (' + error.message + '). Check your connection and try again — your text is still here.', 'err');
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Send report';
    }
  });

  $('github-btn').addEventListener('click', () => {
    window.SSHBugReport.openGitHubIssue(readFields());
  });
})();
