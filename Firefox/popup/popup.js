// Popup script for SelfStudyHebrew

let currentSettings = null;

// DOM elements
const ankiStatus = document.getElementById('anki-status');
const matureCount = document.getElementById('mature-count');
const learningCount = document.getElementById('learning-count');
const wordCount = document.getElementById('word-count');
const lastUpdated = document.getElementById('last-updated');
const comprehensionSection = document.getElementById('comprehension-section');
const comprehensionPercent = document.getElementById('comprehension-percent');
const pageKnown = document.getElementById('page-known');
const pagePotentiallyKnown = document.getElementById('page-potentially-known');
const pageUnknown = document.getElementById('page-unknown');
const pageTotal = document.getElementById('page-total');
const pagePotentiallyI1 = document.getElementById('page-potentially-i1');
const pageI1 = document.getElementById('page-i1');
const toggleBtn = document.getElementById('toggle-btn');
const toggleText = document.getElementById('toggle-text');
const refreshBtn = document.getElementById('refresh-btn');
const settingsBtn = document.getElementById('settings-btn');
const coffeeBtn = document.getElementById('coffee-btn');
const errorMessage = document.getElementById('error-message');

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

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// Show error message
function showError(message) {
  errorMessage.textContent = message;
  errorMessage.style.display = 'block';
}

// Hide error message
function hideError() {
  errorMessage.style.display = 'none';
}

// Update comprehension stats for current tab
async function updateComprehensionStats() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs[0]) {
      comprehensionSection.style.display = 'none';
      return;
    }

    // Request stats from content script
    try {
      const response = await chrome.tabs.sendMessage(tabs[0].id, { action: 'getPageStats' });

      if (response && response.total > 0) {
        const percentage = Math.round((response.known / response.total) * 100);

        comprehensionPercent.textContent = percentage + '%';
        pageKnown.textContent = response.known || 0;
        pagePotentiallyKnown.textContent = response.potentiallyKnown || 0;
        pageUnknown.textContent = response.unknown || 0;
        pageTotal.textContent = response.total || 0;
        pageI1.textContent = response.i1Sentences || 0;
        pagePotentiallyI1.textContent = response.potentiallyI1Sentences || 0;

        // Color code the percentage
        if (percentage >= 80) {
          comprehensionPercent.style.color = '#2d5016'; // Green
        } else if (percentage >= 50) {
          comprehensionPercent.style.color = '#ff8c00'; // Orange
        } else {
          comprehensionPercent.style.color = '#dc3545'; // Red
        }

        comprehensionSection.style.display = 'block';

        // Update badge with percentage
        chrome.action.setBadgeText({ text: percentage + '%' });
        chrome.action.setBadgeBackgroundColor({
          color: percentage >= 80 ? '#4caf50' : percentage >= 50 ? '#ff9800' : '#f44336'
        });
      } else {
        comprehensionSection.style.display = 'none';
        chrome.action.setBadgeText({ text: '' });
      }
    } catch (error) {
      // Content script not loaded or no stats available
      comprehensionSection.style.display = 'none';
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Error updating comprehension stats:', error);
  }
}

// Update status display
async function updateStatus() {
  try {
    // Check AnkiConnect connection
    const ankiResponse = await chrome.runtime.sendMessage({ action: 'checkAnkiConnect' });

    if (ankiResponse.available) {
      ankiStatus.textContent = 'Connected';
      ankiStatus.className = 'status-badge connected';
    } else {
      ankiStatus.textContent = 'Disconnected';
      ankiStatus.className = 'status-badge disconnected';
      showError('Cannot connect to AnkiConnect. Make sure Anki is running and AnkiConnect is installed.');
    }

    // Get word count and last updated
    const wordsResponse = await chrome.runtime.sendMessage({ action: 'getWords' });
    const matureWords = wordsResponse.matureWords || [];
    const learningWords = wordsResponse.learningWords || [];

    matureCount.textContent = matureWords.length;
    learningCount.textContent = learningWords.length;
    wordCount.textContent = matureWords.length + learningWords.length;
    lastUpdated.textContent = formatTimestamp(wordsResponse.lastUpdated);

    // Get settings
    const settingsResponse = await chrome.runtime.sendMessage({ action: 'getSettings' });
    currentSettings = settingsResponse.settings;

    // Update toggle button
    if (currentSettings.highlightEnabled) {
      toggleText.textContent = 'Disable Highlighting';
      toggleBtn.classList.add('btn-primary');
      toggleBtn.classList.remove('btn-secondary');
    } else {
      toggleText.textContent = 'Enable Highlighting';
      toggleBtn.classList.remove('btn-primary');
      toggleBtn.classList.add('btn-secondary');
    }

    // Update comprehension stats for current page
    await updateComprehensionStats();

  } catch (error) {
    console.error('Error updating status:', error);
    showError('Error updating status: ' + error.message);
  }
}

