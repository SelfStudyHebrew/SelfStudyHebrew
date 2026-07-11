const ANKI_CONNECT_URL = 'http://localhost:8765';
const DEFAULT_SETTINGS = {
  sentenceColor: '#5a7fff',   // Sentences with 1 unknown word (blue)
  fieldName: 'Hebrew',
  deckFilter: '',
  highlightEnabled: true,
  sentenceHighlightEnabled: true,  // Highlight i+1 sentences
  stripNikudEnabled: false,  // Strip nikud (vowel marks) from Hebrew text
  matureThreshold: 21,  // Days - cards with interval >= this are "mature"
  claudeApiKey: '',  // Claude API key for AI features
  claudeModel: 'claude-sonnet-4-6',  // Claude model ID for AI features
  elevenLabsApiKey: '',  // ElevenLabs API key for TTS audio generation
  elevenLabsVoiceId: 'Jrq4GqCKqYpigdQsZRkP',  // Default voice (Anatole)
  elevenLabsModel: 'eleven_v3',  // ElevenLabs TTS model ID
  defaultDeck: 'Sentence Mining',  // Default deck for card creation
  defaultNoteType: 'SelfStudyHebrew',  // Default note type for card creation
  audioFieldName: 'Audio',  // Field name for subtitle audio recordings
  autoExportEnabled: true,  // Auto-export custom definitions on change
  autoExportFilename: 'selfstudyhebrew-custom-definitions.json',  // Filename for auto-export
  maxWordsForI1: 3000,  // Max known words to send for i+1 generation (top frequent + random sampling)
  sentenceGenerationPrompt: `TARGET WORD (unknown to student): {{TARGET_WORD}}

Generate {{COUNT}} natural Hebrew sentences following these rules:

1. Each sentence MUST contain the exact target word "{{TARGET_WORD}}" with no modifications (No added prefixes/prepositions)
2. All other words MUST come from the known words list only
3. You MAY add prefixes/prepositions to known words when grammatically necessary, but not the target word as this should not be modified. For example, if the target word is בר then you should NOT change it to לבר or הבר or ובר
4. Sentences must be natural, grammatically correct Hebrew that native speakers would use
5. Vary sentence structure, context, and length
6. Keep sentences simple but meaningful

CRITICAL CONSTRAINTS:
- Do NOT use any words outside the known words list (except the target word)
- Do NOT modify the target word itself (no prefixes/suffixes unless the word already has them)
- Do NOT add explanations, translations, or numbering

OUTPUT FORMAT: Return ONLY {{COUNT}} Hebrew sentences, one per line, nothing else.`,
  aiDefinePrompt: ''  // Empty = use DEFAULT_DEFINE_PROMPT (defined later in this file)
};

const DB_NAME = 'HebrewDictionary';
const DB_VERSION = 1;
const STORE_NAME = 'words';
let db = null;
let dictionariesLoaded = false;

let frequencyData = null;

function openDictionaryDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'normalized' });
        objectStore.createIndex('term', 'term', { unique: false });
      }
    };
  });
}

async function loadFrequencyData() {
  if (frequencyData) return; // Already loaded

  try {
    console.log('Loading frequency data...');
    const url = chrome.runtime.getURL('src/dictionary/frequency.json');
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    frequencyData = await response.json();
    console.log(`✓ Frequency data loaded: ${frequencyData.length} words`);
  } catch (error) {
    console.error('Error loading frequency data:', error);
    frequencyData = []; // Set to empty array to prevent repeated attempts
  }
}

async function sampleKnownWords(knownWords, maxWords) {
  if (knownWords.length <= maxWords) {
    console.log(`[i+1 Sampling] Using all ${knownWords.length} known words (under limit)`);
    return knownWords;
  }

  await loadFrequencyData();

  if (!frequencyData || frequencyData.length === 0) {
    console.log('[i+1 Sampling] No frequency data, using random sample');
    const shuffled = [...knownWords].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, maxWords);
  }

  const frequencyRank = new Map();
  frequencyData.forEach((word, index) => {
    const normalized = word.replace(/[\u0591-\u05C7]/g, '');
    frequencyRank.set(normalized, index);
  });

  const sortedByFrequency = [...knownWords].sort((a, b) => {
    const rankA = frequencyRank.get(a) ?? Infinity;
    const rankB = frequencyRank.get(b) ?? Infinity;
    return rankA - rankB;
  });

  const topCount = Math.floor(maxWords / 2);
  const topFrequent = sortedByFrequency.slice(0, topCount);

  const remaining = sortedByFrequency.slice(topCount);
  const randomCount = maxWords - topCount;

  const shuffled = remaining.sort(() => Math.random() - 0.5);
  const randomSample = shuffled.slice(0, randomCount);

  const result = [...topFrequent, ...randomSample];

  console.log(`[i+1 Sampling] Sampled ${result.length} words from ${knownWords.length} (${topFrequent.length} frequent + ${randomSample.length} random)`);

  return result;
}

