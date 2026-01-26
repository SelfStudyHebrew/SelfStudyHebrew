// Time and timestamp formatting utilities
(function() {
  'use strict';

  /**
   * Format seconds to MM:SS or HH:MM:SS
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time string
   */
  function formatTime(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) {
      return '0:00';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Format timestamp range for subtitle display
   * @param {number} startTime - Start time in seconds
   * @param {number} endTime - End time in seconds
   * @returns {string} Formatted timestamp range (e.g., "1:23 → 1:28")
   */
  function formatTimestamp(startTime, endTime) {
    return `${formatTime(startTime)} → ${formatTime(endTime)}`;
  }

  // Expose to global scope
  window.formatTime = formatTime;
  window.formatTimestamp = formatTimestamp;
})();
