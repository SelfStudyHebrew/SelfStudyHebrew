// Anki card creation modal for creating cards from Hebrew sentences

(function() {
  'use strict';

  // Module state
let ankiModal = null;
let currentSentence = null;
let currentAudioFilename = null;
let currentAudioBlobUrl = null;

function showModalError(message) {
  if (!ankiModal) return;
  const errorDiv = ankiModal.querySelector('#anki-error-message');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function fillSentenceField() {
  if (!ankiModal || !currentSentence) return;

  const sentenceFieldSelect = ankiModal.querySelector('#anki-sentence-field-select');
  const selectedField = sentenceFieldSelect.value;

  if (!selectedField) return;

  const fieldId = selectedField.replace(/[^a-zA-Z0-9]/g, '_');
  const textarea = ankiModal.querySelector(`#anki-field-${fieldId}`);

  if (textarea) {
    textarea.value = currentSentence;
  }
}

/**
 * Extract unknown word from sentence
 * @param {string} sentence - Hebrew sentence
 * @param {Array} matureWords - Known mature words
 * @param {Array} learningWords - Known learning words
 * @returns {string|null} First unknown word found
 */
/**
 * Extract all unknown words from sentence
 * @param {string} sentence - Hebrew sentence
 * @param {Array} matureWords - Known mature words
 * @param {Array} learningWords - Known learning words
 * @returns {string[]} Array of unknown words
 */
function extractAllUnknownWords(sentence, matureWords, learningWords) {
  const hebrewRegex = /[\u0590-\u05FF]+/g;
  const words = sentence.match(hebrewRegex) || [];
  const unknownWords = [];

  for (const word of words) {
    const normalized = window.normalizeHebrew(word);
    if (!window.isWordKnown(normalized, matureWords, learningWords)) {
      if (!unknownWords.includes(word)) {
        unknownWords.push(word);
      }
    }
  }

  return unknownWords;
}

function getSourceText() {
  let sourceText = currentSentence;
  const allTextareas = ankiModal.querySelectorAll('[data-field-name]');
  for (const field of allTextareas) {
    const fieldName = field.dataset.fieldName;
    if (fieldName && fieldName.toLowerCase().includes('hebrew') && field.value.trim()) {
      sourceText = field.value.trim();
      break;
    }
  }

  if (!sourceText) {
    const sentenceDisplay = ankiModal.querySelector('#anki-sentence-display');
    sourceText = sentenceDisplay ? sentenceDisplay.textContent.trim() : currentSentence;
  }

  return sourceText;
}

/**
 * Handle translate button click
 * @param {HTMLElement} button - Button that was clicked
 */
async function handleTranslate(button) {
  const fieldId = button.dataset.fieldId;
  const textarea = document.getElementById(fieldId);

  if (!textarea) return;

  const sourceText = getSourceText();
  if (!sourceText) return;

  button.disabled = true;
  button.textContent = 'Translating...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'translateSentence',
      sentence: sourceText
    });

    if (response.success) {
      textarea.value = response.result || '';
    } else {
      alert('Translation failed: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Translation error:', error);
    alert('Translation failed');
  } finally {
    button.disabled = false;
    button.textContent = 'AI Translate';
  }
}

/**
 * Handle define button click
 * @param {HTMLElement} button - Button that was clicked
 * @param {Function} getWordsCallback - Callback to get word lists
 */
async function handleDefine(button, getWordsCallback) {
  const fieldId = button.dataset.fieldId;
  const textarea = document.getElementById(fieldId);

  if (!textarea) return;

  const sourceText = getSourceText();
  if (!sourceText) return;

  button.disabled = true;
  button.textContent = 'Defining...';

  try {
    // Get word lists
    const { matureWords, learningWords } = await getWordsCallback();

    // Extract unknown words
    const unknownWords = extractAllUnknownWords(sourceText, matureWords, learningWords);

    if (unknownWords.length === 0) {
      alert('No unknown words found in sentence');
      button.disabled = false;
      button.textContent = 'AI Define';
      return;
    }

    // Send all unknown words for definition
    const response = await chrome.runtime.sendMessage({
      action: 'defineWords',
      words: unknownWords,
      sentence: sourceText
    });

    if (response.success) {
      textarea.value = response.result || '';
    } else {
      alert('Definition failed: ' + (response.error || 'Unknown error'));
    }
  } catch (error) {
    console.error('Definition error:', error);
    alert('Definition failed');
  } finally {
    button.disabled = false;
    button.textContent = 'AI Define';
  }
}

/**
 * Handle AI audio generation via ElevenLabs
 * @param {HTMLElement} button - Button that was clicked
 */
async function handleGenerateAudio(button) {
  const sourceText = getSourceText();
  if (!sourceText) return;

  button.disabled = true;
  button.textContent = 'Generating...';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateElevenLabsAudio',
      text: sourceText
    });

    if (response.success) {
      currentAudioFilename = response.filename;

      // Populate the audio field textarea: button → buttonDiv → flexDiv → textarea
      const audioTextarea = button.parentNode.parentNode.querySelector('textarea[data-field-name]');
      if (audioTextarea) {
        audioTextarea.value = `[sound:${response.filename}]`;
        audioTextarea.style.color = '#34d399';
        audioTextarea.style.borderColor = 'rgba(52,211,153,0.40)';
      }

      // Store blob URL for playback
      if (currentAudioBlobUrl) URL.revokeObjectURL(currentAudioBlobUrl);
      const binary = atob(response.audioData);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: 'audio/mpeg' });
      currentAudioBlobUrl = URL.createObjectURL(blob);

      button.textContent = '✓ Audio Ready';
      button.style.cssText = button.style.cssText.replace(/background:[^;]+/, 'background:#21212e');
      button.style.color = '#34d399';
      button.style.borderColor = 'rgba(52,211,153,0.30)';

      // Add/update play button beside AI Audio button
      const buttonDiv = button.parentNode;
      let playBtn = buttonDiv.querySelector('.ai-audio-play-btn');
      if (!playBtn) {
        playBtn = document.createElement('button');
        playBtn.className = 'ai-audio-play-btn';
        playBtn.style.cssText = `
          padding: 5px 9px;
          background: rgba(52,211,153,0.12);
          color: #34d399;
          border: 1px solid rgba(52,211,153,0.28);
          border-radius: 5px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        `;
        playBtn.textContent = '▶ Play';
        playBtn.addEventListener('click', () => {
          if (currentAudioBlobUrl) {
            const audio = new Audio(currentAudioBlobUrl);
            audio.play();
          }
        });
        buttonDiv.insertBefore(playBtn, button.nextSibling);
      }

      // Audio indicator near sentence display
      const existing = ankiModal.querySelector('#anki-audio-indicator');
      if (existing) existing.remove();
      const audioIndicator = document.createElement('div');
      audioIndicator.id = 'anki-audio-indicator';
      audioIndicator.style.cssText = `
        margin-top: 8px;
        padding: 5px 12px;
        background: rgba(52,211,153,0.12);
        color: #34d399;
        border: 1px solid rgba(52,211,153,0.28);
        border-radius: 20px;
        font-size: 11.5px;
        font-weight: 500;
        display: inline-block;
      `;
      audioIndicator.textContent = '🎤 Audio generated';
      const sentenceDisplay = ankiModal.querySelector('#anki-sentence-display');
      sentenceDisplay.parentNode.insertBefore(audioIndicator, sentenceDisplay.nextSibling);
    } else {
      alert('Audio generation failed: ' + (response.error || 'Unknown error'));
      button.textContent = 'AI Audio';
    }
  } catch (error) {
    console.error('Audio generation error:', error);
    alert('Audio generation failed');
    button.textContent = 'AI Audio';
  } finally {
    button.disabled = false;
  }
}