// Refresh words from Anki
async function refreshWords() {
  hideError();
  refreshBtn.disabled = true;
  refreshBtn.innerHTML = '<span class="spinner"></span> Refreshing...';

  try {
    const response = await chrome.runtime.sendMessage({ action: 'fetchWords' });

    if (response.success) {
      // Update display
      await updateStatus();

      // Notify content scripts to refresh highlights
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'refreshHighlights',
          matureWords: response.matureWords || [],
          learningWords: response.learningWords || [],
          matureColor: currentSettings.highlightColor,
          learningColor: currentSettings.learningColor,
          sentenceColor: currentSettings.sentenceColor,
          enabled: currentSettings.highlightEnabled,
          sentenceEnabled: currentSettings.sentenceHighlightEnabled
        }).catch(() => {
          // Content script might not be loaded, that's okay
        });
      }

      hideError();
    } else {
      showError('Failed to fetch words: ' + response.error);
    }
  } catch (error) {
    showError('Error refreshing words: ' + error.message);
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = 'Refresh Words';
  }
}

// Toggle highlighting
async function toggleHighlighting() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'toggleHighlight' });

    if (response.success) {
      currentSettings.highlightEnabled = response.enabled;

      // Update button
      if (response.enabled) {
        toggleText.textContent = 'Disable Highlighting';
        toggleBtn.classList.add('btn-primary');
        toggleBtn.classList.remove('btn-secondary');
      } else {
        toggleText.textContent = 'Enable Highlighting';
        toggleBtn.classList.remove('btn-primary');
        toggleBtn.classList.add('btn-secondary');
      }

      // Notify content scripts
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'toggleHighlightNow'
        }).catch(() => {
          // Content script might not be loaded
        });
      }
    }
  } catch (error) {
    showError('Error toggling highlight: ' + error.message);
  }
}

// Open settings page
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Open Buy Me a Coffee page
function openCoffeePage() {
  chrome.tabs.create({ url: 'https://buymeacoffee.com/selfstudyhebrew' });
}

// i+1 Generator functionality
const i1GeneratorBtn = document.getElementById('i1-generator-btn');
const i1Modal = document.getElementById('i1-modal');
const closeModalBtn = document.getElementById('close-modal');
const generatorConfig = document.getElementById('generator-config');
const wordReview = document.getElementById('word-review');
const wordReviewList = document.getElementById('word-review-list');
const confirmWordsBtn = document.getElementById('confirm-words-btn');
const backToConfigBtn = document.getElementById('back-to-config-btn');
const generationProgress = document.getElementById('generation-progress');
const generationResults = document.getElementById('generation-results');
const startGenerationBtn = document.getElementById('start-generation');
const progressText = document.getElementById('progress-text');
const progressFill = document.getElementById('progress-fill');
const progressDetails = document.getElementById('progress-details');
const resultsContainer = document.getElementById('results-container');
const exportResultsBtn = document.getElementById('export-results');
const generateMoreBtn = document.getElementById('generate-more');
const loadPreviousBtn = document.getElementById('load-previous-btn');

let currentGeneratedData = null;
let currentUnknownWords = [];
let currentWordCount = 5;
let currentSentencesPerWord = 3;

