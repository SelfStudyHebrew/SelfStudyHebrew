// Options page script for SelfStudyHebrew

const DEFAULT_SENTENCE_PROMPT = `TARGET WORD (unknown to student): {{TARGET_WORD}}

Generate {{COUNT}} natural Hebrew sentences following these rules:

1. Each sentence MUST contain the exact target word "{{TARGET_WORD}}" with no modifications (No added prefixes/prepositions)
2. All other words MUST come from the known words list only
3. You MAY add prefixes/prepositions to known words when grammatically necessary, but not the target word as this should not be modified. For example, if the target word is בר then you should NOT change it to לבר or הבר or ובר
4. Sentences must be natural, grammatically correct Hebrew that native speakers would use
5. Vary sentence structure, context, and length
6. Keep sentences simple but meaningful

CRITICAL CONSTRAINTS:
- Do NOT use any words outside the known words list (except the target word)
- Do NOT modify the target word itself (no prefixes/suffixes unless the word already has them)
- Do NOT add explanations, translations, or numbering

OUTPUT FORMAT: Return ONLY {{COUNT}} Hebrew sentences, one per line, nothing else.`;

const DEFAULT_TRANSLATE_PROMPT = `Translate this Hebrew sentence into natural English.{{CONTEXT}}\n\nHebrew: {{SENTENCE}}\nEnglish:`;

const DEFAULT_DEFINE_PROMPT = `Hebrew sentence: {{SENTENCE}}

Define the word "{{WORD}}" as it appears in that sentence.

If the word includes a bound prefix (ש, ב, ל, ו, מ, כ, ה), define the base word using the standard format below. Under MEANING, note the prefix and its contribution briefly, e.g. "people / men (here: שֶׁ + אֲנָשִׁים = 'that people')".

Use exactly this HTML format — bold each label, each entry on its own line with no blank lines:

<b>TYPE:</b> [part of speech — Verb / Noun / Adjective / Adverb / Preposition / Conjunction / Pronoun / Particle / etc.]
<b>ROOT:</b> [Hebrew root letters separated by dashes, e.g. פ - ת - ח, or N/A for particles and function words]
<b>MEANING:</b> [list the main meanings of this word form; include gender/number/person where relevant]
<b>CONTEXT:</b> [what the word means specifically in this sentence — literal, idiomatic, emotional, etc.]

If the word is a Verb, add these three lines immediately after MEANING (before CONTEXT):
<b>TENSE:</b> [Present / Past / Future / Imperative, plus person/gender/number]
<b>BINYAN:</b> [פָּעַל / פִּיעֵל / פּוּעַל / הִפְעִיל / הֻפְעַל / הִתְפַּעֵל / נִפְעַל]
<b>INFINITIVE:</b> [infinitive form in Hebrew followed by English meaning in parentheses, e.g. לִפְתֹּחַ (to open)]

If the word is a Noun or Adjective, add this line immediately after MEANING (before CONTEXT):
<b>LEMMA:</b> [base dictionary form — masculine singular for adjectives, absolute singular for nouns — with gender, e.g. בַּיִת (m)]

Output only the formatted definition — no preamble, no explanation.`;

