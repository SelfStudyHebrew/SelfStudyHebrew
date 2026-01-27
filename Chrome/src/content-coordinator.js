// Content coordinator - main entry point that orchestrates all features

(function() {
  'use strict';

  // Global state
let matureWords = [];
let learningWords = [];
let matureColor = '#ffff00';    // Yellow for mature words
let learningColor = '#ffa500';  // Orange for learning words
let sentenceColor = '#add8e6';  // Light blue for i+1 sentences
let highlightEnabled = true;
let sentenceHighlightEnabled = true;
let isHighlighted = false;
let isSentenceHighlighted = false;
let frequencyData = null; // Hebrew word frequency data
let binyanimData = null; // Hebrew verb conjugation data

// Page comprehension stats
let pageStats = {
  total: 0,
  known: 0,
  potentiallyKnown: 0,
  unknown: 0,
  i1Sentences: 0,
  potentiallyI1Sentences: 0
};

/**
 * Get underline color for word type
 */
function getUnderlineColor(type) {
  const colors = {
    'mature': '#2d5016',        // dark green
    'learning': '#ff8c00',      // orange
    'potentially-known': '#9370db', // purple
    'unknown': '#dc3545'        // red
  };
  return colors[type] || colors['unknown'];
}

/**
 * Get word type (mature, learning, potentially-known, or unknown) for a normalized word
 * @param {string} normalizedWord - Normalized Hebrew word to check
 * @returns {string} 'mature', 'learning', 'potentially-known', or 'unknown'
 */
function getWordType(normalizedWord) {
  // Check direct match first
  if (matureWords.includes(normalizedWord)) return 'mature';
  if (learningWords.includes(normalizedWord)) return 'learning';

  // Check with vav stripped (ו = "and")
  if (normalizedWord.startsWith('ו') && normalizedWord.length > 1) {
    const withoutVav = normalizedWord.substring(1);
    if (matureWords.includes(withoutVav)) return 'mature';
    if (learningWords.includes(withoutVav)) return 'learning';
  }

  // Check for other common prefixes: ל (to/for), ב (in/with), ש (that/which)
  // If removing these reveals a known word, mark as "potentially-known"
  const prefixes = ['ל', 'ב', 'ש'];
  for (const prefix of prefixes) {
    if (normalizedWord.startsWith(prefix) && normalizedWord.length > 1) {
      const withoutPrefix = normalizedWord.substring(1);

      if (matureWords.includes(withoutPrefix) || learningWords.includes(withoutPrefix)) {
        return 'potentially-known';
      }
    }
  }

  return 'unknown';
}

async function initialize() {
  try {
    const wordsData = await chrome.runtime.sendMessage({ action: 'getWords' });
    matureWords = wordsData.matureWords || [];
    learningWords = wordsData.learningWords || [];

    const settingsData = await chrome.runtime.sendMessage({ action: 'getSettings' });
    if (settingsData.settings) {
      matureColor = settingsData.settings.highlightColor;
      learningColor = settingsData.settings.learningColor;
      sentenceColor = settingsData.settings.sentenceColor || '#add8e6';
      highlightEnabled = settingsData.settings.highlightEnabled;
      sentenceHighlightEnabled = settingsData.settings.sentenceHighlightEnabled !== false;
    }

    window.initializeCardCreator(() => ({ matureWords, learningWords }));

    // Apply highlighting if enabled
    // Word highlighting must happen FIRST, then sentence highlighting
    // This is because sentence highlighting needs to count which words are unknown
    if (highlightEnabled && (matureWords.length > 0 || learningWords.length > 0)) {
      const stats = window.highlightWords(matureWords, learningWords);
      pageStats = { ...pageStats, ...stats };
      isHighlighted = true;
    }

    if (sentenceHighlightEnabled && (matureWords.length > 0 || learningWords.length > 0)) {
      const {i1Count, potentiallyI1Count} = window.highlightSentences(matureWords, learningWords, sentenceColor);
      pageStats.i1Sentences = i1Count;
      pageStats.potentiallyI1Sentences = potentiallyI1Count;
      isSentenceHighlighted = true;
    }

    window.initializeDictionaryFeature(refreshWords);

  } catch (error) {
    console.error('[Coordinator] Error initializing:', error);
  }
}

async function refreshWords() {
  try {
    console.log('[Coordinator] Refreshing word list from Anki...');

    const response = await chrome.runtime.sendMessage({ action: 'fetchWords' });

    if (response.success) {
      matureWords = response.matureWords || [];
      learningWords = response.learningWords || [];

      console.log('[Coordinator] Words refreshed:', matureWords.length, 'mature,', learningWords.length, 'learning');

      if (isSentenceHighlighted) {
        window.removeSentenceHighlights();
        isSentenceHighlighted = false;
      }
      if (isHighlighted) {
        const resetStats = window.removeHighlights();
        pageStats = { ...pageStats, ...resetStats };
        isHighlighted = false;
      }

      if (highlightEnabled && (matureWords.length > 0 || learningWords.length > 0)) {
        const stats = window.highlightWords(matureWords, learningWords);
        pageStats = { ...pageStats, ...stats };
        isHighlighted = true;
      }

      if (sentenceHighlightEnabled && (matureWords.length > 0 || learningWords.length > 0)) {
        const {i1Count, potentiallyI1Count} = window.highlightSentences(matureWords, learningWords, sentenceColor);
        pageStats.i1Sentences = i1Count;
        pageStats.potentiallyI1Sentences = potentiallyI1Count;
        isSentenceHighlighted = true;
      }

      window.addDictionaryHoverListeners(refreshWords);

      document.dispatchEvent(new CustomEvent('ankiWordsRefreshed'));

      return true;
    } else {
      console.error('[Coordinator] Failed to refresh words:', response.error);
      return false;
    }
  } catch (error) {
    console.error('[Coordinator] Error refreshing words:', error);
    return false;
  }
}

function toggleHighlight() {
  if (isHighlighted) {
    const resetStats = removeHighlights();
    pageStats = { ...pageStats, ...resetStats };
    isHighlighted = false;
  } else if (highlightEnabled) {
    const stats = highlightWords(matureWords, learningWords);
    pageStats = { ...pageStats, ...stats };
    isHighlighted = true;
  }
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    let needsReload = false;

    if (changes.matureWords) {
      matureWords = changes.matureWords.newValue || [];
      needsReload = true;
    }

    if (changes.learningWords) {
      learningWords = changes.learningWords.newValue || [];
      needsReload = true;
    }

    if (changes.settings) {
      const newSettings = changes.settings.newValue;
      if (newSettings) {
        matureColor = newSettings.highlightColor;
        learningColor = newSettings.learningColor;
        sentenceColor = newSettings.sentenceColor || '#add8e6';
        const wasEnabled = highlightEnabled;
        const wasSentenceEnabled = sentenceHighlightEnabled;
        highlightEnabled = newSettings.highlightEnabled;
        sentenceHighlightEnabled = newSettings.sentenceHighlightEnabled !== false;

        if (wasEnabled !== highlightEnabled || wasSentenceEnabled !== sentenceHighlightEnabled) {
          needsReload = true;
        }
      }
    }

    if (needsReload) {
      if (isSentenceHighlighted) {
        window.removeSentenceHighlights();
        isSentenceHighlighted = false;
      }
      if (isHighlighted) {
        const resetStats = window.removeHighlights();
        pageStats = { ...pageStats, ...resetStats };
        isHighlighted = false;
      }

      // Word highlighting must happen FIRST, then sentence highlighting
      if (highlightEnabled) {
        const stats = window.highlightWords(matureWords, learningWords);
        pageStats = { ...pageStats, ...stats };
        isHighlighted = true;
      }
      if (sentenceHighlightEnabled) {
        const {i1Count, potentiallyI1Count} = window.highlightSentences(matureWords, learningWords, sentenceColor);
        pageStats.i1Sentences = i1Count;
        pageStats.potentiallyI1Sentences = potentiallyI1Count;
        isSentenceHighlighted = true;
      }

      // Re-add dictionary listeners to new highlights
      if (isHighlighted) {
        window.addDictionaryHoverListeners(refreshWords);
      }
    }
  }
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'refreshHighlights') {
    if (isSentenceHighlighted) {
      window.removeSentenceHighlights();
      isSentenceHighlighted = false;
    }
    if (isHighlighted) {
      const resetStats = window.removeHighlights();
      pageStats = { ...pageStats, ...resetStats };
      isHighlighted = false;
    }

    matureWords = request.matureWords || [];
    learningWords = request.learningWords || [];
    matureColor = request.matureColor || matureColor;
    learningColor = request.learningColor || learningColor;
    sentenceColor = request.sentenceColor || sentenceColor;
    highlightEnabled = request.enabled !== undefined ? request.enabled : highlightEnabled;
    sentenceHighlightEnabled = request.sentenceEnabled !== undefined ? request.sentenceEnabled : sentenceHighlightEnabled;

    // Word highlighting must happen FIRST, then sentence highlighting
    if (highlightEnabled) {
      const stats = window.highlightWords(matureWords, learningWords);
      pageStats = { ...pageStats, ...stats };
      isHighlighted = true;
    }
    if (sentenceHighlightEnabled) {
      const {i1Count, potentiallyI1Count} = window.highlightSentences(matureWords, learningWords, sentenceColor);
      pageStats.i1Sentences = i1Count;
      pageStats.potentiallyI1Sentences = potentiallyI1Count;
      isSentenceHighlighted = true;
    }

    if (isHighlighted) {
      window.addDictionaryHoverListeners(refreshWords);
    }

    sendResponse({ success: true });
  }

  if (request.action === 'toggleHighlightNow') {
    toggleHighlight();
    sendResponse({ success: true, isHighlighted: isHighlighted });
  }

  if (request.action === 'getPageStats') {
    sendResponse(pageStats);
  }

  if (request.action === 'openAnkiModalWithSentence') {
    if (window.openAnkiModal && request.sentence) {
      const getWordsCallback = async () => {
        return new Promise((resolve) => {
          chrome.storage.local.get(['matureWords', 'learningWords'], (data) => {
            resolve({
              matureWords: data.matureWords || [],
              learningWords: data.learningWords || []
            });
          });
        });
      };

      window.openAnkiModal(request.sentence, getWordsCallback);
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, error: 'Anki modal not available' });
    }
  }

  return true; // Indicate async response
});