// Open i+1 generator modal
async function openI1Generator() {
  i1Modal.style.display = 'block';

  // Check if we have saved word review state (highest priority - restore in-progress review)
  const reviewData = await chrome.storage.local.get(['i1WordReview']);
  if (reviewData.i1WordReview) {
    const review = reviewData.i1WordReview;

    // Restore word review state
    currentUnknownWords = review.unknownWords;
    currentWordCount = review.wordCount;
    currentSentencesPerWord = review.sentencesPerWord;

    // Display word review screen
    displayWordReview();
    generatorConfig.style.display = 'none';
    wordReview.style.display = 'block';
    generationProgress.style.display = 'none';
    generationResults.style.display = 'none';
    return;
  }

  // Always show config view so user can generate new sentences
  generatorConfig.style.display = 'block';
  wordReview.style.display = 'none';
  generationProgress.style.display = 'none';
  generationResults.style.display = 'none';

  // Check if we have saved results from previous session
  const storage = await chrome.storage.local.get(['i1GeneratedSentences', 'i1GeneratedTimestamp']);

  if (storage.i1GeneratedSentences && storage.i1GeneratedSentences.length > 0) {
    // Store saved results in memory
    currentGeneratedData = storage.i1GeneratedSentences;
    const timestamp = storage.i1GeneratedTimestamp;
    const timeAgo = formatTimestamp(timestamp);

    // Show "Load Previous Results" button
    const savedResultsNotice = document.getElementById('saved-results-notice');
    const loadPreviousBtn = document.getElementById('load-previous-btn');
    if (savedResultsNotice && loadPreviousBtn) {
      savedResultsNotice.style.display = 'block';
      document.getElementById('saved-results-time').textContent = timeAgo;
      document.getElementById('saved-results-count').textContent = storage.i1GeneratedSentences.length;
    }
  } else {
    // Hide saved results notice
    const savedResultsNotice = document.getElementById('saved-results-notice');
    if (savedResultsNotice) {
      savedResultsNotice.style.display = 'none';
    }
  }

}

// Close modal
function closeI1Modal() {
  i1Modal.style.display = 'none';
}

// Start sentence generation - first get unknown words for review
async function startGeneration() {
  // Get fresh references to input elements
  const wordCountInput = document.getElementById('i1-word-count');
  const sentencesPerWordInput = document.getElementById('i1-sentences-per-word');

  const wordCount = parseInt(wordCountInput.value) || 5;
  const sentencesPerWord = parseInt(sentencesPerWordInput.value) || 3;

  if (isNaN(wordCount) || wordCount < 1 || wordCount > 50) {
    alert('Please enter a word count between 1 and 50');
    return;
  }

  if (isNaN(sentencesPerWord) || sentencesPerWord < 1 || sentencesPerWord > 10) {
    alert('Please enter sentences per word between 1 and 10');
    return;
  }

  // Store parameters
  currentWordCount = wordCount;
  currentSentencesPerWord = sentencesPerWord;

  // Get unknown words first
  generatorConfig.style.display = 'none';
  generationProgress.style.display = 'block';
  wordReview.style.display = 'none';
  generationResults.style.display = 'none';

  progressText.textContent = 'Finding unknown words...';
  progressFill.style.width = '50%';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getUnknownWords',
      wordCount: wordCount
    });

    if (response.success) {
      // Store unknown words and show review screen
      currentUnknownWords = response.unknownWords;

      // Save to storage for persistence
      await chrome.storage.local.set({
        i1WordReview: {
          unknownWords: response.unknownWords,
          wordCount: currentWordCount,
          sentencesPerWord: currentSentencesPerWord,
          timestamp: Date.now()
        }
      });

      displayWordReview();
      generationProgress.style.display = 'none';
      wordReview.style.display = 'block';
    } else {
      alert('Failed to get unknown words: ' + response.error);
      generatorConfig.style.display = 'block';
      generationProgress.style.display = 'none';
    }
  } catch (error) {
    console.error('Error getting unknown words:', error);
    alert('Error: ' + error.message);
    generatorConfig.style.display = 'block';
    generationProgress.style.display = 'none';
  }
}