async function loadDictionaries() {
  if (dictionariesLoaded) return;

  try {
    console.log('Opening dictionary database...');
    db = await openDictionaryDB();

    const count = await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });

    if (count > 0) {
      console.log(`✓ Dictionary already loaded with ${count} entries`);
      dictionariesLoaded = true;
      return;
    }

    console.log('Loading dictionaries into IndexedDB...');

    const dictFiles = [
      'dictionaries/d1.json',
      'dictionaries/d2-part1.json',
      'dictionaries/d2-part2.json',
      'dictionaries/d2-part3.json',
    ];

    for (const file of dictFiles) {
      try {
        console.log(`Loading ${file}...`);
        const url = chrome.runtime.getURL(file);
        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`✓ Fetched ${file}: ${data.length} entries`);

        const batchSize = 1000;
        for (let i = 0; i < data.length; i += batchSize) {
          const batch = data.slice(i, i + batchSize);
          await new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            batch.forEach(entry => {
              const normalized = (entry.term || '').replace(/[\u0591-\u05C7]/g, '');
              if (normalized) {
                let definitions = entry.definition || [];
                if (typeof definitions === 'string') {
                  definitions = [definitions];
                } else if (!Array.isArray(definitions)) {
                  definitions = [];
                }

                store.put({
                  normalized: normalized,
                  term: entry.term,
                  definitions: definitions,
                  pos: entry.pos || ''
                });
              }
            });

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
          });

          if ((i + batchSize) % 10000 === 0) {
            console.log(`  Progress: ${Math.min(i + batchSize, data.length)}/${data.length}`);
          }
        }

        console.log(`✓ Indexed ${file}`);
      } catch (error) {
        console.error(`✗ Error loading ${file}:`, error.message);
      }
    }

    const finalCount = await new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const countRequest = store.count();
      countRequest.onsuccess = () => resolve(countRequest.result);
      countRequest.onerror = () => reject(countRequest.error);
    });

    console.log(`✓ Dictionary database ready with ${finalCount} entries`);
    dictionariesLoaded = true;
  } catch (error) {
    console.error('Error loading dictionaries:', error);
    dictionariesLoaded = true;
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  console.log('SelfStudyHebrew installed');

  const settings = await chrome.storage.local.get('settings');
  if (!settings.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }

  await loadDictionaries();
});

chrome.runtime.onStartup.addListener(async () => {
  await loadDictionaries();
});


async function ankiConnectInvoke(action, params = {}) {
  const response = await fetch(ANKI_CONNECT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: action,
      version: 6,
      params: params
    })
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return data.result;
}

