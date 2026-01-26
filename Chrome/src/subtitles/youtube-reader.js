// YouTube Subtitle Reader - Class-based implementation
// Extends SubtitleReaderBase for consistent API

(function() {
  'use strict';

  // Standalone InnerTube API function (proven working /player endpoint)
  async function fetchYouTubeCaptionTrack(videoId, languageCode = 'iw') {
    let apiKey = null;
    const scriptElements = document.querySelectorAll('script');
    for (const script of scriptElements) {
      const content = script.textContent;
      const match = content.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
      if (match) {
        apiKey = match[1];
        break;
      }
    }

    if (!apiKey) {
      console.error('[YouTube Subs] Could not find InnerTube API key');
      return null;
    }

    console.log('[YouTube Subs] Using /player endpoint to get caption tracks');

    const url = `https://www.youtube.com/youtubei/v1/player?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38'
          }
        },
        videoId: videoId
      })
    });

    if (!response.ok) {
      console.error('[YouTube Subs] Failed to fetch player response');
      return null;
    }

    const playerData = await response.json();

    // Check for anti-bot response
    if (playerData?.playabilityStatus?.status === 'LOGIN_REQUIRED' &&
        playerData?.playabilityStatus?.reason?.toLowerCase().includes('bot')) {
      console.error('[YouTube Subs] Anti-bot protection detected');
      alert('⚠️ YouTube Anti-Bot Protection Detected\n\nYouTube has blocked subtitle access. This can happen when:\n• Using a VPN or proxy\n• Making too many requests\n• YouTube detects unusual activity\n\nSolution: Disable VPN/proxy and refresh the page.');
      return null;
    }

    const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];

    console.log('[YouTube Subs] Got', tracks.length, 'caption tracks from player API');

    const track = tracks.find(t => t.languageCode === languageCode || t.languageCode === 'he');
    return track;
  }

  class YouTubeSubtitleReader extends window.SubtitleReaderBase {
    constructor() {
      super('YouTube');
      this.captionTracks = [];
      this.subtitleTimeOffset = 0;
    }

    /**
     * Detect YouTube video element
     */
    detectVideo() {
      return document.querySelector('video');
    }

    /**
     * Get current YouTube video ID from URL
     */
    getVideoId() {
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v');
    }

    /**
     * Parse YouTube's timedtext format (XML with <p> and <s> elements)
     */
    parseXMLSubtitles(xmlString) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

        // YouTube's timedtext format uses <p> (paragraph) elements
        const pElements = xmlDoc.querySelectorAll('p');
        const parsedSubs = [];

        pElements.forEach((elem, index) => {
          const tMs = parseInt(elem.getAttribute('t') || '0');
          const dMs = parseInt(elem.getAttribute('d') || '3000');

          // Extract text from nested <s> segments
          const sElements = elem.querySelectorAll('s');
          let text = '';

          if (sElements.length > 0) {
            // Combine all segment texts
            sElements.forEach(s => {
              const segmentText = s.textContent.trim();
              if (segmentText && !segmentText.startsWith('[') && !segmentText.startsWith('>')) {
                text += segmentText + ' ';
              }
            });
          } else {
            // Fallback to element text content
            text = elem.textContent.trim();
          }

          text = text.trim();

          // Skip empty subtitles and music notations
          if (text && !text.startsWith('[') && !text.startsWith('>')) {
            parsedSubs.push({
              id: 'sub_' + tMs,
              startTime: tMs / 1000,
              endTime: (tMs + dMs) / 1000,
              text: text
            });
          }
        });

        const sortedSubs = parsedSubs.sort((a, b) => a.startTime - b.startTime);

        // Fix overlapping subtitles - ensure each subtitle ends before the next one starts
        for (let i = 0; i < sortedSubs.length - 1; i++) {
          const current = sortedSubs[i];
          const next = sortedSubs[i + 1];

          // If current subtitle overlaps with next, truncate it
          if (current.endTime > next.startTime) {
            console.log(`[YouTube Subs] Fixed overlap: "${current.text}" originally ${current.startTime}-${current.endTime}, now ${current.startTime}-${next.startTime}`);
            current.endTime = next.startTime;
          }
        }

        return sortedSubs;
      } catch (error) {
        console.error('[YouTube Subs] Error parsing XML:', error);
        return [];
      }
    }

    /**
     * Load subtitles using /player endpoint + baseUrl approach
     * @param {string} languageCode - Language code (default: 'iw' for Hebrew)
     */
    async loadSubtitles(languageCode = 'iw') {
      const videoId = this.getVideoId();
      if (!videoId) {
        console.error('[YouTube Subs] No video ID found');
        return [];
      }

      console.log('[YouTube Subs] Video ID:', videoId);
      console.log('[YouTube Subs] Language Code:', languageCode);

      // Get caption track from /player endpoint
      const track = await fetchYouTubeCaptionTrack(videoId, languageCode);

      if (!track || !track.baseUrl) {
        console.error('[YouTube Subs] No caption track found');
        return [];
      }

      console.log('[YouTube Subs] Got caption track, fetching subtitles...');

      const response = await fetch(track.baseUrl);

      if (!response.ok) {
        console.error('[YouTube Subs] Failed to fetch subtitles:', response.status);
        return [];
      }

      const text = await response.text();

      if (!text || text.trim().length === 0) {
        console.error('[YouTube Subs] Empty subtitle response');
        return [];
      }

      const parsedSubtitles = this.parseXMLSubtitles(text);

      if (parsedSubtitles.length === 0) {
        console.error('[YouTube Subs] No subtitles parsed from XML');
        return [];
      }

      console.log('[YouTube Subs] Successfully loaded', parsedSubtitles.length, 'subtitles');
      return parsedSubtitles;
    }

    /**
     * Update current subtitle display
     * Overrides base method to add time offset support
     */
    updateCurrentSubtitle() {
      if (!this.currentVideo || this.subtitles.length === 0) return;

      // Apply time offset for sync adjustment
      const currentTime = this.currentVideo.currentTime + this.subtitleTimeOffset;

      let foundIndex = -1;
      for (let i = 0; i < this.subtitles.length; i++) {
        if (currentTime >= this.subtitles[i].startTime && currentTime <= this.subtitles[i].endTime) {
          foundIndex = i;
          break;
        }
      }

      // Only update if subtitle changed (prevents flicker)
      if (foundIndex !== this.currentSubtitleIndex) {
        this.currentSubtitleIndex = foundIndex;

        if (this.subtitleOverlay) {
          if (foundIndex !== -1) {
            const sub = this.subtitles[foundIndex];
            const displayText = window.stripNikud(sub.text, this.stripNikudEnabled);

            // Hide, reset styles, update text
            this.subtitleOverlay.style.display = 'none';
            this.subtitleOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
            this.subtitleOverlay.style.color = 'white';
            this.subtitleOverlay.style.padding = '10px 20px';
            this.subtitleOverlay.classList.remove('anki-sentence-highlight');
            this.subtitleOverlay.textContent = displayText;

            // Dispatch event for word highlighting
            document.dispatchEvent(new CustomEvent('ankiYouTubeSubtitleUpdated', {
              detail: { element: this.subtitleOverlay, text: displayText }
            }));
          } else {
            this.subtitleOverlay.style.display = 'none';
          }
        }

        // Update browser highlight
        this.updateBrowserHighlight(foundIndex);
      }
    }

    /**
     * Update browser highlighting for current subtitle
     */
    updateBrowserHighlight(index) {
      if (!this.subtitleBrowser) return;

      const container = document.getElementById('anki-youtube-subtitle-browser-list');
      if (!container) return;

      const items = container.querySelectorAll('[data-index]');
      items.forEach((item, i) => {
        const isI1 = item.classList.contains('anki-i1-sentence');
        const isPotentiallyI1 = item.classList.contains('anki-potentially-i1-sentence');

        if (i === index) {
          // Preserve i+1 and potentially-i+1 backgrounds, otherwise use highlight color
          if (isI1) {
            item.style.backgroundColor = '#add8e6'; // Light blue
          } else if (isPotentiallyI1) {
            item.style.backgroundColor = '#e6d5f5'; // Light purple
          } else {
            item.style.backgroundColor = '#4f4f4f';
          }
          item.style.borderLeftColor = '#0066ff'; // Blue
          item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        } else {
          // Preserve i+1 and potentially-i+1 backgrounds, otherwise use default color
          if (isI1) {
            item.style.backgroundColor = '#add8e6'; // Light blue
          } else if (isPotentiallyI1) {
            item.style.backgroundColor = '#e6d5f5'; // Light purple
          } else {
            item.style.backgroundColor = '#272727';
          }
          item.style.borderLeftColor = 'transparent';
        }

        // Maintain text colors for i+1 and potentially-i+1 items
        if (isI1 || isPotentiallyI1) {
          const divElements = item.querySelectorAll('div');
          divElements.forEach(div => {
            div.style.color = '#000';
          });
          const spanElements = item.querySelectorAll('.anki-hebrew-highlight');
          spanElements.forEach(span => {
            span.style.color = '#000';
          });
        }
      });
    }
  }

  // Expose class to global scope
  window.YouTubeSubtitleReader = YouTubeSubtitleReader;

  /**
   * Setup keyboard navigation for subtitles
   * @param {YouTubeSubtitleReader} reader - The subtitle reader instance
   * @param {HTMLVideoElement} video - The video element
   */
  function setupKeyboardNavigation(reader, video) {
    // Use capture phase to intercept before YouTube's handlers
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
        e.preventDefault(); // Prevent default behavior
        e.stopPropagation(); // Stop YouTube from seeing this event

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
          console.log('[YouTube Subs] Jump to previous subtitle:', subtitles[prevIndex].text);
        }
      }

      // Right arrow: next subtitle
      if (e.key === 'ArrowRight') {
        e.preventDefault(); // Prevent default behavior
        e.stopPropagation(); // Stop YouTube from seeing this event

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
          console.log('[YouTube Subs] Jump to next subtitle:', subtitles[nextIndex].text);
        } else {
          console.log('[YouTube Subs] Already at last subtitle');
        }
      }

      // Down arrow: repeat current subtitle
      if (e.key === 'ArrowDown') {
        e.preventDefault(); // Prevent default behavior
        e.stopPropagation(); // Stop YouTube from seeing this event

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
          console.log('[YouTube Subs] Repeat current subtitle:', subtitles[currentIndex].text);
        } else {
          console.log('[YouTube Subs] No current subtitle to repeat');
        }
      }
    }, true); // Use capture phase to intercept before YouTube's handlers
  }

  // Store current reader instance globally for cleanup on navigation
  let currentReader = null;

  // Initialize or reinitialize YouTube subtitles
  function initializeYouTubeSubtitles() {
    console.log('[YouTube Subs] Initializing...');

    // Clean up previous reader if it exists
    if (currentReader) {
      console.log('[YouTube Subs] Cleaning up previous reader');
      currentReader.cleanup();
      currentReader = null;
    }

    // Wait for SubtitleReaderBase to be available
    const initInterval = setInterval(() => {
      if (window.SubtitleReaderBase) {
        clearInterval(initInterval);

        currentReader = new YouTubeSubtitleReader();

        // Poll for video element
        const checkVideo = setInterval(() => {
          const video = document.querySelector('video');
          if (video) {
            clearInterval(checkVideo);
            console.log('[YouTube Subs] Video found, starting reader');

            currentReader.initialize('iw').then(() => {
              // Setup keyboard navigation only if subtitles were loaded
              if (currentReader.subtitles && currentReader.subtitles.length > 0) {
                setupKeyboardNavigation(currentReader, video);
                console.log('[YouTube Subs] Keyboard navigation enabled (←/→/↓)');
              } else {
                console.log('[YouTube Subs] No subtitles loaded, arrow keys will work normally');
              }
            }).catch(error => {
              console.error('[YouTube Subs] Initialization error:', error);
            });
          }
        }, 1000);

        // Stop polling after 10 seconds
        setTimeout(() => {
          clearInterval(checkVideo);
          console.log('[YouTube Subs] Stopped polling for video');
        }, 10000);
      }
    }, 100);
  }

  // Auto-initialize on YouTube video pages
  if (window.location.hostname === 'www.youtube.com' && window.location.pathname === '/watch') {
    initializeYouTubeSubtitles();
  }

  // Re-initialize on SPA navigation (when video URL changes)
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes('youtube.com/watch')) {
        console.log('[YouTube Subs] SPA navigation detected, reinitializing');
        // Longer delay to let YouTube fully swap out the video element
        setTimeout(() => {
          initializeYouTubeSubtitles();
        }, 2000);
      }
    }
  }).observe(document, { subtree: true, childList: true });

})();