// ── Image search helpers ────────────────────────────────────────────────────

function isImageFilename(name) {
  return /\.(jpe?g|png|gif|webp|svg)$/i.test(name);
}

async function searchWikimedia(q) {
  try {
    const url = 'https://commons.wikimedia.org/w/api.php?' + new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: q,
      gsrlimit: 16, gsrnamespace: 6, prop: 'imageinfo',
      iiprop: 'url', iiurlwidth: 220, format: 'json', origin: '*'
    });
    const data = await fetch(url).then(r => r.json());
    return Object.values(data.query?.pages || {})
      .map(x => ({
        thumb: x.imageinfo?.[0]?.thumburl,
        url: x.imageinfo?.[0]?.url,
        filename: (x.title || '').replace('File:', ''),
        source: 'Wikimedia'
      }))
      .filter(x => x.thumb && x.url && isImageFilename(x.filename));
  } catch { return []; }
}

async function searchOpenverse(q) {
  try {
    const url = 'https://api.openverse.org/v1/images/?' + new URLSearchParams({ q, page_size: 16 });
    const data = await fetch(url).then(r => r.json());
    return (data.results || [])
      .map(x => ({
        thumb: x.thumbnail,
        url: x.url,
        filename: x.url.split('/').pop().split('?')[0] || 'image.jpg',
        source: 'Openverse'
      }))
      .filter(x => x.thumb && x.url);
  } catch { return []; }
}

const IMAGE_FIELD_NAMES = ['image', 'picture', 'photo', 'img'];

function isImageField(fieldName) {
  return IMAGE_FIELD_NAMES.some(n => fieldName.toLowerCase().includes(n));
}

