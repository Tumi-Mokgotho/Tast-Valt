// Task Vault — authenticated Vercel endpoint for team invitation emails
// No Firebase Admin credentials or Resend SDK required.
// Firebase ID tokens are checked by Firestore when this function reads protected documents.

const PROJECT_ID = "task-vault1";
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

function json(res, status, body) {
  return res.status(status).set("Cache-Control", "no-store").json(body);
}

function field(document, name, type = "stringValue") {
  return document?.fields?.[name]?.[type] ?? null;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function readTokenClaims(token) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid sign-in token.");
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));

  if (
    claims.aud !== PROJECT_ID ||
    claims.iss !== `https://securetoken.google.com/${PROJECT_ID}` ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    !Number.isFinite(claims.exp) ||
    claims.exp * 1000 <= Date.now()
  ) {
    throw new Error("Your sign-in session is invalid or has expired. Please sign in again.");
  }

  return claims;
}

async function getFirestoreDocument(collection, id, token) {
  const safeId = encodeURIComponent(id);
  const response = await fetch(`${FIRESTORE_URL}/${collection}/${safeId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const error = new Error("Could not verify your Task Vault permissions.");
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export default async function handler(req, res) {
    if (req.method !== "POST") {
      return json(res, 405, { error: "Method not allowed." });
    }

    const origin = req.headers.origin;
    const requestOrigin = `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host || ""}`;

    if (!origin || origin !== requestOrigin) {
      return json(res, 403, { error: "This request is not allowed." });
    }

    if (!req.headers["content-type"]?.includes("application/json")) {
      return json(res, 415, { error: "Expected a JSON request." });
    }

    const authorization = req.headers.authorization || "";
    const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
    if (!tokenMatch) {
      return json(res, 401, { error: "Please sign in before sending an invitation." });
    }

    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(res, 400, { error: "Invalid request body." });
    }

    const inviteId = String(body.inviteId || "");
    if (!/^[A-Za-z0-9_-]{10,128}$/.test(inviteId)) {
      return json(res, 400, { error: "Invalid invitation reference." });
    }

    const token = tokenMatch[1];

    try {
      // Decode the UID, then let Firestore validate the token signature and
      // enforce the existing Firestore Security Rules on every document read.
      const claims = readTokenClaims(token);
      const uid = claims.sub;

      const profile = await getFirestoreDocument("users", uid, token);
      if (
        field(profile, "role") !== "manager" ||
        field(profile, "status") !== "active" ||
        !field(profile, "companyId")
      ) {
        return json(res, 403, { error: "Only an active workspace manager can send invitations." });
      }

      const invite = await getFirestoreDocument("invites", inviteId, token);
      if (!invite) {
        return json(res, 404, { error: "Invitation not found in your workspace." });
      }

      const inviteCompanyId = field(invite, "companyId");
      const inviteEmail = String(field(invite, "email") || "").trim().toLowerCase();
      const expiresAt = field(invite, "expiresAt", "timestampValue");

      if (
        inviteCompanyId !== field(profile, "companyId") ||
        field(invite, "createdBy") !== uid
      ) {
        return json(res, 403, { error: "You are not allowed to send this invitation." });
      }

      if (field(invite, "status") !== "pending") {
        return json(res, 409, { error: "This invitation is no longer pending." });
      }

      if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
        return json(res, 410, { error: "This invitation has expired. Create a new invitation." });
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) {
        return json(res, 400, { error: "The invitation does not contain a valid email address." });
      }

      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        return json(res, 503, { error: "Email sending is not configured yet. Add RESEND_API_KEY to Vercel Environment Variables." });
      }

      const from = process.env.RESEND_FROM_EMAIL || "Task Vault <onboarding@resend.dev>";
      const team = String(field(invite, "team") || "Operations");
      const company = await getFirestoreDocument("companies", inviteCompanyId, token).catch(() => null);
      const companyName = String(field(company, "name") || "your team");

      const inviteUrl = new URL("/accept-invite.html", requestOrigin);
      inviteUrl.searchParams.set("invite", inviteId);
      const safeUrl = escapeHtml(inviteUrl.toString());
      const safeCompany = escapeHtml(companyName);
      const safeTeam = escapeHtml(team);

      const subject = "You're invited to join a team on Task Vault";
      const text = [
        `You've been invited to join ${companyName} on Task Vault.`,
        `Team: ${team}`,
        "",
        "Accept your invitation using this link:",
        inviteUrl.toString(),
        "",
        "This invitation expires in 7 days."
      ].join("\n");

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:0 auto;padding:28px">
          <div style="font-size:22px;font-weight:700;margin-bottom:24px">Task Vault</div>
          <h1 style="font-size:25px;margin:0 0 14px">You're invited!</h1>
          <p>You've been invited to join <strong>${safeCompany}</strong> on Task Vault.</p>
          <p>Team: <strong>${safeTeam}</strong></p>
          <p style="margin:28px 0">
            <a href="${safeUrl}" style="display:inline-block;background:#07865b;color:#fff;text-decoration:none;padding:13px 22px;border-radius:7px;font-weight:700">Accept invitation</a>
          </p>
          <p>If the button doesn't work, copy this link into your browser:</p>
          <p><a href="${safeUrl}">${safeUrl}</a></p>
          <p style="color:#64748b;font-size:13px;margin-top:28px">This invitation expires in 7 days. If you weren't expecting it, you can ignore this email.</p>
        </div>
      `;

      const resendResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from,
          to: [inviteEmail],
          subject,
          text,
          html
        })
      });

      const resendResult = await resendResponse.json().catch(() => ({}));
      if (!resendResponse.ok) {
        let message = resendResult.message || resendResult.error || "Resend could not send the invitation email.";
        if (resendResponse.status === 403 && /testing emails|resend\.dev/i.test(message)) {
          message = "Resend's test sender can only email the address registered to your Resend account. To email employees, verify a domain you own in Resend and set RESEND_FROM_EMAIL to an address on that verified domain.";
        }
        return json(res, 502, { error: message });
      }

      return json(res, 200, {
        success: true,
        message: "Invitation email sent.",
        emailId: resendResult.id || null
      });
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        return json(res, 401, { error: "Your session could not be verified. Please sign in again." });
      }
      return json(res, 500, {
        error: error.message || "The invitation email could not be sent."
      });
    }
}
