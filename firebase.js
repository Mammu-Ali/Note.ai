/**
 * Firebase Configuration & Storage Entry
 * Note: Browser HTML entry files load js/firebase.js.
 * This root file provides an explicit pointer to avoid developer ambiguity.
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = require('./js/firebase.js');
}