async function setupAnkiForSelfStudyHebrew() {
  try {
    const existingDecks = await ankiConnectInvoke('deckNames');

    if (!existingDecks.includes('Already Known')) {
      await ankiConnectInvoke('createDeck', { deck: 'Already Known' });
      console.log('✓ Created Already Known deck');
    } else {
      console.log('Already Known deck already exists');
    }

    if (!existingDecks.includes('Sentence Mining')) {
      await ankiConnectInvoke('createDeck', { deck: 'Sentence Mining' });
      console.log('✓ Created Sentence Mining deck');
    } else {
      console.log('Sentence Mining deck already exists');
    }

    try {
      const selfStudyConfigId = await ankiConnectInvoke('cloneDeckConfigId', {
        name: 'SelfStudyHebrew',
        cloneFrom: '1'  // Clone from Default
      });
      console.log('✓ Created SelfStudyHebrew deck preset');

      const deckConfig = await ankiConnectInvoke('getDeckConfig', { deck: 'Sentence Mining' });

      const updatedConfig = {
        ...deckConfig,
        id: selfStudyConfigId,
        name: 'SelfStudyHebrew',
        new: {
          ...deckConfig.new,
          perDay: 5
        },
        rev: {
          ...deckConfig.rev,
          perDay: 9999
        },
        fsrs: true,
        desiredRetention: 0.85
      };

      await ankiConnectInvoke('saveDeckConfig', { config: updatedConfig });

      await ankiConnectInvoke('setDeckConfigId', {
        decks: ['Sentence Mining'],
        configId: selfStudyConfigId
      });

      console.log('✓ Configured Sentence Mining deck');
    } catch (configError) {
      console.warn('Could not configure deck settings:', configError.message);
    }

    const SSH_CSS = `
      .card {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 18px;
        text-align: center;
        color: #ededf5;
        background-color: #0b0b10;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0;
        padding: 0;
      }

      .card-inner {
        width: 100%;
        max-width: 560px;
        padding: 32px 24px;
      }

      .hebrew {
        font-family: Arial, sans-serif;
        font-size: 36px;
        font-weight: 500;
        direction: rtl;
        line-height: 1.5;
        color: #ededf5;
        margin-bottom: 24px;
        letter-spacing: 0.01em;
      }

      hr#answer {
        border: none;
        border-top: 1px solid #2c2c3e;
        margin: 24px 0;
      }

      .english {
        font-size: 20px;
        color: #ededf5;
        margin-bottom: 12px;
        line-height: 1.5;
      }

      .notes {
        font-size: 15px;
        color: #8f8fa8;
        margin-top: 16px;
        line-height: 1.6;
        background: #13131a;
        border: 1px solid #2c2c3e;
        border-radius: 8px;
        padding: 12px 16px;
        text-align: left;
      }

      .audio-wrap {
        margin-top: 20px;
      }

      /* Night mode — already dark, so no changes needed */
      .night_mode .card {
        background-color: #0b0b10;
        color: #ededf5;
      }
    `;

    const SSH_FRONT = `<div class="card-inner">
  <div class="hebrew">{{Hebrew}}</div>
</div>`;

    const SSH_BACK = `<div class="card-inner">
  <div class="hebrew">{{Hebrew}}</div>

  <hr id=answer>

  <div class="english">{{English}}</div>

  {{#Notes}}
  <div class="notes">{{Notes}}</div>
  {{/Notes}}

  <div class="audio-wrap">{{Audio}}</div>
</div>`;

    const existingModels = await ankiConnectInvoke('modelNames');

    if (!existingModels.includes('SelfStudyHebrew')) {
      await ankiConnectInvoke('createModel', {
        modelName: 'SelfStudyHebrew',
        inOrderFields: ['Hebrew', 'English', 'Notes', 'Audio'],
        css: SSH_CSS,
        cardTemplates: [{ Name: 'Card 1', Front: SSH_FRONT, Back: SSH_BACK }]
      });
      console.log('✓ Created SelfStudyHebrew note type');
    } else {
      // Update existing note type styling and templates
      await ankiConnectInvoke('updateModelStyling', {
        model: { name: 'SelfStudyHebrew', css: SSH_CSS }
      });
      await ankiConnectInvoke('updateModelTemplates', {
        model: {
          name: 'SelfStudyHebrew',
          templates: { 'Card 1': { Front: SSH_FRONT, Back: SSH_BACK } }
        }
      });
      console.log('✓ Updated SelfStudyHebrew note type');
    }

    return {
      success: true,
      message: 'Setup completed! Created: Already Known deck, Sentence Mining deck with SelfStudyHebrew preset (5 new/day, 9999 reviews/day), and SelfStudyHebrew note type.\n\nNote: Please manually enable FSRS in Anki (Sentence Mining → Options → Enable FSRS toggle, set retention to 85%).'
    };
  } catch (error) {
    console.error('Error setting up Anki:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

async function fetchHebrewWords() {
  try {
    const settings = await chrome.storage.local.get('settings');
    const fieldName = settings.settings?.fieldName || 'Hebrew';
    const deckFilter = settings.settings?.deckFilter || '';
    const matureThreshold = settings.settings?.matureThreshold || 21;

    let query = `${fieldName}:*`;
    if (deckFilter) {
      query = `deck:"${deckFilter}" ${query}`;
    }

    const cardIds = await ankiConnectInvoke('findCards', {
      query: query
    });

    if (!cardIds || cardIds.length === 0) {
      console.log('No cards found with Hebrew field');
      return { mature: [], learning: [] };
    }

    const cardsInfo = await ankiConnectInvoke('cardsInfo', {
      cards: cardIds
    });

    const noteIds = [...new Set(cardsInfo.map(card => card.note))];
    const notesInfo = await ankiConnectInvoke('notesInfo', {
      notes: noteIds
    });

    const hebrewRegex = /[\u0590-\u05FF]+(?:[״"׳\u201C\u201D\u2018\u2019][\u0590-\u05FF]+)*/g;
    const noteWordsMap = new Map();

    notesInfo.forEach(note => {
      const hebrewField = note.fields[fieldName];
      if (hebrewField && hebrewField.value) {
        // Strip HTML tags and square brackets
        let text = hebrewField.value.replace(/<[^>]*>/g, ' ');
        text = text.replace(/\[[^\]]*\]/g, ' '); // Remove [bracketed content]

        // Extract Hebrew words
        const matches = text.match(hebrewRegex);
        if (matches) {
          const words = matches.map(word => {
            return word.replace(/[\u0591-\u05C7]/g, '');
          }).filter(w => w.length > 0);
          noteWordsMap.set(note.noteId, words);
        }
      }
    });

    const matureWords = new Set();
    const learningWords = new Set();

    cardsInfo.forEach(card => {
      const words = noteWordsMap.get(card.note);
      if (!words) return;

      const interval = card.interval || 0;
      const cardType = card.type;

      words.forEach(word => {
        if (cardType === 2 && interval >= matureThreshold) {
          matureWords.add(word);
          learningWords.delete(word);
        }
        else if ((cardType === 1) || (cardType === 2 && interval > 0 && interval < matureThreshold)) {
          if (!matureWords.has(word)) {
            learningWords.add(word);
          }
        }
      });
    });

    try {
      const alreadyKnownQuery = `deck:"Already Known" ${fieldName}:*`;
      const alreadyKnownCardIds = await ankiConnectInvoke('findCards', {
        query: alreadyKnownQuery
      });

      if (alreadyKnownCardIds && alreadyKnownCardIds.length > 0) {
        const alreadyKnownCardsInfo = await ankiConnectInvoke('cardsInfo', {
          cards: alreadyKnownCardIds
        });
        const alreadyKnownNoteIds = [...new Set(alreadyKnownCardsInfo.map(card => card.note))];
        const alreadyKnownNotesInfo = await ankiConnectInvoke('notesInfo', {
          notes: alreadyKnownNoteIds
        });

        alreadyKnownNotesInfo.forEach(note => {
          const hebrewField = note.fields[fieldName];
          if (hebrewField && hebrewField.value) {
            let text = hebrewField.value.replace(/<[^>]*>/g, ' ');
            text = text.replace(/\[[^\]]*\]/g, ' ');
            const matches = text.match(hebrewRegex);
            if (matches) {
              const words = matches.map(word => {
                return word.replace(/[\u0591-\u05C7]/g, '');
              }).filter(w => w.length > 0);

              words.forEach(word => {
                matureWords.add(word);
                learningWords.delete(word);
              });
            }
          }
        });

        console.log(`Added ${alreadyKnownCardIds.length} cards from Already Known deck`);
      }
    } catch (error) {
      console.warn('Could not fetch Already Known deck (deck may not exist yet):', error.message);
    }

    const matureArray = Array.from(matureWords).sort();
    const learningArray = Array.from(learningWords).sort();

    await chrome.storage.local.set({
      matureWords: matureArray,
      learningWords: learningArray,
      hebrewWords: matureArray, // Backward compatibility
      lastUpdated: Date.now()
    });

    console.log(`Fetched ${matureArray.length} mature + ${learningArray.length} learning Hebrew words from Anki`);
    return { mature: matureArray, learning: learningArray };

  } catch (error) {
    console.error('Error fetching Hebrew words:', error);
    throw error;
  }
}

async function checkAnkiConnect() {
  try {
    await ankiConnectInvoke('version');
    return true;
  } catch (error) {
    return false;
  }
}

async function callClaudeAPI(apiKey, prompt, options = {}) {
  let messages;
  if (typeof prompt === 'string') {
    messages = [{
      role: 'user',
      content: prompt
    }];
  } else if (Array.isArray(prompt)) {
    // Structured messages for prompt caching
    messages = [{
      role: 'user',
      content: prompt
    }];
  } else {
    throw new Error('Invalid prompt type');
  }

  const requestBody = {
    model: options.model || DEFAULT_SETTINGS.claudeModel,
    max_tokens: options.max_tokens || 1024,
    messages: messages
  };

  if (options.system) {
    requestBody.system = options.system;
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return { text: data.content[0].text, usage: data.usage || {} };
}

// Add cost to the running total in storage
async function accumulateSpend(cost) {
  if (!cost) return;
  const data = await chrome.storage.local.get('claudeSpendTotal');
  await chrome.storage.local.set({ claudeSpendTotal: (data.claudeSpendTotal || 0) + cost });
}

// Calculate cost of a Claude API call from usage metadata
function calculateClaudeCost(usage, model) {
  const m = (model || '').toLowerCase();
  let pricing;
  if (m.includes('haiku')) {
    pricing = { input: 0.80, output: 4.0, cacheWrite: 1.0, cacheRead: 0.08 };
  } else if (m.includes('opus')) {
    pricing = { input: 15.0, output: 75.0, cacheWrite: 18.75, cacheRead: 1.5 };
  } else {
    // Sonnet (default)
    pricing = { input: 3.0, output: 15.0, cacheWrite: 3.75, cacheRead: 0.30 };
  }
  const cacheCreation = usage.cache_creation_input_tokens || 0;
  const cacheRead = usage.cache_read_input_tokens || 0;
  const plainInput = Math.max(0, (usage.input_tokens || 0) - cacheCreation - cacheRead);
  return (
    (plainInput      / 1_000_000) * pricing.input +
    ((usage.output_tokens || 0) / 1_000_000) * pricing.output +
    (cacheCreation   / 1_000_000) * pricing.cacheWrite +
    (cacheRead       / 1_000_000) * pricing.cacheRead
  );
}

async function generateElevenLabsAudio(text, apiKey, voiceId, model) {
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text: text,
      model_id: model || DEFAULT_SETTINGS.elevenLabsModel,
      language_code: 'he',
      voice_settings: {
        stability: 1.0,
        similarity_boost: 0.75
      }
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail?.message || `ElevenLabs error: ${response.status}`);
  }

  // Convert audio buffer to base64
  const arrayBuffer = await response.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  const base64Audio = btoa(binary);

  // Store in Anki and return filename + audio data for playback
  const filename = `elevenlabs_${Date.now()}.mp3`;
  await ankiConnectInvoke('storeMediaFile', {
    filename: filename,
    data: base64Audio
  });

  return { filename, audioData: base64Audio };
}

async function translateSentence(sentence, apiKey, model) {
  const prompt = `Translate the following Hebrew sentence to English. Provide only the English translation, nothing else:\n\n${sentence}`;
  const { text, usage } = await callClaudeAPI(apiKey, prompt, { model });
  return { text, cost: calculateClaudeCost(usage, model) };
}

const DEFAULT_DEFINE_PROMPT = `Hebrew sentence: {{SENTENCE}}

Define the word "{{WORD}}" as it appears in that sentence.

Use exactly this HTML format — bold each label, each entry on its own line with no blank lines:

<b>TYPE:</b> [part of speech — Verb / Noun / Adjective / Adverb / Preposition / Conjunction / Pronoun / Particle / etc.]
<b>ROOT:</b> [Hebrew root letters separated by dashes, e.g. פ - ת - ח]
<b>MEANING:</b> [core meaning(s), including all persons/genders/numbers the form covers where relevant, e.g. "is opened / has been opened"]

If the word is a verb, add these two lines immediately after MEANING:
<b>TENSE:</b> [Present / Past / Future / Imperative, plus person/gender/number where applicable]
<b>INFINITIVE:</b> [infinitive form in Hebrew followed by its English meaning in parentheses, e.g. להיפתח (To Be Opened)]

Then always end with:
<b>CONTEXT:</b> [what the word means specifically in this sentence — emotional, literal, idiomatic, etc.]

If context alone cannot disambiguate between multiple distinct meanings, list each possibility under MEANING before giving the best-guess CONTEXT.
Output only the formatted definition — no preamble, no explanation.`;

async function defineWord(sentence, unknownWord, apiKey, model, customPrompt) {
  const template = customPrompt || DEFAULT_DEFINE_PROMPT;
  const prompt = template
    .replace(/\{\{SENTENCE\}\}/g, sentence)
    .replace(/\{\{WORD\}\}/g, unknownWord);
  const { text, usage } = await callClaudeAPI(apiKey, prompt, { model });
  return { text, cost: calculateClaudeCost(usage, model) };
}

async function defineWords(sentence, unknownWords, apiKey, model, customPrompt) {
  if (!unknownWords || unknownWords.length === 0) {
    return { text: 'No unknown words to define.', cost: 0 };
  }

  if (unknownWords.length === 1) {
    return await defineWord(sentence, unknownWords[0], apiKey, model, customPrompt);
  }

  // Multiple words: run each through the single-word prompt and concatenate
  let combinedText = '';
  let totalCost = 0;
  for (const word of unknownWords) {
    const { text, cost } = await defineWord(sentence, word, apiKey, model, customPrompt);
    combinedText += (combinedText ? '\n\n' : '') + `<b>${word}</b>\n${text}`;
    totalCost += cost;
  }
  return { text: combinedText, cost: totalCost };
}

async function generateI1SentencesForWord(targetWord, knownWords, count, apiKey, maxWords = 3000, model, customPrompt) {
  const sampledWords = await sampleKnownWords(knownWords, maxWords);

  const systemMessage = [
    {
      type: 'text',
      text: 'You are a Hebrew language teacher from Israel creating comprehensible input sentences for students.'
    },
    {
      type: 'text',
      text: `KNOWN WORDS (student already knows): ${sampledWords.join(', ')}`,
      cache_control: { type: 'ephemeral' }
    }
  ];

  const promptTemplate = customPrompt || DEFAULT_SETTINGS.sentenceGenerationPrompt;
  const userPrompt = promptTemplate
    .replace(/\{\{TARGET_WORD\}\}/g, targetWord)
    .replace(/\{\{COUNT\}\}/g, count);

  const { text, usage } = await callClaudeAPI(apiKey, userPrompt, { system: systemMessage, model });

  const sentences = text
    .split('\n')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.match(/^\d+[\.\)]/))
    .map(s => s.replace(/^[\d\.\)\-\s]+/, ''))
    .filter(s => s.length > 0)
    .slice(0, count);

  const cost = calculateClaudeCost(usage, model);
  return { sentences, cost, usage };
}

