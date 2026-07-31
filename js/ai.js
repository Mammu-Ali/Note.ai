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
    const prompt = `Summarize the following note into 2-3 concise, informative bullet points or sentences:\n\n${content}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) throw new Error(`Gemini API Error: ${response.statusText}`);
    const data = await response.json();
    return data.candidates[0].content.parts[0].text.trim();
  },

  async callGeminiTags(apiKey, title, content) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    const prompt = `Suggest 3 to 5 short, single-word tags suitable for categorizing this note. Respond ONLY with a comma-separated list of lowercase tags without spaces or hashtags.\nTitle: ${title}\nContent: ${content}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) throw new Error(`Gemini API Error: ${response.statusText}`);
    const data = await response.json();
    const rawTags = data.candidates[0].content.parts[0].text.trim();
    return rawTags.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean);
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
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful note summarization assistant. Keep summaries under 3 sentences.' },
          { role: 'user', content: `Summarize this note:\n${content}` }
        ]
      })
    });

    if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);
    const data = await response.json();
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
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Respond ONLY with 3-5 comma-separated lowercase single-word tags.' },
          { role: 'user', content: `Suggest tags for:\nTitle: ${title}\nContent: ${content}` }
        ]
      })
    });

    if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);
    const data = await response.json();
    const raw = data.choices[0].message.content.trim();
    return raw.split(',').map(t => t.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')).filter(Boolean);
  },

  /* --- Smart Heuristic Fallback Engine --- */
  heuristicSummarize(content) {
    const sentences = content
      .replace(/[\r\n]+/g, ' ')
      .split(/(?<=[.!?])\s+/)
      .filter(s => s.trim().length > 10);

    if (sentences.length === 0) {
      return content.substring(0, 120) + '...';
    }

    if (sentences.length <= 2) {
      return sentences.join(' ');
    }

    // Pick top 2 sentences (first sentence + sentence with highest keyword density)
    return `${sentences[0]} ${sentences[1]}`.trim();
  },

  heuristicSuggestTags(title, content) {
    const text = `${title || ''} ${content || ''}`.toLowerCase();
    const categoryKeywords = {
      'tech': ['code', 'html', 'css', 'javascript', 'js', 'api', 'database', 'firebase', 'backend', 'developer', 'react', 'git'],
      'work': ['meeting', 'project', 'deadline', 'client', 'email', 'task', 'roadmap', 'presentation', 'schedule'],
      'ideas': ['idea', 'concept', 'brainstorm', 'feature', 'future', 'strategy', 'design', 'inspiration'],
      'personal': ['home', 'family', 'shopping', 'health', 'fitness', 'travel', 'recipe', 'book', 'movie'],
      'finance': ['budget', 'money', 'cost', 'invoice', 'payment', 'tax', 'price', 'expense'],
      'urgent': ['important', 'asap', 'urgent', 'priority', 'todo', 'review']
    };

    const suggested = new Set();

    // Check pre-defined categories
    for (const [tag, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        suggested.add(tag);
      }
    }

    // Extract significant capitalized words or frequent nouns from title
    if (title) {
      const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !['with', 'from', 'that', 'this', 'have'].includes(w));
      titleWords.slice(0, 2).forEach(w => suggested.add(w.replace(/[^a-z0-9]/g, '')));
    }

    if (suggested.size === 0) {
      suggested.add('notes');
      suggested.add('general');
    }

    return Array.from(suggested).slice(0, 4);
  }
};

window.AI = AI;
