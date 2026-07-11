// Dictionary popup feature for Shift+hover word lookup

(function() {
  'use strict';

  // Module state
let dictionaryPopup = null;
let currentPopupWord = null;
let isPopupVisible = false;
let frequencyData = null;
let binyanimData = null;

/**
 * Escape HTML entities to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Load frequency data from JSON file
 */
async function loadFrequencyData() {
  if (frequencyData) return; // Already loaded

  try {
    const response = await fetch(chrome.runtime.getURL('src/dictionary/frequency.json'));
    frequencyData = await response.json();
    console.log('Frequency data loaded:', frequencyData.length, 'words');
  } catch (error) {
    console.error('Error loading frequency data:', error);
  }
}

/**
 * Get frequency percentile for a word
 * @param {string} word - Hebrew word to check
 * @returns {Object|null} Frequency info {rank, percentile, label}
 */
function getFrequencyInfo(word) {
  if (!frequencyData) return null;

  const index = frequencyData.indexOf(word);
  if (index === -1) return null;

  const totalWords = frequencyData.length;
  const percentile = ((index + 1) / totalWords) * 100;

  let label = '';
  if (percentile <= 1) label = 'Top 1%';
  else if (percentile <= 5) label = 'Top 5%';
  else if (percentile <= 10) label = 'Top 10%';
  else if (percentile <= 25) label = 'Top 25%';
  else if (percentile <= 50) label = 'Top 50%';
  else label = `${Math.round(percentile)}%`;

  return {
    rank: index + 1,
    percentile: percentile.toFixed(1),
    label: label
  };
}

/**
 * Load binyanim conjugation data from JSON file
 */
async function loadBinyanimData() {
  if (binyanimData) return; // Already loaded

  try {
    const response = await fetch(chrome.runtime.getURL('src/dictionary/binyanim.json'));
    binyanimData = await response.json();
    console.log('Binyanim data loaded:', binyanimData.length, 'verbs');
  } catch (error) {
    console.error('Error loading binyanim data:', error);
  }
}

/**
 * Search for word in binyanim data (infinitive or conjugations)
 * @param {string} word - Hebrew word to search for
 * @returns {Object|null} Verb information
 */
function findVerbInfo(word) {
  if (!binyanimData) return null;

  // Search through all verbs
  for (const verb of binyanimData) {
    // Check if word matches the infinitive
    if (verb.infinitive.hebrew === word) {
      return verb;
    }
    // Check if word matches any conjugation
    if (verb.conjugations.includes(word)) {
      return verb;
    }
  }

  return null;
}

/**
 * Create dictionary popup element
 * @returns {HTMLElement} Popup element
 */
function createDictionaryPopup() {
  if (dictionaryPopup) return dictionaryPopup;

  const popup = document.createElement('div');
  popup.id = window.DOM_IDS.DICTIONARY_POPUP;
  popup.style.cssText = `
    display: none;
    position: absolute;
    z-index: 2147483647;
    background: #13131a;
    color: #ededf5;
    border: 1px solid #2c2c3e;
    border-radius: 14px;
    padding: 0;
    box-shadow: 0 16px 48px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.05);
    max-width: 360px;
    max-height: 520px;
    overflow-y: auto;
    overflow-x: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13.5px;
    line-height: 1.55;
    scrollbar-width: thin;
    scrollbar-color: #2c2c3e transparent;
  `;

  // Add hover listeners to keep popup visible
  popup.addEventListener('mouseenter', () => {
    // Clear any pending hide timeout when hovering over popup
    if (wordHideTimeout) {
      clearTimeout(wordHideTimeout);
      wordHideTimeout = null;
    }
  });

  popup.addEventListener('mouseleave', () => {
    // Delay hiding to allow user to move mouse back
    wordHideTimeout = setTimeout(() => {
      hideDictionaryPopup();
    }, 300);
  });

  document.body.appendChild(popup);
  dictionaryPopup = popup;
  return popup;
}

/**
 * Show dictionary popup with word information
 * @param {string} word - Hebrew word to look up
 * @param {number} x - X coordinate for popup position
 * @param {number} y - Y coordinate for popup position
 * @param {Function} refreshWordsCallback - Callback to refresh word highlighting
 */
async function showDictionaryPopup(word, x, y, refreshWordsCallback) {
  // Prevent showing if already visible for this word
  if (isPopupVisible && currentPopupWord === word) {
    return;
  }

  // Set current word immediately to prevent duplicate calls
  currentPopupWord = word;
  isPopupVisible = true;

  // Clear any pending hide timeout
  if (wordHideTimeout) {
    clearTimeout(wordHideTimeout);
    wordHideTimeout = null;
  }

  const popup = createDictionaryPopup();

  // Load frequency and binyanim data if not already loaded
  await loadFrequencyData();
  await loadBinyanimData();

  // Show loading state
  popup.innerHTML = '<div style="padding:16px 18px;color:#5a5a72;font-size:13px;">Looking up...</div>';
  popup.style.display = 'block';

  // Smart positioning: check viewport boundaries
  const estimatedPopupHeight = 300;
  const estimatedPopupWidth = 500;
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const spaceBelow = viewportHeight - y;
  const spaceRight = viewportWidth - x;

  // Horizontal positioning - keep popup within viewport
  if (spaceRight < estimatedPopupWidth + 20) {
    // Not enough space on right, position to the left
    popup.style.left = Math.max(10, x - estimatedPopupWidth) + 'px';
  } else {
    popup.style.left = x + 'px';
  }

  // Vertical positioning - if not enough space below, position above
  // Use larger offset to prevent covering the word that triggered the popup
  if (spaceBelow < estimatedPopupHeight + 40) {
    popup.style.top = (y - estimatedPopupHeight - 10) + 'px';
    popup.style.bottom = 'auto';
  } else {
    popup.style.top = (y + 35) + 'px';
    popup.style.bottom = 'auto';
  }

  // Look up word
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'lookupWord',
      word: word
    });

    // Only update if we're still showing the same word
    if (currentPopupWord !== word) return;

    // Check if this is a phrase (multiple words)
    const isPhrase = word.trim().split(/\s+/).length > 1;

    const escapedWord = escapeHtml(word);

    // ── shared style tokens ───────────────────────────────
    const S = {
      surface2:  '#1a1a24',
      surface3:  '#21212e',
      border:    '#2c2c3e',
      accent:    '#5a7fff',
      accentDim: 'rgba(90,127,255,0.10)',
      text:      '#ededf5',
      muted:     '#8f8fa8',
      dimmer:    '#5a5a72',
      success:   '#34d399',
      successBg: 'rgba(52,211,153,0.10)',
      successBdr:'rgba(52,211,153,0.28)',
      info:      '#38bdf8',
      infoBg:    'rgba(56,189,248,0.10)',
      infoBdr:   'rgba(56,189,248,0.28)',
      btnBase:   `padding:7px 12px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:500;border:1px solid #2c2c3e;display:flex;align-items:center;justify-content:center;transition:all 0.15s ease;`,
    };

    // ── header ────────────────────────────────────────────
    let html = `
      <div style="
        padding: 14px 16px 12px;
        border-bottom: 1px solid ${S.border};
        position: relative;
      ">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,${S.accent},#9b6bff 60%,transparent);border-radius:14px 14px 0 0;"></div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div style="flex:1;min-width:0;">
            ${isPhrase ? `<div style="font-size:10px;font-weight:600;letter-spacing:0.5px;color:${S.accent};text-transform:uppercase;margin-bottom:4px;">Phrase</div>` : ''}
            <div style="font-weight:700;color:${S.text};font-size:20px;direction:rtl;line-height:1.3;word-break:break-word;">${escapedWord}</div>
          </div>
          <button id="play-pronunciation-btn" title="Play pronunciation" style="
            background:${S.surface2};
            border:1px solid ${S.border};
            border-radius:8px;
            cursor:pointer;
            font-size:15px;
            padding:6px 8px;
            flex-shrink:0;
            margin-top:2px;
            line-height:1;
            transition:all 0.15s ease;
          ">🔊</button>
        </div>`;

    // frequency badge
    if (!isPhrase) {
      const freqInfo = getFrequencyInfo(word);
      if (freqInfo) {
        const isCommon = freqInfo.percentile <= 10;
        const isMid    = freqInfo.percentile <= 25;
        const bg  = isCommon ? S.successBg  : isMid ? S.infoBg  : 'rgba(255,255,255,0.06)';
        const bdr = isCommon ? S.successBdr : isMid ? S.infoBdr : 'rgba(255,255,255,0.12)';
        const clr = isCommon ? S.success    : isMid ? S.info    : S.muted;
        html += `<div style="margin-top:8px;">
          <span style="font-size:10.5px;font-weight:600;background:${bg};color:${clr};border:1px solid ${bdr};padding:2px 9px;border-radius:20px;display:inline-block;letter-spacing:0.2px;">
            ${freqInfo.label} · #${freqInfo.rank.toLocaleString()}
          </span>
        </div>`;
      }
    }

    html += `</div>`; // end header

    // ── body ─────────────────────────────────────────────
    html += `<div style="padding:12px 16px;">`;

    // verb info card
    const verbInfo = !isPhrase ? findVerbInfo(word) : null;
    if (verbInfo) {
      html += `
        <div style="background:${S.surface2};border:1px solid ${S.border};border-left:3px solid ${S.info};border-radius:8px;padding:10px 12px;margin-bottom:12px;">
          <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${S.info};margin-bottom:6px;">Verb</div>
          <div style="font-size:17px;font-weight:700;direction:rtl;color:${S.text};margin-bottom:3px;">${escapeHtml(verbInfo.infinitive.hebrew)}</div>
          ${verbInfo.infinitive.transliteration ? `<div style="color:${S.muted};font-size:11.5px;font-style:italic;margin-bottom:2px;">${escapeHtml(verbInfo.infinitive.transliteration)}</div>` : ''}
          ${verbInfo.infinitive.english ? `<div style="color:${S.muted};font-size:12.5px;margin-bottom:7px;">${escapeHtml(verbInfo.infinitive.english)}</div>` : ''}
          <a href="${escapeHtml(verbInfo.url)}" target="_blank" style="color:${S.accent};text-decoration:none;font-size:11.5px;font-weight:500;">Full conjugation on Pealim →</a>
        </div>`;
    }

    // definitions
    if (response.success && response.results.length > 0) {
      response.results.forEach((result) => {
        if (!result.definitions || result.definitions.length === 0) return;

        if (result.source === 'custom') {
          html += `<div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${S.success};margin-bottom:6px;">My Definitions</div>`;
        }

        result.definitions.forEach((def) => {
          const isCustom = result.source === 'custom';
          html += `
            <div style="
              padding:7px 10px;
              margin-bottom:5px;
              background:${isCustom ? S.successBg : S.surface2};
              border:1px solid ${isCustom ? S.successBdr : S.border};
              border-radius:6px;
              font-size:13px;
              color:${S.text};
              line-height:1.5;
            ">${escapeHtml(def)}</div>`;
        });
      });
    } else {
      html += `<div style="color:${S.dimmer};font-size:13px;padding:4px 0 8px;">No definitions found</div>`;
    }

    // ── lookup tools ──────────────────────────────────────
    html += `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid ${S.border};">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${S.accent};margin-bottom:8px;">Look up</div>
        <button id="translate-btn" style="${S.btnBase}width:100%;background:${S.surface3};color:${S.text};border-color:#3a3a52;margin-bottom:6px;">Google Translate</button>
        <div id="translate-result" style="display:none;padding:8px 10px;background:${S.surface2};border:1px solid ${S.border};border-radius:6px;font-size:12.5px;color:${S.text};margin-bottom:6px;line-height:1.5;"></div>

        <div style="display:flex;gap:6px;margin-bottom:6px;">
          <button id="reverso-btn" style="${S.btnBase}flex:1;background:${S.surface3};color:${S.text};border-color:#3a3a52;">Reverso</button>
          <button id="pealim-btn" style="${S.btnBase}flex:1;background:${S.surface3};color:${S.text};border-color:#3a3a52;">Pealim</button>
        </div>
        <div id="reverso-result" style="display:none;padding:8px 10px;background:${S.surface2};border:1px solid ${S.border};border-left:3px solid ${S.accent};border-radius:6px;font-size:12.5px;color:${S.text};margin-bottom:6px;line-height:1.5;"></div>
        <div id="pealim-result"  style="display:none;padding:8px 10px;background:${S.surface2};border:1px solid ${S.border};border-left:3px solid ${S.accent};border-radius:6px;font-size:12.5px;color:${S.text};margin-bottom:6px;line-height:1.5;"></div>
      </div>
    `;

    // ── actions ───────────────────────────────────────────
    html += `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid ${S.border};display:flex;flex-direction:column;gap:6px;">
        <button id="create-card-btn" style="${S.btnBase}width:100%;background:${S.accent};color:white;border-color:transparent;font-size:13px;font-weight:600;padding:9px 12px;box-shadow:0 2px 8px rgba(90,127,255,0.28);">
          Create Anki Card
        </button>
        ${!isPhrase ? `<button id="mark-known-btn" style="${S.btnBase}width:100%;background:${S.surface3};color:${S.text};border-color:#3a3a52;font-size:12.5px;">Mark as Already Known</button>` : ''}
      </div>
    `;

    // ── custom definition ─────────────────────────────────
    html += `
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid ${S.border};">
        <div style="font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:${S.accent};margin-bottom:7px;">Add definition</div>
        <input type="text" id="custom-def-input" placeholder="Your own definition..." style="
          width:100%;
          padding:7px 10px;
          border:1px solid ${S.border};
          border-radius:6px;
          font-size:13px;
          margin-bottom:6px;
          color:${S.text};
          background:${S.surface2};
          outline:none;
          box-sizing:border-box;
          font-family:inherit;
        ">
        <button id="add-custom-def-btn" style="${S.btnBase}width:100%;background:${S.surface3};color:${S.text};border-color:#3a3a52;">Add Definition</button>
      </div>
    `;

    html += `</div>`; // end body

    // Use DOMParser to safely parse HTML with escaped content
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    popup.textContent = '';
    while (doc.body.firstChild) {
      popup.appendChild(doc.body.firstChild);
    }

    // Add event listener for pronunciation playback button
    const playBtn = document.getElementById('play-pronunciation-btn');
    if (playBtn) {
      const resetPlayBtn = () => {
        playBtn.textContent = '🔊';
        playBtn.style.background = S.surface2;
        playBtn.style.borderColor = S.border;
        playBtn.style.color = '';
        playBtn.disabled = false;
      };

      const setPlaying = () => {
        playBtn.disabled = true;
        playBtn.textContent = '▶';
        playBtn.style.background = S.accentDim;
        playBtn.style.borderColor = S.accent;
        playBtn.style.color = S.accent;
      };

      const setDone = () => {
        playBtn.textContent = '✓';
        playBtn.style.background = S.successBg;
        playBtn.style.borderColor = S.successBdr;
        playBtn.style.color = S.success;
        setTimeout(resetPlayBtn, 1200);
      };

      const setError = () => {
        playBtn.textContent = '✗';
        playBtn.style.background = 'rgba(248,113,113,0.10)';
        playBtn.style.borderColor = 'rgba(248,113,113,0.30)';
        playBtn.style.color = '#f87171';
        setTimeout(resetPlayBtn, 1500);
      };

      const playWithWebSpeech = () => {
        if (!('speechSynthesis' in window)) { setError(); return; }
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(word);
        utterance.lang = 'he-IL';
        utterance.rate = 0.9;
        utterance.onend = setDone;
        utterance.onerror = setError;
        window.speechSynthesis.speak(utterance);
      };

      playBtn.addEventListener('click', async () => {
        if (playBtn.disabled) return;
        setPlaying();

        try {
          const result = await chrome.runtime.sendMessage({ action: 'previewElevenLabsAudio', text: word });

          if (!result.success) {
            // No API key or error — fall back to Web Speech
            playWithWebSpeech();
            return;
          }

          // Decode base64 and play via Web Audio
          const binary = atob(result.audioData);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const blob = new Blob([bytes], { type: 'audio/mpeg' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          audio.onended = () => { URL.revokeObjectURL(url); setDone(); };
          audio.onerror = () => { URL.revokeObjectURL(url); setError(); };
          audio.play();
        } catch (err) {
          playWithWebSpeech();
        }
      });
    }

    // Add event listener for Google Translate button
    const translateBtn = document.getElementById('translate-btn');
    const translateResult = document.getElementById('translate-result');

    translateBtn.addEventListener('click', async () => {
      translateBtn.disabled = true;
      translateBtn.textContent = 'Translating...';

      try {
        // Use background script to make API call (bypasses CSP restrictions)
        const response = await chrome.runtime.sendMessage({
          action: 'fetchGoogleTranslate',
          word: word
        });

        if (!response.success) {
          throw new Error(response.error);
        }

        translateResult.style.display = 'block';
        translateResult.textContent = '';
        const strong = document.createElement('strong');
        strong.textContent = 'Google Translate: ';
        translateResult.appendChild(strong);
        const translationText = document.createTextNode(response.translation);
        translateResult.appendChild(translationText);
      } catch (error) {
        console.error('Translation error:', error);
        translateResult.style.display = 'block';
        translateResult.textContent = 'Error fetching translation';
        translateResult.style.color = '#f87171';
      } finally {
        translateBtn.disabled = false;
        translateBtn.textContent = 'Google Translate';
      }
    });

    // Add event listener for Reverso button (using API)
    const reversoBtn = document.getElementById('reverso-btn');
    const reversoResult = document.getElementById('reverso-result');

    if (reversoBtn && reversoResult) {
      reversoBtn.addEventListener('click', async () => {
        reversoBtn.disabled = true;
        reversoBtn.textContent = 'Loading...';
        reversoResult.style.display = 'none';

        try {
          // Use background script to make API call
          const response = await chrome.runtime.sendMessage({
            action: 'fetchReversoAPI',
            word: word
          });

          if (!response.success) {
            throw new Error(response.error);
          }

          if (response.translation) {
            reversoResult.style.display = 'block';
            reversoResult.textContent = '';
            const strong = document.createElement('strong');
            strong.textContent = 'Reverso: ';
            reversoResult.appendChild(strong);
            const translationText = document.createTextNode(response.translation);
            reversoResult.appendChild(translationText);
          } else {
            reversoResult.style.display = 'block';
            reversoResult.textContent = 'Translation not available';
            reversoResult.style.color = '#f87171';
          }
        } catch (error) {
          console.error('Reverso API error:', error);
          reversoResult.style.display = 'block';
          reversoResult.textContent = 'Error fetching translation';
          reversoResult.style.color = '#f87171';
        } finally {
          reversoBtn.disabled = false;
          reversoBtn.textContent = 'Reverso';
        }
      });
    }

    // Add event listener for Pealim button
    const pealimBtn = document.getElementById('pealim-btn');
    const pealimResult = document.getElementById('pealim-result');

    if (pealimBtn && pealimResult) {
      pealimBtn.addEventListener('click', async () => {
        pealimBtn.disabled = true;
        pealimBtn.textContent = 'Loading...';
        pealimResult.style.display = 'none';

        try {
          const pealimUrl = `https://www.pealim.com/search/?q=${encodeURIComponent(word)}`;

          // Fetch via background script to bypass CORS
          const response = await chrome.runtime.sendMessage({
            action: 'fetchExternal',
            url: pealimUrl
          });

          if (!response.success) {
            throw new Error(response.error);
          }

          const html = response.html;

          // Parse HTML
          const parser = new DOMParser();
          const doc = parser.parseFromString(html, 'text/html');

          // Extract meanings from all vf-search-meaning elements
          const meaningElements = doc.getElementsByClassName('vf-search-meaning');
          const meanings = [];

          for (let i = 0; i < meaningElements.length; i++) {
            const text = meaningElements[i].innerText.trim();
            if (text) {
              meanings.push(text);
            }
          }

          if (meanings.length > 0) {
            pealimResult.style.display = 'block';
            pealimResult.textContent = '';
            const strong = document.createElement('strong');
            strong.textContent = 'Pealim:';
            pealimResult.appendChild(strong);
            pealimResult.appendChild(document.createElement('br'));
            meanings.forEach((meaning, index) => {
              const bullet = document.createTextNode('▪ ');
              pealimResult.appendChild(bullet);
              const meaningText = document.createTextNode(meaning);
              pealimResult.appendChild(meaningText);
              if (index < meanings.length - 1) {
                pealimResult.appendChild(document.createElement('br'));
              }
            });
          } else {
            pealimResult.style.display = 'block';
            pealimResult.textContent = 'No results found on Pealim';
            pealimResult.style.color = '#f87171';
          }
        } catch (error) {
          console.error('Pealim error:', error);
          pealimResult.style.display = 'block';
          pealimResult.textContent = 'Error fetching from Pealim';
          pealimResult.style.color = '#f87171';
        } finally {
          pealimBtn.disabled = false;
          pealimBtn.textContent = 'Pealim';
        }
      });
    }

    // Add event listener for "Create Anki Card" button
    const createCardBtn = document.getElementById('create-card-btn');
    if (createCardBtn) {
      createCardBtn.addEventListener('click', () => {
        // Hide the dictionary popup
        hideDictionaryPopup();

        // Open the Anki card creator modal with the word/phrase
        if (window.openAnkiModal) {
          // Provide callback to get word lists from storage
          const getWordsCallback = async () => {
            const data = await chrome.storage.local.get(['matureWords', 'learningWords']);
            return {
              matureWords: data.matureWords || [],
              learningWords: data.learningWords || []
            };
          };

          window.openAnkiModal(word, getWordsCallback);
        } else {
          console.error('openAnkiModal not available');
        }
      });
    }

    // Add event listener for "Already Known" button
    const markKnownBtn = document.getElementById('mark-known-btn');
    if (markKnownBtn) {
      markKnownBtn.addEventListener('click', async () => {
        markKnownBtn.disabled = true;
        markKnownBtn.textContent = 'Adding...';

        try {
          // Send message to background script to add note via AnkiConnect
          const response = await chrome.runtime.sendMessage({
            action: 'addToAlreadyKnown',
            word: word
          });

          if (!response.success) {
            throw new Error(response.error || 'Failed to add word');
          }

          // Success - show feedback
          markKnownBtn.style.background = 'rgba(52,211,153,0.12)';
          markKnownBtn.style.color = '#34d399';
          markKnownBtn.style.borderColor = 'rgba(52,211,153,0.30)';
          markKnownBtn.textContent = '✓ Added! Refreshing...';

          // Refresh word list to update highlighting
          if (refreshWordsCallback) {
            await refreshWordsCallback();
          }

          // Notify other scripts (like subtitle browser) that words were updated
          document.dispatchEvent(new CustomEvent('ankiWordsRefreshed'));

          // Keep the success state for 2 seconds, then revert
          setTimeout(() => {
            markKnownBtn.style.background = '#21212e';
            markKnownBtn.style.color = '#8f8fa8';
            markKnownBtn.style.borderColor = '#2c2c3e';
            markKnownBtn.textContent = 'Mark as Already Known';
            markKnownBtn.disabled = false;
          }, 2000);

        } catch (error) {
          console.error('Error adding word to Already Known:', error);

          // Show error state
          markKnownBtn.style.background = 'rgba(248,113,113,0.10)';
          markKnownBtn.style.color = '#f87171';
          markKnownBtn.style.borderColor = 'rgba(248,113,113,0.30)';
          markKnownBtn.textContent = '✗ Failed to add';

          // Revert after 2 seconds
          setTimeout(() => {
            markKnownBtn.style.background = '#21212e';
            markKnownBtn.style.color = '#8f8fa8';
            markKnownBtn.style.borderColor = '#2c2c3e';
            markKnownBtn.textContent = 'Mark as Already Known';
            markKnownBtn.disabled = false;
          }, 2000);
        }
      });
    }

    // Adjust position based on actual popup dimensions
    setTimeout(() => {
      const actualHeight = popup.offsetHeight;
      const actualWidth = popup.offsetWidth;
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      const spaceBelow = viewportHeight - y;
      const spaceRight = viewportWidth - x;

      // Adjust horizontal position if needed
      if (spaceRight < actualWidth + 20) {
        popup.style.left = Math.max(10, x - actualWidth) + 'px';
      }

      // Adjust vertical position if needed
      if (spaceBelow < actualHeight + 40) {
        popup.style.top = (y - actualHeight - 10) + 'px';
      } else {
        popup.style.top = (y + 20) + 'px';
      }
    }, 0);

    // Add event listener for custom definition button
    const addBtn = popup.querySelector('#add-custom-def-btn');
    const input = popup.querySelector('#custom-def-input');

    const addDefinition = async () => {
      const definition = input.value.trim();
      if (!definition) return;

      addBtn.disabled = true;
      addBtn.textContent = 'Adding...';

      try {
        const addResponse = await chrome.runtime.sendMessage({
          action: 'addCustomDefinition',
          word: word,
          definition: definition
        });

        if (addResponse.success) {
          // Refresh the popup
          showDictionaryPopup(word, x, y, refreshWordsCallback);
        }
      } catch (error) {
        console.error('Error adding custom definition:', error);
        alert('Failed to add definition');
        addBtn.disabled = false;
        addBtn.textContent = 'Add Definition';
      }
    };

    addBtn.addEventListener('click', addDefinition);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addDefinition();
      }
    });
  } catch (error) {
    console.error('Dictionary lookup error:', error);
    popup.innerHTML = '<div style="padding:16px 18px;color:#f87171;font-size:13px;">Error loading dictionary</div>';
  }
}

