// Task Vault — Auth module
// Handles signup (creates company + manager profile), login, logout, resets,
// and route guards. Requires js/firebase.js to be loaded as a module.

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

/* ---------- Sign up ---------- */
export async function signUp({ companyName, fullName, email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;

  await updateProfile(cred.user, { displayName: fullName });

  const companyId = crypto.randomUUID();

  await setDoc(doc(db, "companies", companyId), {
    name: companyName,
    ownerUid: uid,
    createdAt: serverTimestamp()
  });

  await setDoc(doc(db, "users", uid), {
    fullName,
    email,
    companyId,
    role: "manager",
    team: "Operations",
    status: "active",
    createdAt: serverTimestamp()
  });

  return cred.user;
}

/* ---------- Login ---------- */
export async function logIn(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

/* ---------- Logout ---------- */
export async function logOut() {
  await signOut(auth);
}

/* ---------- Password reset ---------- */
export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email);
}

/* ---------- Load profile + company ---------- */
export async function loadProfile(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  const profile = { uid, ...snap.data() };
  const companySnap = await getDoc(doc(db, "companies", profile.companyId));
  profile.company = companySnap.exists() ? companySnap.data() : null;
  return profile;
}

/* ---------- Route guards ---------- */
export function requireAuth(onReady) {
  let unsubscribe = () => {};
  unsubscribe = onAuthStateChanged(auth, async (user) => {
    unsubscribe();
    if (!user) {
      window.location.replace("login.html");
      return;
    }
    try {
      const profile = await loadProfile(user.uid);
      onReady(user, profile);
    } catch (error) {
      console.error("Task Vault could not load the signed-in user's profile:", error);
      const message = error?.message || "An unknown error occurred.";
      const topbarStatus = document.querySelector(".topbar .small");
      if (topbarStatus) topbarStatus.textContent = "Could not load your workspace.";
      const main = document.querySelector("main .content") || document.querySelector("main");
      if (main && !document.getElementById("auth-load-error")) {
        const notice = document.createElement("div");
        notice.id = "auth-load-error";
        notice.className = "notice";
        notice.setAttribute("role", "alert");
        notice.textContent = "Task Vault could not load your account or workspace details: " + message + " Please refresh the page. If this continues, check your Firebase connection and Firestore permissions.";
        main.prepend(notice);
      }
    }
  });
}

export function requireGuest(redirectTo = "dashboard.html") {
  const unsub = onAuthStateChanged(auth, (user) => {
    unsub();
    if (user) window.location.replace(redirectTo);
  });
}

/* ---------- Friendly errors ---------- */
export function friendlyAuthError(err) {
  switch (err.code) {
    case "auth/email-already-in-use": return "That email is already registered. Try logging in instead.";
    case "auth/invalid-email": return "That email address looks invalid.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/operation-not-allowed": return "Email/password sign-in is not enabled in Firebase yet.";
    case "auth/invalid-credential":
    case "auth/wrong-password": return "Email or password is incorrect.";
    case "auth/too-many-requests": return "Too many attempts. Please wait a minute and try again.";
    default: return err.message || "Something went wrong. Please try again.";
  }
}

/* ---------- Topbar helper used by app pages ---------- */
export function wireTopbar(user, profile) {
  const nameEl = document.querySelector(".user-chip .name");
  const avatarEl = document.querySelector(".user-chip .avatar");
  const smallEl = document.querySelector(".topbar .small");

  const fullName = profile?.fullName || user.displayName || user.email || "User";
  if (nameEl) nameEl.textContent = fullName;
  if (avatarEl) avatarEl.textContent = initials(fullName);
  if (smallEl && profile?.company) smallEl.textContent = profile.company.name;

  const chip = document.querySelector(".user-chip");
  if (chip && !chip.querySelector("[data-logout]")) {
    const btn = document.createElement("button");
    btn.className = "btn sm";
    btn.textContent = "Log out";
    btn.dataset.logout = "";
    btn.style.marginLeft = "12px";
    btn.addEventListener("click", async () => {
      await logOut();
      window.location.replace("login.html");
    });
    chip.appendChild(btn);
  }
}

function initials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join("") || "U";
}