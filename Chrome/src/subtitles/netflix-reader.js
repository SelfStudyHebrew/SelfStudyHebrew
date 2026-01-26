// Netflix subtitle reader - extends SubtitleReaderBase with Netflix-specific interception

(function() {
  'use strict';

  /**
   * Netflix subtitle reader implementation
   */
  class NetflixSubtitleReader extends window.SubtitleReaderBase {
  constructor() {
    super('Netflix');
    this.interceptorInjected = false;
    this.subtitlesXml = null;
    this.capturedSubtitleTracks = []; // Store all Hebrew tracks
    this.hebrewTrackMetadata = null; // Store track metadata from JSON.parse
    this.enableClickToSeek = true;
    this.originalPlayerStyles = null;
  }

  /**
   * Select best Hebrew track from metadata
   * Prefer: CC over regular, non-forced over forced
   */
  selectBestTrackFromMetadata(tracks) {
    if (!tracks || tracks.length === 0) return null;

    const ccNonForced = tracks.find(t => t.isClosedCaptions && !t.isForcedNarrative);
    if (ccNonForced) return ccNonForced;

    const regularNonForced = tracks.find(t => !t.isForcedNarrative);
    if (regularNonForced) return regularNonForced;

    const anyCC = tracks.find(t => t.isClosedCaptions);
    if (anyCC) return anyCC;

    return tracks[0];
  }

  /**
   * Download subtitle file from URL
   */
  async downloadSubtitleFile(url) {
    try {
      const response = await fetch(url);
      return await response.text();
    } catch (error) {
      console.error('[Netflix Subs] Error downloading:', error);
      return null;
    }
  }

  /**
   * Seek to specific time using Netflix's internal API
   * Source: https://stackoverflow.com/a/78009712
   * @param {number} seconds - Time to seek to
   */
  async seekToTime(seconds) {
    if (!this.currentVideo) return;

    try {
      const timeInMs = Math.floor(seconds * 1000);
      const script = document.createElement('script');
      script.textContent = `
        try {
          const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
          const player = videoPlayer.getVideoPlayerBySessionId(videoPlayer.getAllPlayerSessionIds()[0]);
          player.seek(${timeInMs});
        } catch (e) {
          console.error('[Netflix Subs] Seek failed:', e);
        }
      `;
      document.documentElement.appendChild(script);
      script.remove();
    } catch (error) {
      console.error('[Netflix Subs] Error seeking:', error);
      this.currentVideo.currentTime = seconds;
    }
  }

  /**
   * Inject JSON.parse interceptor to catch Netflix's subtitle track metadata
   */
  injectJSONInterceptor() {
    if (!document.head) {
      setTimeout(() => this.injectJSONInterceptor(), 100);
      return;
    }

    const script = document.createElement('script');
    script.textContent = `
(function() {
  const originalParse = JSON.parse;
  JSON.parse = function() {
    const result = originalParse.apply(this, arguments);

    if (result && result.result && result.result.movieId && result.result.timedtexttracks) {
      const tracks = result.result.timedtexttracks;
      const hebrewTracks = [];

      for (const track of tracks) {
        if (track.language !== 'he' && track.language !== 'heb') continue;
        if (track.isNoneTrack) continue;

        const isCC = track.rawTrackType === 'closedcaptions';
        const isForced = track.isForcedNarrative;

        let downloadUrl = null;
        let downloadFormat = null;

        if (track.ttDownloadables) {
          const formats = ['imsc1.1', 'nflx-cmisc', 'webvtt', 'dfxp', 'simplesdh'];
          for (const format of formats) {
            if (track.ttDownloadables[format]) {
              const formatObj = track.ttDownloadables[format];
              const urls = formatObj.urls;
              if (urls && urls.length > 0) {
                downloadUrl = urls[0].url;
                downloadFormat = format;
                break;
              }
            }
          }
        }

        hebrewTracks.push({
          language: track.language,
          description: track.languageDescription,
          isClosedCaptions: isCC,
          isForcedNarrative: isForced,
          downloadUrl: downloadUrl,
          downloadFormat: downloadFormat,
          trackId: track.new_track_id
        });
      }

      if (hebrewTracks.length > 0) {
        console.log('[Netflix JSON] Dispatching Hebrew track metadata:', hebrewTracks);
        document.dispatchEvent(new CustomEvent('netflixHebrewTracksFound', {
          detail: { tracks: hebrewTracks }
        }));
      }
    }

    return result;
  };

  console.log('[Netflix JSON] JSON.parse interceptor active!');
})();
`;
    document.head.appendChild(script);
    console.log('[Netflix Subs] JSON interceptor injected');
  }

  /**
   * Inject network interceptor into page context
   * Intercepts fetch and XMLHttpRequest to detect Hebrew TTML subtitles
   */
  injectInterceptor() {
    if (this.interceptorInjected) return;

    const script = document.createElement('script');
    script.textContent = `
(function() {
  console.log('[Netflix Injected] Comprehensive interceptor initializing...');

  // Intercept fetch API
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

    const response = await originalFetch.apply(this, args);

    // Check response for Hebrew subtitles
    if (url.includes('nflxvideo.net') || url.includes('.xml') || url.includes('timedtext')) {
      const clonedResponse = response.clone();
      try {
        const text = await clonedResponse.text();
        if ((text.includes('<?xml') || text.includes('<tt')) && text.includes('xml:lang="he"')) {
          console.log('[Netflix Injected] ✅ Hebrew TTML detected via fetch!');
          console.log('[Netflix Injected] URL:', url);
          window.postMessage({
            type: 'NETFLIX_HEBREW_SUBTITLES',
            subtitlesXml: text,
            source: 'fetch',
            url: url
          }, '*');
        }
      } catch (err) {
        // Not text content, ignore
      }
    }

    return response;
  };

  // Intercept XMLHttpRequest
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._interceptedUrl = url;
    this._interceptedMethod = method;
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    const url = this._interceptedUrl;

    // Add listener to check response
    this.addEventListener('load', function() {
      const url = this._interceptedUrl;
      if (typeof url === 'string' && (url.includes('nflxvideo.net') || url.includes('.xml') || url.includes('timedtext'))) {
        try {
          const text = this.responseText;
          if (text && (text.includes('<?xml') || text.includes('<tt')) && text.includes('xml:lang="he"')) {
            console.log('[Netflix Injected] ✅ Hebrew TTML detected via XHR!');
            console.log('[Netflix Injected] URL:', url);
            window.postMessage({
              type: 'NETFLIX_HEBREW_SUBTITLES',
              subtitlesXml: text,
              source: 'xhr',
              url: url
            }, '*');
          }
        } catch (err) {
          // Ignore errors
        }
      }
    });

    return originalXHRSend.apply(this, args);
  };

  console.log('[Netflix Injected] Interceptors active!');
  console.log('[Netflix Injected] Monitoring: fetch, XMLHttpRequest');
})();
`;
    (document.head || document.documentElement).appendChild(script);
    script.remove();

    this.interceptorInjected = true;
    console.log('[Netflix Subs] Interceptor injected');
  }

  /**
   * Parse TTML subtitle file
   * @param {string} xmlString - TTML XML data
   * @returns {Array} Parsed subtitle objects
   */
  /**
   * Parse WebVTT subtitle format
   * @param {string} vttString - WebVTT content
   * @returns {Array} Parsed subtitles
   */
  parseWebVTT(vttString) {
    try {
      const lines = vttString.split('\n');
      const subtitles = [];
      let currentSub = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();

        if (line.startsWith('WEBVTT') || line.startsWith('NOTE') || line === '') {
          continue;
        }

        const timeMatch = line.match(/^(\d{2}):(\d{2}):(\d{2}\.\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}\.\d{3})/);
        if (timeMatch) {
          if (currentSub) {
            subtitles.push(currentSub);
          }

          const startHours = parseInt(timeMatch[1]);
          const startMins = parseInt(timeMatch[2]);
          const startSecs = parseFloat(timeMatch[3]);
          const startTime = startHours * 3600 + startMins * 60 + startSecs;

          const endHours = parseInt(timeMatch[4]);
          const endMins = parseInt(timeMatch[5]);
          const endSecs = parseFloat(timeMatch[6]);
          const endTime = endHours * 3600 + endMins * 60 + endSecs;

          currentSub = {
            id: `vtt-${subtitles.length}`,
            startTime,
            endTime,
            text: ''
          };
        } else if (currentSub && line && !line.match(/^\d+$/)) {
          if (currentSub.text) currentSub.text += '\n';
          currentSub.text += line.replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, '');
        }
      }

      if (currentSub) {
        subtitles.push(currentSub);
      }

      return subtitles;
    } catch (error) {
      console.error('[Netflix Subs] Error parsing WebVTT:', error);
      return [];
    }
  }

  parseTTML(xmlString) {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, 'text/xml');

      const ttElement = xmlDoc.documentElement;
      const tickRate = parseInt(ttElement?.getAttribute('ttp:tickRate') || '10000000');
      const pElements = xmlDoc.querySelectorAll('p');
      const parsedSubs = [];

      for (let p of pElements) {
        try {
          const id = p.getAttribute('xml:id');
          const beginAttr = p.getAttribute('begin');
          const endAttr = p.getAttribute('end');

          if (!beginAttr || !endAttr) continue;

          const beginTicks = parseInt(beginAttr.replace('t', ''));
          const endTicks = parseInt(endAttr.replace('t', ''));

          if (isNaN(beginTicks) || isNaN(endTicks)) continue;

          const startTime = beginTicks / tickRate;
          const endTime = endTicks / tickRate;

          let text = '';
          for (let child of p.childNodes) {
            if (child.nodeType === Node.TEXT_NODE) {
              text += child.textContent;
            } else if (child.tagName === 'br') {
              text += '\n';
            } else if (child.textContent) {
              text += child.textContent;
            }
          }

          const trimmedText = text.trim();

          // Debug first subtitle text
          if (parsedSubs.length === 0 && trimmedText) {
            console.log('[Netflix Subs] First subtitle text:', trimmedText);
          }

          if (trimmedText) {
            parsedSubs.push({
              id,
              startTime,
              endTime,
              text: trimmedText
            });
          }
        } catch (err) {
          console.warn('[Netflix Subs] Error parsing subtitle element:', err);
        }
      }

      return parsedSubs.sort((a, b) => a.startTime - b.startTime);
    } catch (error) {
      console.error('[Netflix Subs] Error parsing TTML:', error);
      return [];
    }
  }

  /**
   * Detect video element (implementation of abstract method)
   * @returns {HTMLVideoElement|null} Video element
   */
  detectVideo() {
    return document.querySelector('video');
  }

  /**
   * Select the best Hebrew track from captured tracks
   * @returns {string|null} Best subtitle XML
   */
  selectBestTrack() {
    if (this.capturedSubtitleTracks.length === 0) return null;
    if (this.capturedSubtitleTracks.length === 1) return this.capturedSubtitleTracks[0];

    let bestTrack = null;
    let maxCount = 0;

    this.capturedSubtitleTracks.forEach((xml, index) => {
      const parsed = this.parseTTML(xml);
      console.log(`[Netflix Subs] Track ${index + 1}: ${parsed.length} subtitles`);

      if (parsed.length > maxCount) {
        maxCount = parsed.length;
        bestTrack = xml;
      }
    });

    console.log(`[Netflix Subs] Selected track with ${maxCount} subtitles (full Hebrew track)`);
    return bestTrack;
  }

  /**
   * Load subtitles (implementation of abstract method)
   * @returns {Promise<Array>} Array of subtitle objects
   */
  async loadSubtitles() {
    return new Promise((resolve) => {
      if (this.subtitlesXml) {

        // Detect format (WebVTT vs TTML/DFXP)
        const isWebVTT = this.subtitlesXml.includes('WEBVTT');
        const isTTML = this.subtitlesXml.includes('<?xml') || this.subtitlesXml.includes('<tt') || this.subtitlesXml.includes('xmlns:tt');

        let parsed;
        if (isWebVTT) {
          parsed = this.parseWebVTT(this.subtitlesXml);
        } else if (isTTML) {
          parsed = this.parseTTML(this.subtitlesXml);
        } else {
          console.error('[Netflix Subs] Unknown format:', this.subtitlesXml.substring(0, 100));
          parsed = [];
        }

        resolve(parsed);
        return;
      }

      setTimeout(() => {
        if (this.subtitlesXml) {
          const isWebVTT = this.subtitlesXml.includes('WEBVTT');
          const parsed = isWebVTT ? this.parseWebVTT(this.subtitlesXml) : this.parseTTML(this.subtitlesXml);
          resolve(parsed);
        } else if (this.capturedSubtitleTracks.length > 0) {
          const bestXml = this.selectBestTrack();
          if (bestXml) {
            resolve(this.parseTTML(bestXml));
          } else {
            resolve([]);
          }
        } else {
          resolve([]);
        }
      }, 5000);
    });
  }


  adjustPlayerLayout() {
    const playerContainer = document.querySelector('.watch-video');
    if (!playerContainer) return;

    if (!this.originalPlayerStyles) {
      this.originalPlayerStyles = {
        width: playerContainer.style.width,
        maxWidth: playerContainer.style.maxWidth,
        transform: playerContainer.style.transform,
        transformOrigin: playerContainer.style.transformOrigin
      };
    }

    const scale = (window.innerWidth - 350) / window.innerWidth;
    playerContainer.style.transformOrigin = 'top left';
    playerContainer.style.transform = `scale(${scale})`;

    this.centerOverlayWithScaledVideo();
  }

  centerOverlayWithScaledVideo() {
    if (!this.subtitleOverlay || !this.currentVideo) return;

    const rect = this.currentVideo.getBoundingClientRect();
    const videoCenter = rect.left + (rect.width / 2);

    this.subtitleOverlay.style.left = `${videoCenter}px`;
    this.subtitleOverlay.style.transform = 'translateX(-50%)';
  }

  restorePlayerLayout() {
    const playerContainer = document.querySelector('.watch-video');
    if (!playerContainer || !this.originalPlayerStyles) return;

    playerContainer.style.width = this.originalPlayerStyles.width;
    playerContainer.style.maxWidth = this.originalPlayerStyles.maxWidth;
    playerContainer.style.transform = this.originalPlayerStyles.transform;
    playerContainer.style.transformOrigin = this.originalPlayerStyles.transformOrigin;

    if (this.subtitleOverlay && this.currentVideo) {
      this.centerOverlayWithScaledVideo();
    }
  }

  cleanup() {
    this.restorePlayerLayout();
    if (super.cleanup) super.cleanup();
  }

  /**
   * Initialize Netflix subtitle reader
   */
  async initialize() {
    this.setupMessageListener();

    this.injectInterceptor();

    this.enableHebrewSubtitlesAuto();

    const maxWaitTime = 4000;
    const pollInterval = 100;
    const startTime = Date.now();

    while (this.capturedSubtitleTracks.length === 0 && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    if (this.capturedSubtitleTracks.length === 0) {
      console.warn('[Netflix Subs] No Hebrew subtitles intercepted, continuing anyway');
    }

    await super.initialize();

    if (this.subtitles && this.subtitles.length > 0) {
      this.setupKeyboardNavigation();
      this.disableNativeSubtitles();
      this.adjustPlayerLayout();

      // Watch for browser visibility changes
      if (this.subtitleBrowser) {
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
    }
  }

  disableNativeSubtitles() {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
          const player = videoPlayer.getVideoPlayerBySessionId(videoPlayer.getAllPlayerSessionIds()[0]);
          if (!player) return;

          const tracks = player.getTimedTextTrackList();
          const offTrack = tracks.find(t => t.displayName === 'Off');
          if (offTrack) {
            player.setTimedTextTrack(offTrack);
          }
        } catch (e) {
          console.error('[Netflix Subs] Error disabling native subtitles:', e);
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
  }

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'NETFLIX_HEBREW_SUBTITLES') {
        this.capturedSubtitleTracks.push(event.data.subtitlesXml);
      }
    });
  }

  enableHebrewSubtitlesAuto() {
    const script = document.createElement('script');
    script.textContent = `
      (function() {
        try {
          const videoPlayer = netflix.appContext.state.playerApp.getAPI().videoPlayer;
          const player = videoPlayer.getVideoPlayerBySessionId(videoPlayer.getAllPlayerSessionIds()[0]);
          if (!player) return;

          const tracks = player.getTimedTextTrackList();
          let hebrewTrack = null;

          for (let i = 0; i < tracks.length; i++) {
            const track = tracks[i];
            if (track.displayName === 'Off') continue;
            if (track.displayName === 'Hebrew' || track.bcp47 === 'he' || track.language === 'he') {
              if (!hebrewTrack || (hebrewTrack.trackType !== 'PRIMARY' && track.trackType === 'PRIMARY')) {
                hebrewTrack = track;
              }
            }
          }

          if (hebrewTrack) {
            const currentTrack = player.getTimedTextTrack();
            const isHebrewAlreadySelected = currentTrack &&
              (currentTrack.displayName === hebrewTrack.displayName || currentTrack.bcp47 === hebrewTrack.bcp47);

            if (!isHebrewAlreadySelected) {
              const offTrack = tracks.find(t => t.displayName === 'Off');
              if (offTrack) {
                player.setTimedTextTrack(offTrack);
                setTimeout(() => player.setTimedTextTrack(hebrewTrack), 200);
              } else {
                player.setTimedTextTrack(hebrewTrack);
              }
            }
          }
        } catch (e) {
          console.error('[Netflix Subs] Error auto-selecting:', e);
        }
      })();
    `;
    document.documentElement.appendChild(script);
    script.remove();
  }

  setupKeyboardNavigation() {
    document.addEventListener('keydown', async (e) => {
      // Skip if typing in a text field
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
      )) {
        return;
      }

      // Only handle arrow keys if we have subtitles loaded
      if (!this.subtitles || this.subtitles.length === 0) return;

      const currentTime = this.currentVideo.currentTime;

      // Left arrow: previous subtitle
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();

        let currentIndex = -1;
        for (let i = 0; i < this.subtitles.length; i++) {
          if (currentTime >= this.subtitles[i].startTime && currentTime < this.subtitles[i].endTime) {
            currentIndex = i;
            break;
          }
        }

        if (currentIndex === -1) {
          for (let i = this.subtitles.length - 1; i >= 0; i--) {
            if (currentTime >= this.subtitles[i].endTime) {
              currentIndex = i;
              break;
            }
          }
        }

        const prevIndex = currentIndex > 0 ? currentIndex - 1 : 0;
        if (this.subtitles[prevIndex]) {
          await this.seekToTime(this.subtitles[prevIndex].startTime);
        }
      }

      // Right arrow: next subtitle
      else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();

        let nextIndex = -1;
        for (let i = 0; i < this.subtitles.length; i++) {
          if (this.subtitles[i].startTime > currentTime) {
            nextIndex = i;
            break;
          }
        }

        if (nextIndex !== -1 && this.subtitles[nextIndex]) {
          await this.seekToTime(this.subtitles[nextIndex].startTime);
        }
      }

      // Down arrow: repeat current subtitle
      else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();

        let currentIndex = -1;
        for (let i = 0; i < this.subtitles.length; i++) {
          if (currentTime >= this.subtitles[i].startTime && currentTime <= this.subtitles[i].endTime) {
            currentIndex = i;
            break;
          }
        }

        if (currentIndex !== -1 && this.subtitles[currentIndex]) {
          await this.seekToTime(this.subtitles[currentIndex].startTime);
        }
      }
    }, true); // Use capture phase to intercept before Netflix's handlers
  }
}

  // Expose to global scope
  window.NetflixSubtitleReader = NetflixSubtitleReader;
})();

