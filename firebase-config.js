// AERO CRASH - FIREBASE CONFIGURATION
// Firebase project: aviator-66312

const firebaseConfig = {
  apiKey: "AIzaSyAMkJ8hGJxGfmbKOon7uB5U-62gpVPo3KU",
  authDomain: "aviator-66312.firebaseapp.com",
  projectId: "aviator-66312",
  storageBucket: "aviator-66312.firebasestorage.app",
  messagingSenderId: "717261508619",
  appId: "1:717261508619:web:7610d061c2856bd03a370e",
  measurementId: "G-CVL2ENGNE2"
};

// Initialize Firebase if loaded
let fbApp = null;
let fbAuth = null;
let fbDb = null;

try {
  if (typeof firebase !== "undefined") {
    fbApp = firebase.initializeApp(firebaseConfig);
    fbAuth = firebase.auth();
    fbDb = firebase.firestore();
    console.log("[AeroCrash] Firebase initialized successfully.");
  }
} catch (e) {
  console.warn("[AeroCrash] Firebase init warning:", e.message);
}

const ADMIN_EMAILS = [
  "carrentpedatabase@gmail.com",
];

window.AERO_FIREBASE = {
  config: firebaseConfig,
  app: fbApp,
  auth: fbAuth,
  db: fbDb,
  adminEmails: ADMIN_EMAILS,
  // Helper to check if email is an authorized admin
  isAdminEmail: function(email) {
    if (!email) return false;
    const lower = email.trim().toLowerCase();
    if (ADMIN_EMAILS.includes(lower)) return true;
    return lower.startsWith("admin") || lower.includes("admin@") || lower.includes("@admin.");
  }
};