// DOM elements
const claudeApiKeyInput = document.getElementById('claude-api-key');
const claudeModelInput = document.getElementById('claude-model');
const elevenLabsApiKeyInput = document.getElementById('elevenlabs-api-key');
const elevenLabsVoiceIdInput = document.getElementById('elevenlabs-voice-id');
document.querySelectorAll('.voice-preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    elevenLabsVoiceIdInput.value = btn.dataset.voiceId;
  });
});
const elevenLabsModelInput = document.getElementById('elevenlabs-model');
const geminiApiKeyInput = document.getElementById('gemini-api-key');
const cloudflareAccountIdInput = document.getElementById('cloudflare-account-id');
const cloudflareApiTokenInput = document.getElementById('cloudflare-api-token');
const cloudflareImageModelInput = document.getElementById('cloudflare-image-model');
const maxWordsI1Input = document.getElementById('max-words-i1');
const sentenceGenerationPromptInput = document.getElementById('sentence-generation-prompt');
const resetPromptBtn = document.getElementById('reset-prompt-btn');
const aiDefinePromptInput = document.getElementById('ai-define-prompt');
const resetDefinePromptBtn = document.getElementById('reset-define-prompt-btn');
const aiTranslatePromptInput = document.getElementById('ai-translate-prompt');
const resetTranslatePromptBtn = document.getElementById('reset-translate-prompt-btn');
const spendTotal = document.getElementById('spend-total');
const resetSpendBtn = document.getElementById('reset-spend-btn');
const defaultDeckSelect = document.getElementById('default-deck');
const defaultNoteTypeSelect = document.getElementById('default-note-type');
const audioFieldNameInput = document.getElementById('audio-field-name');
const imageFieldNameInput = document.getElementById('image-field-name');
const meaningFieldNameInput = document.getElementById('meaning-field-name');
const sentenceColorInput = document.getElementById('sentence-color');
const sentenceColorText = document.getElementById('sentence-color-text');
const resetSentenceColorBtn = document.getElementById('reset-sentence-color-btn');
const potentiallyI1ColorInput = document.getElementById('potentially-i1-color');
const potentiallyI1ColorText = document.getElementById('potentially-i1-color-text');
const resetPotentiallyI1ColorBtn = document.getElementById('reset-potentially-i1-color-btn');
const sentenceHighlightEnabled = document.getElementById('sentence-highlight-enabled');
const stripNikudEnabled = document.getElementById('strip-nikud-enabled');
const fieldNameInput = document.getElementById('field-name');
const deckFilterInput = document.getElementById('deck-filter');
const matureThresholdInput = document.getElementById('mature-threshold');
const ankiStatus = document.getElementById('anki-status');
const matureCount = document.getElementById('mature-count');
const learningCount = document.getElementById('learning-count');
const wordCount = document.getElementById('word-count');
const lastUpdated = document.getElementById('last-updated');
const testConnectionBtn = document.getElementById('test-connection-btn');
const setupAnkiBtn = document.getElementById('setup-anki-btn');
const refreshWordsBtn = document.getElementById('refresh-words-btn');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const clearDictionaryBtn = document.getElementById('clear-dictionary-btn');
const exportWordsBtn = document.getElementById('export-words-btn');
const bulkImportBtn = document.getElementById('bulk-import-btn');
const bulkImportFile = document.getElementById('bulk-import-file');
const bulkImportTextarea = document.getElementById('bulk-import-textarea');
const bulkImportTextBtn = document.getElementById('bulk-import-text-btn');
const clearTextareaBtn = document.getElementById('clear-textarea-btn');
const saveBtn = document.getElementById('save-btn');
const statusMessage = document.getElementById('status-message');

// Word list elements
const wordSearch = document.getElementById('word-search');
const filterAll = document.getElementById('filter-all');
const filterMature = document.getElementById('filter-mature');
const filterLearning = document.getElementById('filter-learning');
const wordListContainer = document.getElementById('word-list-container');

// Global state
let allMatureWords = [];
let allLearningWords = [];
let currentFilter = 'all';

// Format timestamp
function formatTimestamp(timestamp) {
  if (!timestamp) return 'Never';

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

// Show status message
function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = 'status-message ' + (isError ? 'error' : 'success');

  setTimeout(() => {
    statusMessage.textContent = '';
    statusMessage.className = 'status-message';
  }, 3000);
}

// Sync color inputs for sentence color
sentenceColorInput.addEventListener('input', (e) => {
  sentenceColorText.value = e.target.value;
});
sentenceColorText.addEventListener('input', (e) => {
  const color = e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(color)) sentenceColorInput.value = color;
});
resetSentenceColorBtn.addEventListener('click', () => {
  sentenceColorInput.value = '#5a7fff';
  sentenceColorText.value = '#5a7fff';
});