// Dictionary lookup function
async function lookupWord(word) {
  if (!word) {
    return [];
  }

  try {
    if (!db) {
      console.log('Opening DB for lookup...');
      db = await openDictionaryDB();
    }

    const normalizedWord = word.replace(/[\u0591-\u05C7]/g, '');
    console.log(`Looking up word: ${word} (normalized: ${normalizedWord})`);

    const dictionaryMatches = await new Promise((resolve, reject) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(normalizedWord);

        request.onsuccess = () => {
          const result = request.result;
          if (result) {
            console.log(`Found dictionary entry for ${normalizedWord}`);
            resolve([{
              term: result.term,
              definitions: result.definitions || [],
              pos: result.pos || '',
              source: 'dictionary'
            }]);
          } else {
            console.log(`No dictionary entry found for ${normalizedWord}`);
            resolve([]);
          }
        };
        request.onerror = () => {
          console.error('IndexedDB request error:', request.error);
          reject(request.error);
        };
      } catch (error) {
        console.error('Error creating transaction:', error);
        resolve([]); // Don't reject, just return empty
      }
    });

    const customDefs = await new Promise((resolve) => {
      chrome.storage.local.get('customDefinitions', (data) => {
        const customs = data.customDefinitions || {};
        const wordCustoms = customs[normalizedWord] || [];
        if (wordCustoms.length > 0) {
          console.log(`Found ${wordCustoms.length} custom definitions for ${normalizedWord}`);
        }
        resolve(wordCustoms);
      });
    });

    if (customDefs.length > 0) {
      dictionaryMatches.push({
        term: word,
        definitions: customDefs,
        pos: '',
        source: 'custom'
      });
    }

    return dictionaryMatches;
  } catch (error) {
    console.error('Error in lookupWord:', error);
    return [];
  }
}

