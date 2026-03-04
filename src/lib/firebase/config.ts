import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "mock-key",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// dont reinit if already running
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let _auth = null;
let _db = null;
let _storage = null;

try {
    _auth = getAuth(app);
    _db = getFirestore(app);
    _storage = getStorage(app);
} catch (error) {
    console.error("Firebase initialized without Auth or Firestore:", error);
}

// triple cast because typescript and js type system cant agree on shit
export const auth = _auth as unknown as ReturnType<typeof getAuth>;
export const db = _db as unknown as ReturnType<typeof getFirestore>;
export const storage = _storage as unknown as ReturnType<typeof getStorage>;
export { app };
