import { onAuthStateChanged, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
import { auth } from "./firebase.js";
import {
  acceptInvitation, createInvitedAccount, signInInvitedAccount, getInvitation
} from "./invites.js";

const inviteId = new URLSearchParams(window.location.search).get("invite");
const createForm = document.getElementById("create-form");
const loginForm = document.getElementById("login-form");
const message = document.getElementById("invite-message");
const toggle = document.getElementById("toggle-mode");
let mode = "create";
let busy = false;

if (!inviteId) {
  message.textContent = "This invitation link is incomplete. Ask your manager for a new link.";
  createForm.classList.add("hidden");
  loginForm.classList.add("hidden");
  toggle.classList.add("hidden");
}

toggle.addEventListener("click", () => {
  mode = mode === "create" ? "login" : "create";
  createForm.classList.toggle("hidden", mode !== "create");
  loginForm.classList.toggle("hidden", mode !== "login");
  toggle.textContent = mode === "create" ? "Already have an account? Log in" : "New to Task Vault? Create an account";
  message.textContent = "";
});

async function verifyInvitationForUser(user) {
  let invite;
  try {
    invite = await getInvitation(inviteId);
  } catch (error) {
    if (error.code === "permission-denied") {
      throw new Error("This invitation belongs to a different email address. Use the exact email your manager invited.");
    }
    throw error;
  }

  if (!invite) throw new Error("This invitation does not exist. Ask your manager to send a new link.");
  if (invite.status !== "pending") throw new Error("This invitation has already been used or cancelled.");
  if (invite.expiresAt?.toMillis?.() <= Date.now()) {
    throw new Error("This invitation has expired. Ask your manager to send another one.");
  }

  const invitedEmail = String(invite.email || "").trim().toLowerCase();
  const accountEmail = String(user.email || "").trim().toLowerCase();
  if (!accountEmail || invitedEmail !== accountEmail) {
    throw new Error("This invitation was sent to a different email address. Use the exact email your manager invited.");
  }
  return invite;
}

function showSignOutOption() {
  if (document.getElementById("invite-signout")) return;
  const button = document.createElement("button");
  button.id = "invite-signout";
  button.className = "btn ghost";
  button.type = "button";
  button.textContent = "Sign out and use another account";
  button.addEventListener("click", async () => {
    await signOut(auth);
    button.remove();
    createForm.classList.toggle("hidden", mode !== "create");
    loginForm.classList.toggle("hidden", mode !== "login");
    toggle.classList.remove("hidden");
    message.textContent = "Sign in or create an account using the invited email address.";
  });
  message.after(button);
}

async function finishJoining(user, fullName) {
  await verifyInvitationForUser(user);
  await acceptInvitation(inviteId, fullName || user.displayName || user.email, user);
  message.textContent = "Invitation accepted. Opening your tasks…";
  window.location.replace("my-tasks.html");
}

onAuthStateChanged(auth, async user => {
  if (!user || !inviteId || busy) return;
  busy = true;
  createForm.classList.add("hidden");
  loginForm.classList.add("hidden");
  toggle.classList.add("hidden");
  message.textContent = "Checking your invitation…";
  try {
    await finishJoining(user, user.displayName || user.email);
  } catch (error) {
    message.textContent = error.message || "Could not accept this invitation.";
    showSignOutOption();
    busy = false;
  }
});

createForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !inviteId) return;
  busy = true;
  const button = createForm.querySelector("button[type=submit]");
  button.disabled = true;
  message.textContent = "Creating your account and checking the invitation…";
  let createdUser = null;
  try {
    createdUser = await createInvitedAccount({
      fullName: document.getElementById("create-name").value.trim(),
      email: document.getElementById("create-email").value.trim(),
      password: document.getElementById("create-password").value
    });
    await finishJoining(createdUser, document.getElementById("create-name").value.trim());
  } catch (error) {
    let cleanupMessage = "";
    if (createdUser && auth.currentUser?.uid === createdUser.uid) {
      try {
        await deleteUser(createdUser);
        createdUser = null;
        message.textContent = error.message || "Could not accept the invitation.";
      } catch (cleanupError) {
        await signOut(auth).catch(() => {});
        cleanupMessage = " Your account was created but could not be removed automatically. Please contact your manager before trying again.";
        message.textContent = (error.message || "Could not accept the invitation.") + cleanupMessage;
      }
    } else {
      message.textContent = error.message || "Could not create your account or accept the invitation.";
    }
    busy = false;
    button.disabled = false;
  }
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy || !inviteId) return;
  busy = true;
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  message.textContent = "Signing you in and checking the invitation…";
  try {
    const user = await signInInvitedAccount(
      document.getElementById("login-email").value.trim(),
      document.getElementById("login-password").value
    );
    await finishJoining(user, user.displayName || user.email);
  } catch (error) {
    message.textContent = error.message || "Could not sign in or accept the invitation.";
    if (auth.currentUser) showSignOutOption();
    busy = false;
    button.disabled = false;
  }
});