async function autoExportCustomDefinitions() {
  try {
    const settingsData = await chrome.storage.local.get('settings');
    const settings = settingsData.settings || {};

    if (!settings.autoExportEnabled) {
      return;
    }

    const data = await chrome.storage.local.get('customDefinitions');
    const customDefinitions = data.customDefinitions || {};

    const dataStr = JSON.stringify(customDefinitions, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const filename = settings.autoExportFilename || 'selfstudyhebrew-custom-definitions.json';

    await chrome.downloads.download({
      url: url,
      filename: filename,
      conflictAction: 'overwrite',
      saveAs: false // Don't prompt user, use Downloads folder
    });

    console.log('[Auto-export] Custom definitions exported to:', filename);

    // Clean up blob URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    console.error('[Auto-export] Error exporting custom definitions:', error);
  }
}

// Add custom definition
async function addCustomDefinition(word, definition) {
  const normalizedWord = word.replace(/[\u0591-\u05C7]/g, '');

  return new Promise((resolve, reject) => {
    chrome.storage.local.get('customDefinitions', (data) => {
      const customs = data.customDefinitions || {};

      if (!customs[normalizedWord]) {
        customs[normalizedWord] = [];
      }

      // Add definition if not already present
      if (!customs[normalizedWord].includes(definition)) {
        customs[normalizedWord].push(definition);
      }

      chrome.storage.local.set({ customDefinitions: customs }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          // Trigger auto-export after successfully adding definition
          autoExportCustomDefinitions();
          resolve();
        }
      });
    });
  });
}

// Clear dictionary database
async function clearDictionaryDB() {
  return new Promise((resolve, reject) => {
    // Close existing connection
    if (db) {
      db.close();
      db = null;
    }

    // Delete the database
    const deleteRequest = indexedDB.deleteDatabase(DB_NAME);

    deleteRequest.onsuccess = () => {
      console.log('Dictionary database cleared successfully');
      dictionariesLoaded = false;
      resolve();
    };

    deleteRequest.onerror = () => {
      console.error('Error clearing dictionary database:', deleteRequest.error);
      reject(deleteRequest.error);
    };

    deleteRequest.onblocked = () => {
      console.warn('Dictionary database deletion blocked');
      reject(new Error('Database deletion blocked. Please close all tabs and try again.'));
    };
  });
}

