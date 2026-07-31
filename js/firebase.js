/**
 * Firebase Configuration & Storage Initialization
 * Supports Firebase v10 Auth + Firestore with zero-config Local Storage Fallback
 */

// Firebase Configuration Object (Replace with your Firebase project credentials)
const firebaseConfig = {
  apiKey: "YOUR_FIREBASE_API_KEY",
  authDomain: "ai-notes-demo.firebaseapp.com",
  projectId: "ai-notes-demo",
  storageBucket: "ai-notes-demo.appspot.com",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};

// State flag to track whether live Firebase credentials have been configured
window.isFirebaseLive = false;
window.firebaseDB = null;
window.firebaseAuth = null;

// Initialize Firebase if credentials provided, otherwise initialize Local Storage Fallback
(function initBackend() {
  const customConfig = localStorage.getItem('ainotes_firebase_config');
  let activeConfig = firebaseConfig;
  
  if (customConfig) {
    try {
      activeConfig = JSON.parse(customConfig);
    } catch (e) {
      console.warn("Invalid stored Firebase config, using default", e);
    }
  }

  // Check if user has set real credentials
  if (activeConfig.apiKey && activeConfig.apiKey !== "YOUR_FIREBASE_API_KEY") {
    try {
      if (window.firebase) {
        if (!window.firebase.apps.length) {
          window.firebase.initializeApp(activeConfig);
        }
        window.firebaseAuth = window.firebase.auth();
        window.firebaseDB = window.firebase.firestore();
        window.isFirebaseLive = true;
        console.log("🔥 Firebase Auth & Firestore connected successfully.");
        return;
      }
    } catch (err) {
      console.warn("Firebase initialization failed, using Local Fallback Mode", err);
    }
  }

  console.log("⚡ Running in Local Storage Mode (Instant Demo / Setup optional).");
})();

// Local Storage Fallback Data Store Helper
const LocalStore = {
  getUser() {
    const userStr = localStorage.getItem('ainotes_current_user');
    return userStr ? JSON.parse(userStr) : null;
  },
  
  setUser(user) {
    if (user) {
      localStorage.setItem('ainotes_current_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('ainotes_current_user');
    }
  },

  getNotes(userId) {
    const notesStr = localStorage.getItem(`ainotes_data_${userId || 'guest'}`);
    return notesStr ? JSON.parse(notesStr) : getInitialDemoNotes(userId || 'guest');
  },

  saveNotes(userId, notes) {
    localStorage.setItem(`ainotes_data_${userId || 'guest'}`, JSON.stringify(notes));
  }
};

// Seed initial sample notes for demo user if empty
function getInitialDemoNotes(userId) {
  const demoNotes = [
    {
      id: 'demo-1',
      userId: userId,
      title: 'Welcome to AI Notes',
      content: 'AI Notes is a minimalist note-taking app. Create, edit, and categorize your notes with AI summarization and automatic tag suggestions.\n\nTry clicking "Summarize Note" or "Suggest Tags" to test the AI capabilities!',
      tags: ['welcome', 'guide', 'ai'],
      summary: 'An introduction to AI Notes detailing its note-taking and AI summarization features.',
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 24).toISOString()
    },
    {
      id: 'demo-2',
      userId: userId,
      title: 'Project Architecture & Tech Stack',
      content: 'Front-end: HTML5, Vanilla CSS, JavaScript (ES6+)\nBackend: Firebase Auth, Cloud Firestore, Firebase Hosting\nAI Engine: Gemini API / OpenAI API integration with heuristic NLP fallback.',
      tags: ['tech', 'architecture', 'firebase'],
      summary: 'Tech stack details covering HTML/CSS/JS frontend, Firebase backend, and Gemini/OpenAI integration.',
      createdAt: new Date(Date.now() - 3600000 * 12).toISOString(),
      updatedAt: new Date(Date.now() - 3600000 * 12).toISOString()
    }
  ];
  localStorage.setItem(`ainotes_data_${userId}`, JSON.stringify(demoNotes));
  return demoNotes;
}

window.LocalStore = LocalStore;
