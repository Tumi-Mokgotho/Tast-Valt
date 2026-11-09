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
  updateDoc,
  arrayUnion,
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


test("manager can deactivate an employee and inactive employee cannot read assigned tasks", async () => {
  const managerDb = testEnv.authenticatedContext("managerA", {
    email: "managerA@example.com"
  }).firestore();

  await assertSucceeds(updateDoc(doc(managerDb, "users", "employeeA"), {
    status: "inactive"
  }));

  const employeeDb = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertFails(getDocs(query(
    collection(employeeDb, "tasks"),
    where("companyId", "==", "companyA"),
    where("assigneeId", "==", "employeeA")
  )));
});

test("inactive employee cannot update an assigned task", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "users", "employeeA"), {
      status: "inactive"
    });
  });

  const employeeDb = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertFails(updateDoc(doc(employeeDb, "tasks", "taskForA"), {
    status: "Submitted"
  }));
});


test("employee can move an assigned task from Not started to In progress", async () => {
  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertSucceeds(updateDoc(doc(db, "tasks", "taskForA"), {
    status: "In progress"
  }));
});

test("employee can submit an active task for manager review", async () => {
  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertSucceeds(updateDoc(doc(db, "tasks", "taskForA"), {
    status: "Submitted"
  }));
});

test("employee cannot submit a task that is already Approved", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "tasks", "taskForA"), {
      status: "Approved"
    });
  });

  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertFails(updateDoc(doc(db, "tasks", "taskForA"), {
    status: "Submitted"
  }));
});

test("employee cannot change a task directly to Approved", async () => {
  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertFails(updateDoc(doc(db, "tasks", "taskForA"), {
    status: "Approved"
  }));
});

test("employee cannot edit a task while it is waiting for review", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "tasks", "taskForA"), {
      status: "Submitted"
    });
  });

  const db = testEnv.authenticatedContext("employeeA", {
    email: "employeeA@example.com"
  }).firestore();

  await assertFails(updateDoc(doc(db, "tasks", "taskForA"), {
    notes: "Changed after submission"
  }));
});


test("manager review appends activity without deleting previous task history", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "tasks", "taskForA"), {
      activity: [{ at: "2026-01-01T10:00:00.000Z", by: "managerA", text: "created the task" }]
    });
  });

  const db = testEnv.authenticatedContext("managerA", {
    email: "managerA@example.com"
  }).firestore();

  await assertSucceeds(updateDoc(doc(db, "tasks", "taskForA"), {
    status: "Approved",
    activity: arrayUnion({
      at: "2026-01-02T10:00:00.000Z",
      by: "managerA",
      text: "approved the task"
    })
  }));

  const { getDoc } = await import("firebase/firestore");
  const task = await getDoc(doc(db, "tasks", "taskForA"));
  assert.equal(task.data().activity.length, 2);
  assert.equal(task.data().activity[0].text, "created the task");
  assert.equal(task.data().activity[1].text, "approved the task");
});


test("manager can record the actual approval timestamp", async () => {
  const db = testEnv.authenticatedContext("managerA", {
    email: "managerA@example.com"
  }).firestore();

  await assertSucceeds(updateDoc(doc(db, "tasks", "taskForA"), {
    status: "Approved",
    completedAt: serverTimestamp()
  }));
});

test("manager can reactivate a previously deactivated employee", async () => {
  await testEnv.withSecurityRulesDisabled(async context => {
    await updateDoc(doc(context.firestore(), "users", "employeeA"), {
      status: "inactive"
    });
  });

  const managerDb = testEnv.authenticatedContext("managerA", {
    email: "managerA@example.com"
  }).firestore();

  await assertSucceeds(updateDoc(doc(managerDb, "users", "employeeA"), {
    status: "active"
  }));
});
