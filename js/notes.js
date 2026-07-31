/**
 * Notes Data Layer (notes.js)
 * Manages Note CRUD operations with Firestore and LocalStore fallback
 */

const NotesAPI = {
  // Fetch all notes for a specific user
  async getNotes(userId) {
    if (!userId) return [];

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        const snapshot = await window.firebaseDB
          .collection('notes')
          .where('userId', '==', userId)
          .orderBy('updatedAt', 'desc')
          .get();
        
        const notes = [];
        snapshot.forEach(doc => {
          notes.push({ id: doc.id, ...doc.data() });
        });
        return notes;
      } catch (err) {
        console.warn("Firestore fetch error, falling back to local store", err);
      }
    }

    // Local Storage Fallback
    const notes = window.LocalStore.getNotes(userId);
    return notes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  },

  // Get single note by ID
  async getNoteById(userId, noteId) {
    if (!noteId) return null;

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        const doc = await window.firebaseDB.collection('notes').doc(noteId).get();
        if (doc.exists) {
          return { id: doc.id, ...doc.data() };
        }
      } catch (err) {
        console.warn("Firestore getNoteById error", err);
      }
    }

    const notes = window.LocalStore.getNotes(userId);
    return notes.find(n => n.id === noteId) || null;
  },

  // Create a new note
  async createNote(userId, noteData) {
    const timestamp = new Date().toISOString();
    const newNote = {
      userId: userId,
      title: noteData.title ? noteData.title.trim() : 'Untitled Note',
      content: noteData.content || '',
      tags: Array.isArray(noteData.tags) ? noteData.tags : [],
      summary: noteData.summary || '',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        const docRef = await window.firebaseDB.collection('notes').add(newNote);
        return { success: true, note: { id: docRef.id, ...newNote } };
      } catch (err) {
        console.error("Firestore createNote error", err);
      }
    }

    // Local Storage Fallback
    const notes = window.LocalStore.getNotes(userId);
    const createdNote = { id: 'note_' + Date.now(), ...newNote };
    notes.unshift(createdNote);
    window.LocalStore.saveNotes(userId, notes);
    return { success: true, note: createdNote };
  },

  // Update existing note
  async updateNote(userId, noteId, noteData) {
    const timestamp = new Date().toISOString();
    const updates = {
      title: noteData.title ? noteData.title.trim() : 'Untitled Note',
      content: noteData.content || '',
      tags: Array.isArray(noteData.tags) ? noteData.tags : [],
      summary: noteData.summary || '',
      updatedAt: timestamp
    };

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        await window.firebaseDB.collection('notes').doc(noteId).update(updates);
        return { success: true, note: { id: noteId, userId, ...updates } };
      } catch (err) {
        console.error("Firestore updateNote error", err);
      }
    }

    // Local Storage Fallback
    const notes = window.LocalStore.getNotes(userId);
    const index = notes.findIndex(n => n.id === noteId);
    if (index !== -1) {
      notes[index] = { ...notes[index], ...updates };
      window.LocalStore.saveNotes(userId, notes);
      return { success: true, note: notes[index] };
    }
    return { success: false, error: 'Note not found' };
  },

  // Delete note
  async deleteNote(userId, noteId) {
    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        await window.firebaseDB.collection('notes').doc(noteId).delete();
        return { success: true };
      } catch (err) {
        console.error("Firestore deleteNote error", err);
      }
    }

    // Local Storage Fallback
    let notes = window.LocalStore.getNotes(userId);
    notes = notes.filter(n => n.id !== noteId);
    window.LocalStore.saveNotes(userId, notes);
    return { success: true };
  },

  // Get aggregated tag counts across user's notes
  getTagsWithCounts(notes) {
    const tagMap = {};
    notes.forEach(note => {
      if (Array.isArray(note.tags)) {
        note.tags.forEach(tag => {
          const cleanTag = tag.trim().toLowerCase();
          if (cleanTag) {
            tagMap[cleanTag] = (tagMap[cleanTag] || 0) + 1;
          }
        });
      }
    });

    return Object.entries(tagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },

  // Search and filter notes
  filterNotes(notes, query, selectedTag) {
    return notes.filter(note => {
      const matchesTag = !selectedTag || (note.tags && note.tags.some(t => t.toLowerCase() === selectedTag.toLowerCase()));
      if (!matchesTag) return false;

      if (!query) return true;

      const q = query.toLowerCase();
      const inTitle = note.title && note.title.toLowerCase().includes(q);
      const inContent = note.content && note.content.toLowerCase().includes(q);
      const inTags = note.tags && note.tags.some(t => t.toLowerCase().includes(q));
      const inSummary = note.summary && note.summary.toLowerCase().includes(q);

      return inTitle || inContent || inTags || inSummary;
    });
  }
};

window.NotesAPI = NotesAPI;