// Auto-initialize when page loads
(async function() {
  // Only run on Netflix watch pages
  if (!window.location.href.includes('netflix.com/watch/')) {
    console.log('[Netflix Subs] Not on watch page, skipping');
    return;
  }

  console.log('[Netflix Subs] Initializing...');

  // Create reader immediately
  const reader = new window.NetflixSubtitleReader();

  // Inject JSON interceptor FIRST (must catch API response before it's processed)
  reader.injectJSONInterceptor();

  // Listen for track metadata from JSON interceptor
  document.addEventListener('netflixHebrewTracksFound', async (event) => {
    console.log('[Netflix Subs] Received Hebrew track metadata!');
    const tracks = event.detail.tracks;

    // Select best track
    const bestTrack = reader.selectBestTrackFromMetadata(tracks);

    if (bestTrack && bestTrack.downloadUrl) {
      // Download the subtitle file
      const subtitleData = await reader.downloadSubtitleFile(bestTrack.downloadUrl);
      if (subtitleData) {
        // Store it for loadSubtitles() to use
        reader.subtitlesXml = subtitleData;
        reader.hebrewTrackMetadata = bestTrack;
        console.log('[Netflix Subs] Hebrew subtitles ready!');
      }
    }
  });

  // Note: Message listener and interceptor are now set up in initialize()

  // Poll for video element (may take time to load)
  const checkVideo = setInterval(() => {
    const video = document.querySelector('video');
    if (video) {
      clearInterval(checkVideo);
      console.log('[Netflix Subs] Video found, starting reader');

      reader.initialize('he').catch(error => {
        console.error('[Netflix Subs] Initialization error:', error);
      });
    }
  }, 1000);

  // Stop checking after 10 seconds
  setTimeout(() => {
    clearInterval(checkVideo);
    console.log('[Netflix Subs] Stopped polling for video');
  }, 10000);
})();

// Re-initialize on SPA navigation
let lastUrl = location.href;
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    if (url.includes('netflix.com/watch/')) {
      console.log('[Netflix Subs] SPA navigation detected, reinitializing');
      setTimeout(() => {
        const reader = new window.NetflixSubtitleReader();
        reader.initialize('he').catch(error => {
          console.error('[Netflix Subs] Reinitialization error:', error);
        });
      }, 2000);
    }
  }
}).observe(document, { subtree: true, childList: true });