// Sync color inputs for potentially-i+1 color
potentiallyI1ColorInput.addEventListener('input', (e) => {
  potentiallyI1ColorText.value = e.target.value;
});
potentiallyI1ColorText.addEventListener('input', (e) => {
  const color = e.target.value;
  if (/^#[0-9A-F]{6}$/i.test(color)) potentiallyI1ColorInput.value = color;
});
resetPotentiallyI1ColorBtn.addEventListener('click', () => {
  potentiallyI1ColorInput.value = '#9b6bff';
  potentiallyI1ColorText.value = '#9b6bff';
});

// Display word list
function displayWordList(searchTerm = '') {
  const filtered = {
    mature: allMatureWords.filter(w => !searchTerm || w.includes(searchTerm)),
    learning: allLearningWords.filter(w => !searchTerm || w.includes(searchTerm))
  };

  // Update filter counts
  document.getElementById('filter-all-count').textContent = filtered.mature.length + filtered.learning.length;
  document.getElementById('filter-mature-count').textContent = filtered.mature.length;
  document.getElementById('filter-learning-count').textContent = filtered.learning.length;

  // Determine which words to show
  let wordsToShow = [];
  if (currentFilter === 'all') {
    wordsToShow = [
      ...filtered.mature.map(w => ({word: w, type: 'mature'})),
      ...filtered.learning.map(w => ({word: w, type: 'learning'}))
    ];
  } else if (currentFilter === 'mature') {
    wordsToShow = filtered.mature.map(w => ({word: w, type: 'mature'}));
  } else if (currentFilter === 'learning') {
    wordsToShow = filtered.learning.map(w => ({word: w, type: 'learning'}));
  }

  // Sort by word
  wordsToShow.sort((a, b) => a.word.localeCompare(b.word));

  // Display words
  wordListContainer.textContent = '';
  if (wordsToShow.length === 0) {
    const p = document.createElement('p');
    p.className = 'word-list-empty';
    p.textContent = 'No words found';
    wordListContainer.appendChild(p);
  } else {
    wordsToShow.forEach(item => {
      const span = document.createElement('span');
      span.className = `word-item ${item.type}`;
      span.textContent = item.word;
      wordListContainer.appendChild(span);
    });
  }
}

// Load decks and note types for defaults dropdowns
async function loadDefaultsDropdowns(settings) {
  try {
    // Load decks
    const decksResponse = await chrome.runtime.sendMessage({ action: 'getDecks' });
    if (decksResponse.success) {
      defaultDeckSelect.textContent = '';

      const noneOption = document.createElement('option');
      noneOption.value = '';
      noneOption.textContent = 'None (select each time)';
      defaultDeckSelect.appendChild(noneOption);

      decksResponse.decks.sort().forEach(deck => {
        const option = document.createElement('option');
        option.value = deck;
        option.textContent = deck;
        defaultDeckSelect.appendChild(option);
      });

      // Set saved default
      if (settings?.defaultDeck) {
        defaultDeckSelect.value = settings.defaultDeck;
      }
    }

    // Load note types
    const modelsResponse = await chrome.runtime.sendMessage({ action: 'getModels' });
    if (modelsResponse.success) {
      defaultNoteTypeSelect.textContent = '';

      const noneOption = document.createElement('option');
      noneOption.value = '';
      noneOption.textContent = 'None (select each time)';
      defaultNoteTypeSelect.appendChild(noneOption);

      modelsResponse.models.sort().forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        defaultNoteTypeSelect.appendChild(option);
      });

      // Set saved default
      if (settings?.defaultNoteType) {
        defaultNoteTypeSelect.value = settings.defaultNoteType;
      }
    }
  } catch (error) {
    console.error('Error loading defaults dropdowns:', error);
  }
}

// Load settings
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = response.settings;

    if (settings) {
      claudeApiKeyInput.value = settings.claudeApiKey || '';
      claudeModelInput.value = settings.claudeModel || 'claude-sonnet-4-6';
      elevenLabsApiKeyInput.value = settings.elevenLabsApiKey || '';
      elevenLabsVoiceIdInput.value = settings.elevenLabsVoiceId || 'Jrq4GqCKqYpigdQsZRkP';
      elevenLabsModelInput.value = settings.elevenLabsModel || 'eleven_v3';
      geminiApiKeyInput.value = settings.geminiApiKey || '';
      cloudflareAccountIdInput.value = settings.cloudflareAccountId || '';
      cloudflareApiTokenInput.value = settings.cloudflareApiToken || '';
      cloudflareImageModelInput.value = settings.cloudflareImageModel || '';
      maxWordsI1Input.value = settings.maxWordsForI1 || 3000;
      sentenceGenerationPromptInput.value = settings.sentenceGenerationPrompt || DEFAULT_SENTENCE_PROMPT;
      aiDefinePromptInput.value = settings.aiDefinePrompt || DEFAULT_DEFINE_PROMPT;
      aiTranslatePromptInput.value = settings.aiTranslatePrompt || DEFAULT_TRANSLATE_PROMPT;
      sentenceColorInput.value = settings.sentenceColor || '#5a7fff';
      sentenceColorText.value = settings.sentenceColor || '#5a7fff';
      potentiallyI1ColorInput.value = settings.potentiallyI1Color || '#9b6bff';
      potentiallyI1ColorText.value = settings.potentiallyI1Color || '#9b6bff';
      sentenceHighlightEnabled.checked = settings.sentenceHighlightEnabled !== false;
      stripNikudEnabled.checked = settings.stripNikudEnabled || false;
      audioFieldNameInput.value = settings.audioFieldName || 'Audio';
      imageFieldNameInput.value = settings.imageFieldName || 'Image';
      meaningFieldNameInput.value = settings.meaningFieldName || 'English';
      fieldNameInput.value = settings.fieldName;
      deckFilterInput.value = settings.deckFilter || '';
      matureThresholdInput.value = settings.matureThreshold || 21;
    }

    // Load decks and note types for defaults
    await loadDefaultsDropdowns(settings);

    // Load word count and last updated
    const wordsResponse = await chrome.runtime.sendMessage({ action: 'getWords' });
    allMatureWords = wordsResponse.matureWords || [];
    allLearningWords = wordsResponse.learningWords || [];

    matureCount.textContent = allMatureWords.length;
    learningCount.textContent = allLearningWords.length;
    wordCount.textContent = allMatureWords.length + allLearningWords.length;
    lastUpdated.textContent = formatTimestamp(wordsResponse.lastUpdated);

    // Display word list
    displayWordList();

    // Check connection
    await checkConnection();

  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', true);
  }
}