function createImagePickerField(field, fieldId) {
  const aiButtonStyle = `
    padding: 5px 9px;
    background: #21212e;
    color: #8aabff;
    border: 1px solid #2c2c3e;
    border-radius: 5px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    letter-spacing: 0.1px;
  `;

  const wrapper = document.createElement('div');

  // Hidden textarea — picked up by createAnkiCard
  const hiddenTextarea = document.createElement('textarea');
  hiddenTextarea.id = `anki-field-${fieldId}`;
  hiddenTextarea.setAttribute('data-field-name', field);
  hiddenTextarea.style.display = 'none';
  wrapper.appendChild(hiddenTextarea);

  // Search row
  const searchRow = document.createElement('div');
  searchRow.style.cssText = 'display:flex;gap:6px;margin-bottom:8px;';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Search images…';
  searchInput.style.cssText = `
    flex:1;padding:7px 10px;border:1px solid #2c2c3e;border-radius:6px;
    background:#1a1a24;color:#ededf5;font-size:13px;outline:none;
    transition:border-color 0.15s;
  `;
  searchInput.addEventListener('focus', () => { searchInput.style.borderColor = '#5a7fff'; });
  searchInput.addEventListener('blur',  () => { searchInput.style.borderColor = '#2c2c3e'; });

  const searchBtn = document.createElement('button');
  searchBtn.textContent = 'Search';
  searchBtn.style.cssText = aiButtonStyle + 'padding:7px 13px;font-size:12px;';

  searchRow.appendChild(searchInput);
  searchRow.appendChild(searchBtn);
  wrapper.appendChild(searchRow);

  // Source tabs
  const tabRow = document.createElement('div');
  tabRow.style.cssText = 'display:flex;gap:4px;margin-bottom:6px;';
  const tabDefs = [
    { id: 'all',       label: 'All' },
    { id: 'wikimedia', label: 'Wikimedia' },
    { id: 'openverse', label: 'Openverse' },
    { id: 'generate',  label: '✨ Generate' },
  ];
  let activeTab = 'all';
  let lastResults = [];

  function setSearchMode(isSearch) {
    searchRow.style.display = isSearch ? 'flex' : 'none';
    grid.style.display      = isSearch ? 'grid' : 'none';
    statusLine.style.display = isSearch ? 'block' : 'none';
    generatePanel.style.display = isSearch ? 'none' : 'block';
  }

  tabDefs.forEach(t => {
    const tab = document.createElement('button');
    tab.textContent = t.label;
    tab.dataset.tabId = t.id;
    tab.style.cssText = `
      padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer;
      border:1px solid #2c2c3e;
      background:${t.id === 'all' ? '#2c2c3e' : '#1a1a24'};
      color:${t.id === 'all' ? '#ededf5' : '#8f8fa8'};transition:all 0.1s;
    `;
    tab.addEventListener('click', () => {
      activeTab = t.id;
      tabRow.querySelectorAll('button').forEach(b => {
        const isActive = b.dataset.tabId === activeTab;
        b.style.background = isActive ? '#2c2c3e' : '#1a1a24';
        b.style.color      = isActive ? '#ededf5' : '#8f8fa8';
      });
      if (activeTab === 'generate') {
        setSearchMode(false);
        return;
      }
      setSearchMode(true);
      const filtered = activeTab === 'all'
        ? lastResults
        : lastResults.filter(r => r.source.toLowerCase() === activeTab);
      renderResults(filtered);
    });
    tabRow.appendChild(tab);
  });
  wrapper.appendChild(tabRow);

  // Selected preview strip
  const preview = document.createElement('div');
  preview.style.cssText = 'margin-bottom:6px;min-height:0;';
  wrapper.appendChild(preview);

  // Results grid
  const grid = document.createElement('div');
  grid.style.cssText = `
    display:grid;grid-template-columns:repeat(4,1fr);gap:5px;
    max-height:180px;overflow-y:auto;
    scrollbar-width:thin;scrollbar-color:#2c2c3e transparent;
  `;
  wrapper.appendChild(grid);

  // Status line
  const statusLine = document.createElement('div');
  statusLine.style.cssText = 'color:#8f8fa8;font-size:11.5px;margin-top:4px;min-height:16px;';
  wrapper.appendChild(statusLine);

  // Generate panel (hidden unless Generate tab active)
  const generatePanel = document.createElement('div');
  generatePanel.style.display = 'none';

  const promptTextarea = document.createElement('textarea');
  promptTextarea.placeholder = 'Describe the image you want…';
  promptTextarea.style.cssText = `
    width:100%;box-sizing:border-box;min-height:62px;padding:8px 11px;
    border:1px solid #2c2c3e;border-radius:6px;background:#1a1a24;
    color:#ededf5;font-size:13px;outline:none;resize:vertical;
    transition:border-color 0.15s;margin-bottom:7px;
  `;
  promptTextarea.addEventListener('focus', () => { promptTextarea.style.borderColor = '#5a7fff'; });
  promptTextarea.addEventListener('blur',  () => { promptTextarea.style.borderColor = '#2c2c3e'; });

  // Provider selector row
  const providerRow = document.createElement('div');
  providerRow.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:7px;';

  const providerLabel = document.createElement('span');
  providerLabel.textContent = 'Provider:';
  providerLabel.style.cssText = 'color:#8f8fa8;font-size:11.5px;white-space:nowrap;';

  const providerSelect = document.createElement('select');
  providerSelect.style.cssText = `
    flex:1;padding:5px 8px;border:1px solid #2c2c3e;border-radius:5px;
    background:#1a1a24;color:#ededf5;font-size:12px;cursor:pointer;outline:none;
  `;
  [
    { value: 'cloudflare', label: '☁️ Cloudflare (free — Flux Schnell)' },
    { value: 'gemini',     label: '✦ Gemini (paid — ~$0.05/image)' },
  ].forEach(({ value, label }) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label;
    providerSelect.appendChild(opt);
  });

  providerRow.appendChild(providerLabel);
  providerRow.appendChild(providerSelect);

  const generateBtn = document.createElement('button');
  generateBtn.textContent = '✨ Generate Image';
  generateBtn.style.cssText = aiButtonStyle + 'padding:7px 14px;font-size:12px;margin-bottom:8px;';

  const generateStatus = document.createElement('div');
  generateStatus.style.cssText = 'color:#8f8fa8;font-size:11.5px;min-height:16px;margin-top:2px;';

  generateBtn.addEventListener('click', async () => {
    const prompt = promptTextarea.value.trim();
    if (!prompt) return;
    const provider = providerSelect.value;
    const action = provider === 'gemini' ? 'generateGeminiImage' : 'generateCloudflareImage';
    const providerName = provider === 'gemini' ? 'Gemini' : 'Cloudflare';
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating…';
    generateStatus.style.color = '#8f8fa8';
    generateStatus.textContent = `Calling ${providerName}…`;
    hiddenTextarea.value = '';
    preview.innerHTML = '';

    try {
      const resp = await chrome.runtime.sendMessage({ action, prompt });
      if (resp.success) {
        hiddenTextarea.value = `<img src="${resp.filename}">`;
        preview.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;
                      background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.25);
                      border-radius:6px;margin-bottom:4px;">
            <img src="${resp.dataUrl}"
                 style="height:60px;width:80px;object-fit:cover;border-radius:3px;flex-shrink:0;">
            <span style="color:#34d399;font-size:11px;word-break:break-all;">
              ✓ ${resp.filename}
            </span>
          </div>`;
        generateStatus.textContent = '';
      } else {
        generateStatus.style.color = '#f87171';
        generateStatus.textContent = '⚠ ' + (resp.error || 'Image generation failed');
      }
    } catch (e) {
      generateStatus.style.color = '#f87171';
      generateStatus.textContent = '⚠ ' + e.message;
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '✨ Generate Image';
    }
  });

  generatePanel.appendChild(promptTextarea);
  generatePanel.appendChild(providerRow);
  generatePanel.appendChild(generateBtn);
  generatePanel.appendChild(generateStatus);
  wrapper.appendChild(generatePanel);

  function renderResults(items) {
    grid.innerHTML = '';
    if (!items.length) {
      const msg = document.createElement('span');
      msg.style.cssText = 'color:#8f8fa8;font-size:12px;grid-column:span 4;';
      msg.textContent = 'No results';
      grid.appendChild(msg);
      return;
    }
    items.forEach(item => {
      const img = document.createElement('img');
      img.src = item.thumb;
      img.title = item.source + ': ' + item.filename;
      img.loading = 'lazy';
      img.style.cssText = `
        width:100%;height:68px;object-fit:cover;cursor:pointer;
        border:2px solid transparent;border-radius:5px;
        transition:border-color 0.12s,opacity 0.12s;
      `;
      img.addEventListener('mouseenter', () => {
        if (img.style.borderColor !== 'rgb(90, 127, 255)') img.style.opacity = '0.8';
      });
      img.addEventListener('mouseleave', () => {
        if (img.style.borderColor !== 'rgb(90, 127, 255)') img.style.opacity = '1';
      });
      img.addEventListener('click', async () => {
        grid.querySelectorAll('img').forEach(i => {
          i.style.borderColor = 'transparent'; i.style.opacity = '1';
        });
        img.style.borderColor = '#5a7fff';
        hiddenTextarea.value = '';
        preview.innerHTML = '';
        statusLine.style.color = '#8f8fa8';
        statusLine.textContent = 'Storing image in Anki…';

        try {
          const resp = await chrome.runtime.sendMessage({
            action: 'storeAnkiImage',
            url: item.url,
            filename: item.filename
          });
          if (resp.success) {
            hiddenTextarea.value = `<img src="${resp.filename}">`;
            preview.innerHTML = `
              <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;
                          background:rgba(52,211,153,0.08);border:1px solid rgba(52,211,153,0.25);
                          border-radius:6px;margin-bottom:4px;">
                <img src="${item.thumb}"
                     style="height:40px;width:56px;object-fit:cover;border-radius:3px;flex-shrink:0;">
                <span style="color:#34d399;font-size:11px;word-break:break-all;">
                  ✓ ${resp.filename}
                </span>
              </div>`;
            statusLine.textContent = '';
          } else {
            statusLine.style.color = '#f87171';
            statusLine.textContent = '⚠ ' + (resp.error || 'Failed to store image');
          }
        } catch (e) {
          statusLine.style.color = '#f87171';
          statusLine.textContent = '⚠ ' + e.message;
        }
      });
      grid.appendChild(img);
    });
  }

  async function doSearch(q) {
    grid.innerHTML = '';
    statusLine.style.color = '#8f8fa8';
    statusLine.textContent = 'Searching…';
    preview.innerHTML = '';
    hiddenTextarea.value = '';

    const [wm, ov] = await Promise.all([searchWikimedia(q), searchOpenverse(q)]);
    lastResults = [...wm, ...ov];

    tabRow.querySelectorAll('button').forEach(b => {
      const id = b.dataset.tabId;
      if (id === 'all')       b.textContent = `All (${lastResults.length})`;
      if (id === 'wikimedia') b.textContent = `Wikimedia (${wm.length})`;
      if (id === 'openverse') b.textContent = `Openverse (${ov.length})`;
    });

    const toShow = activeTab === 'all'
      ? lastResults
      : lastResults.filter(r => r.source.toLowerCase() === activeTab);
    renderResults(toShow);
    statusLine.textContent = lastResults.length
      ? `${lastResults.length} results from Wikimedia + Openverse`
      : 'No results found';
  }

  searchBtn.addEventListener('click', () => {
    if (searchInput.value.trim()) doSearch(searchInput.value.trim());
  });
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') searchBtn.click();
  });

  return { wrapper, searchInput, promptTextarea };
}

// ── End image search helpers ────────────────────────────────────────────────

function attachAIButtonListeners(getWordsCallback) {
  if (!ankiModal) return;

  const translateButtons = ankiModal.querySelectorAll('.ai-translate-btn');
  const defineButtons = ankiModal.querySelectorAll('.ai-define-btn');
  const audioButtons = ankiModal.querySelectorAll('.ai-audio-btn');

  translateButtons.forEach(button => {
    button.addEventListener('click', () => handleTranslate(button));
  });

  defineButtons.forEach(button => {
    button.addEventListener('click', () => handleDefine(button, getWordsCallback));
  });

  audioButtons.forEach(button => {
    button.addEventListener('click', () => handleGenerateAudio(button));
  });
}

async function loadModelFields(getWordsCallback) {
  const modelSelect = ankiModal.querySelector('#anki-model-select');
  const modelName = modelSelect.value;

  if (!modelName) return;

  try {
    const [fieldsResponse, settingsResponse] = await Promise.all([
      chrome.runtime.sendMessage({ action: 'getModelFields', modelName: modelName }),
      chrome.runtime.sendMessage({ action: 'getSettings' })
    ]);
    const audioFieldName = settingsResponse.settings?.audioFieldName || 'Audio';
    const imageFieldName = settingsResponse.settings?.imageFieldName || 'Image';

    const response = fieldsResponse;

    if (response.success) {
      const sentenceFieldSelect = ankiModal.querySelector('#anki-sentence-field-select');
      sentenceFieldSelect.textContent = '';

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = 'Select field...';
      sentenceFieldSelect.appendChild(defaultOption);

      response.fields.forEach((field, index) => {
        const option = document.createElement('option');
        option.value = field;
        option.textContent = field;
        if (index === 0) option.selected = true;
        sentenceFieldSelect.appendChild(option);
      });

      const fieldsContainer = ankiModal.querySelector('#anki-fields-container');
      fieldsContainer.textContent = '';

      // Track image picker search inputs and generate prompts so we can pre-fill from target word
      const imagePickerInputs = [];
      const imagePickerPrompts = [];

      response.fields.forEach(field => {
        const fieldId = field.replace(/[^a-zA-Z0-9]/g, '_');
        const isAudioField = field === audioFieldName;
        const isImgField = imageFieldName && field === imageFieldName;

        const fieldDiv = document.createElement('div');
        fieldDiv.style.marginBottom = '16px';

        const label = document.createElement('label');
        label.style.cssText = 'display:block;margin-bottom:6px;font-weight:500;color:#ededf5;font-size:13px;letter-spacing:0.1px;';
        label.textContent = field;
        fieldDiv.appendChild(label);

        if (isImgField) {
          // ── Image search picker ──────────────────────────────────────────
          const { wrapper, searchInput, promptTextarea } = createImagePickerField(field, fieldId);
          fieldDiv.appendChild(wrapper);
          imagePickerInputs.push(searchInput);
          imagePickerPrompts.push(promptTextarea);
        } else {
          // ── Standard textarea + AI buttons ───────────────────────────────
          const flexDiv = document.createElement('div');
          flexDiv.style.cssText = 'display:flex;gap:6px;align-items:flex-start;';

          const textarea = document.createElement('textarea');
          textarea.id = `anki-field-${fieldId}`;
          textarea.setAttribute('data-field-name', field);
          textarea.style.cssText = `
            flex: 1;
            min-height: 62px;
            padding: 8px 11px;
            border: 1px solid #2c2c3e;
            border-radius: 6px;
            font-size: 13.5px;
            font-family: inherit;
            resize: vertical;
            color: #ededf5;
            background: #1a1a24;
            outline: none;
            transition: border-color 0.15s ease, box-shadow 0.15s ease;
            line-height: 1.5;
          `;
          textarea.addEventListener('focus', () => {
            textarea.style.borderColor = '#5a7fff';
            textarea.style.boxShadow = '0 0 0 3px rgba(90,127,255,0.14)';
          });
          textarea.addEventListener('blur', () => {
            textarea.style.borderColor = '#2c2c3e';
            textarea.style.boxShadow = 'none';
          });
          flexDiv.appendChild(textarea);

          const aiButtonStyle = `
            padding: 5px 9px;
            background: #21212e;
            color: #8aabff;
            border: 1px solid #2c2c3e;
            border-radius: 5px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            white-space: nowrap;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.15s ease;
            letter-spacing: 0.1px;
          `;

          const buttonDiv = document.createElement('div');
          buttonDiv.style.cssText = 'display:flex;flex-direction:column;gap:4px;';

          const translateBtn = document.createElement('button');
          translateBtn.className = 'ai-translate-btn';
          translateBtn.setAttribute('data-field-id', `anki-field-${fieldId}`);
          translateBtn.title = 'Translate sentence to English';
          translateBtn.style.cssText = aiButtonStyle;
          translateBtn.textContent = 'AI Translate';
          buttonDiv.appendChild(translateBtn);

          const defineBtn = document.createElement('button');
          defineBtn.className = 'ai-define-btn';
          defineBtn.setAttribute('data-field-id', `anki-field-${fieldId}`);
          defineBtn.title = 'Define unknown word in context';
          defineBtn.style.cssText = aiButtonStyle;
          defineBtn.textContent = 'AI Define';
          buttonDiv.appendChild(defineBtn);

          if (isAudioField) {
            const audioBtn = document.createElement('button');
            audioBtn.className = 'ai-audio-btn';
            audioBtn.title = 'Generate audio via ElevenLabs TTS';
            audioBtn.style.cssText = aiButtonStyle;
            audioBtn.textContent = 'AI Audio';
            buttonDiv.appendChild(audioBtn);
          }

          flexDiv.appendChild(buttonDiv);
          fieldDiv.appendChild(flexDiv);
        }

        fieldsContainer.appendChild(fieldDiv);
      });

      // Pre-fill image search inputs with unknown word(s) from the sentence
      if (imagePickerInputs.length && currentSentence) {
        let searchTerm = '';
        try {
          const { matureWords, learningWords } = await getWordsCallback();
          const unknownWords = extractAllUnknownWords(currentSentence, matureWords, learningWords);
          searchTerm = unknownWords.join(' ');
        } catch (_) {}
        // Fall back to first Hebrew word if word lists unavailable
        if (!searchTerm) {
          searchTerm = (currentSentence.match(/[֐-׿]+/g) || [])[0] || '';
        }
        if (searchTerm) {
          imagePickerInputs.forEach(inp => { inp.value = searchTerm; });
          imagePickerPrompts.forEach(ta => { ta.value = searchTerm; });
        }
      }

      if (response.fields.length > 0) {
        fillSentenceField();
      }

      attachAIButtonListeners(getWordsCallback);
    } else {
      const fieldsContainer = ankiModal.querySelector('#anki-fields-container');
      fieldsContainer.textContent = 'Error loading fields';
      fieldsContainer.style.color = '#dc3545';
    }
  } catch (error) {
    console.error('Error loading model fields:', error);
    showModalError('Failed to load note type fields.');
  }
}

async function loadDecksAndModels(getWordsCallback) {
  try {
    const settingsResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = settingsResponse.settings;

    const decksResponse = await chrome.runtime.sendMessage({ action: 'getDecks' });
    const deckSelect = ankiModal.querySelector('#anki-deck-select');

    if (decksResponse.success) {
      deckSelect.textContent = '';
      decksResponse.decks.forEach(deck => {
        const option = document.createElement('option');
        option.value = deck;
        option.textContent = deck;
        deckSelect.appendChild(option);
      });

      // Set default deck if configured
      if (settings?.defaultDeck && decksResponse.decks.includes(settings.defaultDeck)) {
        deckSelect.value = settings.defaultDeck;
      }
    } else {
      deckSelect.textContent = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Error loading decks';
      deckSelect.appendChild(option);
    }

    const modelsResponse = await chrome.runtime.sendMessage({ action: 'getModels' });
    const modelSelect = ankiModal.querySelector('#anki-model-select');

    if (modelsResponse.success) {
      modelSelect.textContent = '';
      modelsResponse.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      });

      // Set default note type if configured
      if (settings?.defaultNoteType && modelsResponse.models.includes(settings.defaultNoteType)) {
        modelSelect.value = settings.defaultNoteType;
      }

      // Load fields for selected model (either default or first)
      if (modelsResponse.models.length > 0) {
        await loadModelFields(getWordsCallback);
      }
    } else {
      modelSelect.textContent = '';
      const option = document.createElement('option');
      option.value = '';
      option.textContent = 'Error loading note types';
      modelSelect.appendChild(option);
    }
  } catch (error) {
    console.error('Error loading Anki data:', error);
    showModalError('Failed to load Anki data. Make sure Anki is running.');
  }
}

async function createAnkiCard() {
  const deckSelect = ankiModal.querySelector('#anki-deck-select');
  const modelSelect = ankiModal.querySelector('#anki-model-select');

  const deckName = deckSelect.value;
  const modelName = modelSelect.value;

  if (!deckName || !modelName) {
    showModalError('Please select a deck and note type');
    return;
  }

  const fieldTextareas = ankiModal.querySelectorAll('[data-field-name]');
  const fields = {};

  fieldTextareas.forEach(textarea => {
    const fieldName = textarea.dataset.fieldName;
    const value = textarea.value.trim();
    fields[fieldName] = value.replace(/\n/g, '<br>');
  });

  if (currentAudioFilename) {
    const settingsResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const audioFieldName = settingsResponse.settings?.audioFieldName || 'Audio';

    const allFieldTextareas = Array.from(fieldTextareas);
    const audioTextarea = allFieldTextareas.find(t => t.dataset.fieldName === audioFieldName);

    // Only override if the textarea doesn't already contain the sound tag (it's pre-populated visually)
    if (audioTextarea && !fields[audioFieldName]?.includes('[sound:')) {
      fields[audioFieldName] = `[sound:${currentAudioFilename}]`;
    }
  }

  const hasContent = Object.values(fields).some(value => value.length > 0);
  if (!hasContent) {
    showModalError('Please fill in at least one field');
    return;
  }

  try {
    const createButton = ankiModal.querySelector('#anki-modal-create');
    createButton.disabled = true;
    createButton.textContent = 'Creating...';

    const response = await chrome.runtime.sendMessage({
      action: 'createNote',
      deckName: deckName,
      modelName: modelName,
      fields: fields,
      tags: ['sentence'],
      options: {
        "allowHTML": true
      }
    });

    if (response.success) {
      showNotification('Card created successfully!', 'success');
      closeAnkiModal();
    } else {
      showModalError(response.error || 'Failed to create card');
      createButton.disabled = false;
      createButton.textContent = 'Create Card';
    }
  } catch (error) {
    console.error('Error creating Anki card:', error);
    showModalError('Failed to create card');
    const createButton = ankiModal.querySelector('#anki-modal-create');
    createButton.disabled = false;
    createButton.textContent = 'Create Card';
  }
}

/**
 * Show notification
 * @param {string} message - Message to show
 * @param {string} type - Notification type ('success' or 'error')
 */
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  const isSuccess = type === 'success';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10001;
    background: ${isSuccess ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)'};
    color: ${isSuccess ? '#34d399' : '#f87171'};
    border: 1px solid ${isSuccess ? 'rgba(52,211,153,0.30)' : 'rgba(248,113,113,0.30)'};
    padding: 12px 18px;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-size: 13.5px;
    font-weight: 500;
    backdrop-filter: blur(8px);
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.transition = 'opacity 0.3s';
    notification.style.opacity = '0';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function closeAnkiModal() {
  if (ankiModal) {
    ankiModal.style.display = 'none';
  }
  currentSentence = null;
  currentAudioFilename = null;
  if (currentAudioBlobUrl) {
    URL.revokeObjectURL(currentAudioBlobUrl);
    currentAudioBlobUrl = null;
  }
}

/**
 * Create the modal HTML
 * @param {Function} getWordsCallback - Callback to get word lists
 * @returns {HTMLElement} Modal element
 */
function createAnkiModal(getWordsCallback) {
  if (ankiModal) return ankiModal;

  const modal = document.createElement('div');
  modal.id = window.DOM_IDS.ANKI_MODAL;
  modal.style.cssText = `
    display: none;
    position: fixed;
    z-index: 10000;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0,0,0,0.5);
  `;

  modal.innerHTML = `
    <div style="
      background: #13131a;
      color: #ededf5;
      margin: 48px auto;
      padding: 0;
      border-radius: 14px;
      width: 92%;
      max-width: 500px;
      max-height: calc(100vh - 96px);
      box-shadow: 0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06);
      border: 1px solid #2c2c3e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    ">
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 22px 16px;
        border-bottom: 1px solid #2c2c3e;
        background: #13131a;
        position: relative;
        flex-shrink: 0;
      ">
        <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#5a7fff,#9b6bff 60%,transparent);border-radius:14px 14px 0 0;"></div>
        <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #ededf5; letter-spacing: -0.2px;">Create Anki Card</h2>
        <button id="anki-modal-close" style="
          background: #1a1a24;
          border: 1px solid #2c2c3e;
          width: 28px;
          height: 28px;
          border-radius: 6px;
          font-size: 18px;
          line-height: 1;
          cursor: pointer;
          color: #8f8fa8;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        ">&times;</button>
      </div>

      <div style="overflow-y: auto; flex: 1; padding: 20px 22px; scrollbar-width: thin; scrollbar-color: #2c2c3e transparent;">
        <div id="anki-sentence-display" style="
          background: #1a1a24;
          color: #ededf5;
          padding: 13px 15px;
          border-radius: 8px;
          margin-bottom: 18px;
          direction: rtl;
          font-size: 16px;
          font-weight: 500;
          border: 1px solid #2c2c3e;
          line-height: 1.6;
        "></div>

        <div style="margin-bottom: 14px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #ededf5; font-size: 13px; letter-spacing: 0.1px;">
            Deck
          </label>
          <select id="anki-deck-select" style="
            width: 100%;
            padding: 8px 32px 8px 12px;
            border: 1px solid #2c2c3e;
            border-radius: 6px;
            font-size: 13.5px;
            color: #ededf5;
            background: #1a1a24;
            outline: none;
            appearance: none;
            -webkit-appearance: none;
            cursor: pointer;
          ">
            <option value="">Loading...</option>
          </select>
        </div>

        <div style="margin-bottom: 14px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #ededf5; font-size: 13px; letter-spacing: 0.1px;">
            Note Type
          </label>
          <select id="anki-model-select" style="
            width: 100%;
            padding: 8px 32px 8px 12px;
            border: 1px solid #2c2c3e;
            border-radius: 6px;
            font-size: 13.5px;
            color: #ededf5;
            background: #1a1a24;
            outline: none;
            appearance: none;
            -webkit-appearance: none;
            cursor: pointer;
          ">
            <option value="">Loading...</option>
          </select>
        </div>

        <div style="margin-bottom: 18px;">
          <label style="display: block; margin-bottom: 6px; font-weight: 500; color: #ededf5; font-size: 13px; letter-spacing: 0.1px;">
            Put sentence in field
          </label>
          <select id="anki-sentence-field-select" style="
            width: 100%;
            padding: 8px 32px 8px 12px;
            border: 1px solid #2c2c3e;
            border-radius: 6px;
            font-size: 13.5px;
            color: #ededf5;
            background: #1a1a24;
            outline: none;
            appearance: none;
            -webkit-appearance: none;
            cursor: pointer;
          ">
            <option value="">Select field...</option>
          </select>
        </div>

        <div id="anki-fields-container"></div>

        <div id="anki-error-message" style="
          display: none;
          background: rgba(248,113,113,0.10);
          color: #f87171;
          padding: 10px 13px;
          border-radius: 6px;
          margin-top: 14px;
          font-size: 13px;
          border: 1px solid rgba(248,113,113,0.28);
          line-height: 1.5;
        "></div>
      </div>

      <div style="
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 14px 22px;
        border-top: 1px solid #2c2c3e;
        background: #13131a;
        flex-shrink: 0;
      ">
        <button id="anki-modal-cancel" style="
          padding: 8px 18px;
          background: #21212e;
          color: #8f8fa8;
          border: 1px solid #2c2c3e;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s ease;
        ">Cancel</button>
        <button id="anki-modal-create" style="
          padding: 8px 20px;
          background: #5a7fff;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(90,127,255,0.30);
          transition: all 0.15s ease;
        ">Create Card</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelector('#anki-modal-close').addEventListener('click', closeAnkiModal);
  modal.querySelector('#anki-modal-cancel').addEventListener('click', closeAnkiModal);
  modal.querySelector('#anki-modal-create').addEventListener('click', createAnkiCard);
  modal.querySelector('#anki-model-select').addEventListener('change', () => loadModelFields(getWordsCallback));
  modal.querySelector('#anki-sentence-field-select').addEventListener('change', fillSentenceField);

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeAnkiModal();
    }
  });

  ankiModal = modal;
  return modal;
}