// Observe DOM changes for dynamic content
const observer = new MutationObserver((mutations) => {
  if (!highlightEnabled || !isHighlighted) {
    return;
  }

  let shouldProcess = false;

  for (const mutation of mutations) {
    // Skip mutations inside subtitle overlays (they handle their own highlighting)
    const target = mutation.target;
    if (target && (
      target.id === window.DOM_IDS.YOUTUBE_OVERLAY ||
      target.id === window.DOM_IDS.NETFLIX_OVERLAY ||
      target.id === window.DOM_IDS.STREAMISRAEL_OVERLAY ||
      (target.closest && (
        target.closest(`#${window.DOM_IDS.YOUTUBE_OVERLAY}`) ||
        target.closest(`#${window.DOM_IDS.NETFLIX_OVERLAY}`) ||
        target.closest(`#${window.DOM_IDS.STREAMISRAEL_OVERLAY}`)
      ))
    )) {
      continue; // Skip this mutation
    }

    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      for (const node of mutation.addedNodes) {
        // Skip if node is or is inside a subtitle overlay
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.id === window.DOM_IDS.YOUTUBE_OVERLAY ||
              node.id === window.DOM_IDS.NETFLIX_OVERLAY ||
              node.id === window.DOM_IDS.STREAMISRAEL_OVERLAY ||
              (node.closest && (
                node.closest(`#${window.DOM_IDS.YOUTUBE_OVERLAY}`) ||
                node.closest(`#${window.DOM_IDS.NETFLIX_OVERLAY}`) ||
                node.closest(`#${window.DOM_IDS.STREAMISRAEL_OVERLAY}`)
              ))) {
            continue; // Skip this node
          }
        }

        // Only process if node contains Hebrew text
        // Reset regex lastIndex before each test
        window.HEBREW_WORD_REGEX.lastIndex = 0;
        if (node.nodeType === Node.TEXT_NODE && window.HEBREW_WORD_REGEX.test(node.textContent)) {
          shouldProcess = true;
          break;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const text = node.textContent || '';
          window.HEBREW_WORD_REGEX.lastIndex = 0;
          if (window.HEBREW_WORD_REGEX.test(text)) {
            shouldProcess = true;
            break;
          }
        }
      }
    }
    if (shouldProcess) break;
  }

  if (shouldProcess) {
    // Debounce: wait a bit before re-highlighting
    if (window.highlightTimeout) {
      clearTimeout(window.highlightTimeout);
    }
    window.highlightTimeout = setTimeout(() => {
      // Don't rehighlight if user has text selected (would destroy selection)
      const selection = window.getSelection();
      if (selection && selection.toString().trim().length > 0) {
        return; // Skip rehighlighting while text is selected
      }

      if (isHighlighted) {
        const resetStats = window.removeHighlights();
        pageStats = { ...pageStats, ...resetStats };
      }
      const stats = window.highlightWords(matureWords, learningWords);
      pageStats = { ...pageStats, ...stats };
      isHighlighted = true;

      if (sentenceHighlightEnabled) {
        if (isSentenceHighlighted) {
          window.removeSentenceHighlights();
        }
        const {i1Count, potentiallyI1Count} = window.highlightSentences(matureWords, learningWords, sentenceColor);
        pageStats.i1Sentences = i1Count;
        pageStats.potentiallyI1Sentences = potentiallyI1Count;
        isSentenceHighlighted = true;
      }

      // Re-add dictionary listeners to new highlights
      if (isHighlighted) {
        window.addDictionaryHoverListeners(refreshWords);
      }
    }, 500);
  }
});

