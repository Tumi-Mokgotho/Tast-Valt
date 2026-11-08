import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "task-vault1";

function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(status).json(body);
}

function getAdminServices() {
  if (!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Permanent employee deletion is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON to Vercel Environment Variables.");
  }

  if (!getApps().length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: String(serviceAccount.private_key || "").replace(/\\n/g, "\n")
      }),
      projectId: PROJECT_ID
    });
  }

  return { auth: getAuth(), db: getFirestore() };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed." });

  const origin = req.headers.origin;
  const requestOrigin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host || ""}`;
  if (!origin || origin !== requestOrigin) {
    return json(res, 403, { error: "This request is not allowed." });
  }

  const match = String(req.headers.authorization || "").match(/^Bearer\s+(.+)$/i);
  if (!match) return json(res, 401, { error: "Please sign in again." });

  const employeeUid = String(req.body?.employeeUid || "");
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(employeeUid) || req.body?.action !== "delete") {
    return json(res, 400, { error: "Invalid employee deletion request." });
  }

  try {
    const { auth, db } = getAdminServices();
    const claims = await auth.verifyIdToken(match[1]);
    const managerRef = db.collection("users").doc(claims.uid);
    const employeeRef = db.collection("users").doc(employeeUid);
    const [managerSnap, employeeSnap] = await Promise.all([managerRef.get(), employeeRef.get()]);

    if (!managerSnap.exists || managerSnap.data().role !== "manager" ||
        managerSnap.data().status !== "active" || !managerSnap.data().companyId) {
      return json(res, 403, { error: "Only an active workspace manager can delete employees." });
    }

    if (!employeeSnap.exists) return json(res, 404, { error: "Employee profile was not found." });
    const employee = employeeSnap.data();
    if (employeeUid === claims.uid || employee.role !== "employee" ||
        employee.companyId !== managerSnap.data().companyId) {
      return json(res, 403, { error: "You can only delete employees in your own workspace." });
    }

    const previousStatus = employee.status === "inactive" ? "inactive" : "active";
    await employeeRef.update({ status: "deleting" });

    // Preserve the company's task history. Remove the employee assignment and
    // leave an audit entry rather than deleting tasks.
    const assignedTasks = await db.collection("tasks")
      .where("assigneeId", "==", employeeUid).get();
    const companyTasks = assignedTasks.docs.filter(doc => doc.data().companyId === employee.companyId);

    for (let i = 0; i < companyTasks.length; i += 400) {
      const batch = db.batch();
      for (const taskDoc of companyTasks.slice(i, i + 400)) {
        batch.update(taskDoc.ref, {
          assigneeId: null,
          assigneeName: "Former employee",
          activity: FieldValue.arrayUnion({
            at: new Date().toISOString(),
            by: claims.uid,
            text: "unassigned because the employee account was permanently deleted"
          }),
          updatedAt: FieldValue.serverTimestamp()
        });
      }
      await batch.commit();
    }

    try {
      await auth.deleteUser(employeeUid);
    } catch (error) {
      if (error.code !== "auth/user-not-found") {
        await employeeRef.update({ status: previousStatus }).catch(() => {});
        throw error;
      }
    }

    await employeeRef.delete();
    return json(res, 200, {
      success: true,
      message: "Employee account and profile deleted. Assigned tasks were retained and unassigned.",
      tasksUpdated: companyTasks.length
    });
  } catch (error) {
    console.error("Task Vault employee deletion failed:", error);
    const status = error.code === "auth/id-token-expired" || error.code === "auth/argument-error" ? 401 : 500;
    return json(res, status, {
      error: status === 401 ? "Your session expired. Please sign in again." :
        (error.message || "The employee could not be deleted.")
    });
  }
}
