import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

export const firebaseConfig = {
  apiKey: "AIzaSyBAX_OQYqVOh7LmWDrOQubMYZR9zgnZF2M",
  authDomain: "katuro-ai.firebaseapp.com",
  projectId: "katuro-ai",
  storageBucket: "katuro-ai.firebasestorage.app",
  messagingSenderId: "619876856787",
  appId: "1:619876856787:web:8c4e93ed9eb7765c597526",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

// `storage` and `functions` are intentionally NOT initialized here — both are
// only needed by a handful of features (avatar upload, Gemini Cloud Function
// calls). Eagerly exporting them from this file would pull the full
// firebase/storage and firebase/functions SDKs into the main entry bundle,
// since this module is imported on every page. Callers import them lazily
// from 'firebase/storage' / 'firebase/functions' directly instead.

export default app;