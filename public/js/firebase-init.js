/**
 * Firebase configuration for africa-office.
 *
 * ⚠️  ACTION REQUIRED: Replace REPLACE_WITH_API_KEY below.
 *   Firebase Console → Project Settings → General → Web API Key
 *
 * All other values are already filled in from your web app ID.
 * These values are safe to embed in frontend code — access is
 * controlled by Firestore Security Rules.
 */
const firebaseConfig = {
  apiKey:            "REPLACE_WITH_API_KEY",
  authDomain:        "africa-office.firebaseapp.com",
  projectId:         "africa-office",
  storageBucket:     "africa-office.appspot.com",
  messagingSenderId: "485578644088",
  appId:             "1:485578644088:web:9de92c0747468784946b8d",
};

firebase.initializeApp(firebaseConfig);

// Expose Firestore globally (no Functions needed — free Spark plan)
window.db = firebase.firestore();
