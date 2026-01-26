// Anki comprehension statistics and i+1 detection

(function() {
  'use strict';

  /**
   * Count unknown words in a list of Hebrew words
   * @param {Array} hebrewWords - Array of Hebrew words to check
   * @param {Array} matureWords - Array of mature (known) words
   * @param {Array} learningWords - Array of learning words
   * @returns {number} Count of unknown words
   */
  function countUnknownWords(hebrewWords, matureWords, learningWords) {
    const uniqueWordsInSentence = new Set();
    let unknownCount = 0;

    hebrewWords.forEach(word => {
      const normalized = window.normalizeHebrew(word);
      if (normalized.length > 0 && !uniqueWordsInSentence.has(normalized)) {
        uniqueWordsInSentence.add(normalized);
        if (!window.isWordKnown(normalized, matureWords, learningWords)) {
          unknownCount++;
        }
      }
    });

    return unknownCount;
  }

  /**
   * Calculate comprehension statistics from subtitles
   * @param {Array} subtitles - Array of subtitle objects with .text property
   * @returns {Promise<Object>} Stats object with total, known, percentage, i1Sentences
   */
  async function calculateComprehensionStats(subtitles) {
    try {
      // Get word lists from extension storage
      const wordsData = await chrome.runtime.sendMessage({ action: 'getWords' });
      const matureWords = wordsData.matureWords || [];
      const learningWords = wordsData.learningWords || [];

      // Collect all unique Hebrew words from subtitles
      const uniqueWords = new Set();
      let i1SentenceCount = 0;
      let potentiallyI1SentenceCount = 0;

      subtitles.forEach(sub => {
        const hebrewWords = window.extractHebrewWords(sub.text, 2, false);

        // For overall stats, add to unique words
        hebrewWords.forEach(word => {
          const normalized = window.normalizeHebrew(word);
          if (normalized.length > 0) {
            uniqueWords.add(normalized);
          }
        });

        // Count i+1 sentences (sentences with exactly 1 unknown word, 0 potentially-known)
        // and potentially-i+1 sentences (exactly 1 potentially-known word, 0-1 unknown words)
        if (hebrewWords.length >= 3) {
          const {unknownCount, potentiallyKnownCount} = countWordTypes(hebrewWords, matureWords, learningWords);

          // Regular i+1: 1 unknown word, 0 potentially-known words
          if (unknownCount === 1 && potentiallyKnownCount === 0) {
            i1SentenceCount++;
          }
          // Potentially-i+1: 1 potentially-known word, and 0 or 1 unknown words
          else if (potentiallyKnownCount === 1 && (unknownCount === 0 || unknownCount === 1)) {
            potentiallyI1SentenceCount++;
          }
        }
      });

      // Count known and potentially-known words
      let knownCount = 0;
      let potentiallyKnownCount = 0;
      uniqueWords.forEach(word => {
        const type = window.getWordKnownType(word, matureWords, learningWords);
        if (type === 'known') {
          knownCount++;
        } else if (type === 'potentially-known') {
          potentiallyKnownCount++;
        }
      });

      const totalWords = uniqueWords.size;
      const percentage = totalWords > 0 ? Math.round((knownCount / totalWords) * 100) : 0;

      return {
        total: totalWords,
        known: knownCount,
        potentiallyKnown: potentiallyKnownCount,
        percentage: percentage,
        i1Sentences: i1SentenceCount,
        potentiallyI1Sentences: potentiallyI1SentenceCount
      };
    } catch (error) {
      console.error('[Anki Stats] Error calculating comprehension:', error);
      return { total: 0, known: 0, potentiallyKnown: 0, percentage: 0, i1Sentences: 0, potentiallyI1Sentences: 0 };
    }
  }

  /**
   * Count word types in a set of Hebrew words
   * @param {Array} hebrewWords - Array of Hebrew words
   * @param {Array} matureWords - Array of mature (known) words
   * @param {Array} learningWords - Array of learning words
   * @returns {Object} {unknownCount, potentiallyKnownCount}
   */
  function countWordTypes(hebrewWords, matureWords, learningWords) {
    const uniqueWordsInSentence = new Set();
    let unknownCount = 0;
    let potentiallyKnownCount = 0;

    hebrewWords.forEach(word => {
      const normalized = window.normalizeHebrew(word);
      if (normalized.length > 0 && !uniqueWordsInSentence.has(normalized)) {
        uniqueWordsInSentence.add(normalized);
        const type = window.getWordKnownType(normalized, matureWords, learningWords);
        if (type === 'unknown') {
          unknownCount++;
        } else if (type === 'potentially-known') {
          potentiallyKnownCount++;
        }
      }
    });

    return {unknownCount, potentiallyKnownCount};
  }

  /**
   * Count unknown words in a set of Hebrew words
   * @param {Array} hebrewWords - Array of Hebrew words
   * @param {Array} matureWords - Array of mature (known) words
   * @param {Array} learningWords - Array of learning words
   * @returns {number} Count of unknown words
   */
  /**
   * Check if a sentence is i+1 (exactly 1 unknown word, minimum 3 words)
   * @param {string} sentenceText - Sentence text to check
   * @param {Array} matureWords - Array of mature (known) words
   * @param {Array} learningWords - Array of learning words
   * @returns {boolean} True if sentence is i+1
   */
  function checkIfI1Sentence(sentenceText, matureWords, learningWords) {
    if (!sentenceText) return false;

    // Extract Hebrew words, filter out single letters
    const hebrewWords = (sentenceText.match(window.HEBREW_WORD_REGEX) || [])
      .filter(word => window.normalizeHebrew(word).length > 1);

    // Need at least 3 words to be a meaningful sentence
    if (hebrewWords.length < 3) return false;

    // Count unknown words
    const unknownCount = countUnknownWords(hebrewWords, matureWords, learningWords);

    // i+1 means exactly 1 unknown word
    return unknownCount === 1;
  }

  /**
   * Check if a sentence is potentially-i+1
   * Two scenarios qualify:
   * 1. Exactly 1 potentially-known word, 0 unknown words
   * 2. Exactly 1 potentially-known word, 1 unknown word (treat potentially-known as known)
   * @param {string} sentenceText - Sentence text to check
   * @param {Array} matureWords - Array of mature (known) words
   * @param {Array} learningWords - Array of learning words
   * @returns {boolean} True if sentence is potentially-i+1
   */
  function checkIfPotentiallyI1Sentence(sentenceText, matureWords, learningWords) {
    if (!sentenceText) return false;

    // Extract Hebrew words, filter out single letters
    const hebrewWords = (sentenceText.match(window.HEBREW_WORD_REGEX) || [])
      .filter(word => window.normalizeHebrew(word).length > 1);

    // Need at least 3 words to be a meaningful sentence
    if (hebrewWords.length < 3) return false;

    // Count word types
    const {unknownCount, potentiallyKnownCount} = countWordTypes(hebrewWords, matureWords, learningWords);

    // Potentially-i+1 has two scenarios:
    // 1. Exactly 1 potentially-known word and 0 unknown words
    // 2. Exactly 1 potentially-known word and 1 unknown word
    return potentiallyKnownCount === 1 && (unknownCount === 0 || unknownCount === 1);
  }

  // Expose to global scope
  window.calculateComprehensionStats = calculateComprehensionStats;
  window.checkIfI1Sentence = checkIfI1Sentence;
  window.checkIfPotentiallyI1Sentence = checkIfPotentiallyI1Sentence;
})();
