/**
 * Firebase configuration for newslettersa-d21db.
 *
 * These values are safe to embed in frontend code — access is
 * controlled by Firestore Security Rules.
 */
const firebaseConfig = {
  apiKey:            "AIzaSyCKOaVh7zqglStR7QUMVE88Y_fZvVUZg10",
  authDomain:        "newslettersa-d21db.firebaseapp.com",
  projectId:         "newslettersa-d21db",
  storageBucket:     "newslettersa-d21db.firebasestorage.app",
  messagingSenderId: "779985522966",
  appId:             "1:779985522966:web:f33703c9fd4eadf9360037",
};

firebase.initializeApp(firebaseConfig);

// Expose Firestore and Auth globally (no Functions needed — free Spark plan)
window.db   = firebase.firestore();
window.auth = firebase.auth();
