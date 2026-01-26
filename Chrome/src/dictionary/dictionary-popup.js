// Dictionary popup feature for Shift+hover word lookup

(function() {
  'use strict';

  // Module state
let dictionaryPopup = null;
let currentPopupWord = null;
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
    background: #272727;
    color: white;
    border: 2px solid #333;
    border-radius: 8px;
    padding: 12px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    max-width: 400px;
    max-height: 300px;
    overflow-y: auto;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  `;

  // Add hover listeners to keep popup visible
  popup.addEventListener('mouseenter', () => {
    // Keep popup visible when hovering over it
  });

  popup.addEventListener('mouseleave', () => {
    hideDictionaryPopup();
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
  const popup = createDictionaryPopup();
  currentPopupWord = word;

  // Load frequency and binyanim data if not already loaded
  await loadFrequencyData();
  await loadBinyanimData();

  // Show loading state
  popup.innerHTML = '<div style="color: #aaa;">Loading...</div>';
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
  if (spaceBelow < estimatedPopupHeight + 40) {
    popup.style.top = (y - estimatedPopupHeight) + 'px';
    popup.style.bottom = 'auto';
  } else {
    popup.style.top = (y + 20) + 'px';
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
    let html = `<div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
      <div>
        ${isPhrase ? '<div style="font-size: 11px; color: #888; margin-bottom: 2px;">Phrase</div>' : ''}
        <div style="font-weight: 600; color: #0066ff; font-size: 16px; direction: rtl;">${escapedWord}</div>
      </div>
      <button id="play-pronunciation-btn" title="Play pronunciation" style="
        background: none;
        border: none;
        cursor: pointer;
        font-size: 20px;
        padding: 0;
        margin-left: 8px;
      ">🔊</button>
    </div>`;

    // Add frequency information (only for single words)
    if (!isPhrase) {
      const freqInfo = getFrequencyInfo(word);
      if (freqInfo) {
        const color = freqInfo.percentile <= 10 ? '#28a745' : freqInfo.percentile <= 25 ? '#17a2b8' : '#6c757d';
        html += `<div style="font-size: 11px; background: ${color}; color: white; padding: 3px 8px; border-radius: 3px; margin-bottom: 8px; display: inline-block;">
          📊 ${freqInfo.label} (Rank #${freqInfo.rank.toLocaleString()})
        </div>`;
      }
    }

    // Add binyanim/conjugation information (only for single words)
    const verbInfo = !isPhrase ? findVerbInfo(word) : null;
    if (verbInfo) {
      html += `<div style="font-size: 12px; background: #1a1a1a; padding: 8px; border-radius: 4px; margin-bottom: 10px; border-left: 3px solid #17a2b8;">
        <div style="margin-bottom: 4px;">
          <span style="font-weight: 600; color: #17a2b8;">Verb:</span>
          <span style="direction: rtl; font-weight: 600; margin-left: 6px;">${escapeHtml(verbInfo.infinitive.hebrew)}</span>
        </div>`;

      // Add transliteration if available
      if (verbInfo.infinitive.transliteration) {
        html += `<div style="color: #aaa; font-size: 11px; font-style: italic; margin-bottom: 2px;">${escapeHtml(verbInfo.infinitive.transliteration)}</div>`;
      }

      // Add English meaning if available
      if (verbInfo.infinitive.english) {
        html += `<div style="color: #ccc; margin-bottom: 6px;">${escapeHtml(verbInfo.infinitive.english)}</div>`;
      }

      html += `<a href="${escapeHtml(verbInfo.url)}" target="_blank" style="color: #0066ff; text-decoration: none; font-size: 11px;">
          View full conjugation on Pealim →
        </a>
      </div>`;
    }

    if (response.success && response.results.length > 0) {
      response.results.forEach((result) => {
        if (result.definitions && result.definitions.length > 0) {
          // Show source label
          const sourceLabel = result.source === 'custom' ?
            '<span style="font-size: 11px; background: #28a745; color: white; padding: 2px 6px; border-radius: 3px; margin-bottom: 4px; display: inline-block;">MY DEFINITIONS</span>' : '';

          if (sourceLabel) html += sourceLabel;

          result.definitions.forEach((def) => {
            html += `<div style="margin-bottom: 6px;">
              ${result.source === 'custom' ? '★' : '▪'} ${escapeHtml(def)}
            </div>`;
          });
        }
      });
    } else {
      html += `<div style="color: #aaa; margin-bottom: 10px;">No definitions found</div>`;
    }

    // Add translation/external search section
    html += `
      <div id="translate-section" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #444;">
        <button id="translate-btn" style="
          width: 100%;
          padding: 8px;
          background: #4285f4;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">Google Translate</button>
        <div id="translate-result" style="display: none; padding: 8px; background: #1a1a1a; border-radius: 4px; font-size: 13px; color: white; margin-bottom: 8px;"></div>

        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <button id="reverso-btn" style="
            flex: 1;
            padding: 8px;
            background: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
          ">Reverso</button>

          <button id="pealim-btn" style="
            flex: 1;
            padding: 8px;
            background: #4285f4;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
          ">Pealim</button>
        </div>

        <div id="reverso-result" style="display: none; padding: 8px; background: #1a1a1a; border-radius: 4px; font-size: 13px; color: white; margin-bottom: 8px; border-left: 3px solid #4285f4;"></div>
        <div id="pealim-result" style="display: none; padding: 8px; background: #1a1a1a; border-radius: 4px; font-size: 13px; color: white; margin-bottom: 8px; border-left: 3px solid #4285f4;"></div>
      </div>
    `;

    // Add "Create Anki Card" button (for both words and phrases)
    html += `
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #444;">
        <button id="create-card-btn" style="
          width: 100%;
          padding: 8px;
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">Create Anki Card</button>
      </div>
    `;

    // Add "Already Known" button (only for single words)
    // Note: isPhrase already declared above
    if (!isPhrase) {
      html += `
        <div style="margin-top: 0;">
          <button id="mark-known-btn" style="
            width: 100%;
            padding: 8px;
            background: #555;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
          ">Mark as Already Known</button>
        </div>
      `;
    }

    // Add custom definition input
    html += `
      <style>
        #custom-def-input::placeholder {
          color: #666;
        }
      </style>
      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #444;">
        <input type="text" id="custom-def-input" placeholder="Add your own definition..." style="
          width: 100%;
          padding: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          font-size: 13px;
          margin-bottom: 8px;
          color: white;
          background: #1a1a1a;
        ">
        <button id="add-custom-def-btn" style="
          width: 100%;
          padding: 8px;
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
        ">Add Definition</button>
      </div>
    `;

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
      playBtn.addEventListener('click', () => {
        playBtn.style.opacity = '0.5';

        // Use Web Speech API (built into browser)
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(word);
          utterance.lang = 'he-IL'; // Hebrew (Israel)
          utterance.rate = 0.9; // Slightly slower for clarity

          utterance.onend = () => {
            playBtn.style.opacity = '1';
          };

          utterance.onerror = (error) => {
            console.error('Speech synthesis error:', error);
            playBtn.style.opacity = '1';
            alert('Unable to play pronunciation. Speech synthesis failed.');
          };

          window.speechSynthesis.speak(utterance);
        } else {
          playBtn.style.opacity = '1';
          alert('Speech synthesis not supported in your browser.');
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
        translateResult.style.color = '#dc3545';
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
            reversoResult.style.color = '#dc3545';
          }
        } catch (error) {
          console.error('Reverso API error:', error);
          reversoResult.style.display = 'block';
          reversoResult.textContent = 'Error fetching translation';
          reversoResult.style.color = '#dc3545';
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
            pealimResult.style.color = '#dc3545';
          }
        } catch (error) {
          console.error('Pealim error:', error);
          pealimResult.style.display = 'block';
          pealimResult.textContent = 'Error fetching from Pealim';
          pealimResult.style.color = '#dc3545';
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
          markKnownBtn.style.background = '#28a745'; // Green
          markKnownBtn.textContent = '✓ Added! Refreshing...';

          // Refresh word list to update highlighting
          if (refreshWordsCallback) {
            await refreshWordsCallback();
          }

          // Notify other scripts (like subtitle browser) that words were updated
          document.dispatchEvent(new CustomEvent('ankiWordsRefreshed'));

          // Keep the success state for 2 seconds, then revert
          setTimeout(() => {
            markKnownBtn.style.background = '#6c757d';
            markKnownBtn.textContent = 'Mark as Already Known';
            markKnownBtn.disabled = false;
          }, 2000);

        } catch (error) {
          console.error('Error adding word to Already Known:', error);

          // Show error state
          markKnownBtn.style.background = '#dc3545'; // Red
          markKnownBtn.textContent = '✗ Failed to add';

          // Revert after 2 seconds
          setTimeout(() => {
            markKnownBtn.style.background = '#6c757d';
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
    popup.innerHTML = '<div style="color: #dc3545;">Error loading dictionary</div>';
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
}

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

    wordSpan.addEventListener('mousemove', (e) => {
      if (e.shiftKey && (!dictionaryPopup || dictionaryPopup.style.display === 'none')) {
        const word = wordSpan.textContent.trim();
        if (word) {
          showDictionaryPopup(word, e.pageX, e.pageY, refreshWordsCallback);
        }
      }
    });

    wordSpan.addEventListener('mouseleave', () => {
      // Delay hiding to allow mouse to move to popup
      setTimeout(() => {
        // Only hide if mouse isn't over the popup
        if (!dictionaryPopup || !dictionaryPopup.matches(':hover')) {
          hideDictionaryPopup();
        }
      }, 100);
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
}

  // Expose to global scope
  window.initializeDictionaryFeature = initializeDictionaryFeature;
  window.showDictionaryPopup = showDictionaryPopup;
  window.hideDictionaryPopup = hideDictionaryPopup;
  window.addDictionaryHoverListeners = addDictionaryHoverListeners;
})();
