import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const PROJECT_ID = "task-vault1";

function json(res, status, body) {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  return res.status(status).json(body);
}

function getAdminServices() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("The secure Firebase server connection is not configured.");

  if (!getApps().length) {
    const serviceAccount = JSON.parse(raw);
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

function millis(value) {
  return value && typeof value.toMillis === "function" ? value.toMillis() : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed." });
  }

  const origin = req.headers.origin;
  const requestOrigin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host || ""}`;
  if (origin && origin !== requestOrigin) {
    return json(res, 403, { error: "This request is not allowed." });
  }

  const match = String(req.headers.authorization || "").match(/^Bearer\\s+(.+)$/i);
  if (!match) return json(res, 401, { error: "Please sign in again." });

  try {
    const { auth, db } = getAdminServices();
    const claims = await auth.verifyIdToken(match[1]);
    const managerSnap = await db.collection("users").doc(claims.uid).get();

    if (!managerSnap.exists) {
      return json(res, 403, { error: "Your workspace manager profile could not be found." });
    }

    const manager = managerSnap.data();
    if (manager.role !== "manager" || (manager.status && manager.status !== "active") || !manager.companyId) {
      return json(res, 403, { error: "Only an active workspace manager can view team members." });
    }

    const [usersSnap, invitesSnap] = await Promise.all([
      db.collection("users").where("companyId", "==", manager.companyId).get(),
      db.collection("invites").where("companyId", "==", manager.companyId).get()
    ]);

    const users = usersSnap.docs.map(document => {
      const data = document.data();
      return {
        id: document.id,
        fullName: data.fullName || "",
        email: data.email || "",
        role: data.role || "",
        team: data.team || "",
        status: data.status || "active"
      };
    }).sort((a, b) => a.fullName.localeCompare(b.fullName));

    const invitations = invitesSnap.docs.map(document => {
      const data = document.data();
      return {
        id: document.id,
        email: data.email || "",
        team: data.team || "",
        status: data.status || "",
        createdAt: millis(data.createdAt),
        expiresAt: millis(data.expiresAt)
      };
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    return json(res, 200, { users, invitations });
  } catch (error) {
    console.error("Task Vault manager data request failed:", error);
    const status = error.code === "auth/id-token-expired" || error.code === "auth/argument-error" ? 401 : 500;
    return json(res, status, {
      error: status === 401
        ? "Your session expired. Please sign in again."
        : "Task Vault could not retrieve team data from Firebase."
    });
  }
}
