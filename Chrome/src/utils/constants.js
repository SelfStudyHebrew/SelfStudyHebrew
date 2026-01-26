// Application constants and magic values

(function() {
  'use strict';

  // ===== HIGHLIGHT COLORS =====
  const COLORS = {
    MATURE: '#ffff00',        // Yellow for mature/known words
    LEARNING: '#ffa500',      // Orange for learning words
    SENTENCE: '#add8e6',      // Light blue for i+1 sentences

    // Comprehension stats colors
    HIGH: '#4caf50',          // Green (80%+)
    MEDIUM: '#ff9800',        // Orange (60-79%)
    LOW: '#f44336'            // Red (<60%)
  };

  // ===== DOM IDS AND SELECTORS =====
  const DOM_IDS = {
    // Subtitle overlays
    YOUTUBE_OVERLAY: 'anki-youtube-subtitle-overlay',
    YOUTUBE_BROWSER: 'anki-youtube-subtitle-browser',
    NETFLIX_OVERLAY: 'anki-netflix-subtitle-overlay',
    NETFLIX_BROWSER: 'anki-netflix-subtitle-browser',
    STREAMISRAEL_OVERLAY: 'anki-streamisrael-subtitle-overlay',
    STREAMISRAEL_BROWSER: 'anki-streamisrael-subtitle-browser',

    // UI modals and popups
    ANKI_MODAL: 'anki-modal',
    DICTIONARY_POPUP: 'anki-dictionary-popup'
  };

  const CSS_CLASSES = {
    WORD_HIGHLIGHT: 'anki-hebrew-highlight',
    SENTENCE_HIGHLIGHT: 'anki-sentence-highlight',
    MATURE: 'anki-mature',
    LEARNING: 'anki-learning',
    UNKNOWN: 'anki-unknown'
  };

  // ===== ANKI CONNECT =====
  const ANKI_CONNECT_URL = 'http://localhost:8765';
  const ANKI_CONNECT_VERSION = 6;

  // ===== SETTINGS DEFAULTS =====
  const DEFAULT_SETTINGS = {
    matureColor: COLORS.MATURE,
    learningColor: COLORS.LEARNING,
    sentenceColor: COLORS.SENTENCE,
    highlightEnabled: true,
    sentenceHighlightEnabled: true,
    stripNikudEnabled: false,
    matureThreshold: 21,
    autoExportEnabled: false,
    autoExportFilename: 'custom-definitions-backup.json'
  };

  // ===== HEBREW TEXT PROCESSING =====
  const MIN_SENTENCE_WORDS = 3;     // Minimum words for i+1 detection
  const MIN_WORD_LENGTH = 2;        // Minimum length for real words (filter single letters)

  // ===== UI TIMING CONSTANTS (ms) =====
  const TIMING = {
    DEBOUNCE_SHORT: 100,       // Quick debounce
    DEBOUNCE_MEDIUM: 300,      // Standard debounce
    DEBOUNCE_LONG: 500,        // Long debounce
    NOTIFICATION_DURATION: 3000, // How long to show notifications
    FADE_DURATION: 200,        // Fade in/out animations
    POLLING_INTERVAL: 1000,    // Video detection polling
    SUBTITLE_UPDATE: 100       // Subtitle sync check interval
  };

  // ===== COMPREHENSION THRESHOLDS =====
  const COMPREHENSION_THRESHOLDS = {
    HIGH: 80,    // >= 80% is good comprehension
    MEDIUM: 60   // >= 60% is medium comprehension
  };

  // Expose to global scope
  window.COLORS = COLORS;
  window.DOM_IDS = DOM_IDS;
  window.CSS_CLASSES = CSS_CLASSES;
  window.ANKI_CONNECT_URL = ANKI_CONNECT_URL;
  window.ANKI_CONNECT_VERSION = ANKI_CONNECT_VERSION;
  window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  window.MIN_SENTENCE_WORDS = MIN_SENTENCE_WORDS;
  window.MIN_WORD_LENGTH = MIN_WORD_LENGTH;
  window.TIMING = TIMING;
  window.COMPREHENSION_THRESHOLDS = COMPREHENSION_THRESHOLDS;
})();