/**
 * Open modal with sentence
 * @param {string} sentence - Hebrew sentence to create card from
 * @param {Function} getWordsCallback - Callback to get word lists
 */
async function openAnkiModal(sentence, getWordsCallback, audioFilename = null) {
  currentSentence = sentence;
  currentAudioFilename = audioFilename;
  const modal = createAnkiModal(getWordsCallback);

  modal.querySelector('#anki-sentence-display').textContent = sentence;

  if (audioFilename) {
    const audioIndicator = document.createElement('div');
    audioIndicator.style.cssText = `
      margin-top: 8px;
      padding: 5px 12px;
      background: rgba(52,211,153,0.12);
      color: #34d399;
      border: 1px solid rgba(52,211,153,0.28);
      border-radius: 20px;
      font-size: 11.5px;
      font-weight: 500;
      display: inline-block;
    `;
    audioIndicator.textContent = '🎤 Audio recorded';
    const sentenceDisplay = modal.querySelector('#anki-sentence-display');
    sentenceDisplay.parentNode.insertBefore(audioIndicator, sentenceDisplay.nextSibling);
  }

  const errorDiv = modal.querySelector('#anki-error-message');
  errorDiv.style.display = 'none';

  const createButton = modal.querySelector('#anki-modal-create');
  if (createButton) {
    createButton.disabled = false;
    createButton.textContent = 'Create Card';
  }

  await loadDecksAndModels(getWordsCallback);

  modal.style.display = 'block';
}

function initializeCardCreator(getWordsCallback) {
  document.addEventListener('click', async (e) => {
    if (!e.shiftKey) return;

    const sentenceHighlight = e.target.closest(`.${window.CSS_CLASSES.SENTENCE_HIGHLIGHT}`);
    if (sentenceHighlight) {
      e.preventDefault(); // Prevent text selection on shift+click
      e.stopPropagation(); // Stop event from bubbling

      // Clear any existing text selection
      if (window.getSelection) {
        window.getSelection().removeAllRanges();
      }

      const sentence = sentenceHighlight.dataset.ankiSentence || sentenceHighlight.textContent.trim();
      if (sentence) {
        await openAnkiModal(sentence, getWordsCallback);
      }
    }
  });
}

  window.initializeCardCreator = initializeCardCreator;
  window.openAnkiModal = openAnkiModal;
  window.closeAnkiModal = closeAnkiModal;
})();
