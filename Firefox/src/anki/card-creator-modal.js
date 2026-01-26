// Anki card creation modal for creating cards from Hebrew sentences

(function() {
  'use strict';

  // Module state
let ankiModal = null;
let currentSentence = null;
let currentAudioFilename = null;

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

function attachAIButtonListeners(getWordsCallback) {
  if (!ankiModal) return;

  const translateButtons = ankiModal.querySelectorAll('.ai-translate-btn');
  const defineButtons = ankiModal.querySelectorAll('.ai-define-btn');

  translateButtons.forEach(button => {
    button.addEventListener('click', () => handleTranslate(button));
  });

  defineButtons.forEach(button => {
    button.addEventListener('click', () => handleDefine(button, getWordsCallback));
  });
}

async function loadModelFields(getWordsCallback) {
  const modelSelect = ankiModal.querySelector('#anki-model-select');
  const modelName = modelSelect.value;

  if (!modelName) return;

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getModelFields',
      modelName: modelName
    });

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

      response.fields.forEach(field => {
        const fieldId = field.replace(/[^a-zA-Z0-9]/g, '_');

        const fieldDiv = document.createElement('div');
        fieldDiv.style.marginBottom = '15px';

        const label = document.createElement('label');
        label.style.display = 'block';
        label.style.marginBottom = '5px';
        label.style.fontWeight = '500';
        label.style.color = '#ddd';
        label.style.fontSize = '16px';
        label.textContent = `${field}:`;
        fieldDiv.appendChild(label);

        const flexDiv = document.createElement('div');
        flexDiv.style.display = 'flex';
        flexDiv.style.gap = '5px';
        flexDiv.style.alignItems = 'flex-start';

        const textarea = document.createElement('textarea');
        textarea.id = `anki-field-${fieldId}`;
        textarea.setAttribute('data-field-name', field);
        textarea.style.cssText = `
          flex: 1;
          min-height: 60px;
          padding: 8px;
          border: 1px solid #444;
          border-radius: 4px;
          font-size: 14px;
          font-family: inherit;
          resize: vertical;
          color: white;
          background: #1a1a1a;
        `;
        flexDiv.appendChild(textarea);

        const buttonDiv = document.createElement('div');
        buttonDiv.style.display = 'flex';
        buttonDiv.style.flexDirection = 'column';
        buttonDiv.style.gap = '5px';

        const translateBtn = document.createElement('button');
        translateBtn.className = 'ai-translate-btn';
        translateBtn.setAttribute('data-field-id', `anki-field-${fieldId}`);
        translateBtn.title = 'Translate sentence to English';
        translateBtn.style.cssText = `
          padding: 6px 10px;
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
        `;
        translateBtn.textContent = 'AI Translate';
        buttonDiv.appendChild(translateBtn);

        const defineBtn = document.createElement('button');
        defineBtn.className = 'ai-define-btn';
        defineBtn.setAttribute('data-field-id', `anki-field-${fieldId}`);
        defineBtn.title = 'Define unknown word in context';
        defineBtn.style.cssText = `
          padding: 6px 10px;
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
        `;
        defineBtn.textContent = 'AI Define';
        buttonDiv.appendChild(defineBtn);

        flexDiv.appendChild(buttonDiv);
        fieldDiv.appendChild(flexDiv);
        fieldsContainer.appendChild(fieldDiv);
      });

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
    const hasAudioField = allFieldTextareas.some(textarea => textarea.dataset.fieldName === audioFieldName);

    if (hasAudioField) {
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
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10001;
    background: ${type === 'success' ? '#28a745' : '#dc3545'};
    color: white;
    padding: 15px 20px;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    font-size: 14px;
    font-weight: 500;
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
      background-color: #272727;
      color: white;
      margin: 50px auto;
      padding: 20px;
      border-radius: 8px;
      width: 90%;
      max-width: 500px;
      max-height: calc(100vh - 100px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      border: 1px solid #333;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
    ">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-size: 20px; color: white;">Create Anki Card</h2>
        <button id="anki-modal-close" style="
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #aaa;
        ">&times;</button>
      </div>

      <div style="overflow-y: auto; flex: 1; margin-bottom: 15px;">
        <div id="anki-sentence-display" style="
          background: #1a1a1a;
          color: white;
          padding: 12px;
          border-radius: 4px;
          margin-bottom: 20px;
          direction: rtl;
          font-size: 16px;
          font-weight: 500;
          border: 1px solid #333;
        "></div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #ddd; font-size: 16px;">
            Deck:
          </label>
          <select id="anki-deck-select" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #444;
            border-radius: 4px;
            font-size: 14px;
            color: white;
            background: #1a1a1a;
          ">
            <option value="">Loading...</option>
          </select>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #ddd; font-size: 16px;">
            Note Type:
          </label>
          <select id="anki-model-select" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #444;
            border-radius: 4px;
            font-size: 14px;
            color: white;
            background: #1a1a1a;
          ">
            <option value="">Loading...</option>
          </select>
        </div>

        <div style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500; color: #ddd; font-size: 16px;">
            Put sentence in field:
          </label>
          <select id="anki-sentence-field-select" style="
            width: 100%;
            padding: 8px;
            border: 1px solid #444;
            border-radius: 4px;
            font-size: 14px;
            color: white;
            background: #1a1a1a;
          ">
            <option value="">Select field...</option>
          </select>
        </div>

        <div id="anki-fields-container"></div>

        <div id="anki-error-message" style="
          display: none;
          background: #721c24;
          color: #f44336;
          padding: 10px;
          border-radius: 4px;
          margin-top: 15px;
          font-size: 14px;
          border: 1px solid #f44336;
        "></div>
      </div>

      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="anki-modal-cancel" style="
          padding: 10px 20px;
          background: #555;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
        ">Cancel</button>
        <button id="anki-modal-create" style="
          padding: 10px 20px;
          background: #0066ff;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
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
      padding: 6px 12px;
      background: #28a745;
      color: white;
      border-radius: 4px;
      font-size: 12px;
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
