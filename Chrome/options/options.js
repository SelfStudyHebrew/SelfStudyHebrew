// Options page script for SelfStudyHebrew

// DOM elements
const claudeApiKeyInput = document.getElementById('claude-api-key');
const maxWordsI1Input = document.getElementById('max-words-i1');
const defaultDeckSelect = document.getElementById('default-deck');
const defaultNoteTypeSelect = document.getElementById('default-note-type');
const audioFieldNameInput = document.getElementById('audio-field-name');
const sentenceColorInput = document.getElementById('sentence-color');
const sentenceColorText = document.getElementById('sentence-color-text');
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
const exportDefinitionsBtn = document.getElementById('export-definitions-btn');
const importDefinitionsBtn = document.getElementById('import-definitions-btn');
const importDefinitionsFile = document.getElementById('import-definitions-file');
const exportWordsBtn = document.getElementById('export-words-btn');
const bulkImportBtn = document.getElementById('bulk-import-btn');
const bulkImportFile = document.getElementById('bulk-import-file');
const bulkImportTextarea = document.getElementById('bulk-import-textarea');
const bulkImportTextBtn = document.getElementById('bulk-import-text-btn');
const clearTextareaBtn = document.getElementById('clear-textarea-btn');
const autoExportEnabled = document.getElementById('auto-export-enabled');
const autoExportFilename = document.getElementById('auto-export-filename');
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
  if (/^#[0-9A-F]{6}$/i.test(color)) {
    sentenceColorInput.value = color;
  }
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
      maxWordsI1Input.value = settings.maxWordsForI1 || 3000;
      sentenceColorInput.value = settings.sentenceColor || '#add8e6';
      sentenceColorText.value = settings.sentenceColor || '#add8e6';
      sentenceHighlightEnabled.checked = settings.sentenceHighlightEnabled !== false;
      stripNikudEnabled.checked = settings.stripNikudEnabled || false;
      autoExportEnabled.checked = settings.autoExportEnabled || false;
      autoExportFilename.value = settings.autoExportFilename || 'selfstudyhebrew-custom-definitions.json';
      audioFieldNameInput.value = settings.audioFieldName || 'Audio';
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

    // Validate sentence color
    const sentenceColor = sentenceColorText.value;
    if (!/^#[0-9A-F]{6}$/i.test(sentenceColor)) {
      showStatus('Invalid color format. Use hex format like #add8e6', true);
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
    settings.maxWordsForI1 = parseInt(maxWordsI1Input.value) || 3000;
    settings.defaultDeck = defaultDeckSelect.value;
    settings.defaultNoteType = defaultNoteTypeSelect.value;
    settings.audioFieldName = audioFieldNameInput.value.trim() || 'Audio';
    settings.sentenceColor = sentenceColor;
    settings.sentenceHighlightEnabled = sentenceHighlightEnabled.checked;
    settings.stripNikudEnabled = stripNikudEnabled.checked;
    settings.autoExportEnabled = autoExportEnabled.checked;
    settings.autoExportFilename = autoExportFilename.value.trim() || 'selfstudyhebrew-custom-definitions.json';
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
    const response = await chrome.runtime.sendMessage({ action: 'fetchWords' });

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

// Export custom definitions
async function exportCustomDefinitions() {
  exportDefinitionsBtn.disabled = true;
  exportDefinitionsBtn.textContent = 'Exporting...';

  try {
    const result = await chrome.storage.local.get('customDefinitions');
    const customDefinitions = result.customDefinitions || {};

    const count = Object.keys(customDefinitions).length;
    if (count === 0) {
      showStatus('No custom definitions to export', true);
      return;
    }

    // Create JSON file
    const dataStr = JSON.stringify(customDefinitions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Create download link
    const a = document.createElement('a');
    a.href = url;
    a.download = `selfstudyhebrew-custom-definitions-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showStatus(`Exported ${count} custom definition(s)`);
  } catch (error) {
    console.error('Error exporting custom definitions:', error);
    showStatus('Error exporting custom definitions', true);
  } finally {
    exportDefinitionsBtn.disabled = false;
    exportDefinitionsBtn.textContent = 'Export Custom Definitions';
  }
}

// Import custom definitions
async function importCustomDefinitions(file) {
  try {
    const text = await file.text();
    const importedDefs = JSON.parse(text);

    // Validate structure
    if (typeof importedDefs !== 'object' || importedDefs === null) {
      showStatus('Invalid file format', true);
      return;
    }

    // Get existing custom definitions
    const result = await chrome.storage.local.get('customDefinitions');
    const existingDefs = result.customDefinitions || {};

    // Merge imported definitions with existing ones
    let addedCount = 0;
    for (const [word, definitions] of Object.entries(importedDefs)) {
      if (!Array.isArray(definitions)) continue;

      if (!existingDefs[word]) {
        existingDefs[word] = [];
      }

      // Add new definitions that don't already exist
      for (const def of definitions) {
        if (!existingDefs[word].includes(def)) {
          existingDefs[word].push(def);
          addedCount++;
        }
      }
    }

    // Save merged definitions
    await chrome.storage.local.set({ customDefinitions: existingDefs });

    showStatus(`Imported ${addedCount} custom definition(s)`);
  } catch (error) {
    console.error('Error importing custom definitions:', error);
    showStatus('Error importing custom definitions: Invalid file', true);
  }
}

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
exportDefinitionsBtn.addEventListener('click', exportCustomDefinitions);
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
importDefinitionsBtn.addEventListener('click', () => {
  importDefinitionsFile.click();
});
importDefinitionsFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    importCustomDefinitions(file);
    // Reset file input so same file can be imported again
    e.target.value = '';
  }
});
saveBtn.addEventListener('click', saveSettings);

// Allow saving with Enter key in text fields
[claudeApiKeyInput, fieldNameInput, deckFilterInput, sentenceColorText, matureThresholdInput].forEach(input => {
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      saveSettings();
    }
  });
});

// Load settings on page load
loadSettings();
