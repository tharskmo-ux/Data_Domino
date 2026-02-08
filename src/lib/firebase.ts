import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics, isSupported } from "firebase/analytics";

// Placeholder config - User will need to replace this with actual credentials
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "PLACEHOLDER",
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "data-domino-abc.firebaseapp.com",
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "data-domino-abc",
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "data-domino-abc.appspot.com",
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "PLACEHOLDER",
    appId: import.meta.env.VITE_FIREBASE_APP_ID || "PLACEHOLDER",
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "PLACEHOLDER"
};

// Robust check for demo mode: if API key is empty, placeholder, or specifically set to "demo"
export const IS_DEMO_MODE =
    !firebaseConfig.apiKey ||
    firebaseConfig.apiKey === "PLACEHOLDER" ||
    firebaseConfig.apiKey === "" ||
    import.meta.env.VITE_USE_DEMO_MODE === "true";

console.log("[Firebase] Config:", { ...firebaseConfig, apiKey: "***" });
console.log("[Firebase] Is Demo Mode:", IS_DEMO_MODE);

let app: any;
let auth: any;
let db: any;
let storage: any;
let analytics: any;

if (!IS_DEMO_MODE) {
    try {
        console.log("[Firebase] Initializing production services...");
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        storage = getStorage(app);
        isSupported().then(yes => {
            if (yes) analytics = getAnalytics(app);
        });
    } catch (err) {
        console.error("[Firebase] Initialization failed:", err);
    }
} else {
    console.warn("[Firebase] Operating in DEMO MODE. No real backend calls will be made.");
}

export { auth, db, storage, analytics };
export default app;