function handleSubtitleUpdate(subtitleElement, platform) {
  if (!subtitleElement || !highlightEnabled) {
    // Show subtitle even if highlighting is disabled
    if (subtitleElement) {
      subtitleElement.style.display = 'block';
    }
    return;
  }

  const subtitleText = subtitleElement.textContent;

  // Highlight Hebrew words in subtitle
  const hebrewRegex = /[\u0590-\u05FF]+/g;
  const text = subtitleElement.textContent;
  const matches = [];
  let match;

  while ((match = hebrewRegex.exec(text)) !== null) {
    const word = match[0];
    const normalized = window.normalizeHebrew(word);
    const wordType = getWordType(normalized);

    matches.push({
      word: word,
      type: wordType,
      index: match.index,
      length: word.length
    });
  }

  if (matches.length > 0) {
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach(m => {
      if (m.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.index)));
      }

      const span = document.createElement('span');
      span.textContent = m.word;
      span.className = `anki-hebrew-highlight anki-${m.type}`;
      span.style.color = 'inherit';
      span.style.textDecoration = 'underline';
      span.style.textDecorationThickness = '2px';

      // Platform-specific word styling
      if (platform === 'streamisrael') {
        // StreamIsrael uses custom colors with titles
        const underlineColors = {
          'mature': matureColor,
          'learning': learningColor,
          'potentially-known': '#9370db',
          'unknown': '#dc3545'
        };
        span.style.textDecorationColor = underlineColors[m.type] || '#dc3545';

        const titles = {
          'mature': 'Mature card',
          'learning': 'Learning card',
          'potentially-known': 'Potentially known (prefix detected)',
          'unknown': 'Unknown word'
        };
        span.title = titles[m.type] || 'Unknown word';
      } else {
        // YouTube and Netflix use getUnderlineColor()
        span.style.textDecorationColor = getUnderlineColor(m.type);
      }

      fragment.appendChild(span);
      lastIndex = m.index + m.length;
    });

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    subtitleElement.textContent = '';
    subtitleElement.appendChild(fragment);
  }

  if (sentenceHighlightEnabled) {
    const isI1 = window.checkIfI1Sentence(subtitleText, matureWords, learningWords);
    const isPotentiallyI1 = !isI1 && window.checkIfPotentiallyI1Sentence(subtitleText, matureWords, learningWords);

    if (isI1) {
      const spans = subtitleElement.querySelectorAll('.anki-hebrew-highlight');
      spans.forEach(span => {
        span.style.backgroundColor = sentenceColor;
        span.style.color = 'black';
        span.style.borderRadius = '3px';
        span.style.padding = '2px 4px';

        // Platform-specific sentence styling
        if (platform === 'streamisrael') {
          span.title = span.title + ' (i+1 sentence)';
        } else {
          span.classList.add('anki-sentence-highlight');
          span.dataset.ankiSentence = subtitleText;
          span.title = 'Shift+click to create Anki card (i+1 sentence)';
        }
      });

      // StreamIsrael adds classes/styles to subtitle element itself
      if (platform === 'streamisrael') {
        subtitleElement.classList.add('anki-sentence-highlight');
        subtitleElement.style.cursor = 'pointer';
        subtitleElement.title = 'Shift+click to create Anki card (i+1 sentence)';
      }
    } else if (isPotentiallyI1) {
      const spans = subtitleElement.querySelectorAll('.anki-hebrew-highlight');
      spans.forEach(span => {
        span.style.backgroundColor = '#e6d5f5'; // Light purple
        span.style.color = 'black';
        span.style.borderRadius = '3px';
        span.style.padding = '2px 4px';

        // Platform-specific sentence styling
        if (platform === 'streamisrael') {
          span.title = span.title + ' (potentially i+1 sentence)';
        } else {
          span.classList.add('anki-sentence-highlight');
          span.dataset.ankiSentence = subtitleText;
          span.title = 'Shift+click to create Anki card (potentially i+1 sentence)';
        }
      });

      // StreamIsrael adds classes/styles to subtitle element itself
      if (platform === 'streamisrael') {
        subtitleElement.classList.add('anki-sentence-highlight');
        subtitleElement.style.cursor = 'pointer';
        subtitleElement.title = 'Shift+click to create Anki card (potentially i+1 sentence)';
      }
    }
  }

  window.addDictionaryHoverListeners(refreshWords);

  subtitleElement.style.display = 'block';
}

