/**
 * Core Application Controller (app.js)
 * Manages UI interactions, toasts, settings modal, theme switching, and global events
 */

const App = {
  init() {
    this.initTheme();
    this.createSettingsModal();
    this.bindEvents();
  },

  // Initialize theme from preference
  initTheme() {
    const savedTheme = localStorage.getItem('ainotes_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  },

  // Toggle dark/light theme
  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const target = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', target);
    localStorage.setItem('ainotes_theme', target);
    this.showToast(`Switched to ${target} mode`);
  },

  // Toast Notification System
  showToast(message, icon = '✦') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span>${icon}</span> <span>${this.escapeHTML(message)}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 200);
    }, 2800);
  },

  // Settings Modal Markup Injection & Event Listener setup
  createSettingsModal() {
    if (document.getElementById('settings-modal')) return;

    const modalHTML = `
      <div id="settings-modal" class="modal-overlay">
        <div class="modal-card">
          <div class="note-header">
            <h3 class="section-title">Settings & AI Config</h3>
            <button id="close-settings-btn" class="btn-icon" aria-label="Close settings">&times;</button>
          </div>
          <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.2rem;">
            Configure your AI API Key (Gemini or OpenAI) to unlock live AI summaries and smart tag generation.
          </p>
          <div class="form-group">
            <label class="form-label">AI Provider</label>
            <select id="ai-provider-select" class="input-field">
              <option value="gemini">Google Gemini API (Default)</option>
              <option value="openai">OpenAI API (GPT-3.5/4)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">API Key</label>
            <input type="password" id="ai-key-input" class="input-field" placeholder="Paste API Key here..." />
            <small style="font-size: 0.75rem; color: var(--text-subtle); margin-top: 0.2rem;">
              Leave blank to use built-in smart heuristic NLP engine.
            </small>
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.5rem;">
            <button id="clear-ai-key-btn" class="btn btn-secondary btn-sm">Clear Key</button>
            <button id="save-settings-btn" class="btn btn-primary btn-sm">Save Config</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Modal listeners
    const modal = document.getElementById('settings-modal');
    const closeBtn = document.getElementById('close-settings-btn');
    const saveBtn = document.getElementById('save-settings-btn');
    const clearBtn = document.getElementById('clear-ai-key-btn');

    closeBtn.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    saveBtn.addEventListener('click', () => {
      const provider = document.getElementById('ai-provider-select').value;
      const key = document.getElementById('ai-key-input').value;
      window.AI.setAIConfig(key, provider);
      modal.classList.remove('active');
      this.showToast('AI Settings updated successfully!');
    });

    clearBtn.addEventListener('click', () => {
      document.getElementById('ai-key-input').value = '';
      window.AI.setAIConfig('', 'gemini');
      modal.classList.remove('active');
      this.showToast('AI Key cleared. Using fallback engine.');
    });
  },

  // Open Settings Modal
  openSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    const config = window.AI.getAIConfig();
    document.getElementById('ai-provider-select').value = config.provider || 'gemini';
    document.getElementById('ai-key-input').value = config.key || '';
    modal.classList.add('active');
  },

  bindEvents() {
    // Theme toggle button binding
    document.addEventListener('click', (e) => {
      if (e.target.closest('#theme-toggle-btn')) {
        this.toggleTheme();
      }
      if (e.target.closest('#open-settings-btn')) {
        this.openSettingsModal();
      }
    });
  },

  // Utility: Date Formatter
  formatDate(isoString) {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffHours = Math.abs(now - date) / 3600000;

    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  },

  // Utility: HTML Escaper
  escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
window.App = App;
