// Word-level Hebrew text highlighting

(function() {
  'use strict';

  // Underline colors for different word types
  const UNDERLINE_COLORS = {
    mature: '#2d5016',        // dark green
    learning: '#ff8c00',      // orange
    'potentially-known': '#9370db', // purple (medium purple)
    unknown: '#dc3545'        // red
  };

  const WORD_TITLES = {
    mature: 'Mature card',
    learning: 'Learning card',
    'potentially-known': 'Potentially known (prefix detected)',
    unknown: 'Unknown word'
  };

  /**
   * Check if a word should be highlighted and return its type
   * @param {string} word - Hebrew word to check
   * @param {Array} matureWords - Array of mature/known words
   * @param {Array} learningWords - Array of learning words
   * @returns {string} Word type: 'mature', 'learning', 'potentially-known', or 'unknown'
   */
  function getWordType(word, matureWords, learningWords) {
    const normalized = window.normalizeHebrew(word);

    // Check if word is known as-is
    if (matureWords.includes(normalized)) {
      return 'mature';
    }
    if (learningWords.includes(normalized)) {
      return 'learning';
    }

    // Check if word starts with vav (ו) preposition meaning "and"
    // Most Hebrew words don't naturally start with vav, so this is likely a prefix
    if (normalized.startsWith('ו') && normalized.length > 1) {
      const withoutVav = normalized.substring(1);

      // Check if the word without vav is known
      if (matureWords.includes(withoutVav)) {
        return 'mature';
      }
      if (learningWords.includes(withoutVav)) {
        return 'learning';
      }
    }

    // Check for other common prefixes: ל (to/for), ב (in/with), ש (that/which)
    // If removing these reveals a known word, mark as "potentially-known"
    const prefixes = ['ל', 'ב', 'ש'];
    for (const prefix of prefixes) {
      if (normalized.startsWith(prefix) && normalized.length > 1) {
        const withoutPrefix = normalized.substring(1);

        if (matureWords.includes(withoutPrefix) || learningWords.includes(withoutPrefix)) {
          return 'potentially-known';
        }
      }
    }

    return 'unknown';
  }

  /**
   * Highlight Hebrew words in a text node
   * @param {Text} textNode - Text node to process
   * @param {Set} uniqueWords - Set to track unique words for stats
   * @param {Array} matureWords - Array of mature/known words
   * @param {Array} learningWords - Array of learning words
   */
  function highlightTextNode(textNode, uniqueWords, matureWords, learningWords) {
    const text = textNode.textContent;
    const matches = [];
    let match;

    // Reset regex
    window.HEBREW_WORD_REGEX.lastIndex = 0;

    // Find all Hebrew words
    while ((match = window.HEBREW_WORD_REGEX.exec(text)) !== null) {
      const wordType = getWordType(match[0], matureWords, learningWords);
      if (wordType) {
        matches.push({
          word: match[0],
          type: wordType,
          index: match.index,
          length: match[0].length
        });

        // Add to unique words for stats
        if (uniqueWords) {
          uniqueWords.add(window.normalizeHebrew(match[0]));
        }
      }
    }

    if (matches.length === 0) {
      return;
    }

    // Create document fragment with highlighted words
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    matches.forEach(match => {
      // Add text before match
      if (match.index > lastIndex) {
        fragment.appendChild(
          document.createTextNode(text.substring(lastIndex, match.index))
        );
      }

      // Add highlighted word with appropriate underline color
      const span = document.createElement('span');
      span.className = `${window.CSS_CLASSES.WORD_HIGHLIGHT} anki-${match.type}`;
      span.style.textDecoration = 'underline';
      span.style.color = 'inherit'; // Inherit color from parent (important for subtitle overlays)
      span.style.textDecorationColor = UNDERLINE_COLORS[match.type];
      span.style.textDecorationThickness = '2px';
      span.style.cursor = 'pointer'; // Show pointer cursor to indicate interactivity
      span.style.display = 'inline'; // Ensure proper inline behavior
      span.textContent = match.word;
      span.title = WORD_TITLES[match.type];
      fragment.appendChild(span);

      lastIndex = match.index + match.length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      fragment.appendChild(
        document.createTextNode(text.substring(lastIndex))
      );
    }

    // Replace text node with fragment
    textNode.parentNode.replaceChild(fragment, textNode);
  }

  /**
   * Highlight all Hebrew words in the document
   * @param {Array} matureWords - Array of mature/known words
   * @param {Array} learningWords - Array of learning words
   * @returns {Object} Page statistics {total, known, unknown}
   */
  function highlightWords(matureWords, learningWords) {
    const body = document.body;
    if (!body) {
      return { total: 0, known: 0, unknown: 0 };
    }

    const uniqueWords = new Set();

    // Use TreeWalker for efficient DOM traversal
    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function(node) {
          // Skip script, style, and already highlighted nodes
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName;
          if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip if parent is already a highlighted word span
          if (parent.classList && parent.classList.contains(window.CSS_CLASSES.WORD_HIGHLIGHT)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip if node is inside a highlighted word span (check ancestors)
          if (parent.closest && parent.closest(`.${window.CSS_CLASSES.WORD_HIGHLIGHT}`)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Only process nodes with Hebrew text
          // Reset regex lastIndex to avoid state issues with global regex
          window.HEBREW_WORD_REGEX.lastIndex = 0;
          if (window.HEBREW_WORD_REGEX.test(node.textContent)) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const nodesToProcess = [];
    let node;
    while (node = walker.nextNode()) {
      nodesToProcess.push(node);
    }

    // Process nodes
    nodesToProcess.forEach(textNode => {
      highlightTextNode(textNode, uniqueWords, matureWords, learningWords);
    });

    // Calculate final stats from unique words
    const total = uniqueWords.size;
    const known = Array.from(uniqueWords).filter(word => {
      const wordType = getWordType(word, matureWords, learningWords);
      return wordType === 'mature' || wordType === 'learning';
    }).length;
    const unknown = total - known;

    console.log('Page comprehension stats:', { total, known, unknown });

    return { total, known, unknown };
  }

  /**
   * Remove all word highlights from the document
   * @returns {Object} Reset stats {total: 0, known: 0, unknown: 0}
   */
  function removeHighlights() {
    const highlights = document.querySelectorAll(`.${window.CSS_CLASSES.WORD_HIGHLIGHT}`);
    highlights.forEach(span => {
      // Skip highlights inside subtitle overlays (they manage their own highlighting)
      if (span.closest(`#${window.DOM_IDS.YOUTUBE_OVERLAY}`) ||
          span.closest(`#${window.DOM_IDS.NETFLIX_OVERLAY}`) ||
          span.closest(`#${window.DOM_IDS.STREAMISRAEL_OVERLAY}`)) {
        return;
      }

      const parent = span.parentNode;
      const textNode = document.createTextNode(span.textContent);
      parent.replaceChild(textNode, span);

      // Normalize the parent to merge adjacent text nodes
      parent.normalize();
    });

    return { total: 0, known: 0, unknown: 0 };
  }

  // Expose to global scope
  window.highlightWords = highlightWords;
  window.removeHighlights = removeHighlights;
  window.getWordType = getWordType;
})();
