// Sentence-level i+1 highlighting (sentences with exactly 1 unknown word)

(function() {
  'use strict';

  const SPECIAL_CONTAINER_IDS = [
    'YOUTUBE_OVERLAY', 'NETFLIX_OVERLAY', 'STREAMISRAEL_OVERLAY',
    'YOUTUBE_BROWSER', 'NETFLIX_BROWSER', 'STREAMISRAEL_BROWSER'
  ];

  /**
   * Check if a node is within a special container (subtitle overlay or browser)
   * @param {Node} node - Node to check
   * @returns {boolean} True if node is in or is a special container
   */
  function isInSpecialContainer(node) {
    return SPECIAL_CONTAINER_IDS.some(containerId => {
      const domId = window.DOM_IDS[containerId];
      return node.id === domId || (node.closest && node.closest(`#${domId}`));
    });
  }

  /**
   * Check if sentence is i+1 (exactly 1 unknown word, 0 potentially-known words)
   * @param {Object} sentence - Sentence object with unknownCount and potentiallyKnownCount
   * @returns {boolean} True if sentence is i+1
   */
  function isI1Sentence(sentence) {
    return sentence.unknownCount === 1 && sentence.potentiallyKnownCount === 0;
  }

  /**
   * Check if sentence is potentially-i+1
   * @param {Object} sentence - Sentence object with unknownCount and potentiallyKnownCount
   * @returns {boolean} True if sentence is potentially-i+1
   */
  function isPotentiallyI1Sentence(sentence) {
    return sentence.potentiallyKnownCount === 1 &&
           (sentence.unknownCount === 0 || sentence.unknownCount === 1);
  }

  /**
   * Apply highlight styling to a sentence element
   * @param {Element} element - Element to highlight
   * @param {string} color - Background color
   * @param {string} sentenceText - Sentence text to store
   */
  function highlightSentenceElement(element, color, sentenceText) {
    element.style.backgroundColor = color;

    // Check if we're in a subtitle overlay or browser and set appropriate text color
    const isInSubtitleOverlay = element.closest(`#${window.DOM_IDS.YOUTUBE_OVERLAY}, #${window.DOM_IDS.NETFLIX_OVERLAY}`);
    const isInSubtitleBrowser = element.closest(`#${window.DOM_IDS.YOUTUBE_BROWSER}, #${window.DOM_IDS.NETFLIX_BROWSER}`);

    if (isInSubtitleOverlay) {
      element.style.color = 'white'; // White text for video overlay
    } else if (isInSubtitleBrowser) {
      element.style.color = 'black'; // Black text for sidebar browser (better contrast)
    } else {
      element.style.color = 'black'; // Black text for regular pages (fixes dark mode visibility)
    }

    element.style.borderRadius = '3px';
    element.style.padding = '2px 4px';
    element.classList.add(window.CSS_CLASSES.SENTENCE_HIGHLIGHT);
    element.title = 'Shift+click to create Anki card';
    // Store the full sentence text for retrieval on click
    element.dataset.ankiSentence = sentenceText;
  }

  /**
   * Highlight sentences with exactly 1 unknown Hebrew word (i+1 sentences)
   * or exactly 1 potentially-known word (potentially-i+1 sentences)
   * This runs AFTER word highlighting, working with already-highlighted spans
   * @param {Array} matureWords - Array of mature/known words
   * @param {Array} learningWords - Array of learning words
   * @param {string} sentenceColor - Color for i+1 sentence highlights
   * @param {string} potentiallyI1Color - Color for potentially-i+1 sentence highlights
   * @returns {Object} {i1Count, potentiallyI1Count}
   */
  function highlightSentences(matureWords, learningWords, sentenceColor, potentiallyI1Color = '#e6d5f5') {
    const body = document.body;
    if (!body) return {i1Count: 0, potentiallyI1Count: 0};

    let i1SentenceCount = 0;
    let potentiallyI1SentenceCount = 0;

    // Find elements that contain text (working with already word-highlighted content)
    const walker = document.createTreeWalker(
      body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: function(node) {
          const tagName = node.tagName;
          if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'NOSCRIPT') {
            return NodeFilter.FILTER_REJECT;
          }

          if (isInSpecialContainer(node)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip if already sentence highlighted
          if (node.classList && node.classList.contains(window.CSS_CLASSES.SENTENCE_HIGHLIGHT)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip word highlight spans - we want their parents
          if (node.classList && node.classList.contains(window.CSS_CLASSES.WORD_HIGHLIGHT)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Only process elements with Hebrew text
          // Reset regex lastIndex to avoid state issues with global regex
          window.HEBREW_WORD_REGEX.lastIndex = 0;
          if (window.HEBREW_WORD_REGEX.test(node.textContent)) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const elementsToProcess = [];
    let element;
    while (element = walker.nextNode()) {
      // Only process leaf-ish elements (not containers)
      const hasBlockChildren = Array.from(element.children).some(child => {
        const display = window.getComputedStyle(child).display;
        return display === 'block' || display === 'flex' || display === 'grid';
      });

      if (!hasBlockChildren && element.textContent.trim().length > 0) {
        // Skip elements that only contain a single word-highlight span
        const wordHighlightChildren = Array.from(element.children).filter(child =>
          child.classList && child.classList.contains(window.CSS_CLASSES.WORD_HIGHLIGHT)
        );

        // If this element only has one word-highlight child and nothing else meaningful, skip it
        if (wordHighlightChildren.length === 1 && element.children.length === 1) {
          continue;
        }

        elementsToProcess.push(element);
      }
    }

    // Process each element
    elementsToProcess.forEach(element => {
      const text = element.textContent;

      // Split text by sentence boundaries
      // For Netflix: don't split on newlines, keep commas as part of sentences
      // For other sites: split on newlines and punctuation
      const isNetflix = window.location.hostname.includes('netflix.com');
      const sentenceRegex = isNetflix
        ? /[^.!?\u05C3]+[.!?\u05C3]*/g  // Netflix: only split on sentence-ending punctuation
        : /[^.!?\u05C3\n]+[.!?\u05C3]*/g;  // Others: also split on newlines
      let match;
      const sentences = [];

      while ((match = sentenceRegex.exec(text)) !== null) {
        const sentence = match[0].trim();
        if (sentence.length === 0) continue;

        const hebrewWords = window.extractHebrewWords(sentence, 2, false);
        if (hebrewWords.length === 0) continue;

        // Only highlight sentences with minimum number of words
        if (hebrewWords.length < window.MIN_SENTENCE_WORDS) continue;

        // Count unknown and potentially-known words
        let unknownCount = 0;
        let potentiallyKnownCount = 0;
        const uniqueWords = new Set();
        const unknownWordsList = [];

        hebrewWords.forEach(word => {
          const normalized = window.normalizeHebrew(word);
          if (!uniqueWords.has(normalized)) {
            uniqueWords.add(normalized);
            const wordType = window.getWordKnownType(normalized, matureWords, learningWords);
            if (wordType === 'unknown') {
              unknownCount++;
              unknownWordsList.push(word);
            } else if (wordType === 'potentially-known') {
              potentiallyKnownCount++;
            }
          }
        });

        sentences.push({
          text: sentence,
          unknownCount: unknownCount,
          potentiallyKnownCount: potentiallyKnownCount,
          unknownWords: unknownWordsList,
          start: match.index,
          end: match.index + match[0].length
        });
      }

      const i1Sentences = sentences.filter(isI1Sentence);
      const potentiallyI1Sentences = sentences.filter(isPotentiallyI1Sentence);

      // Update counts
      i1SentenceCount += i1Sentences.length;
      potentiallyI1SentenceCount += potentiallyI1Sentences.length;

      // Highlight i+1 sentences (1 unknown word, 0 potentially-known)
      if (i1Sentences.length > 0) {
        // If the entire element is a single i+1 sentence, highlight the whole element
        if (sentences.length === 1 && i1Sentences.length === 1) {
          highlightSentenceElement(element, sentenceColor, i1Sentences[0].text);
        } else {
          // Multiple sentences: wrap each i+1 sentence individually
          wrapI1SentencesInElement(element, i1Sentences, sentenceColor);
        }
      }

      // Highlight potentially-i+1 sentences (0 unknown words, 1 potentially-known)
      if (potentiallyI1Sentences.length > 0) {
        // If the entire element is a single potentially-i+1 sentence, highlight the whole element
        if (sentences.length === 1 && potentiallyI1Sentences.length === 1) {
          highlightSentenceElement(element, potentiallyI1Color, potentiallyI1Sentences[0].text);
        } else {
          // Multiple sentences: wrap each potentially-i+1 sentence individually
          wrapI1SentencesInElement(element, potentiallyI1Sentences, potentiallyI1Color);
        }
      }
    });

    return {i1Count: i1SentenceCount, potentiallyI1Count: potentiallyI1SentenceCount};
  }

  /**
   * Wrap individual i+1 sentences within an element by highlighting word spans
   * @param {Element} element - Element containing multiple sentences
   * @param {Array} i1Sentences - Array of i+1 sentence objects
   * @param {string} sentenceColor - Color for highlights
   */
  function wrapI1SentencesInElement(element, i1Sentences, sentenceColor) {
    // Get full text content and build a map of all word spans
    const fullText = element.textContent;
    const wordSpans = element.querySelectorAll(`.${window.CSS_CLASSES.WORD_HIGHLIGHT}`);

    if (wordSpans.length === 0) {
      return; // No highlighted words, nothing to do
    }

    // Build position map of word spans
    let currentPos = 0;
    const spanMap = [];

    // Walk through the element's text to find each word span's position
    Array.from(wordSpans).forEach(span => {
      const wordText = span.textContent;
      const startPos = fullText.indexOf(wordText, currentPos);

      if (startPos !== -1) {
        spanMap.push({
          span: span,
          start: startPos,
          end: startPos + wordText.length,
          text: wordText
        });
        currentPos = startPos + wordText.length;
      }
    });

    // For each i+1 sentence, find which word spans belong to it
    i1Sentences.forEach(sentence => {
      // Use the position from the regex match, not indexOf
      // This ensures we match the correct occurrence when text repeats
      const sentenceStart = sentence.start;
      const sentenceEnd = sentence.end;

      // Find word spans that are part of this sentence
      const sentenceSpans = spanMap.filter(sm =>
        sm.start >= sentenceStart && sm.end <= sentenceEnd
      );

      if (sentenceSpans.length === 0) {
        return;
      }

      // Apply sentence highlighting to these word spans
      // Check if we're in a subtitle overlay or browser and set appropriate text color
      const isInSubtitleOverlay = sentenceSpans.length > 0 &&
                                   sentenceSpans[0].span.closest(`#${window.DOM_IDS.YOUTUBE_OVERLAY}, #${window.DOM_IDS.NETFLIX_OVERLAY}`);
      const isInSubtitleBrowser = sentenceSpans.length > 0 &&
                                   sentenceSpans[0].span.closest(`#${window.DOM_IDS.YOUTUBE_BROWSER}, #${window.DOM_IDS.NETFLIX_BROWSER}`);

      sentenceSpans.forEach(sm => {
        sm.span.style.backgroundColor = sentenceColor;

        if (isInSubtitleOverlay) {
          sm.span.style.color = 'white'; // White text for video overlay
        } else if (isInSubtitleBrowser) {
          sm.span.style.color = 'black'; // Black text for sidebar browser (better contrast with blue)
        } else {
          sm.span.style.color = 'black'; // Black text for regular pages (fixes dark mode visibility)
        }

        sm.span.style.borderRadius = '3px';
        sm.span.style.padding = '2px 4px';
        sm.span.classList.add(window.CSS_CLASSES.SENTENCE_HIGHLIGHT);
        sm.span.title = 'Shift+click to create Anki card';
        // Store the full sentence text for retrieval on click
        sm.span.dataset.ankiSentence = sentence.text;
      });
    });
  }

  /**
   * Remove all sentence highlights from the document
   */
  function removeSentenceHighlights() {
    const highlights = document.querySelectorAll(`.${window.CSS_CLASSES.SENTENCE_HIGHLIGHT}`);
    highlights.forEach(element => {
      if (isInSpecialContainer(element)) {
        return;
      }

      // Only remove sentence highlight styles, keep word highlight styles
      if (element.classList.contains(window.CSS_CLASSES.WORD_HIGHLIGHT)) {
        // This is a word span with sentence highlighting - only remove sentence styles
        element.style.backgroundColor = '';
        element.style.padding = '';
        element.style.color = '';
        element.classList.remove(window.CSS_CLASSES.SENTENCE_HIGHLIGHT);
        element.title = element.classList.contains(window.CSS_CLASSES.MATURE) ? 'Mature card' :
                        element.classList.contains(window.CSS_CLASSES.LEARNING) ? 'Learning card' :
                        element.classList.contains(window.CSS_CLASSES.UNKNOWN) ? 'Unknown word' : '';
      } else {
        // This is a standalone sentence highlight element
        element.style.backgroundColor = '';
        element.style.borderRadius = '';
        element.style.padding = '';
        element.style.color = '';
        element.classList.remove(window.CSS_CLASSES.SENTENCE_HIGHLIGHT);
        element.title = '';
      }
    });
  }

  // Expose to global scope
  window.highlightSentences = highlightSentences;
  window.removeSentenceHighlights = removeSentenceHighlights;
})();