// Display word review screen with checkboxes
async function displayWordReview() {
  wordReviewList.innerHTML = '';

  // Show only the requested number of words initially
  const wordsToShow = currentUnknownWords.slice(0, currentWordCount);

  // Load saved checkbox states if any
  const reviewData = await chrome.storage.local.get(['i1WordReview']);
  const savedStates = reviewData.i1WordReview?.checkedStates || {};

  wordsToShow.forEach((wordData, index) => {
    const item = document.createElement('div');
    item.className = 'word-review-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    // Restore saved state, or default to checked
    checkbox.checked = savedStates[wordData.word] !== undefined ? savedStates[wordData.word] : true;
    checkbox.dataset.index = index;
    checkbox.dataset.word = wordData.word;

    // Save checkbox state when changed
    checkbox.addEventListener('change', async () => {
      await saveCheckboxStates();
    });

    const wordSpan = document.createElement('span');
    wordSpan.className = 'word-review-item-word';
    wordSpan.textContent = wordData.word;

    const rankSpan = document.createElement('span');
    rankSpan.className = 'word-review-item-rank';
    rankSpan.textContent = `Rank #${wordData.rank}`;

    item.appendChild(checkbox);
    item.appendChild(wordSpan);
    item.appendChild(rankSpan);
    wordReviewList.appendChild(item);
  });
}

// Save checkbox states to storage
async function saveCheckboxStates() {
  const checkboxes = wordReviewList.querySelectorAll('input[type="checkbox"]');
  const checkedStates = {};

  checkboxes.forEach(checkbox => {
    checkedStates[checkbox.dataset.word] = checkbox.checked;
  });

  const reviewData = await chrome.storage.local.get(['i1WordReview']);
  if (reviewData.i1WordReview) {
    reviewData.i1WordReview.checkedStates = checkedStates;
    await chrome.storage.local.set({ i1WordReview: reviewData.i1WordReview });
  }
}

// Go back to config
async function backToConfig() {
  // Clear saved word review state
  await chrome.storage.local.remove('i1WordReview');

  wordReview.style.display = 'none';
  generatorConfig.style.display = 'block';
}