// Check AnkiConnect connection
async function checkConnection() {
  ankiStatus.textContent = 'Checking...';
  ankiStatus.className = 'status-badge checking';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'checkAnkiConnect' });

    if (response.available) {
      ankiStatus.textContent = 'Connected';
      ankiStatus.className = 'status-badge connected';
      return true;
    } else {
      ankiStatus.textContent = 'Disconnected';
      ankiStatus.className = 'status-badge disconnected';
      return false;
    }
  } catch (error) {
    ankiStatus.textContent = 'Error';
    ankiStatus.className = 'status-badge disconnected';
    return false;
  }
}

// Test connection
async function testConnection() {
  testConnectionBtn.disabled = true;
  testConnectionBtn.textContent = 'Testing...';

  const isConnected = await checkConnection();

  if (isConnected) {
    showStatus('Successfully connected to AnkiConnect!');
  } else {
    showStatus('Cannot connect to AnkiConnect. Make sure Anki is running.', true);
  }

  testConnectionBtn.disabled = false;
  testConnectionBtn.textContent = 'Test Connection';
}

// Save settings
async function saveSettings() {
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

  try {
    // Validate field name
    const fieldName = fieldNameInput.value.trim();
    if (!fieldName) {
      showStatus('Field name cannot be empty', true);
      return;
    }

    // Validate sentence colors
    const sentenceColor = sentenceColorText.value;
    if (!/^#[0-9A-F]{6}$/i.test(sentenceColor)) {
      showStatus('Invalid i+1 color format. Use hex format like #5a7fff', true);
      return;
    }
    if (!/^#[0-9A-F]{6}$/i.test(potentiallyI1ColorText.value)) {
      showStatus('Invalid potentially i+1 color format. Use hex format like #9b6bff', true);
      return;
    }

    // Get current settings
    const currentResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
    const settings = currentResponse.settings;

    // Update settings
    const oldFieldName = settings.fieldName;
    const oldDeckFilter = settings.deckFilter;
    const oldThreshold = settings.matureThreshold;

    settings.claudeApiKey = claudeApiKeyInput.value.trim();
    settings.claudeModel = claudeModelInput.value.trim() || 'claude-sonnet-4-6';
    settings.elevenLabsApiKey = elevenLabsApiKeyInput.value.trim();
    settings.elevenLabsVoiceId = elevenLabsVoiceIdInput.value.trim() || 'Jrq4GqCKqYpigdQsZRkP';
    settings.elevenLabsModel = elevenLabsModelInput.value.trim() || 'eleven_v3';
    settings.geminiApiKey = geminiApiKeyInput.value.trim();
    settings.cloudflareAccountId = cloudflareAccountIdInput.value.trim();
    settings.cloudflareApiToken = cloudflareApiTokenInput.value.trim();
    settings.cloudflareImageModel = cloudflareImageModelInput.value.trim();
    settings.maxWordsForI1 = parseInt(maxWordsI1Input.value) || 3000;
    settings.sentenceGenerationPrompt = sentenceGenerationPromptInput.value.trim() || DEFAULT_SENTENCE_PROMPT;
    settings.aiDefinePrompt = aiDefinePromptInput.value.trim() || DEFAULT_DEFINE_PROMPT;
    settings.aiTranslatePrompt = aiTranslatePromptInput.value.trim() || DEFAULT_TRANSLATE_PROMPT;
    settings.defaultDeck = defaultDeckSelect.value;
    settings.defaultNoteType = defaultNoteTypeSelect.value;
    settings.audioFieldName = audioFieldNameInput.value.trim() || 'Audio';
    settings.imageFieldName = imageFieldNameInput.value.trim() || 'Image';
    settings.meaningFieldName = meaningFieldNameInput.value.trim() || 'English';
    settings.sentenceColor = sentenceColor;
    settings.potentiallyI1Color = potentiallyI1ColorText.value;
    settings.sentenceHighlightEnabled = sentenceHighlightEnabled.checked;
    settings.stripNikudEnabled = stripNikudEnabled.checked;
    settings.fieldName = fieldName;
    settings.deckFilter = deckFilterInput.value.trim();
    settings.matureThreshold = parseInt(matureThresholdInput.value) || 21;

    // Save
    const response = await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: settings
    });

    if (response.success) {
      showStatus('Settings saved successfully!');

      // If field name, deck filter, or threshold changed, suggest refreshing
      if (oldFieldName !== settings.fieldName ||
          oldDeckFilter !== settings.deckFilter ||
          oldThreshold !== settings.matureThreshold) {
        setTimeout(() => {
          if (confirm('Field name, deck filter, or maturity threshold changed. Would you like to refresh the word list now?')) {
            refreshWords();
          }
        }, 500);
      }
    } else {
      showStatus('Failed to save settings', true);
    }

  } catch (error) {
    console.error('Error saving settings:', error);
    showStatus('Error saving settings: ' + error.message, true);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Settings';
  }
}

