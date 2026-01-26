// StreamIsrael/Vimeo Subtitle Reader
// Handles VTT subtitles from Vimeo player on StreamIsrael.tv

(function() {
  'use strict';

  /**
   * Parse WebVTT format subtitles
   * @param {string} vttText - Raw VTT text
   * @returns {Array} Array of subtitle objects {start, end, text}
   */
  function parseVTT(vttText) {
    const subtitles = [];
    const lines = vttText.split('\n');

    let i = 0;
    // Skip WEBVTT header and initial blank lines
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i].trim();

      // Look for timestamp line (HH:MM:SS.mmm --> HH:MM:SS.mmm)
      if (line.includes('-->')) {
        const parts = line.split('-->').map(s => s.trim());
        if (parts.length === 2) {
          const start = parseVTTTimestamp(parts[0]);
          const end = parseVTTTimestamp(parts[1]);

          // Collect subtitle text (lines after timestamp until blank line)
          i++;
          const textLines = [];
          while (i < lines.length && lines[i].trim() !== '') {
            textLines.push(lines[i].trim());
            i++;
          }

          if (textLines.length > 0) {
            subtitles.push({
              startTime: start,
              endTime: end,
              text: textLines.join(' ')
            });
          }
        }
      }
      i++;
    }

    console.log(`[StreamIsrael Subs] Parsed ${subtitles.length} subtitles from VTT`);
    return subtitles;
  }

  /**
   * Parse VTT timestamp to seconds
   * Supports: HH:MM:SS.mmm or MM:SS.mmm
   * @param {string} timestamp - VTT timestamp string
   * @returns {number} Time in seconds
   */
  function parseVTTTimestamp(timestamp) {
    const parts = timestamp.split(':');
    let hours = 0, minutes = 0, seconds = 0;

    if (parts.length === 3) {
      // HH:MM:SS.mmm
      hours = parseInt(parts[0]);
      minutes = parseInt(parts[1]);
      seconds = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      // MM:SS.mmm
      minutes = parseInt(parts[0]);
      seconds = parseFloat(parts[1]);
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * StreamIsrael Subtitle Reader
   * Extends SubtitleReaderBase for StreamIsrael.tv (Vimeo player)
   */
  class StreamIsraelSubtitleReader extends window.SubtitleReaderBase {
    constructor() {
      super('StreamIsrael');
      this.originalPlayerStyles = null;
    }

    /**
     * Detect video element
     * @returns {HTMLVideoElement|null} Video element
     */
    detectVideo() {
      // Try Vimeo player container first (when running inside iframe)
      let video = document.querySelector('.vp-video video');
      if (video) return video;

      // Try any video element
      video = document.querySelector('video');
      if (video) return video;

      return null;
    }

    adjustPlayerLayout() {
      const playerContainer = document.querySelector('.player-container');
      if (!playerContainer) return;

      if (!this.originalPlayerStyles) {
        this.originalPlayerStyles = {
          paddingRight: playerContainer.style.paddingRight
        };
      }

      playerContainer.style.paddingRight = '350px';
    }

    restorePlayerLayout() {
      const playerContainer = document.querySelector('.player-container');
      if (!playerContainer || !this.originalPlayerStyles) return;

      playerContainer.style.paddingRight = this.originalPlayerStyles.paddingRight;
    }
    async initialize(languageCode = 'he') {
      await super.initialize(languageCode);

      if (this.subtitleBrowser) {
        if (this.subtitleBrowser.parentElement !== document.body) {
          document.body.appendChild(this.subtitleBrowser);
        }

        this.subtitleBrowser.style.position = 'fixed';
        this.subtitleBrowser.style.top = '0';
        this.subtitleBrowser.style.bottom = '0';
        this.subtitleBrowser.style.height = '100vh';
        this.subtitleBrowser.style.right = '0';
        this.subtitleBrowser.style.zIndex = '10000';
        this.subtitleBrowser.style.maxHeight = 'none';

        this.adjustPlayerLayout();

        const observer = new MutationObserver(() => {
          if (this.subtitleBrowser) {
            const isVisible = this.subtitleBrowser.style.display !== 'none';
            if (isVisible) {
              this.adjustPlayerLayout();
            } else {
              this.restorePlayerLayout();
            }
          }
        });

        observer.observe(this.subtitleBrowser, {
          attributes: true,
          attributeFilter: ['style']
        });
      }

      if (this.subtitleOverlay && this.currentVideo) {
        this.subtitleOverlay.style.bottom = '50px';
        this.subtitleOverlay.style.top = 'auto';

        const updateOverlayPosition = () => {
          const videoRect = this.currentVideo.getBoundingClientRect();
          const videoCenter = videoRect.left + (videoRect.width / 2);
          this.subtitleOverlay.style.left = `${videoCenter}px`;
          this.subtitleOverlay.style.transform = 'translateX(-50%)';
        };

        updateOverlayPosition();
        window.addEventListener('resize', updateOverlayPosition);
      }
    }

    cleanup() {
      this.restorePlayerLayout();
      super.cleanup();
    }

    /**
     * Load subtitles from VTT file
     * @param {string} languageCode - Language code (default: 'he')
     * @returns {Promise<Array>} Array of subtitle objects
     */
    async loadSubtitles(languageCode = 'he') {
      console.log('[StreamIsrael Subs] Loading subtitles...');

      // Find subtitle track element
      const track = await this.findSubtitleTrack(languageCode);
      if (!track) {
        console.log('[StreamIsrael Subs] No subtitle track found');
        return [];
      }

      const vttUrl = track.src;
      console.log('[StreamIsrael Subs] Found VTT URL:', vttUrl);

      try {
        const response = await fetch(vttUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const vttText = await response.text();
        const subtitles = parseVTT(vttText);

        return subtitles;
      } catch (error) {
        console.error('[StreamIsrael Subs] Error loading VTT:', error);
        return [];
      }
    }

    /**
     * Find subtitle track element in DOM
     * @param {string} languageCode - Language code
     * @returns {Promise<HTMLTrackElement|null>} Track element
     */
    async findSubtitleTrack(languageCode) {
      console.log('[StreamIsrael Subs] Looking for subtitle track with language:', languageCode);

      for (let attempt = 0; attempt < 10; attempt++) {
        // Look for Hebrew track with either "he" or "iw" language code
        let track = document.querySelector('track[kind="subtitles"][srclang="he"]');
        if (!track) {
          track = document.querySelector('track[kind="subtitles"][srclang="iw"]');
        }
        if (track && track.src) {
          console.log('[StreamIsrael Subs] Found Hebrew track (', track.srclang, '):', track.src);
          return track;
        }

        // Try the requested language code
        track = document.querySelector(`track[kind="subtitles"][srclang="${languageCode}"]`);
        if (track && track.src) {
          console.log('[StreamIsrael Subs] Found track for', languageCode, ':', track.src);
          return track;
        }

        // Debug: Log all available tracks
        const allTracks = document.querySelectorAll('track[kind="subtitles"]');
        if (allTracks.length > 0 && attempt === 0) {
          console.log('[StreamIsrael Subs] Available subtitle tracks:');
          allTracks.forEach(t => console.log('  -', t.srclang, ':', t.label, ':', t.src));
        }

        // Wait and retry
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('[StreamIsrael Subs] No subtitle track found after 10 attempts');
      return null;
    }
  }

  // Export to global scope
  window.StreamIsraelSubtitleReader = StreamIsraelSubtitleReader;

  /**
   * Setup keyboard navigation for subtitles
   * @param {StreamIsraelSubtitleReader} reader - The subtitle reader instance
   * @param {HTMLVideoElement} video - The video element
   */
  function setupKeyboardNavigation(reader, video) {
    // Use capture phase to intercept before other handlers
    document.addEventListener('keydown', (e) => {
      // Only block arrow keys when actively typing in text fields
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      )) {
        return; // Let user use arrow keys normally in text fields
      }

      // Left arrow: previous subtitle
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();

        const currentTime = video.currentTime;
        const subtitles = reader.subtitles;

        if (subtitles.length === 0) return;

        // Find current subtitle index
        let currentIndex = -1;
        for (let i = 0; i < subtitles.length; i++) {
          if (currentTime >= subtitles[i].startTime && currentTime < subtitles[i].endTime) {
            currentIndex = i;
            break;
          }
        }

        // If no current subtitle, find the last subtitle before current time
        if (currentIndex === -1) {
          for (let i = subtitles.length - 1; i >= 0; i--) {
            if (currentTime >= subtitles[i].endTime) {
              currentIndex = i;
              break;
            }
          }
        }

        // Go to previous subtitle
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        if (subtitles[prevIndex]) {
          video.currentTime = subtitles[prevIndex].startTime;
          console.log('[StreamIsrael Subs] Jump to previous subtitle:', subtitles[prevIndex].text);
        }
      }

      // Right arrow: next subtitle
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();

        const currentTime = video.currentTime;
        const subtitles = reader.subtitles;

        if (subtitles.length === 0) return;

        // Find the next subtitle after current time
        let nextIndex = -1;
        for (let i = 0; i < subtitles.length; i++) {
          if (subtitles[i].startTime > currentTime) {
            nextIndex = i;
            break;
          }
        }

        // If found a next subtitle, jump to it
        if (nextIndex !== -1 && subtitles[nextIndex]) {
          video.currentTime = subtitles[nextIndex].startTime;
          console.log('[StreamIsrael Subs] Jump to next subtitle:', subtitles[nextIndex].text);
        } else {
          console.log('[StreamIsrael Subs] Already at last subtitle');
        }
      }

      // Down arrow: repeat current subtitle
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();

        const currentTime = video.currentTime;
        const subtitles = reader.subtitles;

        if (subtitles.length === 0) return;

        // Find current subtitle
        let currentIndex = -1;
        for (let i = 0; i < subtitles.length; i++) {
          if (currentTime >= subtitles[i].startTime && currentTime <= subtitles[i].endTime) {
            currentIndex = i;
            break;
          }
        }

        // If found current subtitle, jump to its start
        if (currentIndex !== -1 && subtitles[currentIndex]) {
          video.currentTime = subtitles[currentIndex].startTime;
          console.log('[StreamIsrael Subs] Repeat current subtitle:', subtitles[currentIndex].text);
        } else {
          console.log('[StreamIsrael Subs] No current subtitle to repeat');
        }
      }
    }, true); // Use capture phase
  }

  // Auto-initialize on StreamIsrael pages (main page or embed iframe)
  const isStreamIsraelPage = window.location.hostname === 'www.streamisrael.tv' && window.location.pathname.includes('/videos/');
  const isVHXEmbed = window.location.hostname === 'embed.vhx.tv' && window.location.pathname.includes('/videos/');

  if (isStreamIsraelPage || isVHXEmbed) {
    console.log('[StreamIsrael Subs] Initializing on', window.location.hostname);

    // Store current reader instance for cleanup
    let currentReader = null;

    function initializeStreamIsraelSubtitles() {
      console.log('[StreamIsrael Subs] Starting initialization...');

      // Clean up previous reader
      if (currentReader) {
        console.log('[StreamIsrael Subs] Cleaning up previous reader');
        currentReader.cleanup();
        currentReader = null;
      }

      // Wait for SubtitleReaderBase to be available
      const initInterval = setInterval(() => {
        if (window.SubtitleReaderBase) {
          clearInterval(initInterval);

          currentReader = new StreamIsraelSubtitleReader();

          // Poll for video element
          const checkVideo = setInterval(() => {
            const video = currentReader.detectVideo();
            if (video) {
              clearInterval(checkVideo);
              console.log('[StreamIsrael Subs] Video found, initializing reader');

              currentReader.initialize('he').then(() => {
                // Setup keyboard navigation only if subtitles were loaded
                if (currentReader.subtitles && currentReader.subtitles.length > 0) {
                  setupKeyboardNavigation(currentReader, video);
                  console.log('[StreamIsrael Subs] Keyboard navigation enabled (←/→/↓)');
                } else {
                  console.log('[StreamIsrael Subs] No subtitles loaded, arrow keys will work normally');
                }
              }).catch(error => {
                console.error('[StreamIsrael Subs] Initialization error:', error);
              });
            }
          }, 1000);

          // Stop polling after 10 seconds
          setTimeout(() => {
            clearInterval(checkVideo);
            console.log('[StreamIsrael Subs] Stopped polling for video');
          }, 10000);
        }
      }, 100);
    }

    // Initialize on page load
    initializeStreamIsraelSubtitles();

    // Re-initialize on SPA navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('streamisrael.tv/') && url.includes('/videos/')) {
          console.log('[StreamIsrael Subs] SPA navigation detected, reinitializing');
          setTimeout(() => {
            initializeStreamIsraelSubtitles();
          }, 2000);
        }
      }
    }).observe(document, { subtree: true, childList: true });
  }

})();