// Confirm words and proceed with generation or refresh list
async function confirmWords() {
  // Get checked words
  const checkboxes = wordReviewList.querySelectorAll('input[type="checkbox"]');
  const selectedWords = [];
  const uncheckedIndices = [];

  checkboxes.forEach((checkbox, index) => {
    if (checkbox.checked) {
      selectedWords.push(currentUnknownWords[index]);
    } else {
      uncheckedIndices.push(index);
    }
  });

  // If user unchecked words, mark them as known and refresh the list
  if (uncheckedIndices.length > 0) {
    const wordsToMarkKnown = uncheckedIndices.map(i => currentUnknownWords[i].word);

    // Mark as known in background
    for (const word of wordsToMarkKnown) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'addToAlreadyKnown',
          word: word
        });

        if (!response.success) {
          console.error(`Failed to mark "${word}" as known:`, response.error);
          alert(`Warning: Could not mark "${word}" as known. Check Anki connection.`);
        } else if (response.skipped) {
          console.log(`Skipped "${word}" - already exists in Anki (${response.reason})`);
        } else {
          console.log(`Successfully marked "${word}" as known`);
        }
      } catch (error) {
        console.error(`Error marking "${word}" as known:`, error);
        alert(`Error marking "${word}" as known: ${error.message}`);
      }
    }

    // Refresh word lists from Anki so newly added words are recognized as known
    try {
      const refreshResponse = await chrome.runtime.sendMessage({
        action: 'refreshWords'
      });

      if (!refreshResponse.success) {
        console.error('Failed to refresh word lists:', refreshResponse.error);
      } else {
        console.log('Successfully refreshed word lists from Anki');
      }
    } catch (error) {
      console.error('Error refreshing word lists:', error);
    }

    // Replace with next unknown words from the buffer
    const nextStartIndex = currentWordCount;
    const nextEndIndex = nextStartIndex + uncheckedIndices.length;
    const replacementWords = currentUnknownWords.slice(nextStartIndex, nextEndIndex);

    // If we don't have enough replacement words in buffer, fetch more
    if (replacementWords.length < uncheckedIndices.length) {
      wordReview.style.display = 'none';
      generationProgress.style.display = 'block';
      progressText.textContent = 'Finding more unknown words...';
      progressFill.style.width = '50%';

      try {
        const response = await chrome.runtime.sendMessage({
          action: 'getUnknownWords',
          wordCount: currentWordCount
        });

        if (response.success) {
          currentUnknownWords = response.unknownWords;
        } else {
          alert('Failed to get more unknown words: ' + response.error);
          generatorConfig.style.display = 'block';
          generationProgress.style.display = 'none';
          return;
        }
      } catch (error) {
        console.error('Error getting more unknown words:', error);
        alert('Error: ' + error.message);
        generatorConfig.style.display = 'block';
        generationProgress.style.display = 'none';
        return;
      }

      generationProgress.style.display = 'none';
    } else {
      // Build new word list with replacements
      const newWordList = [...selectedWords, ...replacementWords].slice(0, currentWordCount);
      currentUnknownWords = [...newWordList, ...currentUnknownWords.slice(nextEndIndex)];
    }

    // Update storage with new word list (clear checkbox states for fresh review)
    await chrome.storage.local.set({
      i1WordReview: {
        unknownWords: currentUnknownWords,
        wordCount: currentWordCount,
        sentencesPerWord: currentSentencesPerWord,
        timestamp: Date.now()
        // No checkedStates - all will default to checked
      }
    });

    // Refresh the word review display
    await displayWordReview();
    wordReview.style.display = 'block';
    return;
  }

  // All words are checked - proceed with generation
  const finalWords = selectedWords.slice(0, currentWordCount);

  if (finalWords.length === 0) {
    alert('Please select at least one word to generate sentences for');
    return;
  }

  // Clear saved word review state since we're proceeding
  await chrome.storage.local.remove('i1WordReview');

  // Proceed with generation
  wordReview.style.display = 'none';
  generationProgress.style.display = 'block';
  progressText.textContent = 'Generating sentences...';
  progressFill.style.width = '0%';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'generateI1SentencesForWords',
      words: finalWords,
      sentencesPerWord: currentSentencesPerWord
    });

    if (response.success) {
      // Save and display results
      currentGeneratedData = response.data;

      const timestamp = Date.now();
      await chrome.storage.local.set({
        i1GeneratedSentences: response.data,
        i1GeneratedTimestamp: timestamp
      });

      // Update saved results notice
      const savedResultsNotice = document.getElementById('saved-results-notice');
      if (savedResultsNotice) {
        savedResultsNotice.style.display = 'block';
        document.getElementById('saved-results-time').textContent = 'just now';
        document.getElementById('saved-results-count').textContent = response.data.length;
      }

      displayResults(response.data);
      generationProgress.style.display = 'none';
      generationResults.style.display = 'block';
    } else {
      alert('Generation failed: ' + response.error);
      wordReview.style.display = 'block';
      generationProgress.style.display = 'none';
    }
  } catch (error) {
    console.error('Generation error:', error);
    alert('Error during generation: ' + error.message);
    wordReview.style.display = 'block';
    generationProgress.style.display = 'none';
  }
}

