// Task Vault — Firestore data layer
// Company-scoped helpers for tasks and users.

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  getDocs
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";
import { db } from "./firebase.js";

/* ---------- Tasks ---------- */

export function watchTasks(companyId, cb, onError) {
  const q = query(
    collection(db, "tasks"),
    where("companyId", "==", companyId),
    orderBy("createdAt", "desc")
  );
  return onSnapshot(q, snap => {
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    tasks.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(tasks);
  }, onError);
}

export function watchMyTasks(companyId, assigneeId, cb, onError) {
  const q = query(
    collection(db, "tasks"),
    where("companyId", "==", companyId),
    where("assigneeId", "==", assigneeId)
  );
  return onSnapshot(q, snap => {
    const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    tasks.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    cb(tasks);
  }, onError);
}

export function watchTask(taskId, cb, onError) {
  return onSnapshot(doc(db, "tasks", taskId), snap => {
    if (snap.exists()) cb({ id: snap.id, ...snap.data() });
    else cb(null);
  }, onError);
}

export async function createTask(companyId, uid, data) {
  const ref = await addDoc(collection(db, "tasks"), {
    companyId,
    createdBy: uid,
    title: data.title,
    assigneeId: data.assigneeId || null,
    assigneeName: data.assigneeName || "",
    dueDate: data.dueDate || null,
    priority: data.priority || "Normal",
    status: "Not started",
    description: data.description || "",
    checklist: data.checklist || [],
    evidence: [],
    activity: [{
      at: new Date().toISOString(),
      by: uid,
      text: "created the task"
    }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateTask(taskId, patch) {
  await updateDoc(doc(db, "tasks", taskId), {
    ...patch,
    updatedAt: serverTimestamp()
  });
}

export async function deleteTask(taskId) {
  await deleteDoc(doc(db, "tasks", taskId));
}

/* ---------- Users / teams ---------- */

export function watchUsers(companyId, cb, onError) {
  const q = query(collection(db, "users"), where("companyId", "==", companyId));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, onError);
}

export async function listUsersOnce(companyId) {
  const q = query(collection(db, "users"), where("companyId", "==", companyId));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}