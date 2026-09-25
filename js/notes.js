/**
 * Notes Data Layer (notes.js)
 * Firebase Cloud Firestore integration with zero-config Local Storage fallback.
 * Strictly enforces user-scoped note ownership, server timestamps, and optimized single-read caching.
 */

const NotesAPI = {
  // Helper: Format Firestore Document into a clean Note object
  _formatNoteDoc(doc) {
    if (!doc || !doc.exists) return null;
    const data = doc.data();

    const formatTimestamp = (ts) => {
      if (!ts) return new Date().toISOString();
      if (typeof ts.toDate === 'function') return ts.toDate().toISOString();
      if (ts instanceof Date) return ts.toISOString();
      return String(ts);
    };

    return {
      id: doc.id,
      userId: data.userId || '',
      title: data.title || '',
      content: data.content || '',
      tags: (Array.isArray(data.tags) ? data.tags : []).filter(t => typeof t === 'string' && !t.includes('@')),
      summary: data.summary || '',
      createdAt: formatTimestamp(data.createdAt),
      updatedAt: formatTimestamp(data.updatedAt)
    };
  },

  // Helper: Surface error to console and UI toast
  _notifyError(err, context = 'Operation') {
    const errorMsg = err?.message || String(err);
    console.error(`[Firestore Error - ${context}]:`, err);
    if (window.App && typeof window.App.showToast === 'function') {
      window.App.showToast(`${context} failed: ${errorMsg}`, '⚠️');
    }
    return errorMsg;
  },

  // Fetch all notes for the authenticated user
  async getNotes(userId) {
    if (!userId) return [];

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        let snapshot;
        try {
          // Attempt compound query with index
          snapshot = await window.firebaseDB
            .collection('notes')
            .where('userId', '==', userId)
            .orderBy('updatedAt', 'desc')
            .get();
        } catch (queryErr) {
          // Fallback to unindexed equality query + client-side sort if composite index is pending
          console.warn("Indexed query failed, falling back to client sort:", queryErr.message);
          snapshot = await window.firebaseDB
            .collection('notes')
            .where('userId', '==', userId)
            .get();
        }

        const notes = [];
        snapshot.forEach(doc => {
          const note = this._formatNoteDoc(doc);
          if (note && note.userId === userId) {
            notes.push(note);
          }
        });

        // Ensure descending order by latest updatedAt
        return notes.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
      } catch (err) {
        this._notifyError(err, 'Loading notes');
        return [];
      }
    }

    // Local Storage Mode (when Firebase credentials are not active)
    const notes = window.LocalStore.getNotes(userId);
    return notes
      .filter(n => n.userId === userId)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  },

  // Get a single note by ID with ownership verification
  async getNoteById(userId, noteId) {
    if (!noteId || !userId) return null;

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        const doc = await window.firebaseDB.collection('notes').doc(noteId).get();
        if (!doc.exists) return null;

        const note = this._formatNoteDoc(doc);
        if (note.userId !== userId) {
          console.warn(`[Security] Unauthorized access attempt: user ${userId} requested note ${noteId}`);
          return null;
        }
        return note;
      } catch (err) {
        this._notifyError(err, 'Loading note');
        return null;
      }
    }

    const notes = window.LocalStore.getNotes(userId);
    return notes.find(n => n.id === noteId && n.userId === userId) || null;
  },

  // Create a new note with Server Timestamp
  async createNote(userId, noteData) {
    if (!userId) return { success: false, error: 'User must be authenticated' };

    const serverTs = (window.firebase?.firestore?.FieldValue?.serverTimestamp)
      ? window.firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString();

    const sanitizedTags = (Array.isArray(noteData.tags) ? noteData.tags : [])
      .filter(t => typeof t === 'string' && !t.includes('@') && t.trim().length > 0)
      .map(t => t.trim().replace(/^#+/, ''));

    const newNote = {
      userId: userId,
      title: noteData.title ? noteData.title.trim() : 'Untitled Note',
      content: noteData.content || '',
      tags: sanitizedTags,
      summary: noteData.summary || '',
      createdAt: serverTs,
      updatedAt: serverTs
    };

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        const docRef = await window.firebaseDB.collection('notes').add(newNote);
        const nowIso = new Date().toISOString();
        return {
          success: true,
          note: {
            id: docRef.id,
            ...newNote,
            createdAt: nowIso,
            updatedAt: nowIso
          }
        };
      } catch (err) {
        const errorMsg = this._notifyError(err, 'Creating note');
        return { success: false, error: errorMsg };
      }
    }

    // Local Storage Mode
    try {
      const nowIso = new Date().toISOString();
      const localNote = {
        id: 'note_' + Date.now(),
        ...newNote,
        createdAt: nowIso,
        updatedAt: nowIso
      };
      const notes = window.LocalStore.getNotes(userId);
      notes.unshift(localNote);
      window.LocalStore.saveNotes(userId, notes);
      return { success: true, note: localNote };
    } catch (localErr) {
      return { success: false, error: localErr.message };
    }
  },

  // Update existing note (optimized: no redundant read before update)
  async updateNote(userId, noteId, noteData) {
    if (!userId || !noteId) return { success: false, error: 'Invalid note or user identifier' };

    const serverTs = (window.firebase?.firestore?.FieldValue?.serverTimestamp)
      ? window.firebase.firestore.FieldValue.serverTimestamp()
      : new Date().toISOString();

    const sanitizedTags = (Array.isArray(noteData.tags) ? noteData.tags : [])
      .filter(t => typeof t === 'string' && !t.includes('@') && t.trim().length > 0)
      .map(t => t.trim().replace(/^#+/, ''));

    const updates = {
      title: noteData.title ? noteData.title.trim() : 'Untitled Note',
      content: noteData.content || '',
      tags: sanitizedTags,
      summary: noteData.summary || '',
      updatedAt: serverTs
    };

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        // Direct update: security rules enforce ownership and prevent unauthorized overwrite
        await window.firebaseDB.collection('notes').doc(noteId).update(updates);
        return {
          success: true,
          note: {
            id: noteId,
            userId,
            ...updates,
            updatedAt: new Date().toISOString()
          }
        };
      } catch (err) {
        const errorMsg = this._notifyError(err, 'Updating note');
        return { success: false, error: errorMsg };
      }
    }

    // Local Storage Mode
    const notes = window.LocalStore.getNotes(userId);
    const index = notes.findIndex(n => n.id === noteId && n.userId === userId);
    if (index !== -1) {
      notes[index] = { ...notes[index], ...updates, updatedAt: new Date().toISOString() };
      window.LocalStore.saveNotes(userId, notes);
      return { success: true, note: notes[index] };
    }
    return { success: false, error: 'Note not found or permission denied' };
  },

  // Delete note (optimized: no redundant read before delete)
  async deleteNote(userId, noteId) {
    if (!userId || !noteId) return { success: false, error: 'Invalid note or user identifier' };

    if (window.isFirebaseLive && window.firebaseDB) {
      try {
        // Direct delete: security rules enforce ownership
        await window.firebaseDB.collection('notes').doc(noteId).delete();
        return { success: true };
      } catch (err) {
        const errorMsg = this._notifyError(err, 'Deleting note');
        return { success: false, error: errorMsg };
      }
    }

    // Local Storage Mode
    let notes = window.LocalStore.getNotes(userId);
    const noteExists = notes.some(n => n.id === noteId && n.userId === userId);
    if (!noteExists) {
      return { success: false, error: 'Note not found' };
    }
    notes = notes.filter(n => n.id !== noteId);
    window.LocalStore.saveNotes(userId, notes);
    return { success: true };
  },

  // Get aggregated tag counts across user's notes
  getTagsWithCounts(notes) {
    const tagMap = {};
    if (!Array.isArray(notes)) return [];

    notes.forEach(note => {
      if (Array.isArray(note.tags)) {
        note.tags.forEach(tag => {
          if (typeof tag === 'string') {
            const cleanTag = tag.trim().toLowerCase();
            if (cleanTag) {
              tagMap[cleanTag] = (tagMap[cleanTag] || 0) + 1;
            }
          }
        });
      }
    });

    return Object.entries(tagMap)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  },

  // In-memory search and filter (prevents duplicate Firestore read requests)
  filterNotes(notes, query, selectedTag) {
    if (!Array.isArray(notes)) return [];

    return notes.filter(note => {
      if (!note) return false;

      const matchesTag = !selectedTag || (Array.isArray(note.tags) && note.tags.some(t => typeof t === 'string' && t.toLowerCase() === selectedTag.toLowerCase()));
      if (!matchesTag) return false;

      if (!query || typeof query !== 'string' || !query.trim()) return true;

      const q = query.trim().toLowerCase();
      const inTitle = typeof note.title === 'string' && note.title.toLowerCase().includes(q);
      const inContent = typeof note.content === 'string' && note.content.toLowerCase().includes(q);
      const inTags = Array.isArray(note.tags) && note.tags.some(t => typeof t === 'string' && t.toLowerCase().includes(q));
      const inSummary = typeof note.summary === 'string' && note.summary.toLowerCase().includes(q);

      return inTitle || inContent || inTags || inSummary;
    });
  }
};

window.NotesAPI = NotesAPI;
