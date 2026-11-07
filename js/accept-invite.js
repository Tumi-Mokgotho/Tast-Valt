import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-auth.js";
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
  toggle.classList.add("hidden");
}

toggle.addEventListener("click", () => {
  mode = mode === "create" ? "login" : "create";
  createForm.classList.toggle("hidden", mode !== "create");
  loginForm.classList.toggle("hidden", mode !== "login");
  toggle.textContent = mode === "create" ? "Already have an account? Log in" : "New to Task Vault? Create an account";
  message.textContent = "";
});

onAuthStateChanged(auth, async user => {
  if (!user || !inviteId || busy) return;
  busy = true;
  createForm.classList.add("hidden");
  loginForm.classList.add("hidden");
  toggle.classList.add("hidden");
  message.textContent = "Checking your invitation…";
  try {
    await acceptInvitation(inviteId, user.displayName || user.email, user);
    message.textContent = "Invitation accepted. Opening your workspace…";
    window.location.replace("tasks.html");
  } catch (error) {
    message.textContent = error.message || "Could not accept this invitation.";
    if (error.message?.includes("different email")) {
      const signOutButton = document.createElement("button");
      signOutButton.className = "btn ghost";
      signOutButton.type = "button";
      signOutButton.textContent = "Sign out and use another account";
      signOutButton.addEventListener("click", () => signOut(auth).then(() => window.location.reload()));
      message.after(signOutButton);
    }
    busy = false;
  }
});

createForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const button = createForm.querySelector("button[type=submit]");
  button.disabled = true;
  message.textContent = "Creating your account…";
  try {
    const user = await createInvitedAccount({
      fullName: document.getElementById("create-name").value,
      email: document.getElementById("create-email").value,
      password: document.getElementById("create-password").value
    });
    await acceptInvitation(inviteId, document.getElementById("create-name").value, user);
    message.textContent = "Invitation accepted. Opening your workspace…";
    window.location.replace("tasks.html");
  } catch (error) {
    message.textContent = error.message || "Could not create your account or accept the invitation.";
    busy = false;
    button.disabled = false;
  }
});

loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (busy) return;
  busy = true;
  const button = loginForm.querySelector("button[type=submit]");
  button.disabled = true;
  message.textContent = "Signing you in…";
  try {
    const user = await signInInvitedAccount(
      document.getElementById("login-email").value,
      document.getElementById("login-password").value
    );
    await acceptInvitation(inviteId, user.displayName || user.email, user);
    message.textContent = "Invitation accepted. Opening your workspace…";
    window.location.replace("tasks.html");
  } catch (error) {
    message.textContent = error.message || "Could not sign in.";
    busy = false;
    button.disabled = false;
  }
});