// Action handlers object
const MESSAGE_HANDLERS = {
  setupAnki: (request, sender, sendResponse) => {
    setupAnkiForSelfStudyHebrew()
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  },

  fetchWords: (request, sender, sendResponse) => {
    fetchHebrewWords()
      .then(result => sendResponse({
        success: true,
        matureWords: result.mature,
        learningWords: result.learning,
        words: result.mature  // Backward compatibility
      }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Will respond asynchronously
  },

  checkAnkiConnect: (request, sender, sendResponse) => {
    checkAnkiConnect()
      .then(available => sendResponse({ available: available }))
      .catch(() => sendResponse({ available: false }));
    return true;
  },

  getWords: (request, sender, sendResponse) => {
    chrome.storage.local.get(['matureWords', 'learningWords', 'hebrewWords', 'lastUpdated'])
      .then(data => sendResponse({
        matureWords: data.matureWords || [],
        learningWords: data.learningWords || [],
        words: data.hebrewWords || [],  // Backward compatibility
        lastUpdated: data.lastUpdated
      }));
    return true;
  },

  getSettings: (request, sender, sendResponse) => {
    chrome.storage.local.get('settings')
      .then(data => sendResponse({ settings: data.settings || DEFAULT_SETTINGS }));
    return true;
  },

  saveSettings: (request, sender, sendResponse) => {
    chrome.storage.local.set({ settings: request.settings })
      .then(() => {
        // Notify all tabs that settings have been updated
        chrome.tabs.query({}, (tabs) => {
          tabs.forEach((tab) => {
            chrome.tabs.sendMessage(tab.id, {
              action: 'settingsUpdated',
              settings: request.settings
            }).catch(() => {
              // Ignore errors (tab might not have content script)
            });
          });
        });
        sendResponse({ success: true });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  toggleHighlight: async (request, sender, sendResponse) => {
    try {
      const data = await chrome.storage.local.get('settings');
      const settings = data.settings || DEFAULT_SETTINGS;
      settings.highlightEnabled = !settings.highlightEnabled;
      await chrome.storage.local.set({ settings });

      const updatedData = await chrome.storage.local.get('settings');
      sendResponse({
        success: true,
        enabled: updatedData.settings.highlightEnabled
      });
    } catch (error) {
      sendResponse({ success: false, error: error.message });
    }
    return true;
  },

  getDecks: (request, sender, sendResponse) => {
    ankiConnectInvoke('deckNames')
      .then(decks => sendResponse({ success: true, decks: decks }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  getModels: (request, sender, sendResponse) => {
    ankiConnectInvoke('modelNames')
      .then(models => sendResponse({ success: true, models: models }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  getModelFields: (request, sender, sendResponse) => {
    ankiConnectInvoke('modelFieldNames', { modelName: request.modelName })
      .then(fields => sendResponse({ success: true, fields: fields }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  createNote: (request, sender, sendResponse) => {
    const note = {
      deckName: request.deckName,
      modelName: request.modelName,
      fields: request.fields,
      tags: request.tags || []
    };

    ankiConnectInvoke('addNote', { note: note })
      .then(noteId => sendResponse({ success: true, noteId: noteId }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  ankiStoreMediaFile: (request, sender, sendResponse) => {
    ankiConnectInvoke('storeMediaFile', {
      filename: request.filename,
      data: request.data
    })
      .then(filename => sendResponse({ success: true, filename: filename }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  refreshWords: (request, sender, sendResponse) => {
    fetchHebrewWords()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  addToAlreadyKnown: (request, sender, sendResponse) => {
    (async () => {
      try {
        const word = request.word;

        // Escape double quotes for Anki search query
        const escapedWord = word.replace(/"/g, '\\"');

        // Check if word already exists in Already Known deck specifically
        const existingInAlreadyKnown = await ankiConnectInvoke('findNotes', {
          query: `"deck:Already Known" "Hebrew:${escapedWord}"`
        });

        if (existingInAlreadyKnown && existingInAlreadyKnown.length > 0) {
          // Word already in Already Known deck, skip
          sendResponse({ success: true, skipped: true, reason: 'Word already in Already Known deck' });
          return;
        }

        // Add to Already Known deck (allow duplicates from other decks)
        const note = {
          deckName: 'Already Known',
          modelName: 'Hebrew',
          fields: {
            'Hebrew': word
          },
          tags: ['am-known-manually'],
          options: {
            allowDuplicate: true
          }
        };

        const noteId = await ankiConnectInvoke('addNote', { note: note });

        // Get the card IDs for this note
        const cardIds = await ankiConnectInvoke('findCards', {
          query: `nid:${noteId}`
        });

        // Suspend all cards for this note
        if (cardIds && cardIds.length > 0) {
          await ankiConnectInvoke('suspend', { cards: cardIds });
        }

        sendResponse({ success: true, noteId: noteId });
      } catch (error) {
        // If it's a duplicate error, treat as success (word is marked as known)
        if (error.message && error.message.includes('duplicate')) {
          sendResponse({ success: true, skipped: true, reason: 'Duplicate handled' });
        } else {
          sendResponse({ success: false, error: error.message });
        }
      }
    })();
    return true;
  },

  bulkAddToAlreadyKnown: (request, sender, sendResponse) => {
    const words = request.words || [];
    if (words.length === 0) {
      sendResponse({ success: false, error: 'No words provided' });
      return true;
    }

    let added = 0;
    let skipped = 0;
    const errors = [];

    // Process words sequentially to avoid overwhelming Anki
    (async () => {
      for (const word of words) {
        try {
          const note = {
            deckName: 'Already Known',
            modelName: 'Hebrew',
            fields: {
              'Hebrew': word
            },
            tags: ['am-known-manually', 'bulk-import']
          };

          // Try to add the note
          const noteId = await ankiConnectInvoke('addNote', { note: note });

          if (noteId) {
            // Get and suspend the card
            const cardIds = await ankiConnectInvoke('findCards', {
              query: `nid:${noteId}`
            });

            if (cardIds && cardIds.length > 0) {
              await ankiConnectInvoke('suspend', { cards: cardIds });
            }

            added++;
          }
        } catch (error) {
          // If duplicate, increment skipped count
          if (error.message && error.message.includes('duplicate')) {
            skipped++;
          } else {
            errors.push(`${word}: ${error.message}`);
          }
        }
      }

      sendResponse({
        success: true,
        added: added,
        skipped: skipped,
        errorCount: errors.length,
        errors: errors.length > 0 ? errors : []
      });
    })();

    return true;
  },

  previewElevenLabsAudio: (request, sender, sendResponse) => {
    chrome.storage.local.get('settings')
      .then(async data => {
        const apiKey = data.settings?.elevenLabsApiKey;
        if (!apiKey) throw new Error('no_key');
        const voiceId = data.settings?.elevenLabsVoiceId || DEFAULT_SETTINGS.elevenLabsVoiceId;
        const elModel = data.settings?.elevenLabsModel || DEFAULT_SETTINGS.elevenLabsModel;

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
          method: 'POST',
          headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          body: JSON.stringify({
            text: request.text,
            model_id: elModel,
            language_code: 'he',
            voice_settings: { stability: 1.0, similarity_boost: 0.75 }
          })
        });
        if (!response.ok) throw new Error(`ElevenLabs error: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        let binary = '';
        for (let i = 0; i < uint8Array.byteLength; i++) binary += String.fromCharCode(uint8Array[i]);
        sendResponse({ success: true, audioData: btoa(binary) });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  generateElevenLabsAudio: (request, sender, sendResponse) => {
    chrome.storage.local.get('settings')
      .then(data => {
        const apiKey = data.settings?.elevenLabsApiKey;
        if (!apiKey) {
          throw new Error('ElevenLabs API key not set. Please add it in the settings.');
        }
        const voiceId = data.settings?.elevenLabsVoiceId || DEFAULT_SETTINGS.elevenLabsVoiceId;
        const elModel = data.settings?.elevenLabsModel || DEFAULT_SETTINGS.elevenLabsModel;
        return generateElevenLabsAudio(request.text, apiKey, voiceId, elModel);
      })
      .then(result => sendResponse({ success: true, filename: result.filename, audioData: result.audioData }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  translateSentence: (request, sender, sendResponse) => {
    chrome.storage.local.get('settings')
      .then(data => {
        const apiKey = data.settings?.claudeApiKey;
        if (!apiKey) {
          throw new Error('Claude API key not set. Please add it in the settings.');
        }
        const model = data.settings?.claudeModel || DEFAULT_SETTINGS.claudeModel;
        return translateSentence(request.sentence, apiKey, model);
      })
      .then(async ({ text, cost }) => {
        await accumulateSpend(cost);
        sendResponse({ success: true, result: text });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  defineWord: (request, sender, sendResponse) => {
    chrome.storage.local.get('settings')
      .then(data => {
        const apiKey = data.settings?.claudeApiKey;
        if (!apiKey) {
          throw new Error('Claude API key not set. Please add it in the settings.');
        }
        const model = data.settings?.claudeModel || DEFAULT_SETTINGS.claudeModel;
        const customPrompt = data.settings?.aiDefinePrompt || null;
        return defineWord(request.sentence, request.word, apiKey, model, customPrompt);
      })
      .then(async ({ text, cost }) => {
        await accumulateSpend(cost);
        sendResponse({ success: true, result: text });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  defineWords: (request, sender, sendResponse) => {
    chrome.storage.local.get('settings')
      .then(data => {
        const apiKey = data.settings?.claudeApiKey;
        if (!apiKey) {
          throw new Error('Claude API key not set. Please add it in the settings.');
        }
        const model = data.settings?.claudeModel || DEFAULT_SETTINGS.claudeModel;
        const customPrompt = data.settings?.aiDefinePrompt || null;
        return defineWords(request.sentence, request.words, apiKey, model, customPrompt);
      })
      .then(async ({ text, cost }) => {
        await accumulateSpend(cost);
        sendResponse({ success: true, result: text });
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  getUnknownWords: (request, sender, sendResponse) => {
    (async () => {
      try {
        const data = await chrome.storage.local.get(['matureWords', 'learningWords', 'settings']);
        const matureWords = data.matureWords || [];
        const learningWords = data.learningWords || [];
        const knownWords = [...matureWords, ...learningWords];

        if (knownWords.length === 0) {
          sendResponse({ success: false, error: 'No known words found. Please refresh your word list from Anki first.' });
          return;
        }

        // Get ALL words that exist in Anki (including new/unstudied cards)
        // This prevents offering words that were already added to Anki but not studied yet
        const settings = data.settings || {};
        const fieldName = settings.fieldName || 'Hebrew';
        const deckFilter = settings.deckFilter || '';

        let allAnkiWords = new Set();
        try {
          // Build query for all cards with Hebrew field
          let query = `${fieldName}:*`;
          if (deckFilter) {
            query = `deck:"${deckFilter}" ${query}`;
          }

          const cardIds = await ankiConnectInvoke('findCards', { query: query });

          if (cardIds && cardIds.length > 0) {
            const cardsInfo = await ankiConnectInvoke('cardsInfo', { cards: cardIds });
            const noteIds = [...new Set(cardsInfo.map(card => card.note))];
            const notesInfo = await ankiConnectInvoke('notesInfo', { notes: noteIds });

            const hebrewRegex = /[\u0590-\u05FF]+(?:[״"׳\u201C\u201D\u2018\u2019][\u0590-\u05FF]+)*/g;

            notesInfo.forEach(note => {
              const hebrewField = note.fields[fieldName];
              if (hebrewField && hebrewField.value) {
                let text = hebrewField.value.replace(/<[^>]*>/g, ' ');
                text = text.replace(/\[[^\]]*\]/g, ' ');

                const matches = text.match(hebrewRegex);
                if (matches) {
                  matches.forEach(word => {
                    const normalizedWord = word.replace(/[\u0591-\u05C7]/g, '');
                    if (normalizedWord.length > 0) {
                      allAnkiWords.add(normalizedWord);
                    }
                  });
                }
              }
            });
          }
        } catch (error) {
          console.error('Error fetching all Anki words:', error);
          // Continue with just known words if this fails
          allAnkiWords = new Set(knownWords.map(w => w.replace(/[\u0591-\u05C7]/g, '')));
        }

        // Load frequency data if not loaded
        await loadFrequencyData();

        if (!frequencyData || frequencyData.length === 0) {
          sendResponse({ success: false, error: 'Frequency data not available. Please try again.' });
          return;
        }

        // Get unknown words from frequency list - words NOT in Anki at all
        const unknownWords = [];

        // Get more than requested to allow for user filtering
        const bufferCount = Math.min(request.wordCount * 2, request.wordCount + 20);

        for (let i = 0; i < frequencyData.length && unknownWords.length < bufferCount; i++) {
          const word = frequencyData[i];
          const normalizedWord = word.replace(/[\u0591-\u05C7]/g, '');

          if (!allAnkiWords.has(normalizedWord) && normalizedWord.length > 1) {
            unknownWords.push({
              word: normalizedWord,
              rank: i + 1
            });
          }
        }

        if (unknownWords.length === 0) {
          sendResponse({ success: false, error: `No unknown words found in frequency list. You have ${allAnkiWords.size} words in Anki already!` });
          return;
        }

        sendResponse({ success: true, unknownWords: unknownWords });
      } catch (error) {
        console.error('Error getting unknown words:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  },

  generateI1SentencesForWords: (request, sender, sendResponse) => {
    (async () => {
      try {
        const data = await chrome.storage.local.get(['settings', 'matureWords', 'learningWords']);
        const apiKey = data.settings?.claudeApiKey;

        if (!apiKey) {
          sendResponse({ success: false, error: 'Please set your Claude API key in settings first.' });
          return;
        }

        const matureWords = data.matureWords || [];
        const learningWords = data.learningWords || [];
        const knownWords = [...matureWords, ...learningWords];

        if (knownWords.length === 0) {
          sendResponse({ success: false, error: 'No known words found. Please refresh your word list from Anki first.' });
          return;
        }

        const maxWords = data.settings?.maxWordsForI1 || 3000;
        const claudeModel = data.settings?.claudeModel || DEFAULT_SETTINGS.claudeModel;
        const customPrompt = data.settings?.sentenceGenerationPrompt || DEFAULT_SETTINGS.sentenceGenerationPrompt;
        const words = request.words; // Array of {word, rank} objects
        const sentencesPerWord = request.sentencesPerWord;
        const results = [];
        let sessionCost = 0;

        // Generate sentences for each word
        for (let i = 0; i < words.length; i++) {
          const wordData = words[i];

          // Send progress update
          chrome.runtime.sendMessage({
            action: 'i1GenerationProgress',
            current: i + 1,
            total: words.length,
            currentWord: wordData.word
          });

          try {
            const { sentences, cost, usage } = await generateI1SentencesForWord(wordData.word, knownWords, sentencesPerWord, apiKey, maxWords, claudeModel, customPrompt);
            sessionCost += cost;

            results.push({
              word: wordData.word,
              rank: wordData.rank,
              sentences,
              cost,
              usage
            });
          } catch (error) {
            console.error(`Error generating sentences for ${wordData.word}:`, error);
            results.push({
              word: wordData.word,
              rank: wordData.rank,
              sentences: [],
              cost: 0,
              error: error.message
            });
          }
        }

        // Accumulate total spend in storage
        await accumulateSpend(sessionCost);
        const spendData = await chrome.storage.local.get('claudeSpendTotal');
        const newTotal = spendData.claudeSpendTotal || 0;

        sendResponse({ success: true, data: results, sessionCost, totalSpend: newTotal });
      } catch (error) {
        console.error('Error generating i+1 sentences:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  },

  lookupWord: (request, sender, sendResponse) => {
    // Ensure dictionaries are loaded
    if (!dictionariesLoaded) {
      loadDictionaries()
        .then(() => lookupWord(request.word))
        .then(results => sendResponse({ success: true, results: results }))
        .catch(error => sendResponse({ success: false, error: error.message }));
    } else {
      lookupWord(request.word)
        .then(results => sendResponse({ success: true, results: results }))
        .catch(error => sendResponse({ success: false, error: error.message }));
    }
    return true;
  },

  addCustomDefinition: (request, sender, sendResponse) => {
    addCustomDefinition(request.word, request.definition)
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  clearDictionary: (request, sender, sendResponse) => {
    clearDictionaryDB()
      .then(() => sendResponse({ success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  fetchExternal: (request, sender, sendResponse) => {
    fetch(request.url)
      .then(response => response.text())
      .then(html => sendResponse({ success: true, html: html }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  fetchReversoAPI: (request, sender, sendResponse) => {
    const apiUrl = 'https://api.reverso.net/translate/v1/translation';

    fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        format: 'text',
        from: 'heb',
        input: request.word,
        options: {
          contextResults: true,
          languageDetection: true,
          origin: 'reversomobile',
          sentenceSplitter: false,
        },
        to: 'eng',
      })
    })
      .then(response => response.json())
      .then(data => {
        if (data.translation && data.translation.length > 0) {
          sendResponse({ success: true, translation: data.translation[0] });
        } else {
          sendResponse({ success: false, error: 'No translation found' });
        }
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  },

  fetchGoogleTranslate: (request, sender, sendResponse) => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(request.word)}`;

    fetch(url)
      .then(response => response.json())
      .then(data => {
        // Extract translation from response
        if (data && data[0] && data[0][0] && data[0][0][0]) {
          const translation = data[0].map(item => item[0]).join(' ');
          sendResponse({ success: true, translation: translation });
        } else {
          sendResponse({ success: false, error: 'Translation not available' });
        }
      })
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
};

// Message listener for popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[request.action];
  if (handler) {
    return handler(request, sender, sendResponse);
  }
  return false; // No handler found
});

// Auto-fetch words on startup if cache is old (older than 1 hour)
chrome.runtime.onStartup.addListener(async () => {
  const data = await chrome.storage.local.get(['lastUpdated']);
  const oneHour = 60 * 60 * 1000;

  if (!data.lastUpdated || (Date.now() - data.lastUpdated) > oneHour) {
    try {
      await fetchHebrewWords();
    } catch (error) {
      console.log('Could not auto-fetch words on startup:', error.message);
    }
  }
});
