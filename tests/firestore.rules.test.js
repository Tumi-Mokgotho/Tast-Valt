import { before, after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  setDoc,
  runTransaction,
  serverTimestamp,
  Timestamp
} from "firebase/firestore";

const projectId = "demo-task-vault-rules";
const rulesPath = new URL("../firestore.rules", import.meta.url);
const rules = readFileSync(fileURLToPath(rulesPath), "utf8");
let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules }
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    const future = Timestamp.fromMillis(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await setDoc(doc(db, "companies", "companyA"), {
      name: "Company A",
      ownerUid: "managerA",
      createdAt: Timestamp.now()
    });
    await setDoc(doc(db, "companies", "companyB"), {
      name: "Company B",
      ownerUid: "managerB",
      createdAt: Timestamp.now()
    });

    await setDoc(doc(db, "users", "managerA"), {
      fullName: "Manager A", email: "managerA@example.com",
      companyId: "companyA", role: "manager", team: "Operations",
      status: "active", createdAt: Timestamp.now()
    });
    await setDoc(doc(db, "users", "employeeA"), {
      fullName: "Employee A", email: "employeeA@example.com",
      companyId: "companyA", role: "employee", team: "Operations",
      status: "active", createdAt: Timestamp.now()
    });
    await setDoc(doc(db, "users", "employeeB"), {
      fullName: "Employee B", email: "employeeB@example.com",
      companyId: "companyA", role: "employee", team: "Cleaning",
      status: "active", createdAt: Timestamp.now()
    });
    await setDoc(doc(db, "users", "managerB"), {
      fullName: "Manager B", email: "managerB@example.com",
      companyId: "companyB", role: "manager", team: "Operations",
      status: "active", createdAt: Timestamp.now()
    });

    await setDoc(doc(db, "tasks", "taskForA"), {
      companyId: "companyA", createdBy: "managerA", title: "Task for A",
      assigneeId: "employeeA", assigneeName: "Employee A",
      status: "Not started", createdAt: Timestamp.now()
    });
    await setDoc(doc(db, "tasks", "taskForB"), {
      companyId: "companyA", createdBy: "managerA", title: "Task for B",
      assigneeId: "employeeB", assigneeName: "Employee B",
      status: "Not started", createdAt: Timestamp.now()
    });
    await setDoc(doc(db, "tasks", "taskCompanyB"), {
      companyId: "companyB", createdBy: "managerB", title: "Private task",
      assigneeId: "managerB", assigneeName: "Manager B",
      status: "Not started", createdAt: Timestamp.now()
    });

    await setDoc(doc(db, "invites", "inviteA"), {
      companyId: "companyA",
      email: "newemployee@example.com",
      team: "Operations",
      createdBy: "managerA",
      status: "pending",
      createdAt: Timestamp.now(),
      expiresAt: future
    });
  });
});

test("employee can query only their own assigned tasks", async () => {
  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  const ownQuery = query(
    collection(db, "tasks"),
    where("companyId", "==", "companyA"),
    where("assigneeId", "==", "employeeA")
  );
  const result = await assertSucceeds(getDocs(ownQuery));
  assert.equal(result.size, 1);
  assert.equal(result.docs[0].id, "taskForA");

  const broadQuery = query(
    collection(db, "tasks"),
    where("companyId", "==", "companyA")
  );
  await assertFails(getDocs(broadQuery));
});

test("manager can list company tasks and team members", async () => {
  const db = testEnv.authenticatedContext("managerA", {
    email: "managerA@example.com"
  }).firestore();

  const tasks = await assertSucceeds(getDocs(query(
    collection(db, "tasks"),
    where("companyId", "==", "companyA")
  )));
  assert.equal(tasks.size, 2);

  const users = await assertSucceeds(getDocs(query(
    collection(db, "users"),
    where("companyId", "==", "companyA")
  )));
  assert.equal(users.size, 3);
});

test("employee cannot list the whole company team", async () => {
  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertFails(getDocs(query(
    collection(db, "users"),
    where("companyId", "==", "companyA")
  )));
});

test("manager can create a pending invitation for their company", async () => {
  const db = testEnv.authenticatedContext("managerA", {
    email: "managerA@example.com"
  }).firestore();

  await assertSucceeds(setDoc(doc(db, "invites", "newInvite"), {
    companyId: "companyA",
    email: "anotheremployee@example.com",
    team: "Cleaning",
    createdBy: "managerA",
    status: "pending",
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60 * 1000)
  }));
});

test("invited email can atomically create its employee profile and accept invite", async () => {
  const db = testEnv.authenticatedContext("newEmployee", {
    email: "newemployee@example.com"
  }).firestore();

  await assertSucceeds(runTransaction(db, async transaction => {
    transaction.set(doc(db, "users", "newEmployee"), {
      fullName: "New Employee",
      email: "newemployee@example.com",
      companyId: "companyA",
      role: "employee",
      team: "Operations",
      status: "active",
      inviteId: "inviteA",
      createdAt: serverTimestamp()
    });
    transaction.update(doc(db, "invites", "inviteA"), {
      status: "accepted",
      acceptedBy: "newEmployee",
      acceptedAt: serverTimestamp()
    });
  }));
});

test("a different email cannot accept the invitation", async () => {
  const db = testEnv.authenticatedContext("wrongPerson", {
    email: "wrong@example.com"
  }).firestore();

  await assertFails(runTransaction(db, async transaction => {
    transaction.set(doc(db, "users", "wrongPerson"), {
      fullName: "Wrong Person",
      email: "wrong@example.com",
      companyId: "companyA",
      role: "employee",
      team: "Operations",
      status: "active",
      inviteId: "inviteA",
      createdAt: serverTimestamp()
    });
    transaction.update(doc(db, "invites", "inviteA"), {
      status: "accepted",
      acceptedBy: "wrongPerson",
      acceptedAt: serverTimestamp()
    });
  }));
});

test("employee cannot read another company's task", async () => {
  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertFails(getDocs(query(
    collection(db, "tasks"),
    where("companyId", "==", "companyB")
  )));
});