// Display generation results
function displayResults(data) {
  resultsContainer.innerHTML = '';

  data.forEach((wordData, index) => {
    const section = document.createElement('div');
    section.className = 'result-word-section';

    const header = document.createElement('div');
    header.className = 'result-word-header';

    const word = document.createElement('div');
    word.className = 'result-unknown-word';
    word.textContent = wordData.word;

    const frequency = document.createElement('div');
    frequency.className = 'result-frequency';
    frequency.textContent = `Rank #${wordData.rank || (index + 1)}`;

    header.appendChild(word);
    header.appendChild(frequency);
    section.appendChild(header);

    const sentencesList = document.createElement('ul');
    sentencesList.className = 'result-sentences';

    wordData.sentences.forEach(sentence => {
      const li = document.createElement('li');
      li.style.display = 'flex';
      li.style.flexDirection = 'column';
      li.style.gap = '8px';

      const sentenceText = document.createElement('span');
      sentenceText.textContent = sentence;
      sentenceText.style.fontSize = '16px';
      sentenceText.style.lineHeight = '1.5';

      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        display: flex;
        gap: 6px;
        justify-content: flex-start;
      `;

      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋';
      copyBtn.title = 'Copy to Clipboard';
      copyBtn.style.cssText = `
        background: #555;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 16px;
      `;

      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(sentence);
          copyBtn.textContent = '✓';
          copyBtn.style.background = '#28a745';
          setTimeout(() => {
            copyBtn.textContent = '📋';
            copyBtn.style.background = '#555';
          }, 1500);
        } catch (error) {
          console.error('Error copying to clipboard:', error);
          alert('Failed to copy to clipboard');
        }
      });

      const reversoBtn = document.createElement('button');
      reversoBtn.textContent = '🔄';
      reversoBtn.title = 'Translate on Reverso';
      reversoBtn.style.cssText = `
        background: #0066cc;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 16px;
      `;

      reversoBtn.addEventListener('click', () => {
        const encodedSentence = encodeURIComponent(sentence);
        const reversoUrl = `https://www.reverso.net/text-translation#sl=heb&tl=eng&text=${encodedSentence}`;
        chrome.tabs.create({ url: reversoUrl });
      });

      const createCardBtn = document.createElement('button');
      createCardBtn.textContent = '🃏';
      createCardBtn.title = 'Create Anki Card';
      createCardBtn.style.cssText = `
        background: #0066ff;
        color: white;
        border: none;
        border-radius: 4px;
        padding: 4px 8px;
        cursor: pointer;
        font-size: 16px;
      `;

      createCardBtn.addEventListener('click', async () => {
        try {
          // Get active tab
          const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tabs[0]) {
            alert('No active tab found');
            return;
          }

          // Send message to content script to open Anki modal
          await chrome.tabs.sendMessage(tabs[0].id, {
            action: 'openAnkiModalWithSentence',
            sentence: sentence
          });

          // Close the i+1 modal so user can see the card creator
          closeI1Modal();
        } catch (error) {
          console.error('Error opening card creator:', error);
          alert('Could not open card creator. Make sure you are on a webpage (not a browser page like about:, chrome://, etc.)');
        }
      });

      buttonContainer.appendChild(copyBtn);
      buttonContainer.appendChild(reversoBtn);
      buttonContainer.appendChild(createCardBtn);

      li.appendChild(sentenceText);
      li.appendChild(buttonContainer);
      sentencesList.appendChild(li);
    });

    section.appendChild(sentencesList);
    resultsContainer.appendChild(section);
  });
}

// Export results to file
function exportResults() {
  if (!currentGeneratedData) return;

  const exportData = {
    generatedDate: new Date().toISOString(),
    totalWords: currentGeneratedData.length,
    totalSentences: currentGeneratedData.reduce((sum, wd) => sum + wd.sentences.length, 0),
    words: currentGeneratedData
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `i1-sentences-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Generate more (go back to config)
function generateMore() {
  generationResults.style.display = 'none';
  generatorConfig.style.display = 'block';
}

// Load previous results
function loadPreviousResults() {
  if (currentGeneratedData && currentGeneratedData.length > 0) {
    displayResults(currentGeneratedData);
    generatorConfig.style.display = 'none';
    generationProgress.style.display = 'none';
    generationResults.style.display = 'block';
  }
}

// Update progress (called by message listener)
function updateGenerationProgress(current, total, currentWord) {
  const percentage = Math.round((current / total) * 100);
  progressFill.style.width = percentage + '%';
  progressText.textContent = `Generating sentences... (${current}/${total})`;
  progressDetails.textContent = currentWord ? `Current word: ${currentWord}` : '';
}

// Listen for progress updates from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'i1GenerationProgress') {
    updateGenerationProgress(request.current, request.total, request.currentWord);
  }
});

// Event listeners
toggleBtn.addEventListener('click', toggleHighlighting);
refreshBtn.addEventListener('click', refreshWords);
settingsBtn.addEventListener('click', openSettings);
coffeeBtn.addEventListener('click', openCoffeePage);
i1GeneratorBtn.addEventListener('click', openI1Generator);
closeModalBtn.addEventListener('click', closeI1Modal);
startGenerationBtn.addEventListener('click', startGeneration);
exportResultsBtn.addEventListener('click', exportResults);
generateMoreBtn.addEventListener('click', generateMore);
loadPreviousBtn.addEventListener('click', loadPreviousResults);
confirmWordsBtn.addEventListener('click', confirmWords);
backToConfigBtn.addEventListener('click', backToConfig);

// Close modal on background click
i1Modal.addEventListener('click', (e) => {
  if (e.target === i1Modal) {
    closeI1Modal();
  }
});

// Initialize popup
updateStatus();
