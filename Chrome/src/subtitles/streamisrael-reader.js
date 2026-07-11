// StreamIsrael/Mux HLS Subtitle Reader
// Intercepts Mux HLS subtitle M3U8 requests and loads chunked VTT subtitles

(function() {
  'use strict';

  /**
   * Parse a single WebVTT segment's text.
   * Mux HLS VTT chunks use timestamps RELATIVE to the segment start.
   * We add timeOffset (seconds) to convert to absolute video time.
   *
   * @param {string} vttText - Raw VTT text from one chunk
   * @param {number} timeOffset - Seconds to add to all timestamps
   * @returns {Array} Array of {startTime, endTime, text}
   */
  function parseVTTChunk(vttText, timeOffset = 0) {
    const subtitles = [];
    const lines = vttText.split('\n');

    let i = 0;
    // Skip WEBVTT header and any NOTE/STYLE blocks
    while (i < lines.length && !lines[i].includes('-->')) {
      i++;
    }

    while (i < lines.length) {
      const line = lines[i].trim();

      if (line.includes('-->')) {
        // Strip any positioning metadata after the timestamps
        const rawParts = line.split('-->');
        if (rawParts.length === 2) {
          const startRaw = rawParts[0].trim().split(/\s/)[0];
          const endRaw   = rawParts[1].trim().split(/\s/)[0];

          const startAbs = parseVTTTimestamp(startRaw) + timeOffset;
          const endAbs   = parseVTTTimestamp(endRaw)   + timeOffset;

          // Collect subtitle text lines until blank line
          i++;
          const textLines = [];
          while (i < lines.length && lines[i].trim() !== '') {
            const t = lines[i].trim();
            // Skip header lines that can appear in some Mux chunks
            if (!t.startsWith('WEBVTT') && !t.startsWith('NOTE') && !t.startsWith('STYLE')) {
              // Strip VTT markup tags like <c.he>, <b>, <i>, etc.
              textLines.push(t.replace(/<[^>]*>/g, ''));
            }
            i++;
          }

          if (textLines.length > 0 && endAbs > startAbs) {
            subtitles.push({
              startTime: startAbs,
              endTime: endAbs,
              text: textLines.join(' ').trim()
            });
          }
        }
      }
      i++;
    }

    return subtitles;
  }

  /**
   * Parse VTT timestamp string to seconds.
   * Supports: HH:MM:SS.mmm or MM:SS.mmm
   */
  function parseVTTTimestamp(timestamp) {
    const parts = timestamp.split(':');
    let hours = 0, minutes = 0, seconds = 0;
    if (parts.length === 3) {
      hours   = parseInt(parts[0], 10);
      minutes = parseInt(parts[1], 10);
      seconds = parseFloat(parts[2]);
    } else if (parts.length === 2) {
      minutes = parseInt(parts[0], 10);
      seconds = parseFloat(parts[1]);
    }
    return hours * 3600 + minutes * 60 + seconds;
  }

  /**
   * Parse a Mux HLS M3U8 subtitle playlist into an ordered segment list.
   * @param {string} m3u8Text
   * @returns {Array} [{url, duration}]
   */
  function parseM3U8Segments(m3u8Text) {
    const lines = m3u8Text.split('\n');
    const segments = [];
    let nextDuration = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        nextDuration = parseFloat(line.slice(8));
      } else if (line && !line.startsWith('#')) {
        segments.push({ url: line, duration: nextDuration });
        nextDuration = 0;
      }
    }
    return segments;
  }

  // ─── StreamIsrael subtitle reader ──────────────────────────────────────────

  class StreamIsraelSubtitleReader extends window.SubtitleReaderBase {
    constructor() {
      super('StreamIsrael');
      this.originalPlayerStyles = null;
      this._m3u8MessageHandler = null;
    }

    // ── Video detection ───────────────────────────────────────────────────────

    detectVideo() {
      let video = document.querySelector('.vp-video video');
      if (video) return video;
      return document.querySelector('video');
    }

    // ── Layout helpers ────────────────────────────────────────────────────────

    adjustPlayerLayout() {
      const playerContainer = document.querySelector('.player-container');
      if (!playerContainer) return;
      if (!this.originalPlayerStyles) {
        this.originalPlayerStyles = { paddingRight: playerContainer.style.paddingRight };
      }
      playerContainer.style.paddingRight = '350px';
    }

    restorePlayerLayout() {
      const playerContainer = document.querySelector('.player-container');
      if (!playerContainer || !this.originalPlayerStyles) return;
      playerContainer.style.paddingRight = this.originalPlayerStyles.paddingRight;
    }

    // ── Mux HLS subtitle interception ─────────────────────────────────────────

    /**
     * Inject a tiny script into the PAGE context (not the extension context)
     * that wraps fetch/XHR to broadcast subtitle M3U8 URLs via postMessage.
     * Content scripts run in a separate context and cannot observe page fetch/XHR
     * directly, so page-context injection is required.
     */
    injectNetworkInterceptor() {
      if (document.getElementById('_ssh_interceptor_')) return; // already injected

      const script = document.createElement('script');
      script.id = '_ssh_interceptor_';
      script.textContent = `(function() {
        if (window.__SSH_NET_INTERCEPTOR__) return;
        window.__SSH_NET_INTERCEPTOR__ = true;

        const _fetch = window.fetch;
        window.fetch = function(...args) {
          const url = typeof args[0] === 'string' ? args[0]
                    : (args[0] && args[0].url) ? args[0].url : '';
          if (url && url.includes('subtitles.m3u8')) {
            window.postMessage({ type: 'SSH_SUBTITLE_M3U8', url: url }, '*');
          }
          return _fetch.apply(this, args);
        };

        const _open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
          if (url && String(url).includes('subtitles.m3u8')) {
            window.postMessage({ type: 'SSH_SUBTITLE_M3U8', url: String(url) }, '*');
          }
          return _open.apply(this, arguments);
        };

        console.log('[StreamIsrael Subs] Network interceptor active');
      })();`;

      (document.head || document.documentElement).appendChild(script);
      script.remove(); // Remove from DOM — the code keeps running
    }

    /**
     * Check if a subtitle M3U8 was already fetched before our interceptor ran.
     * @returns {string|null}
     */
    checkPerformanceEntries() {
      try {
        const entries = performance.getEntriesByType('resource');
        for (const entry of entries) {
          if (entry.name && entry.name.includes('subtitles.m3u8')) {
            console.log('[StreamIsrael Subs] Found already-fetched M3U8 in perf entries:', entry.name);
            return entry.name;
          }
        }
      } catch (e) {
        // Cross-origin restriction — ignore
      }
      return null;
    }

    /**
     * Returns a Promise that resolves with the subtitle M3U8 URL.
     * Checks performance entries first (for already-loaded subtitles),
     * then waits for the postMessage from the injected interceptor.
     *
     * @param {number} timeoutMs
     * @returns {Promise<string>}
     */
    waitForM3U8Url(timeoutMs = 120000) {
      const existing = this.checkPerformanceEntries();
      if (existing) return Promise.resolve(existing);

      return new Promise((resolve, reject) => {
        const handler = (event) => {
          if (event.data && event.data.type === 'SSH_SUBTITLE_M3U8') {
            window.removeEventListener('message', handler);
            this._m3u8MessageHandler = null;
            console.log('[StreamIsrael Subs] Captured subtitle M3U8:', event.data.url);
            resolve(event.data.url);
          }
        };
        this._m3u8MessageHandler = handler;
        window.addEventListener('message', handler);

        setTimeout(() => {
          window.removeEventListener('message', handler);
          this._m3u8MessageHandler = null;
          reject(new Error('Timed out waiting for subtitle M3U8 — was Hebrew selected in the player?'));
        }, timeoutMs);
      });
    }

    /**
     * Fetch all VTT chunks listed in a Mux subtitle M3U8, apply time offsets,
     * and return a merged, sorted subtitle array.
     *
     * @param {string} m3u8Url
     * @returns {Promise<Array>}
     */
    async loadFromM3U8(m3u8Url) {
      console.log('[StreamIsrael Subs] Fetching M3U8 playlist...');
      const m3u8Res = await fetch(m3u8Url);
      if (!m3u8Res.ok) throw new Error(`M3U8 fetch failed: ${m3u8Res.status}`);
      const m3u8Text = await m3u8Res.text();

      const segments = parseM3U8Segments(m3u8Text);
      if (segments.length === 0) {
        console.log('[StreamIsrael Subs] No segments found in M3U8');
        return [];
      }
      console.log(`[StreamIsrael Subs] Found ${segments.length} VTT segments`);

      // Mux HLS VTT chunks use absolute timestamps — no offset needed
      // Resolve relative URLs (Mux URLs are already absolute, but handle both)
      const m3u8Base = m3u8Url.split('?')[0].replace(/\/[^/]*$/, '/');
      const resolved = segments.map(seg => ({
        ...seg,
        url: seg.url.startsWith('http') ? seg.url : m3u8Base + seg.url
      }));

      // Fetch all chunks in parallel batches of 15
      const BATCH = 15;
      const allSubtitles = [];

      for (let i = 0; i < resolved.length; i += BATCH) {
        const batch = resolved.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(async (seg) => {
            try {
              const res = await fetch(seg.url);
              if (!res.ok) return [];
              const text = await res.text();
              return parseVTTChunk(text, 0); // Mux timestamps are absolute
            } catch (e) {
              console.warn('[StreamIsrael Subs] Failed to fetch chunk:', seg.url, e.message);
              return [];
            }
          })
        );
        for (const subs of results) allSubtitles.push(...subs);
      }

      // Sort by start time and remove duplicates (overlap at chunk boundaries)
      allSubtitles.sort((a, b) => a.startTime - b.startTime);
      const deduped = allSubtitles.filter((sub, idx, arr) => {
        if (idx === 0) return true;
        const prev = arr[idx - 1];
        return !(sub.startTime === prev.startTime && sub.text === prev.text);
      });

      console.log(`[StreamIsrael Subs] Parsed ${deduped.length} subtitles from ${segments.length} chunks`);
      return deduped;
    }

    // ── Main subtitle loading entry point ─────────────────────────────────────

    /**
     * Load subtitles. Tries Mux HLS M3U8 first, falls back to <track> elements.
     * Blocks until the user selects Hebrew subtitles in the Mux player
     * (or the 2-minute timeout elapses).
     */
    async loadSubtitles(languageCode = 'he') {
      console.log('[StreamIsrael Subs] Loading subtitles...');

      // Ensure interceptor is active
      this.injectNetworkInterceptor();

      // --- Strategy 1: Mux HLS M3U8 ---
      try {
        console.log('[StreamIsrael Subs] Waiting for Mux subtitle M3U8 (select Hebrew in player)...');
        const m3u8Url = await this.waitForM3U8Url(120000);
        const subtitles = await this.loadFromM3U8(m3u8Url);
        if (subtitles.length > 0) return subtitles;
      } catch (e) {
        console.log('[StreamIsrael Subs] M3U8 strategy failed:', e.message);
      }

      // --- Strategy 2: Standard <track> elements (fallback for non-HLS embeds) ---
      console.log('[StreamIsrael Subs] Falling back to <track> element search...');
      const track = await this.findSubtitleTrack(languageCode);
      if (!track) {
        console.log('[StreamIsrael Subs] No subtitle track found');
        return [];
      }

      try {
        const res = await fetch(track.src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const vttText = await res.text();
        return parseVTTChunk(vttText, 0);
      } catch (e) {
        console.error('[StreamIsrael Subs] Error loading VTT from track:', e);
        return [];
      }
    }

    /**
     * Find a standard <track> subtitle element (fallback path).
     */
    async findSubtitleTrack(languageCode) {
      for (let attempt = 0; attempt < 10; attempt++) {
        const track = document.querySelector('track[kind="subtitles"][srclang="he"]')
                   || document.querySelector('track[kind="subtitles"][srclang="iw"]')
                   || document.querySelector(`track[kind="subtitles"][srclang="${languageCode}"]`);
        if (track && track.src) {
          console.log('[StreamIsrael Subs] Found track:', track.srclang, track.src);
          return track;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      return null;
    }

    // ── Initialization ────────────────────────────────────────────────────────

    async initialize(languageCode = 'he') {
      // Inject interceptor immediately — before super.initialize calls loadSubtitles —
      // so we don't miss the M3U8 request if it fires during page startup.
      this.injectNetworkInterceptor();

      await super.initialize(languageCode);

      if (this.subtitleBrowser) {
        if (this.subtitleBrowser.parentElement !== document.body) {
          document.body.appendChild(this.subtitleBrowser);
        }
        this.subtitleBrowser.style.position  = 'fixed';
        this.subtitleBrowser.style.top       = '0';
        this.subtitleBrowser.style.bottom    = '0';
        this.subtitleBrowser.style.height    = '100vh';
        this.subtitleBrowser.style.right     = '0';
        this.subtitleBrowser.style.zIndex    = '10000';
        this.subtitleBrowser.style.maxHeight = 'none';

        this.adjustPlayerLayout();

        const observer = new MutationObserver(() => {
          if (this.subtitleBrowser) {
            if (this.subtitleBrowser.style.display !== 'none') {
              this.adjustPlayerLayout();
            } else {
              this.restorePlayerLayout();
            }
          }
        });
        observer.observe(this.subtitleBrowser, { attributes: true, attributeFilter: ['style'] });
      }

      if (this.subtitleOverlay && this.currentVideo) {
        const updateOverlayPosition = () => {
          const rect = this.currentVideo.getBoundingClientRect();
          this.subtitleOverlay.style.bottom    = 'auto';
          this.subtitleOverlay.style.top       = `${rect.bottom + 8}px`;
          this.subtitleOverlay.style.left      = `${rect.left + rect.width / 2}px`;
          this.subtitleOverlay.style.transform = 'translateX(-50%)';
        };
        updateOverlayPosition();
        window.addEventListener('resize', updateOverlayPosition);
      }
    }

    cleanup() {
      if (this._m3u8MessageHandler) {
        window.removeEventListener('message', this._m3u8MessageHandler);
        this._m3u8MessageHandler = null;
      }
      this.restorePlayerLayout();
      super.cleanup();
    }
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  window.StreamIsraelSubtitleReader = StreamIsraelSubtitleReader;

  // ── Keyboard navigation ───────────────────────────────────────────────────────

  function setupKeyboardNavigation(reader, video) {
    document.addEventListener('keydown', (e) => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

      const subtitles = reader.subtitles;
      if (!subtitles || subtitles.length === 0) return;

      const currentTime = video.currentTime;

      if (e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation();
        let idx = subtitles.findIndex(s => currentTime >= s.startTime && currentTime < s.endTime);
        if (idx === -1) {
          for (let i = subtitles.length - 1; i >= 0; i--) {
            if (currentTime >= subtitles[i].endTime) { idx = i; break; }
          }
        }
        const prev = Math.max(0, idx > 0 ? idx - 1 : 0);
        video.currentTime = subtitles[prev].startTime;
        console.log('[StreamIsrael Subs] ← prev subtitle:', subtitles[prev].text);
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation();
        const next = subtitles.findIndex(s => s.startTime > currentTime);
        if (next !== -1) {
          video.currentTime = subtitles[next].startTime;
          console.log('[StreamIsrael Subs] → next subtitle:', subtitles[next].text);
        }
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation();
        const cur = subtitles.find(s => currentTime >= s.startTime && currentTime <= s.endTime);
        if (cur) {
          video.currentTime = cur.startTime;
          console.log('[StreamIsrael Subs] ↓ repeat subtitle:', cur.text);
        }
      }
    }, true);
  }

  // ── Auto-initialize ───────────────────────────────────────────────────────────

  const isStreamIsraelPage = window.location.hostname.endsWith('streamisrael.tv');
  const isVHXEmbed = window.location.hostname === 'embed.vhx.tv' && window.location.pathname.includes('/videos/');

  if (isStreamIsraelPage || isVHXEmbed) {
    console.log('[StreamIsrael Subs] Initializing on', window.location.hostname, window.location.pathname);

    let currentReader = null;

    function initializeStreamIsraelSubtitles() {
      console.log('[StreamIsrael Subs] Starting initialization...');

      if (currentReader) {
        console.log('[StreamIsrael Subs] Cleaning up previous reader');
        currentReader.cleanup();
        currentReader = null;
      }

      const initInterval = setInterval(() => {
        if (window.SubtitleReaderBase) {
          clearInterval(initInterval);
          currentReader = new StreamIsraelSubtitleReader();

          // Inject interceptor ASAP — don't wait for video detection
          currentReader.injectNetworkInterceptor();

          const checkVideo = setInterval(() => {
            const video = currentReader.detectVideo();
            if (video) {
              clearInterval(checkVideo);
              console.log('[StreamIsrael Subs] Video found, starting reader initialization');

              currentReader.initialize('he').then(() => {
                if (currentReader.subtitles && currentReader.subtitles.length > 0) {
                  setupKeyboardNavigation(currentReader, video);
                  console.log('[StreamIsrael Subs] Keyboard navigation enabled (←/→/↓)');
                } else {
                  console.log('[StreamIsrael Subs] No subtitles loaded');
                }
              }).catch(err => {
                console.error('[StreamIsrael Subs] Initialization error:', err);
              });
            }
          }, 1000);

          setTimeout(() => clearInterval(checkVideo), 15000);
        }
      }, 100);
    }

    initializeStreamIsraelSubtitles();

    // Re-initialize on SPA navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        if (url.includes('streamisrael.tv/')) {
          console.log('[StreamIsrael Subs] SPA navigation — reinitializing');
          setTimeout(initializeStreamIsraelSubtitles, 2000);
        }
      }
    }).observe(document, { subtree: true, childList: true });
  }

})();
