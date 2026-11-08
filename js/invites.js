// Task Vault — secure team invitations
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where,
  runTransaction, serverTimestamp, Timestamp, setDoc
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { auth, db } from "./firebase.js";

const INVITE_DAYS = 7;

export async function createInvitation({ companyId, email, team, inviterUid }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error("Enter a valid employee email address.");
  }
  if (!companyId || !inviterUid) throw new Error("Your manager session is missing workspace details.");

  const id = crypto.randomUUID().replaceAll("-", "");
  const expiresAt = Timestamp.fromDate(new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000));
  await setDoc(doc(db, "invites", id), {
    companyId,
    email: normalizedEmail,
    team: String(team || "Operations").trim() || "Operations",
    createdBy: inviterUid,
    status: "pending",
    createdAt: serverTimestamp(),
    expiresAt
  });
  return id;
}

export function watchInvitations(companyId, callback, onError) {
  const q = query(collection(db, "invites"), where("companyId", "==", companyId));
  return onSnapshot(q, snapshot => {
    const invites = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    invites.sort((a, b) => {
      const at = a.createdAt?.toMillis?.() || 0;
      const bt = b.createdAt?.toMillis?.() || 0;
      return bt - at;
    });
    callback(invites);
  }, onError);
}

export async function acceptInvitation(inviteId, fullName, user) {
  if (!inviteId) throw new Error("This invitation link is missing its invitation code.");
  if (!user?.uid || !user.email) throw new Error("Sign in with the invited email address first.");

  const inviteRef = doc(db, "invites", inviteId);
  const userRef = doc(db, "users", user.uid);
  const normalizedEmail = user.email.trim().toLowerCase();

  await runTransaction(db, async transaction => {
    const inviteSnap = await transaction.get(inviteRef);
    const userSnap = await transaction.get(userRef);

    if (!inviteSnap.exists()) throw new Error("This invitation does not exist or the link is invalid.");
    if (userSnap.exists()) throw new Error("This account already has a Task Vault workspace profile.");
    const invite = inviteSnap.data();

    if (invite.status !== "pending") throw new Error("This invitation has already been used or cancelled.");
    if (invite.expiresAt?.toMillis?.() <= Date.now()) throw new Error("This invitation has expired. Ask your manager to send another one.");
    if (String(invite.email || "").toLowerCase() !== normalizedEmail) {
      throw new Error("This invitation was sent to a different email address. Sign in with the invited email.");
    }

    transaction.set(userRef, {
      fullName: String(fullName || user.displayName || normalizedEmail).trim(),
      email: normalizedEmail,
      companyId: invite.companyId,
      role: "employee",
      team: invite.team || "Operations",
      status: "active",
      inviteId,
      createdAt: serverTimestamp()
    });
    transaction.update(inviteRef, {
      status: "accepted",
      acceptedBy: user.uid,
      acceptedAt: serverTimestamp()
    });
  });
}

export async function createInvitedAccount({ email, password, fullName }) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: fullName.trim() });
  return credential.user;
}

export async function signInInvitedAccount(email, password) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}

export async function getInvitation(inviteId) {
  const snapshot = await getDoc(doc(db, "invites", inviteId));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}
