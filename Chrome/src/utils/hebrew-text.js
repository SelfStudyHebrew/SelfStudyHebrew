// Hebrew text processing utilities
(function() {
  'use strict';

  // Hebrew regex pattern (includes nikud)
  // Unicode range: U+0590 to U+05FF
  const HEBREW_WORD_REGEX = /[\u0590-\u05FF]+/g;

  // Nikud (vowel marks) regex pattern
  // Unicode range: U+0591 to U+05C7
  const NIKUD_REGEX = /[\u0591-\u05C7]/g;

  /**
   * Normalize Hebrew word by removing nikud (vowel marks)
   * @param {string} word - Hebrew word to normalize
   * @returns {string} Normalized word without nikud
   */
  function normalizeHebrew(word) {
    if (!word) return '';
    return word.replace(NIKUD_REGEX, '');
  }

  /**
   * Strip nikud from text (respects settings)
   * @param {string} text - Text to process
   * @param {boolean} stripNikudEnabled - Whether to strip nikud
   * @returns {string} Processed text
   */
  function stripNikud(text, stripNikudEnabled = false) {
    if (!stripNikudEnabled || !text) return text;
    return text.replace(NIKUD_REGEX, '');
  }

  /**
   * Check if text contains Hebrew characters
   * @param {string} text - Text to check
   * @returns {boolean} True if text contains Hebrew
   */
  function containsHebrew(text) {
    if (!text) return false;
    // Reset regex lastIndex to avoid state issues
    HEBREW_WORD_REGEX.lastIndex = 0;
    return HEBREW_WORD_REGEX.test(text);
  }

  /**
   * Extract Hebrew words from text
   * @param {string} text - Text to extract words from
   * @param {number} minLength - Minimum word length (default: 1)
   * @param {boolean} ignoreBrackets - Remove bracketed content (default: true)
   * @returns {string[]} Array of Hebrew words
   */
  function extractHebrewWords(text, minLength = 1, ignoreBrackets = true) {
    if (!text) return [];
    
    // Remove bracketed content if enabled
    if (ignoreBrackets) {
      // Remove square brackets and their contents
      text = text.replace(/\[[^\]]*\]/g, '');
      // Remove round brackets (full-width)
      text = text.replace(/（[^）]*）/g, '');
      // Remove round brackets (regular)
      text = text.replace(/\([^)]*\)/g, '');
    }
    
    const words = text.match(HEBREW_WORD_REGEX) || [];
    return words.filter(word => normalizeHebrew(word).length >= minLength);
  }

  /**
   * Check if a word is Hebrew (at least 1 Hebrew character)
   * @param {string} word - Word to check
   * @returns {boolean} True if word contains Hebrew
   */
  function isHebrewWord(word) {
    if (!word) return false;
    // Reset regex lastIndex to avoid state issues
    HEBREW_WORD_REGEX.lastIndex = 0;
    return HEBREW_WORD_REGEX.test(word);
  }

  /**
   * Get word type (known, potentially-known, or unknown)
   * @param {string} normalizedWord - Normalized Hebrew word to check
   * @param {Array} matureWords - Array of mature (known) words
   * @param {Array} learningWords - Array of learning words
   * @returns {string} 'known', 'potentially-known', or 'unknown'
   */
  function getWordKnownType(normalizedWord, matureWords, learningWords) {
    if (matureWords.includes(normalizedWord) || learningWords.includes(normalizedWord)) {
      return 'known';
    }

    if (normalizedWord.startsWith('ו') && normalizedWord.length > 1) {
      const withoutVav = normalizedWord.substring(1);
      if (matureWords.includes(withoutVav) || learningWords.includes(withoutVav)) {
        return 'known';
      }
    }

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

  /**
   * Check if normalized Hebrew word is known (in matureWords or learningWords)
   * Also checks if stripping vav (ו) prefix makes it known
   */
  function isWordKnown(normalizedWord, matureWords, learningWords) {
    const type = getWordKnownType(normalizedWord, matureWords, learningWords);
    return type === 'known';
  }

  // Expose to global scope
  window.HEBREW_WORD_REGEX = HEBREW_WORD_REGEX;
  window.NIKUD_REGEX = NIKUD_REGEX;
  window.normalizeHebrew = normalizeHebrew;
  window.stripNikud = stripNikud;
  window.containsHebrew = containsHebrew;
  window.extractHebrewWords = extractHebrewWords;
  window.isHebrewWord = isHebrewWord;
  window.getWordKnownType = getWordKnownType;
  window.isWordKnown = isWordKnown;
})();
