/**
 * AI Features Engine (ai.js)
 * Provides Summarization and Tag Suggestion via Gemini / OpenAI API with fallback NLP engine
 */

const AI = {
  // Retrieve user API Key & Provider from localStorage
  getAIConfig() {
    return {
      key: localStorage.getItem('ainotes_ai_key') || '',
      provider: localStorage.getItem('ainotes_ai_provider') || 'gemini' // 'gemini' or 'openai'
    };
  },

  // Save AI Config
  setAIConfig(key, provider = 'gemini') {
    if (key) {
      localStorage.setItem('ainotes_ai_key', key.trim());
    } else {
      localStorage.removeItem('ainotes_ai_key');
    }
    localStorage.setItem('ainotes_ai_provider', provider);
  },

  /**
   * Summarize Note Content
   * @param {string} content - Full text of the note
   * @returns {Promise<string>} Summary text
   */
  async summarize(content) {
    if (!content || content.trim().length < 20) {
      return "Note content is too short to generate a summary.";
    }

    const { key, provider } = this.getAIConfig();

    if (key) {
      try {
        if (provider === 'gemini') {
          return await this.callGeminiSummary(key, content);
        } else {
          return await this.callOpenAISummary(key, content);
        }
      } catch (err) {
        console.warn("AI API Call failed, switching to Smart Fallback NLP", err);
      }
    }

    // Heuristic Fallback Engine
    return this.heuristicSummarize(content);
  },

  /**
   * Suggest Tags for Note Title & Content
   * @param {string} title - Note title
   * @param {string} content - Note body
   * @returns {Promise<string[]>} Array of tag strings
   */
  async suggestTags(title, content) {
    const fullText = `${title || ''}\n${content || ''}`.trim();
    if (!fullText) return [];

    const { key, provider } = this.getAIConfig();

    if (key) {
      try {
        if (provider === 'gemini') {
          return await this.callGeminiTags(key, title, content);
        } else {
          return await this.callOpenAITags(key, title, content);
        }
      } catch (err) {
        console.warn("AI Tag API failed, switching to Smart Fallback", err);
      }
    }

    // Heuristic Fallback Engine
    return this.heuristicSuggestTags(title, content);
  },

  /* --- Gemini API Handlers --- */
  async callGeminiSummary(apiKey, content) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    const prompt = `You are a precise note summarization assistant.

Analyze the following note carefully and return a structured summary using EXACTLY this format:

Summary:
[Write 2-5 sentences that capture the full meaning of the note. Preserve important names, dates, numbers, and technical terms. Do not invent facts. Do not add information that is not in the note.]

Key Points:
\u2022 [Most important point]
\u2022 [Second important point]
\u2022 [Third important point]

Rules:
- For very short notes, keep the summary and key points brief.
- For very long notes, be thorough but concise.
- Never use generic filler phrases.
- Preserve technical terms exactly as written.
- Do not include a title or heading above "Summary:".

Note to summarize:
"""
${content}
"""`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`Gemini API Error: ${data.error?.message || response.statusText}`);
    }

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error('Gemini returned an empty response.');
    }

    return data.candidates[0].content.parts[0].text.trim();
  },

  async callGeminiTags(apiKey, title, content) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const prompt = `You are a tag suggestion assistant for a note-taking app.

Analyze the note below and suggest 3 to 6 relevant tags.

STRICT RULES:
- Return ONLY a plain comma-separated list of tags. Nothing else.
- Each tag must be a single lowercase word or short hyphenated phrase (e.g., machine-learning).
- Tags must be directly relevant to the actual content of the note.
- Do NOT include these generic tags: note, notes, text, information, content, general, misc, other, stuff.
- Do NOT use hashtags (#).
- Do NOT write sentences or explanations.
- Do NOT include duplicate tags.
- Maximum 6 tags.

Note Title: ${title || '(none)'}
Note Content:
"""
${content || '(empty)'}
"""

Respond with only the comma-separated tags:`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`Gemini API Error: ${data.error?.message || response.statusText}`);
    }

    if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
      throw new Error('Gemini returned an empty response.');
    }

    const rawTags = data.candidates[0].content.parts[0].text.trim();
    return this._parseTags(rawTags);
  },

  /* --- OpenAI API Handlers --- */
  async callOpenAISummary(apiKey, content) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a precise note summarization assistant.\nAlways respond using EXACTLY this format:\n\nSummary:\n[2-5 sentences capturing the full meaning. Preserve names, dates, numbers, and technical terms. Never invent facts.]\n\nKey Points:\n\u2022 [Point 1]\n\u2022 [Point 2]\n\u2022 [Point 3]\n\nFor very short notes, keep it brief. For long notes, be thorough but concise.`
          },
          { role: 'user', content: `Summarize this note:\n"""\n${content}\n"""` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`OpenAI API Error: ${data.error?.message || response.statusText}`);
    }

    return data.choices[0].message.content.trim();
  },

  async callOpenAITags(apiKey, title, content) {
    const url = 'https://api.openai.com/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a tag suggestion assistant. Respond ONLY with 3-6 comma-separated lowercase tags relevant to the note.\nDo NOT include: note, notes, text, information, content, general, misc, other.\nDo NOT use hashtags. Do NOT write sentences. Maximum 6 tags.'
          },
          { role: 'user', content: `Suggest tags for:\nTitle: ${title || '(none)'}\nContent:\n"""\n${content || '(empty)'}\n"""` }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`OpenAI API Error: ${data.error?.message || response.statusText}`);
    }

    const raw = data.choices[0].message.content.trim();
    return this._parseTags(raw);
  },

  /* --- Resilient Tag Parsing Utility --- */
  _parseTags(rawText) {
    if (!rawText || typeof rawText !== 'string') return [];

    const GENERIC_TAGS = new Set([
      'note', 'notes', 'text', 'information', 'content',
      'general', 'misc', 'other', 'stuff', 'things', 'tag', 'tags'
    ]);

    // Handle comma-separated, newlines, markdown lists (1. , - , * , •)
    const rawTokens = rawText.split(/[\n,;]+/);
    const tags = [];

    for (let token of rawTokens) {
      // Discard emails or authentication-like strings
      if (token.includes('@')) continue;

      const cleaned = token
        .trim()
        .replace(/^[\s\d\.\-\*\•\#]+/, '')
        .replace(/^tags?:\s*/i, '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .trim();

      const lower = cleaned.toLowerCase();
      if (cleaned.length >= 2 && !GENERIC_TAGS.has(lower) && !tags.some(t => t.toLowerCase() === lower)) {
        const formatted = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        tags.push(formatted);
      }
    }

    return tags.slice(0, 6);
  },

  /* --- Smart Heuristic Fallback Engine --- */
  heuristicSummarize(content) {
    if (!content || typeof content !== 'string') return '';
    const cleaned = content.replace(/[\r\n]+/g, ' ').trim();
    // Split sentences safely across standard punctuation marks
    const sentences = cleaned
      .replace(/([.!?])\s+/g, "$1|SENTENCE_BREAK|")
      .split("|SENTENCE_BREAK|")
      .map(s => s.trim())
      .filter(s => s.length > 10);

    if (sentences.length === 0) {
      return `Summary:\n${content.substring(0, 200)}...\n\nKey Points:\n\u2022 Unable to extract structured key points from this note.`;
    }

    const summarySentences = sentences.length <= 2
      ? sentences
      : [sentences[0], sentences.reduce((a, b) => b.length > a.length ? b : a)];

    const keyPoints = sentences
      .filter(s => !summarySentences.includes(s))
      .slice(0, 3);

    const summaryText = summarySentences.join(' ');
    const keyPointsText = keyPoints.length > 0
      ? keyPoints.map(p => `\u2022 ${p}`).join('\n')
      : `\u2022 ${sentences[0]}`;

    return `Summary:\n${summaryText}\n\nKey Points:\n${keyPointsText}`;
  },

  heuristicSuggestTags(title, content) {
    const rawText = `${title || ''} ${content || ''}`.trim();
    if (!rawText) return [];

    const GENERIC_TAGS = new Set([
      'note', 'notes', 'text', 'information', 'content',
      'general', 'misc', 'other', 'stuff', 'things', 'tag', 'tags'
    ]);

    const STOP_WORDS = new Set([
      'about', 'above', 'after', 'again', 'against', 'almost', 'also', 'although',
      'always', 'among', 'another', 'around', 'because', 'been', 'before', 'being',
      'between', 'both', 'came', 'come', 'could', 'days', 'during', 'each', 'early',
      'even', 'every', 'first', 'from', 'gave', 'getting', 'give', 'going', 'good',
      'great', 'have', 'having', 'here', 'into', 'just', 'know', 'last', 'like',
      'made', 'make', 'many', 'more', 'most', 'much', 'must', 'near', 'need',
      'never', 'next', 'only', 'other', 'over', 'really', 'said', 'same', 'should',
      'since', 'some', 'still', 'such', 'take', 'than', 'that', 'their', 'them',
      'then', 'there', 'these', 'they', 'this', 'those', 'through', 'time', 'under',
      'until', 'very', 'want', 'went', 'were', 'what', 'when', 'where', 'which',
      'while', 'will', 'with', 'would', 'your', 'short', 'wonderful', 'break', 'daily',
      'visit', 'visited', 'visiting', 'start', 'started', 'starting', 'reach', 'reached',
      'reaching', 'enjoy', 'enjoyed', 'enjoying', 'explore', 'explored', 'exploring',
      'make', 'making', 'looked', 'looking', 'surrounded', 'pleasant', 'created'
    ]);

    const suggested = new Set();
    const textLower = rawText.toLowerCase();

    // 1. Broad Category Keywords Mapping
    const categoryKeywords = {
      'Travel': ['travel', 'trip', 'journey', 'visited', 'visit', 'vacation', 'tour', 'explore', 'exploring', 'destination', 'flight', 'roadtrip', 'trekking', 'hills', 'forest', 'forests', 'waterfall', 'beach', 'viewpoint', 'viewpoints', 'route', 'sightseeing'],
      'Friends': ['friend', 'friends', 'friendship', 'buddies', 'peers', 'hangout', 'companion', 'group'],
      'Tech': ['code', 'coding', 'html', 'css', 'javascript', 'js', 'python', 'java', 'api', 'database', 'firestore', 'firebase', 'frontend', 'backend', 'developer', 'software', 'programming', 'app', 'web', 'git', 'bug', 'deploy', 'cloud'],
      'Work': ['meeting', 'project', 'deadline', 'client', 'task', 'roadmap', 'presentation', 'schedule', 'team', 'sprint', 'report', 'office', 'career', 'job', 'interview'],
      'Lifestyle': ['routine', 'weekend', 'relax', 'habits', 'morning', 'evening', 'holiday', 'leisure', 'memories', 'moments', 'experience'],
      'Food': ['food', 'cooking', 'restaurant', 'dinner', 'lunch', 'breakfast', 'cuisine', 'coffee', 'cafe', 'delicious', 'meal'],
      'Ideas': ['idea', 'concept', 'brainstorm', 'feature', 'future', 'strategy', 'design', 'inspiration', 'plan', 'proposal'],
      'Personal': ['family', 'shopping', 'health', 'fitness', 'diary', 'journal', 'personal', 'home'],
      'Finance': ['budget', 'money', 'cost', 'invoice', 'payment', 'tax', 'price', 'expense', 'revenue', 'salary', 'investment', 'crypto', 'savings'],
      'Study': ['study', 'research', 'analysis', 'data', 'reading', 'book', 'course', 'learn', 'lecture', 'exam', 'notes', 'university', 'college', 'student'],
      'Urgent': ['important', 'asap', 'urgent', 'priority', 'todo', 'deadline', 'critical', 'action']
    };

    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => new RegExp(`\\b${kw}\\b`, 'i').test(textLower))) {
        suggested.add(category);
      }
    }

    // 2. Extract Proper Nouns / Capitalized Entities (e.g. "Wayanad", "Paris", "Google")
    const properNounRegex = /(?:[a-z0-9,;]\s+)([A-Z][a-zA-Z0-9_-]{2,})\b/g;
    let match;
    while ((match = properNounRegex.exec(rawText)) !== null) {
      const entity = match[1];
      const entityLower = entity.toLowerCase();
      if (!STOP_WORDS.has(entityLower) && !GENERIC_TAGS.has(entityLower) && entity.length >= 3 && !entity.includes('@')) {
        const cleanEntity = entity.charAt(0).toUpperCase() + entity.slice(1);
        suggested.add(cleanEntity);
      }
    }

    // 3. Extract Significant Keywords from Title and Content by frequency
    // Remove email addresses and special chars before extracting words
    const cleanTextWithoutEmails = rawText.replace(/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+/g, ' ');
    const words = cleanTextWithoutEmails
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 4 && !/^\d+$/.test(w));

    const freqMap = {};
    for (const word of words) {
      const lower = word.toLowerCase();
      if (lower.includes('@') || STOP_WORDS.has(lower) || GENERIC_TAGS.has(lower)) continue;
      freqMap[lower] = (freqMap[lower] || 0) + 1;
    }

    const sortedKeywords = Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1])
      .map(([word]) => word.charAt(0).toUpperCase() + word.slice(1));

    for (const kw of sortedKeywords) {
      if (suggested.size >= 6) break;
      const isAlreadyIncluded = Array.from(suggested).some(s => s.toLowerCase() === kw.toLowerCase());
      if (!isAlreadyIncluded) {
        suggested.add(kw);
      }
    }

    return Array.from(suggested)
      .filter(t => !GENERIC_TAGS.has(t.toLowerCase()) && !t.includes('@'))
      .slice(0, 6);
  }
};

window.AI = AI;