document.addEventListener('ankiYouTubeSubtitleUpdated', (event) => {
  handleSubtitleUpdate(event.detail.element, 'youtube');
});

document.addEventListener('ankiNetflixSubtitleUpdated', (event) => {
  handleSubtitleUpdate(event.detail.element, 'netflix');
});

document.addEventListener('ankiStreamIsraelSubtitleUpdated', (event) => {
  handleSubtitleUpdate(event.detail.element, 'streamisrael');
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
} else {
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

  if (window.self === window.top) {
    console.log('[Coordinator] Setting up postMessage listener (main page)');

    window.addEventListener('message', async (event) => {
      const data = event.data;

      if (!data || typeof data !== 'object' || !data.type || !data.type.startsWith('anki')) {
        return;
      }

      console.log('[Coordinator] Received Anki postMessage:', data.type);

    if (data.type === 'ankiPopulateSubtitleBrowser') {
      console.log(`[Coordinator] ⚠️ Received ankiPopulateSubtitleBrowser (${data.subtitles.length} subtitles)`);
      console.log(`[Coordinator] Browser ID:`, data.browserId);

      // Create browser element in main page
      let browser = document.getElementById(data.browserId);
      if (!browser) {
        // Create new browser
        browser = document.createElement('div');
        browser.id = data.browserId;
        browser.style.cssText = `
          position: fixed;
          top: 0;
          right: 0;
          width: 400px;
          height: 100vh;
          background: #0f0f0f;
          color: white;
          z-index: 9998;
          overflow-y: auto;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: -2px 0 10px rgba(0,0,0,0.5);
          border-left: 1px solid #333;
        `;

        // Create header
        const header = document.createElement('div');
        header.style.cssText = `
          position: sticky;
          top: 0;
          background: #0f0f0f;
          padding: 20px 20px 15px 20px;
          border-bottom: 2px solid #333;
          z-index: 10;
        `;

        const title = document.createElement('div');
        title.textContent = `${data.platform} Hebrew Subtitles`;
        title.style.cssText = `
          font-size: 18px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #fff;
        `;
        header.appendChild(title);

        // Stats display
        if (data.stats) {
          const statsDiv = document.createElement('div');
          statsDiv.id = `${data.browserId}-stats`;
          statsDiv.style.cssText = `
            font-size: 13px;
            color: #aaa;
            line-height: 1.6;
          `;
          const percentage = ((data.stats.knownWords / data.stats.totalWords) * 100) || 0;
          statsDiv.textContent = '';

          const div1 = document.createElement('div');
          const strong = document.createElement('strong');
          strong.style.color = '#4caf50';
          strong.textContent = `${percentage.toFixed(1)}%`;
          div1.appendChild(strong);
          div1.appendChild(document.createTextNode(' Comprehension'));

          const div2 = document.createElement('div');
          div2.textContent = `${data.stats.knownWords}/${data.stats.totalWords} words known`;

          const div3 = document.createElement('div');
          div3.textContent = `${data.stats.i1Count} i+1 sentences`;

          statsDiv.appendChild(div1);
          statsDiv.appendChild(div2);
          statsDiv.appendChild(div3);
          header.appendChild(statsDiv);
        }

        browser.appendChild(header);

        // Create container for subtitle items
        const container = document.createElement('div');
        container.id = `${data.browserId}-list`;
        container.style.padding = '10px';
        browser.appendChild(container);

        document.body.appendChild(browser);
        console.log(`[Coordinator] Created subtitle browser in main page`);
      }

      const container = document.getElementById(`${data.browserId}-list`);
      if (container) {
        console.log(`[Coordinator] Clearing and populating container with ${data.subtitles.length} items`);
        container.innerHTML = '';

        const storage = await chrome.storage.local.get(['matureWords', 'learningWords', 'settings']);
        const matureWordsLocal = storage.matureWords || [];
        const learningWordsLocal = storage.learningWords || [];
        const sentenceHighlightEnabledLocal = storage.settings?.sentenceHighlightEnabled !== false;
        const sentenceColorLocal = storage.settings?.sentenceColor || '#add8e6';

        data.subtitles.forEach((sub) => {
          const item = document.createElement('div');
          item.dataset.index = sub.index;

          const isI1 = sentenceHighlightEnabledLocal && window.checkIfI1Sentence(sub.text, matureWordsLocal, learningWordsLocal);

          item.style.cssText = `
            padding: 10px;
            margin-bottom: 8px;
            border-radius: 4px;
            cursor: pointer;
            border: 2px solid transparent;
            transition: border-color 0.2s;
            background: ${isI1 ? sentenceColorLocal : '#1a1a1a'};
          `;

          if (isI1) {
            item.classList.add('anki-i1-sentence');
            item.title = 'i+1 sentence';
          }

          item.addEventListener('mouseenter', () => {
            item.style.borderColor = '#0066ff';
          });

          item.addEventListener('mouseleave', () => {
            item.style.borderColor = 'transparent';
          });

          // Timestamp
          const timestamp = document.createElement('div');
          timestamp.textContent = window.formatTimestamp(sub.startTime, sub.endTime);
          timestamp.style.cssText = `
            font-size: 12px;
            color: ${isI1 ? '#000' : '#aaa'};
            margin-bottom: 6px;
          `;
          item.appendChild(timestamp);

          // Text
          const text = document.createElement('div');
          const displayText = window.stripNikud(sub.text, data.stripNikudEnabled);
          text.textContent = displayText;
          text.style.cssText = `
            font-size: 24px;
            direction: rtl;
            line-height: 1.4;
            color: ${isI1 ? '#000' : 'inherit'};
          `;
          item.appendChild(text);

          container.appendChild(item);
        });
      }
    } else if (data.type === 'ankiUpdateSubtitleHighlight') {
      const browserId = data.platform === 'YouTube' ? window.DOM_IDS.YOUTUBE_BROWSER :
                       data.platform === 'Netflix' ? window.DOM_IDS.NETFLIX_BROWSER :
                       window.DOM_IDS.STREAMISRAEL_BROWSER;
      const container = document.getElementById(`${browserId}-list`);
      if (container) {
        const items = container.querySelectorAll('[data-index]');
        items.forEach((item) => {
          const isI1 = item.classList.contains('anki-i1-sentence');
          const itemIndex = parseInt(item.dataset.index);

          if (itemIndex === data.currentIndex) {
            item.style.borderColor = '#0066ff';
            if (!isI1) {
              item.style.background = '#272727';
            }
            item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            item.style.borderColor = 'transparent';
            if (!isI1) {
              item.style.background = '#1a1a1a';
            }
          }
        });
      }
    }
    });
  }

  console.log('[Coordinator] Starting initialization...');
  initialize();
})();
