// Base class for subtitle readers (YouTube, Netflix, etc.)
// Consolidates shared UI creation, stats calculation, and synchronization logic

(function() {
  'use strict';

  /**
   * Abstract base class for subtitle readers
   * Subclasses must implement: loadSubtitles(), detectVideo()
   */
  class SubtitleReaderBase {
  /**
   * @param {string} platformName - Platform name ('YouTube' or 'Netflix')
   */
  constructor(platformName) {
    this.platformName = platformName;
    this.subtitles = [];
    this.currentSubtitleIndex = -1;
    this.subtitleOverlay = null;
    this.subtitleBrowser = null;
    this.currentVideo = null;
    this.comprehensionStats = { total: 0, known: 0, potentiallyKnown: 0, percentage: 0, i1Sentences: 0, potentiallyI1Sentences: 0 };
    this.stripNikudEnabled = false;
    this.isEnabled = true;
    this.audioContext = null;
    this.audioSourceNode = null;
  }

  /**
   * Abstract method - must be implemented by subclasses
   * Load subtitles for the given language
   * @param {string} languageCode - Language code (e.g., 'iw' for Hebrew)
   * @returns {Promise<Array>} Array of subtitle objects
   */
  async loadSubtitles(_languageCode) {
    throw new Error('loadSubtitles() must be implemented by subclass');
  }

  /**
   * Abstract method - must be implemented by subclasses
   * Detect and return the video element
   * @returns {HTMLVideoElement|null} Video element
   */
  detectVideo() {
    throw new Error('detectVideo() must be implemented by subclass');
  }

  /**
   * Calculate comprehension statistics for loaded subtitles
   * @returns {Promise<Object>} Stats object {total, known, potentiallyKnown, percentage, i1Sentences, potentiallyI1Sentences}
   */
  async calculateComprehensionStats() {
    if (this.subtitles.length === 0) {
      return { total: 0, known: 0, potentiallyKnown: 0, percentage: 0, i1Sentences: 0, potentiallyI1Sentences: 0 };
    }

    this.comprehensionStats = await window.calculateComprehensionStats(this.subtitles);
    return this.comprehensionStats;
  }

  async loadStripNikudSetting() {
    try {
      const result = await chrome.storage.local.get(['stripNikudEnabled']);
      this.stripNikudEnabled = result.stripNikudEnabled || false;
      console.log(`[${this.platformName} Subs] Strip nikud enabled:`, this.stripNikudEnabled);
    } catch (error) {
      console.error(`[${this.platformName} Subs] Error loading strip nikud setting:`, error);
    }
  }

  /**
   * Create subtitle overlay (floating display over video)
   * @returns {HTMLElement} Overlay element
   */
  createSubtitleOverlay() {
    if (this.subtitleOverlay) return this.subtitleOverlay;

    // Determine overlay ID based on platform
    let overlayId;
    if (this.platformName === 'YouTube') {
      overlayId = window.DOM_IDS.YOUTUBE_OVERLAY;
    } else if (this.platformName === 'Netflix') {
      overlayId = window.DOM_IDS.NETFLIX_OVERLAY;
    } else if (this.platformName === 'StreamIsrael') {
      overlayId = window.DOM_IDS.STREAMISRAEL_OVERLAY;
    } else {
      overlayId = 'anki-subtitle-overlay'; // Generic fallback
    }

    const overlay = document.createElement('div');
    overlay.id = overlayId;
    overlay.style.cssText = `
      position: fixed;
      bottom: 150px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 44px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      text-align: center;
      direction: rtl;
      max-width: 80%;
      pointer-events: auto;
      display: none;
    `;

    // If we're in an iframe, try to append to parent document
    const isInIframe = window.self !== window.top;
    console.log(`[${this.platformName} Subs] Running in iframe:`, isInIframe);

    try {
      if (isInIframe && window.top.document.body) {
        window.top.document.body.appendChild(overlay);
        console.log(`[${this.platformName} Subs] Created overlay in parent page`);
      } else {
        document.body.appendChild(overlay);
        console.log(`[${this.platformName} Subs] Created overlay in current page`);
      }
    } catch (e) {
      // Cross-origin restriction - append to current document
      console.log(`[${this.platformName} Subs] Cross-origin iframe detected, creating overlay in iframe`);
      document.body.appendChild(overlay);

      // Make overlay escape iframe bounds with absolute positioning
      overlay.style.position = 'fixed';
      overlay.style.zIndex = '2147483647'; // Maximum z-index
    }

    this.subtitleOverlay = overlay;

    // Center overlay with video dynamically
    this.centerOverlayWithVideo();

    return overlay;
  }

  centerOverlayWithVideo() {
    if (!this.subtitleOverlay || !this.currentVideo) return;

    const video = this.currentVideo;
    const overlay = this.subtitleOverlay;

    const updatePosition = () => {
      const rect = video.getBoundingClientRect();
      const videoCenter = rect.left + (rect.width / 2);

      overlay.style.left = `${videoCenter}px`;
      overlay.style.transform = 'translateX(-50%)';
    };

    // Update position initially
    updatePosition();

    // Update on window resize
    window.addEventListener('resize', updatePosition);

    // For YouTube: update when theater/fullscreen mode changes
    if (this.platformName === 'YouTube') {
      // Use MutationObserver to detect layout changes
      const observer = new MutationObserver(updatePosition);
      const playerContainer = document.querySelector('#movie_player, #player-container');
      if (playerContainer) {
        observer.observe(playerContainer, { attributes: true, attributeFilter: ['class'] });
      }
    }
  }

  /**
   * Create subtitle browser (sidebar with all subtitles)
   * @returns {HTMLElement} Browser element
   */
  createSubtitleBrowser() {
    if (this.subtitleBrowser) return this.subtitleBrowser;

    // Determine browser ID based on platform
    let browserId;
    if (this.platformName === 'YouTube') {
      browserId = window.DOM_IDS.YOUTUBE_BROWSER;
    } else if (this.platformName === 'Netflix') {
      browserId = window.DOM_IDS.NETFLIX_BROWSER;
    } else if (this.platformName === 'StreamIsrael') {
      browserId = window.DOM_IDS.STREAMISRAEL_BROWSER;
    } else {
      browserId = 'anki-subtitle-browser'; // Generic fallback
    }

    const browser = document.createElement('div');
    browser.id = browserId;
    browser.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 350px;
      height: 100vh;
      background: #0f0f0f;
      color: white;
      z-index: 9998;
      overflow-y: auto;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: -2px 0 10px rgba(0,0,0,0.5);
      border-left: 1px solid #333;
    `;

    // Create header
    const header = document.createElement('div');
    header.style.cssText = `
      position: sticky;
      top: 0;
      background: #0f0f0f;
      padding: 20px 20px 15px 20px;
      border-bottom: 2px solid #333;
      z-index: 10;
    `;

    // Title
    const title = document.createElement('div');
    title.textContent = `${this.platformName} Hebrew Subtitles`;
    title.style.cssText = `
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
      color: white;
    `;
    header.appendChild(title);

    // Comprehension stats
    const statsContainer = document.createElement('div');
    statsContainer.style.cssText = `
      background: #1a1a1a;
      padding: 12px;
      border-radius: 6px;
      margin-bottom: 12px;
    `;

    const percentageDiv = document.createElement('div');
    percentageDiv.style.cssText = `
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 4px;
    `;
    percentageDiv.id = `${browserId}-percentage`;
    percentageDiv.textContent = '0%';

    const statsDetail = document.createElement('div');
    statsDetail.style.cssText = `
      font-size: 13px;
      color: #aaa;
    `;
    statsDetail.id = `${browserId}-stats-detail`;
    statsDetail.textContent = '(0 / 0 words)';

    const i1Count = document.createElement('div');
    i1Count.style.cssText = `
      font-size: 14px;
      color: #aaa;
      margin-top: 6px;
    `;
    i1Count.id = `${browserId}-i1-count`;
    i1Count.textContent = '📚 0 i+1 sentences';

    const potentiallyKnownCount = document.createElement('div');
    potentiallyKnownCount.style.cssText = `
      font-size: 13px;
      color: #9370db;
      margin-top: 4px;
    `;
    potentiallyKnownCount.id = `${browserId}-potentially-known-count`;
    potentiallyKnownCount.textContent = '🟣 0 potentially known';

    const potentiallyI1Count = document.createElement('div');
    potentiallyI1Count.style.cssText = `
      font-size: 13px;
      color: #9370db;
      margin-top: 2px;
    `;
    potentiallyI1Count.id = `${browserId}-potentially-i1-count`;
    potentiallyI1Count.textContent = '🟣 0 potentially i+1';

    statsContainer.appendChild(percentageDiv);
    statsContainer.appendChild(statsDetail);
    statsContainer.appendChild(i1Count);
    statsContainer.appendChild(potentiallyKnownCount);
    statsContainer.appendChild(potentiallyI1Count);
    header.appendChild(statsContainer);

    // Toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = 'Hide';
    toggleBtn.style.cssText = `
      width: 100%;
      padding: 8px;
      background: #0066ff;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    `;
    // Create show button (initially hidden)
    const showBtn = document.createElement('button');
    showBtn.textContent = '📖 Show Sub Browser';
    showBtn.style.cssText = `
      position: fixed;
      top: 100px;
      right: 20px;
      padding: 12px 16px;
      background: #0066ff;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: move;
      font-size: 14px;
      font-weight: 600;
      z-index: 9999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      display: none;
      user-select: none;
    `;

    // Make show button draggable
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;

    showBtn.addEventListener('mousedown', (e) => {
      isDragging = true;
      initialX = e.clientX - (parseInt(showBtn.style.left) || 0);
      initialY = e.clientY - (parseInt(showBtn.style.top) || 0);
      showBtn.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        showBtn.style.left = currentX + 'px';
        showBtn.style.top = currentY + 'px';
        showBtn.style.right = 'auto';
      }
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        showBtn.style.cursor = 'move';
      }
    });

    // Show button click - restore browser
    showBtn.addEventListener('click', (e) => {
      if (!isDragging) {
        browser.style.display = 'block';
        showBtn.style.display = 'none';
      }
    });

    // Append show button to body
    try {
      const isInIframe = window.self !== window.top;
      if (isInIframe && window.top.document.body) {
        window.top.document.body.appendChild(showBtn);
      } else {
        document.body.appendChild(showBtn);
      }
    } catch (e) {
      document.body.appendChild(showBtn);
    }

    // Toggle button - hide browser and show the show button
    toggleBtn.addEventListener('click', () => {
      browser.style.display = 'none';
      showBtn.style.display = 'block';
    });
    header.appendChild(toggleBtn);

    browser.appendChild(header);

    // Subtitles container
    const container = document.createElement('div');
    container.id = `${browserId}-list`;
    container.style.cssText = `
      padding: 10px;
    `;
    browser.appendChild(container);

    // If we're in an iframe, try to append to parent document
    const isInIframe = window.self !== window.top;
    try {
      if (isInIframe && window.top.document.body) {
        window.top.document.body.appendChild(browser);
        console.log(`[${this.platformName} Subs] Created browser in parent page`);
      } else {
        document.body.appendChild(browser);
        console.log(`[${this.platformName} Subs] Created browser in current page`);
      }
    } catch (e) {
      // Cross-origin restriction - create browser in iframe but position it over the video
      console.log(`[${this.platformName} Subs] Cross-origin iframe detected - creating browser in iframe with high z-index`);

      // Position browser on RIGHT side of video area (visible within iframe)
      browser.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        bottom: 100px;
        width: 350px;
        height: auto;
        background: rgba(15, 15, 15, 0.95);
        color: white;
        z-index: 2147483647;
        overflow-y: auto;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        box-shadow: 0 4px 20px rgba(0,0,0,0.8);
        border-radius: 8px;
        border: 2px solid #333;
      `;

      document.body.appendChild(browser);
      console.log(`[${this.platformName} Subs] Created browser in iframe (positioned over video)`);
    }

    this.subtitleBrowser = browser;
    return browser;
  }

  updateStatsDisplay() {
    if (!this.subtitleBrowser) return;

    let browserId;
    if (this.platformName === 'YouTube') {
      browserId = window.DOM_IDS.YOUTUBE_BROWSER;
    } else if (this.platformName === 'Netflix') {
      browserId = window.DOM_IDS.NETFLIX_BROWSER;
    } else if (this.platformName === 'StreamIsrael') {
      browserId = window.DOM_IDS.STREAMISRAEL_BROWSER;
    }
    const percentageText = document.getElementById(`${browserId}-percentage`);
    const statsText = document.getElementById(`${browserId}-stats-detail`);
    const i1Text = document.getElementById(`${browserId}-i1-count`);
    const potentiallyKnownText = document.getElementById(`${browserId}-potentially-known-count`);
    const potentiallyI1Text = document.getElementById(`${browserId}-potentially-i1-count`);

    if (percentageText) {
      percentageText.textContent = `${this.comprehensionStats.percentage}%`;

      const color = this.comprehensionStats.percentage >= window.COMPREHENSION_THRESHOLDS.HIGH ? window.COLORS.HIGH :
                    this.comprehensionStats.percentage >= window.COMPREHENSION_THRESHOLDS.MEDIUM ? window.COLORS.MEDIUM : window.COLORS.LOW;
      percentageText.style.color = color;
    }

    if (statsText) {
      statsText.textContent = `(${this.comprehensionStats.known} / ${this.comprehensionStats.total} words)`;
    }

    if (i1Text) {
      i1Text.textContent = `📚 ${this.comprehensionStats.i1Sentences} i+1 sentences`;
    }

    if (potentiallyKnownText) {
      potentiallyKnownText.textContent = `🟣 ${this.comprehensionStats.potentiallyKnown || 0} potentially known`;
    }

    if (potentiallyI1Text) {
      potentiallyI1Text.textContent = `🟣 ${this.comprehensionStats.potentiallyI1Sentences || 0} potentially i+1`;
    }
  }

  /**
   * Populate subtitle browser with subtitle items
   */
  async populateSubtitleBrowser() {
    console.log(`[${this.platformName} Subs] populateSubtitleBrowser called, subtitles:`, this.subtitles.length, 'isInCrossOriginIframe:', this.isInCrossOriginIframe);
    if (!this.subtitleBrowser || this.subtitles.length === 0) {
      console.log(`[${this.platformName} Subs] populateSubtitleBrowser aborted - browser:`, !!this.subtitleBrowser, 'subtitles:', this.subtitles.length);
      return;
    }

    let browserId;
    if (this.platformName === 'YouTube') {
      browserId = window.DOM_IDS.YOUTUBE_BROWSER;
    } else if (this.platformName === 'Netflix') {
      browserId = window.DOM_IDS.NETFLIX_BROWSER;
    } else if (this.platformName === 'StreamIsrael') {
      browserId = window.DOM_IDS.STREAMISRAEL_BROWSER;
    }

    const container = document.getElementById(`${browserId}-list`);
    if (!container) {
      console.log(`[${this.platformName} Subs] Container ${browserId}-list not found, aborting`);
      return;
    }

    // Get words and settings for i+1 detection
    const storage = await chrome.storage.local.get(['matureWords', 'learningWords', 'sentenceHighlightEnabled', 'sentenceColor']);
    const matureWords = storage.matureWords || [];
    const learningWords = storage.learningWords || [];
    const sentenceHighlightEnabled = storage.sentenceHighlightEnabled !== false;
    const sentenceColor = storage.sentenceColor || '#add8e6';

    container.innerHTML = '';

    this.subtitles.forEach((sub, index) => {
      const item = document.createElement('div');
      item.dataset.index = index;

      // Check if this subtitle is i+1 or potentially-i+1
      const isI1Sentence = sentenceHighlightEnabled && window.checkIfI1Sentence(sub.text, matureWords, learningWords);
      const isPotentiallyI1Sentence = sentenceHighlightEnabled && !isI1Sentence && window.checkIfPotentiallyI1Sentence(sub.text, matureWords, learningWords);

      item.style.cssText = `
        padding: 10px;
        margin-bottom: 8px;
        border-radius: 4px;
        cursor: pointer;
        border: 2px solid transparent;
        transition: border-color 0.2s;
      `;

      // Set background color separately to ensure it applies
      let backgroundColor = '#1a1a1a';
      if (isI1Sentence) {
        backgroundColor = sentenceColor;  // Light blue
      } else if (isPotentiallyI1Sentence) {
        backgroundColor = '#e6d5f5';  // Light purple
      }
      item.style.backgroundColor = backgroundColor;

      // Store sentence text for card creation
      item.dataset.ankiSentence = sub.text;

      // Mark i+1 and potentially-i+1 sentences and set appropriate tooltip
      if (isI1Sentence) {
        item.classList.add('anki-i1-sentence');
        item.title = 'i+1 sentence - Shift+Click to create Anki card';
      } else if (isPotentiallyI1Sentence) {
        item.classList.add('anki-potentially-i1-sentence');
        item.title = 'Potentially i+1 sentence - Shift+Click to create Anki card';
      } else {
        item.title = 'Click to seek | Shift+Click to create Anki card';
      }

      item.addEventListener('mouseenter', () => {
        item.style.borderColor = '#0066ff';
      });

      item.addEventListener('mouseleave', () => {
        if (parseInt(item.dataset.index) !== this.currentSubtitleIndex) {
          item.style.borderColor = 'transparent';
        }
      });

      // Add click handlers
      item.addEventListener('click', async (e) => {
        // Shift+click opens card creator for any subtitle
        if (e.shiftKey && window.openAnkiModal) {
          e.preventDefault();
          e.stopPropagation();

          // Clear any existing text selection
          if (window.getSelection) {
            window.getSelection().removeAllRanges();
          }

          // Record audio for this subtitle
          const audioFilename = await this.recordSubtitleAudio(sub);

          // Provide callback to get word lists from storage
          const getWordsCallback = async () => {
            const data = await chrome.storage.local.get(['matureWords', 'learningWords']);
            return {
              matureWords: data.matureWords || [],
              learningWords: data.learningWords || []
            };
          };

          window.openAnkiModal(sub.text, getWordsCallback, audioFilename);
          return;
        }

        // Regular click seeks to time (if enabled)
        if (this.enableClickToSeek !== false && this.currentVideo) {
          // Use platform-specific seek if available, otherwise direct seek
          if (typeof this.seekToTime === 'function') {
            await this.seekToTime(sub.startTime);
          } else {
            this.currentVideo.currentTime = sub.startTime;
          }
        }
      });

      // Timestamp
      const timestamp = document.createElement('div');
      timestamp.textContent = window.formatTimestamp(sub.startTime, sub.endTime);
      const timestampColor = (isI1Sentence || isPotentiallyI1Sentence) ? '#000' : '#aaa';
      timestamp.style.cssText = `
        font-size: 12px;
        color: ${timestampColor};
        margin-bottom: 6px;
      `;
      item.appendChild(timestamp);

      // Text
      const text = document.createElement('div');
      const displayText = window.stripNikud(sub.text, this.stripNikudEnabled);
      text.textContent = displayText;
      const textColor = (isI1Sentence || isPotentiallyI1Sentence) ? '#000' : 'inherit';
      text.style.cssText = `
        font-size: 24px;
        direction: rtl;
        line-height: 1.4;
        color: ${textColor};
      `;
      item.appendChild(text);

      container.appendChild(item);
    });
  }

  /**
   * Update current subtitle in overlay and highlight in browser
   */
  updateCurrentSubtitle() {
    if (!this.currentVideo || this.subtitles.length === 0) return;

    const currentTime = this.currentVideo.currentTime;

    // Find current subtitle
    let foundIndex = -1;
    for (let i = 0; i < this.subtitles.length; i++) {
      if (currentTime >= this.subtitles[i].startTime && currentTime <= this.subtitles[i].endTime) {
        foundIndex = i;
        break;
      }
    }

    // Debug: Log first few subtitle checks
    if (this.subtitles.length > 0 && !this._debugLogged) {
      console.log(`[${this.platformName} Subs] First subtitle check:`, {
        currentTime,
        firstSubStart: this.subtitles[0].startTime,
        firstSubEnd: this.subtitles[0].endTime,
        foundIndex
      });
      this._debugLogged = true;
    }

    // Only update if subtitle changed (prevents flicker)
    if (foundIndex !== this.currentSubtitleIndex) {
      console.log(`[${this.platformName} Subs] Subtitle changed to index:`, foundIndex);
      this.currentSubtitleIndex = foundIndex;

      if (this.subtitleOverlay) {
        if (foundIndex !== -1) {
          const sub = this.subtitles[foundIndex];
          const displayText = window.stripNikud(sub.text, this.stripNikudEnabled);

          console.log(`[${this.platformName} Subs] Showing subtitle:`, displayText.substring(0, 50));
          console.log(`[${this.platformName} Subs] Overlay element:`, {
            id: this.subtitleOverlay.id,
            parent: this.subtitleOverlay.parentElement?.tagName,
            display: this.subtitleOverlay.style.display,
            position: this.subtitleOverlay.style.position
          });

          // Hide, reset styles, update text
          this.subtitleOverlay.style.display = 'none';
          this.subtitleOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
          this.subtitleOverlay.style.color = 'white';
          this.subtitleOverlay.style.padding = '10px 20px';
          this.subtitleOverlay.classList.remove('anki-sentence-highlight');
          this.subtitleOverlay.textContent = displayText;

          // Dispatch event for word highlighting
          let eventName;
          if (this.platformName === 'YouTube') {
            eventName = 'ankiYouTubeSubtitleUpdated';
          } else if (this.platformName === 'Netflix') {
            eventName = 'ankiNetflixSubtitleUpdated';
          } else if (this.platformName === 'StreamIsrael') {
            eventName = 'ankiStreamIsraelSubtitleUpdated';
          } else {
            eventName = 'ankiSubtitleUpdated'; // Generic fallback
          }

          document.dispatchEvent(new CustomEvent(eventName, {
            detail: { element: this.subtitleOverlay, text: displayText }
          }));
        } else {
          this.subtitleOverlay.style.display = 'none';
        }
      }

      if (this.subtitleBrowser) {
        let browserId;
        if (this.platformName === 'YouTube') {
          browserId = window.DOM_IDS.YOUTUBE_BROWSER;
        } else if (this.platformName === 'Netflix') {
          browserId = window.DOM_IDS.NETFLIX_BROWSER;
        } else if (this.platformName === 'StreamIsrael') {
          browserId = window.DOM_IDS.STREAMISRAEL_BROWSER;
        }
        const container = document.getElementById(`${browserId}-list`);
        if (container) {
          const items = container.querySelectorAll('[data-index]');
          items.forEach((item, i) => {
            const isI1 = item.classList.contains('anki-i1-sentence');
            const isPotentiallyI1 = item.classList.contains('anki-potentially-i1-sentence');

            if (i === foundIndex) {
              item.style.borderColor = '#0066ff';
              // Set appropriate background: i+1 stays light blue, potentially-i+1 stays purple, others get gray
              if (isI1) {
                item.style.backgroundColor = '#add8e6'; // Light blue
              } else if (isPotentiallyI1) {
                item.style.backgroundColor = '#e6d5f5'; // Light purple
              } else {
                item.style.backgroundColor = '#272727';
              }
              item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
              item.style.borderColor = 'transparent';
              // Set appropriate background: i+1 stays light blue, potentially-i+1 stays purple, others get dark
              if (isI1) {
                item.style.backgroundColor = '#add8e6'; // Light blue
              } else if (isPotentiallyI1) {
                item.style.backgroundColor = '#e6d5f5'; // Light purple
              } else {
                item.style.backgroundColor = '#1a1a1a';
              }
            }

            // Maintain text colors for i+1 and potentially-i+1 items
            if (isI1 || isPotentiallyI1) {
              // Set color on the divs (for timestamp and non-highlighted text)
              const divElements = item.querySelectorAll('div');
              divElements.forEach(div => {
                div.style.color = '#000'; // Black text
              });
              // Set color on the word highlight spans (they have color: inherit)
              const spanElements = item.querySelectorAll('.anki-hebrew-highlight');
              spanElements.forEach(span => {
                span.style.color = '#000'; // Black text for word highlights
              });
            }
          });
        }
      }
    }
  }

  /**
   * Initialize subtitle reader
   * @param {string} languageCode - Language code to load
   */
  async initialize(languageCode = 'iw') {
    await this.loadStripNikudSetting();

    chrome.runtime.onMessage.addListener(async (message, _sender, _sendResponse) => {
      if (message.action === 'settingsUpdated') {
        this.stripNikudEnabled = message.settings.stripNikudEnabled;
        // Refresh displays
        await this.populateSubtitleBrowser();
        if (this.currentSubtitleIndex !== -1) {
          this.updateCurrentSubtitle();
        }
      }
    });

    document.addEventListener('ankiWordsRefreshed', async () => {
      if (this.subtitles.length > 0) {
        await this.calculateComprehensionStats();
        await this.populateSubtitleBrowser(); // Refresh i+1 highlighting
        this.updateStatsDisplay();
      }
    });

    this.currentVideo = this.detectVideo();
    if (!this.currentVideo) {
      console.log(`[${this.platformName} Subs] No video found yet, will retry`);
      return;
    }

    try {
      this.subtitles = await this.loadSubtitles(languageCode);

      if (this.subtitles && this.subtitles.length > 0) {
        console.log(`[${this.platformName} Subs] Loaded ${this.subtitles.length} subtitles`);

        this.createSubtitleOverlay();
        this.createSubtitleBrowser();

        await this.calculateComprehensionStats();

        await this.populateSubtitleBrowser();
        this.updateStatsDisplay();

        this.currentVideo = this.detectVideo();
        if (!this.currentVideo) {
          console.log(`[${this.platformName} Subs] Video was removed during initialization, aborting`);
          return;
        }

        this.currentVideo.addEventListener('timeupdate', () => {
          if (this.isEnabled) {
            this.updateCurrentSubtitle();
          }
        });

        console.log(`[${this.platformName} Subs] Initialization complete`);
      }
    } catch (error) {
      console.error(`[${this.platformName} Subs] Error loading subtitles:`, error);
    }
  }

  /**
   * Record audio for a subtitle time range
   * @param {Object} subtitle - Subtitle object with startTime and endTime
   * @returns {Promise<string|null>} Audio filename in Anki media folder, or null if failed
   */
  async recordSubtitleAudio(subtitle) {
    if (!this.currentVideo) {
      console.error(`[${this.platformName} Subs] No video element available for recording`);
      return null;
    }

    let destNode = null;
    let mediaRecorder = null;

    try {
      console.log(`[${this.platformName} Subs] Starting audio recording for subtitle:`, subtitle.text);

      // Save video state
      const wasMuted = this.currentVideo.muted;
      const originalVolume = this.currentVideo.volume;

      if (wasMuted) {
        console.log(`[${this.platformName} Subs] Video is muted, temporarily unmuting for recording`);
        this.currentVideo.muted = false;
      }

      // Initialize Web Audio API once per video element
      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        this.audioSourceNode = this.audioContext.createMediaElementSource(this.currentVideo);
        // Keep source connected to speakers for normal playback
        this.audioSourceNode.connect(this.audioContext.destination);
        console.log(`[${this.platformName} Subs] Web Audio API initialized`);
      }

      // Create recording destination
      destNode = this.audioContext.createMediaStreamDestination();
      this.audioSourceNode.connect(destNode);

      console.log(`[${this.platformName} Subs] Recording stream connected`);

      // Use MediaRecorder to record audio
      const audioChunks = [];
      mediaRecorder = new MediaRecorder(destNode.stream, { mimeType: 'audio/webm' });

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      const duration = subtitle.endTime - subtitle.startTime;

      const recordingPromise = new Promise((resolve, reject) => {
        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          resolve(audioBlob);
        };
        mediaRecorder.onerror = (error) => {
          reject(error);
        };
      });

      await new Promise((resolve) => {
        const onSeeked = () => {
          this.currentVideo.removeEventListener('seeked', onSeeked);
          resolve();
        };
        this.currentVideo.addEventListener('seeked', onSeeked);

        // Use platform-specific seek if available (e.g., Netflix requires special API)
        if (typeof this.seekToTime === 'function') {
          this.seekToTime(subtitle.startTime);
        } else {
          this.currentVideo.currentTime = subtitle.startTime;
        }
      });

      mediaRecorder.start();
      console.log(`[${this.platformName} Subs] Recording started at ${subtitle.startTime}s`);

      const wasPlaying = !this.currentVideo.paused;
      await this.currentVideo.play();

      await new Promise(resolve => setTimeout(resolve, duration * 1000));
      mediaRecorder.stop();

      if (!wasPlaying) {
        this.currentVideo.pause();
      }

      // Restore video state
      if (wasMuted) {
        this.currentVideo.muted = true;
      }
      this.currentVideo.volume = originalVolume;

      console.log(`[${this.platformName} Subs] Recording stopped, waiting for data...`);

      const audioBlob = await recordingPromise;
      console.log(`[${this.platformName} Subs] Audio blob created, size: ${audioBlob.size} bytes`);

      // Small delay to let MediaRecorder fully release resources
      await new Promise(resolve => setTimeout(resolve, 100));

      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onloadend = () => {
          const base64 = reader.result.split(',')[1]; // Remove data:audio/webm;base64, prefix
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await base64Promise;

      // Generate filename using timestamp and first few words
      const timestamp = Date.now();
      const textPreview = subtitle.text.split(' ').slice(0, 3).join('_').replace(/[^\u0590-\u05FF\w]/g, '');
      const filename = `subtitle_${timestamp}_${textPreview}.webm`;

      console.log(`[${this.platformName} Subs] Storing audio in Anki as: ${filename}`);

      // Store in Anki via AnkiConnect
      const response = await chrome.runtime.sendMessage({
        action: 'ankiStoreMediaFile',
        filename: filename,
        data: base64Audio
      });

      // Disconnect recording destination (but keep source connected to speakers)
      if (destNode) {
        this.audioSourceNode.disconnect(destNode);
        console.log(`[${this.platformName} Subs] Recording stream disconnected`);
      }

      if (response && response.success) {
        console.log(`[${this.platformName} Subs] Audio successfully stored in Anki`);
        return filename;
      } else {
        console.error(`[${this.platformName} Subs] Failed to store audio in Anki:`, response?.error);
        return null;
      }

    } catch (error) {
      console.error(`[${this.platformName} Subs] Error recording audio:`, error);
      // Disconnect recording destination on error (but keep source connected to speakers)
      if (destNode && this.audioSourceNode) {
        try {
          this.audioSourceNode.disconnect(destNode);
        } catch (e) {
          // Ignore disconnect errors
        }
      }
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.subtitleOverlay) {
      this.subtitleOverlay.remove();
      this.subtitleOverlay = null;
    }
    if (this.subtitleBrowser) {
      this.subtitleBrowser.remove();
      this.subtitleBrowser = null;
    }
    this.subtitles = [];
    this.currentSubtitleIndex = -1;
    this.currentVideo = null;
  }
}

  // Expose to global scope
  window.SubtitleReaderBase = SubtitleReaderBase;
})();
