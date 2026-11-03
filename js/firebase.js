// Task Vault — Firebase configuration
// Security comes from Auth + Firestore/Storage Rules, not from hiding this config.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyDzlUOXa5EFogPfnUlUmCFB1slQKpPkWEY",
  authDomain: "task-vault1.firebaseapp.com",
  projectId: "task-vault1",
  storageBucket: "task-vault1.firebasestorage.app",
  messagingSenderId: "359762621782",
  appId: "1:359762621782:web:6ebe7813541dfb323752f7"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);