// Refresh words from Anki
async function refreshWords() {
  refreshWordsBtn.disabled = true;
  refreshWordsBtn.innerHTML = '<span class="spinner"></span> Refreshing...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'refreshWords' });

    if (response.success) {
      allMatureWords = response.matureWords || [];
      allLearningWords = response.learningWords || [];

      matureCount.textContent = allMatureWords.length;
      learningCount.textContent = allLearningWords.length;
      wordCount.textContent = allMatureWords.length + allLearningWords.length;
      lastUpdated.textContent = formatTimestamp(Date.now());

      displayWordList();
      showStatus(`Successfully loaded ${allMatureWords.length} mature + ${allLearningWords.length} learning words!`);
    } else {
      showStatus('Failed to fetch words: ' + response.error, true);
    }

  } catch (error) {
    console.error('Error refreshing words:', error);
    showStatus('Error refreshing words: ' + error.message, true);
  } finally {
    refreshWordsBtn.disabled = false;
    refreshWordsBtn.textContent = 'Refresh Word List from Anki';
  }
}

// Clear cached words
async function clearCache() {
  if (!confirm('Are you sure you want to clear all cached Hebrew words?')) {
    return;
  }

  clearCacheBtn.disabled = true;

  try {
    await chrome.storage.local.set({
      matureWords: [],
      learningWords: [],
      hebrewWords: [],
      lastUpdated: null
    });

    allMatureWords = [];
    allLearningWords = [];
    matureCount.textContent = '0';
    learningCount.textContent = '0';
    wordCount.textContent = '0';
    lastUpdated.textContent = 'Never';
    displayWordList();
    showStatus('Cache cleared successfully');

  } catch (error) {
    console.error('Error clearing cache:', error);
    showStatus('Error clearing cache', true);
  } finally {
    clearCacheBtn.disabled = false;
  }
}

// Clear dictionary cache
async function clearDictionary() {
  if (!confirm('Are you sure you want to clear the dictionary cache? The dictionaries will reload automatically next time you use the dictionary feature.')) {
    return;
  }

  clearDictionaryBtn.disabled = true;
  clearDictionaryBtn.textContent = 'Clearing...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'clearDictionary' });

    if (response.success) {
      showStatus('Dictionary cache cleared successfully! Dictionaries will reload next time.');
    } else {
      showStatus('Failed to clear dictionary cache: ' + response.error, true);
    }

  } catch (error) {
    console.error('Error clearing dictionary:', error);
    showStatus('Error clearing dictionary: ' + error.message, true);
  } finally {
    clearDictionaryBtn.disabled = false;
    clearDictionaryBtn.textContent = 'Clear Dictionary Cache';
  }
}

