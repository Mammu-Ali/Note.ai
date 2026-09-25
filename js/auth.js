/**
 * Authentication Module (auth.js)
 * Manages user sign-in, registration, logout, and session checks
 */

const Auth = {
  // Get currently logged-in user
  async getCurrentUser() {
    if (window.isFirebaseLive && window.firebaseAuth) {
      return new Promise((resolve) => {
        const unsubscribe = window.firebaseAuth.onAuthStateChanged((user) => {
          unsubscribe();
          if (user) {
            resolve({
              uid: user.uid,
              name: user.displayName || user.email.split('@')[0],
              email: user.email
            });
          } else {
            resolve(null);
          }
        }, (err) => {
          console.error("Auth state check error:", err);
          resolve(null);
        });
      });
    }
    return window.LocalStore.getUser();
  },

  // Register a new user
  async register(name, email, password) {
    if (window.isFirebaseLive && window.firebaseAuth) {
      try {
        const cred = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
        await cred.user.updateProfile({ displayName: name });
        // Store in Firestore users collection (if available and permitted)
        if (window.firebaseDB) {
          try {
            await window.firebaseDB.collection('users').doc(cred.user.uid).set({
              name: name,
              email: email,
              createdAt: new Date().toISOString()
            });
          } catch (dbErr) {
            console.warn("Firestore user profile save skipped/failed:", dbErr.message);
          }
        }
        const userObj = { uid: cred.user.uid, name, email };
        window.LocalStore.setUser(userObj);
        return { success: true, user: userObj };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // Local / Demo Mode Registration
    const userObj = {
      uid: 'user_' + Date.now(),
      name: name.trim() || 'Demo User',
      email: email.trim().toLowerCase()
    };
    window.LocalStore.setUser(userObj);
    return { success: true, user: userObj };
  },

  // Log in existing user
  async login(email, password) {
    if (window.isFirebaseLive && window.firebaseAuth) {
      try {
        const cred = await window.firebaseAuth.signInWithEmailAndPassword(email, password);
        const userObj = {
          uid: cred.user.uid,
          name: cred.user.displayName || email.split('@')[0],
          email: cred.user.email
        };
        window.LocalStore.setUser(userObj);
        return { success: true, user: userObj };
      } catch (err) {
        return { success: false, error: err.message };
      }
    }

    // Local / Demo Mode Login
    const userObj = {
      uid: 'demo_user',
      name: email ? email.split('@')[0] : 'Demo User',
      email: email || 'demo@ainotes.local'
    };
    window.LocalStore.setUser(userObj);
    return { success: true, user: userObj };
  },

  // Instant Guest / Demo Sign-in
  async loginAsGuest() {
    if (window.isFirebaseLive && window.firebaseAuth) {
      try {
        await window.firebaseAuth.signOut();
      } catch (e) {
        // ignore signout errors when switching to guest mode
      }
    }
    const guestUser = {
      uid: 'demo_guest',
      name: 'Guest Explorer',
      email: 'guest@ainotes.app'
    };
    window.LocalStore.setUser(guestUser);
    return { success: true, user: guestUser };
  },

  // Log out current user
  async logout() {
    if (window.isFirebaseLive && window.firebaseAuth) {
      try {
        await window.firebaseAuth.signOut();
      } catch (err) {
        console.warn("Firebase signout warning", err);
      }
    }
    window.LocalStore.setUser(null);
    window.location.href = 'login.html';
  },

  // Redirect to login if user is not logged in (used on protected pages)
  async requireAuth() {
    const user = await this.getCurrentUser();
    if (!user) {
      window.location.href = 'login.html';
      return null;
    }
    return user;
  }
};

window.Auth = Auth;
