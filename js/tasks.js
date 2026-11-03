// Task Vault — Tasks page (Firestore-backed)

import { requireAuth, wireTopbar } from "./auth.js";
import { watchTasks, createTask, deleteTask, updateTask, watchUsers } from "./data.js";

let currentCompanyId = null;
let currentUid = null;
let allTasks = [];
let allUsers = [];

requireAuth((user, profile) => {
  wireTopbar(user, profile);
  if (!profile?.companyId) return;
  currentCompanyId = profile.companyId;
  currentUid = user.uid;

  // Load team for the assignee dropdown
  watchUsers(profile.companyId, (users) => {
    allUsers = users;
    renderAssigneeOptions(users);
  });

  // Live tasks
  watchTasks(profile.companyId, (tasks) => {
    allTasks = tasks;
    renderTasks();
  }, (err) => {
    console.error("tasks:", err);
    const tbody = document.getElementById("tasks-table-body");
    if (tbody) tbody.innerHTML =
      `<tr><td colspan="6" class="small" style="padding:16px">Could not load tasks: ${esc(err.message)}</td></tr>`;
  });
});

/* ---------- Form ---------- */
const formSection = document.getElementById("new-task");
const showBtn = document.querySelector("[data-show-task-form]");
const hideBtn = document.querySelector("[data-hide-task-form]");
const form = document.getElementById("task-form");

showBtn?.addEventListener("click", () => formSection?.classList.remove("hidden"));
hideBtn?.addEventListener("click", () => formSection?.classList.add("hidden"));

form?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = form.querySelector(".message");
  msg.textContent = "";
  const assigneeId = form.assigneeId.value;
  const assignee = allUsers.find(u => u.id === assigneeId);

  try {
    await createTask(currentCompanyId, currentUid, {
      title: form.title.value.trim(),
      assigneeId,
      assigneeName: assignee?.fullName || "",
      dueDate: form.dueDate.value,
      priority: form.priority.value,
      description: form.description.value.trim()
    });
    msg.textContent = "Task created.";
    form.reset();
  } catch (err) {
    msg.textContent = "Could not create task: " + err.message;
  }
});

/* ---------- Render ---------- */
function renderAssigneeOptions(users) {
  const sel = document.getElementById("task-assignee");
  if (!sel) return;
  sel.innerHTML = `<option value="">Choose a team member…</option>` +
    users.map(u => `<option value="${u.id}">${esc(u.fullName)}</option>`).join("");
}

function renderTasks() {
  const q = (document.getElementById("task-search")?.value || "").toLowerCase();
  const statusFilter = document.getElementById("task-status-filter")?.value || "all";

  const filtered = allTasks.filter(t => {
    const matchQ = !q || (t.title || "").toLowerCase().includes(q)
      || (t.assigneeName || "").toLowerCase().includes(q);
    const matchS = statusFilter === "all" || t.status === statusFilter;
    return matchQ && matchS;
  });

  const tbody = document.getElementById("tasks-table-body");
  if (tbody) {
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="small" style="padding:16px">No tasks match.</td></tr>`;
    } else {
      tbody.innerHTML = filtered.map(t => `
        <tr>
          <td><b>${esc(t.title)}</b></td>
          <td>${esc(t.assigneeName || "—")}</td>
          <td>${esc(t.dueDate || "—")}</td>
          <td>${esc(t.priority || "Normal")}</td>
          <td>${pillFor(t.status)}</td>
          <td><button class="btn sm danger" data-delete="${t.id}">Delete</button></td>
        </tr>
      `).join("");
    }
  }

  const cards = document.getElementById("task-cards");
  if (cards) {
    cards.innerHTML = filtered.map(t => `
      <div class="task-card">
        <div class="top"><b>${esc(t.title)}</b>${pillFor(t.status)}</div>
        <div class="meta">${esc(t.assigneeName || "—")} · Due ${esc(t.dueDate || "—")} · ${esc(t.priority || "Normal")}</div>
      </div>
    `).join("");
  }

  document.getElementById("no-tasks")?.classList.toggle("hidden", filtered.length > 0);

  // Wire delete buttons
  document.querySelectorAll("[data-delete]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Delete this task?")) return;
      try { await deleteTask(btn.dataset.delete); }
      catch (err) { alert("Could not delete: " + err.message); }
    });
  });
}

document.getElementById("task-search")?.addEventListener("input", renderTasks);
document.getElementById("task-status-filter")?.addEventListener("change", renderTasks);

/* ---------- Helpers ---------- */
function pillFor(status) {
  const cls = {
    "Not started": "pill gray",
    "In progress": "pill amber",
    "Submitted": "pill blue",
    "Approved": "pill",
    "Needs correction": "pill red"
  }[status] || "pill gray";
  return `<span class="${cls}">${esc(status)}</span>`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// Silence unused warnings in some linters
void updateTask;