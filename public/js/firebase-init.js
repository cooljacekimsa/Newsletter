/**
 * Firebase configuration for africa-office.
 *
 * How to find your config values:
 *   Firebase Console → Project Settings → Your apps → Web app → Config
 *
 * These values are SAFE to embed in frontend code.
 * Access control is enforced by Firestore Security Rules.
 */
const firebaseConfig = {
  apiKey:            "REPLACE_ME",
  authDomain:        "africa-office.firebaseapp.com",
  projectId:         "africa-office",
  storageBucket:     "africa-office.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId:             "REPLACE_ME",
};

firebase.initializeApp(firebaseConfig);

// Expose globally
window.db        = firebase.firestore();
window.functions = firebase.app().functions('asia-northeast3');