// Word list search
wordSearch.addEventListener('input', (e) => {
  displayWordList(e.target.value.trim());
});

// Filter buttons
filterAll.addEventListener('click', () => {
  currentFilter = 'all';
  filterAll.classList.add('active');
  filterMature.classList.remove('active');
  filterLearning.classList.remove('active');
  displayWordList(wordSearch.value.trim());
});

filterMature.addEventListener('click', () => {
  currentFilter = 'mature';
  filterMature.classList.add('active');
  filterAll.classList.remove('active');
  filterLearning.classList.remove('active');
  displayWordList(wordSearch.value.trim());
});

filterLearning.addEventListener('click', () => {
  currentFilter = 'learning';
  filterLearning.classList.add('active');
  filterAll.classList.remove('active');
  filterMature.classList.remove('active');
  displayWordList(wordSearch.value.trim());
});

// Export known words
async function exportKnownWords() {
  exportWordsBtn.disabled = true;
  exportWordsBtn.textContent = 'Exporting...';

  try {
    const result = await chrome.storage.local.get(['matureWords', 'learningWords']);
    const matureWords = result.matureWords || [];
    const learningWords = result.learningWords || [];

    const totalCount = matureWords.length + learningWords.length;
    if (totalCount === 0) {
      showStatus('No known words to export', true);
      return;
    }

    // Create export object with both word lists and metadata
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      matureWords: matureWords,
      learningWords: learningWords,
      counts: {
        mature: matureWords.length,
        learning: learningWords.length,
        total: totalCount
      }
    };

    // Create JSON file
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `selfstudyhebrew-known-words-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`Exported ${totalCount} known word(s) (${matureWords.length} mature, ${learningWords.length} learning)`);
  } catch (error) {
    console.error('Error exporting known words:', error);
    showStatus('Error exporting known words', true);
  } finally {
    exportWordsBtn.disabled = false;
    exportWordsBtn.textContent = 'Export Known Words';
  }
}

// Bulk import words from text box
async function bulkImportFromText() {
  try {
    const text = bulkImportTextarea.value.trim();

    if (!text) {
      statusMessage.textContent = 'Please enter some words in the text box';
      statusMessage.className = 'status-message error';
      return;
    }

    // Parse words from textarea (one per line)
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Filter for Hebrew words only
    const hebrewRegex = /[\u0590-\u05FF]/;
    const hebrewWords = lines.filter(word => hebrewRegex.test(word));

    if (hebrewWords.length === 0) {
      statusMessage.textContent = 'No Hebrew words found in text box';
      statusMessage.className = 'status-message error';
      return;
    }

    if (hebrewWords.length !== lines.length) {
      const nonHebrew = lines.length - hebrewWords.length;
      console.log(`Filtered out ${nonHebrew} non-Hebrew entries`);
    }

    // Update UI to show progress
    bulkImportTextBtn.disabled = true;
    bulkImportTextBtn.textContent = `Adding ${hebrewWords.length} word(s)...`;

    // Send to background script
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: 'bulkAddToAlreadyKnown', words: hebrewWords },
        resolve
      );
    });

    // Re-enable button
    bulkImportTextBtn.disabled = false;
    bulkImportTextBtn.textContent = 'Add Words from Text Box';

    if (response && response.success) {
      statusMessage.textContent = `Successfully added ${response.added} word(s) to Already Known deck. ${response.skipped} skipped (already exist), ${response.errorCount} errors.`;
      statusMessage.className = 'status-message success';

      // Clear the textarea after successful import
      bulkImportTextarea.value = '';

      // Refresh word list display
      loadSettings();
    } else {
      statusMessage.textContent = `Import failed: ${response.error || 'Unknown error'}`;
      statusMessage.className = 'status-message error';
    }
  } catch (error) {
    console.error('Error importing from text box:', error);
    statusMessage.textContent = `Error: ${error.message}`;
    statusMessage.className = 'status-message error';
    bulkImportTextBtn.disabled = false;
    bulkImportTextBtn.textContent = 'Add Words from Text Box';
  }
}

// Bulk import words to Already Known deck
async function bulkImportWords(file) {
  bulkImportBtn.disabled = true;
  bulkImportBtn.textContent = 'Importing...';

  try {
    const text = await file.text();
    let words = [];

    // Try parsing as JSON first
    if (file.name.endsWith('.json')) {
      try {
        const parsed = JSON.parse(text);
        // Handle different JSON formats
        if (Array.isArray(parsed)) {
          words = parsed;
        } else if (parsed.matureWords || parsed.learningWords) {
          // Handle exported word list format
          words = [...(parsed.matureWords || []), ...(parsed.learningWords || [])];
        } else {
          showStatus('Invalid JSON format. Expected array of words or exported word list.', true);
          return;
        }
      } catch (e) {
        showStatus('Invalid JSON file', true);
        return;
      }
    } else {
      // Parse as plain text (one word per line)
      words = text.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
    }

    if (words.length === 0) {
      showStatus('No words found in file', true);
      return;
    }

    // Filter to only Hebrew words
    const hebrewRegex = /[\u0590-\u05FF]/;
    const hebrewWords = words.filter(word => hebrewRegex.test(word));

    if (hebrewWords.length === 0) {
      showStatus('No Hebrew words found in file', true);
      return;
    }

    showStatus(`Found ${hebrewWords.length} Hebrew word(s). Adding to Already Known deck...`);

    // Send to background script to bulk add
    const response = await chrome.runtime.sendMessage({
      action: 'bulkAddToAlreadyKnown',
      words: hebrewWords
    });

    if (response.success) {
      showStatus(`Successfully added ${response.added} word(s) to Already Known deck. ${response.skipped} skipped (already exist), ${response.errorCount} errors.`);
    } else {
      showStatus(`Error: ${response.error}`, true);
    }
  } catch (error) {
    console.error('Error bulk importing words:', error);
    showStatus('Error importing words', true);
  } finally {
    bulkImportBtn.disabled = false;
    bulkImportBtn.textContent = 'Import Word List';
  }
}

// Setup Anki decks and note type
async function setupAnki() {
  const setupStatusMessage = document.getElementById('setup-status-message');
  setupAnkiBtn.disabled = true;
  setupAnkiBtn.textContent = 'Setting up Anki...';
  setupStatusMessage.textContent = '';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'setupAnki' });

    if (response.success) {
      setupStatusMessage.textContent = '✓ ' + response.message;
      setupStatusMessage.style.color = '#4caf50';

      // Refresh the deck and note type dropdowns
      const settings = await chrome.storage.local.get('settings');
      await loadDefaultsDropdowns(settings.settings);
    } else {
      setupStatusMessage.textContent = '✗ Setup failed: ' + response.error;
      setupStatusMessage.style.color = '#f44336';
    }
  } catch (error) {
    setupStatusMessage.textContent = '✗ Setup error: ' + error.message;
    setupStatusMessage.style.color = '#f44336';
  } finally {
    setupAnkiBtn.disabled = false;
    setupAnkiBtn.textContent = 'Setup Anki for SelfStudyHebrew';
  }
}

// Event listeners
setupAnkiBtn.addEventListener('click', setupAnki);
testConnectionBtn.addEventListener('click', testConnection);
refreshWordsBtn.addEventListener('click', refreshWords);
clearCacheBtn.addEventListener('click', clearCache);
clearDictionaryBtn.addEventListener('click', clearDictionary);
exportWordsBtn.addEventListener('click', exportKnownWords);
bulkImportBtn.addEventListener('click', () => {
  bulkImportFile.click();
});
bulkImportFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    bulkImportWords(file);
    // Reset file input so same file can be imported again
    e.target.value = '';
  }
});
bulkImportTextBtn.addEventListener('click', bulkImportFromText);
clearTextareaBtn.addEventListener('click', () => {
  bulkImportTextarea.value = '';
  statusMessage.textContent = 'Text box cleared';
  statusMessage.className = 'status-message success';
});
saveBtn.addEventListener('click', saveSettings);

resetPromptBtn.addEventListener('click', () => {
  sentenceGenerationPromptInput.value = DEFAULT_SENTENCE_PROMPT;
});

resetDefinePromptBtn.addEventListener('click', () => {
  aiDefinePromptInput.value = DEFAULT_DEFINE_PROMPT;
});

resetTranslatePromptBtn.addEventListener('click', () => {
  aiTranslatePromptInput.value = DEFAULT_TRANSLATE_PROMPT;
});

// Allow saving with Enter key in text fields
[claudeApiKeyInput, fieldNameInput, deckFilterInput, sentenceColorText, matureThresholdInput].forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });
});

const SPEND_LABELS = {
  subtitleTranslation: 'Subtitle Translations',
  sentenceTranslation: 'Sentence Translations',
  wordDefinition:      'Word Definitions',
  sentenceGeneration:  'Sentence Generation',
  other:               'Other',
};

function formatCost(c) { return c < 0.0001 && c > 0 ? '<$0.0001' : `$${c.toFixed(4)}`; }

// Load and display Claude spend total
async function loadSpendTotal() {
  const data = await chrome.storage.local.get(['claudeSpendTotal', 'claudeSpendBreakdown']);
  const total = data.claudeSpendTotal || 0;
  spendTotal.textContent = formatCost(total);
  const breakdown = data.claudeSpendBreakdown || {};
  const breakdownEl = document.getElementById('spend-breakdown');
  const rowsEl = document.getElementById('spend-breakdown-rows');
  const entries = Object.entries(breakdown).filter(([, v]) => v > 0);
  if (entries.length > 0) {
    rowsEl.textContent = '';
    entries
      .sort(([, a], [, b]) => b - a)
      .forEach(([type, cost]) => {
        const tr = document.createElement('tr');
        const tdLabel = document.createElement('td');
        tdLabel.style.cssText = 'padding:2px 0;color:#aaa;';
        tdLabel.textContent = SPEND_LABELS[type] || type;
        const tdCost = document.createElement('td');
        tdCost.style.cssText = 'padding:2px 0 2px 16px;text-align:right;font-variant-numeric:tabular-nums;';
        tdCost.textContent = formatCost(cost);
        tr.appendChild(tdLabel);
        tr.appendChild(tdCost);
        rowsEl.appendChild(tr);
      });
    breakdownEl.style.display = 'block';
  } else {
    breakdownEl.style.display = 'none';
  }
}

resetSpendBtn.addEventListener('click', async () => {
  if (!confirm('Reset the Claude API spend total to $0.00?')) return;
  await chrome.storage.local.set({ claudeSpendTotal: 0, claudeSpendBreakdown: {} });
  loadSpendTotal();
});

// Keep spend total live — update whenever background writes a new value
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.claudeSpendTotal || changes.claudeSpendBreakdown)) {
    loadSpendTotal();
  }
});

// Load and display ElevenLabs character usage
const elevenLabsUsageText = document.getElementById('elevenlabs-usage-text');
const elevenLabsUsageDesc = document.getElementById('elevenlabs-usage-desc');
const refreshElevenLabsBtn = document.getElementById('refresh-elevenlabs-btn');

async function loadElevenLabsUsage() {
  const data = await chrome.storage.local.get('settings');
  const apiKey = data.settings && data.settings.elevenLabsApiKey;
  if (!apiKey) {
    elevenLabsUsageText.textContent = '—';
    elevenLabsUsageDesc.textContent = 'Save your ElevenLabs API key first, then click Refresh.';
    return;
  }
  elevenLabsUsageText.textContent = '…';
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': apiKey }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    const sub = json.subscription;
    const used = sub.character_count.toLocaleString();
    const limit = sub.character_limit.toLocaleString();
    const pct = sub.character_limit > 0
      ? Math.round((sub.character_count / sub.character_limit) * 100)
      : 0;
    const tier = sub.tier === 'payg' ? 'Pay As You Go' : sub.tier.charAt(0).toUpperCase() + sub.tier.slice(1);
    const resetDate = sub.next_character_count_reset_unix
      ? new Date(sub.next_character_count_reset_unix * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
      : null;
    elevenLabsUsageText.textContent = `${used} / ${limit} (${pct}%)`;
    elevenLabsUsageDesc.textContent = `Plan: ${tier}. Characters used this billing period${resetDate ? ` — resets ${resetDate}` : ''}.`;
  } catch (e) {
    elevenLabsUsageText.textContent = 'Error';
    elevenLabsUsageDesc.textContent = `Could not fetch usage: ${e.message}`;
  }
}

refreshElevenLabsBtn.addEventListener('click', loadElevenLabsUsage);

// Load settings on page load
loadSettings();
loadSpendTotal();
loadElevenLabsUsage();
