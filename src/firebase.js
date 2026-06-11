import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;