/**
 * Hide dictionary popup
 */
function hideDictionaryPopup() {
  if (dictionaryPopup) {
    dictionaryPopup.style.display = 'none';
  }
  currentPopupWord = null;
  isPopupVisible = false;
}

// Track hide timeout globally
let wordHideTimeout = null;

/**
 * Add dictionary hover listeners to Hebrew word highlights
 * @param {Function} refreshWordsCallback - Callback to refresh word highlighting
 */
function addDictionaryHoverListeners(refreshWordsCallback) {
  const hebrewWords = document.querySelectorAll(`.${window.CSS_CLASSES.WORD_HIGHLIGHT}`);

  hebrewWords.forEach(wordSpan => {
    // Don't add multiple handlers
    if (wordSpan.dataset.dictionaryListener) return;
    wordSpan.dataset.dictionaryListener = 'true';

    wordSpan.addEventListener('mouseenter', (e) => {
      // Show popup immediately if shift is held
      if (e.shiftKey) {
        const word = wordSpan.textContent.trim();
        if (word) {
          showDictionaryPopup(word, e.pageX, e.pageY, refreshWordsCallback);
        }
      }
    });

    wordSpan.addEventListener('mousemove', (e) => {
      // Check on mousemove in case user presses shift while already hovering
      if (e.shiftKey) {
        const word = wordSpan.textContent.trim();
        if (word) {
          showDictionaryPopup(word, e.pageX, e.pageY, refreshWordsCallback);
        }
      }
    });

    wordSpan.addEventListener('mouseleave', (e) => {
      // Don't hide if shift is still held (user is moving between words)
      if (e.shiftKey) {
        return;
      }

      // Longer delay to give user time to read or move mouse to popup
      wordHideTimeout = setTimeout(() => {
        // Only hide if mouse isn't over the popup
        if (!dictionaryPopup || !dictionaryPopup.matches(':hover')) {
          hideDictionaryPopup();
        }
        wordHideTimeout = null;
      }, 500);
    });
  });
}

