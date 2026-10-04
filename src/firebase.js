import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// QA only: `VITE_FIREBASE_EMULATORS=1 vite` runs the app against the local Firebase
// emulators (demo project, no real data). Never set for production builds.
export const USE_EMULATORS = import.meta.env.VITE_FIREBASE_EMULATORS === "1";

export const firebaseConfig = {
  apiKey: "AIzaSyBAX_OQYqVOh7LmWDrOQubMYZR9zgnZF2M",
  authDomain: "katuro-ai.firebaseapp.com",
  projectId: USE_EMULATORS ? "demo-katuro" : "katuro-ai",
  storageBucket: "katuro-ai.firebasestorage.app",
  messagingSenderId: "619876856787",
  appId: "1:619876856787:web:8c4e93ed9eb7765c597526",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

if (USE_EMULATORS) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  import("firebase/functions").then(({ getFunctions, connectFunctionsEmulator }) => {
    connectFunctionsEmulator(getFunctions(app, "us-central1"), "127.0.0.1", 5001);
  });
}

// `storage` and `functions` are intentionally NOT initialized here — both are
// only needed by a handful of features (avatar upload, Gemini Cloud Function
// calls). Eagerly exporting them from this file would pull the full
// firebase/storage and firebase/functions SDKs into the main entry bundle,
// since this module is imported on every page. Callers import them lazily
// from 'firebase/storage' / 'firebase/functions' directly instead.

export default app;