/**
 * Initialize dictionary feature (call after word highlighting)
 * @param {Function} refreshWordsCallback - Callback to refresh word highlighting
 */
function initializeDictionaryFeature(refreshWordsCallback) {
  addDictionaryHoverListeners(refreshWordsCallback);

  // Global listener for selected text with Shift+hover
  document.addEventListener('mousemove', (e) => {
    if (!e.shiftKey) return;

    const selection = window.getSelection();
    const selectedText = selection.toString().trim();

    // Check if text is selected and contains Hebrew
    if (selectedText && window.containsHebrew && window.containsHebrew(selectedText)) {
      // Only show if popup isn't already visible or is for different text
      if (!dictionaryPopup || dictionaryPopup.style.display === 'none' ||
          dictionaryPopup.dataset.currentWord !== selectedText) {
        showDictionaryPopup(selectedText, e.pageX, e.pageY, refreshWordsCallback);
        dictionaryPopup.dataset.currentWord = selectedText;
      }
    }
  });

  // Global Escape key listener to hide popup
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideDictionaryPopup();
    }
  });

  // Hide popup when shift is released (unless hovering over popup itself)
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift') {
      // Small delay to allow moving to popup
      setTimeout(() => {
        if (!dictionaryPopup || !dictionaryPopup.matches(':hover')) {
          hideDictionaryPopup();
        }
      }, 100);
    }
  });
}

  // Expose to global scope
  window.initializeDictionaryFeature = initializeDictionaryFeature;
  window.showDictionaryPopup = showDictionaryPopup;
  window.hideDictionaryPopup = hideDictionaryPopup;
  window.addDictionaryHoverListeners = addDictionaryHoverListeners;
})();
