// Task Vault — role-aware tasks page (Firestore-backed)

import { requireAuth, wireTopbar } from "./auth.js";
import { watchTasks, watchMyTasks, createTask, deleteTask, watchUsers } from "./data.js";

let currentCompanyId = null;
let currentUid = null;
let isManager = false;
let allTasks = [];
let allUsers = [];

requireAuth((user, profile) => {
  wireTopbar(user, profile);
  if (!profile?.companyId || !profile?.status || profile.status !== "active") {
    window.location.replace("login.html");
    return;
  }

  currentCompanyId = profile.companyId;
  currentUid = user.uid;
  isManager = profile.role === "manager";

  // Only managers need the full team list and task creation controls.
  if (isManager) {
    document.querySelector("[data-show-task-form]")?.classList.remove("hidden");
    watchUsers(profile.companyId, users => {
      allUsers = users;
      renderAssigneeOptions(users);
    }, showTaskError);
  } else {
    document.querySelector("[data-show-task-form]")?.classList.add("hidden");
    document.getElementById("new-task")?.classList.add("hidden");
    document.getElementById("task-description")?.closest(".panel")?.classList.add("hidden");
  }

  const onTasks = tasks => {
    allTasks = tasks;
    renderTasks();
  };

  // Employees only receive tasks assigned to their own account.
  const stopWatching = isManager
    ? watchTasks(profile.companyId, onTasks, showTaskError)
    : watchMyTasks(profile.companyId, user.uid, onTasks, showTaskError);

  window.addEventListener("pagehide", stopWatching, { once: true });
});

/* ---------- Form ---------- */
const formSection = document.getElementById("new-task");
const showBtn = document.querySelector("[data-show-task-form]");
const hideBtn = document.querySelector("[data-hide-task-form]");
const form = document.getElementById("task-form");

showBtn?.addEventListener("click", () => {
  if (isManager) formSection?.classList.remove("hidden");
});
hideBtn?.addEventListener("click", () => formSection?.classList.add("hidden"));

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!isManager) return;

  const msg = form.querySelector(".message");
  msg.textContent = "";
  const assigneeId = form.assigneeId.value;
  const assignee = allUsers.find(user => user.id === assigneeId);

  try {
    await createTask(currentCompanyId, currentUid, {
      title: form.title.value.trim(),
      assigneeId,
      assigneeName: assignee?.fullName || "",
      dueDate: form.dueDate.value,
      priority: form.priority.value,
      description: form.description.value.trim(),
      checklist: String(form.elements.namedItem("checklist")?.value || "")
        .split("\\n")
        .map(item => item.trim())
        .filter(Boolean)
        .slice(0, 30)
        .map(text => ({ text, done: false }))
    });
    msg.textContent = "Task created.";
    form.reset();
  } catch (error) {
    msg.textContent = "Could not create task: " + error.message;
  }
});

/* ---------- Render ---------- */
function renderAssigneeOptions(users) {
  const select = document.getElementById("task-assignee");
  if (!select) return;
  const activeUsers = users.filter(user => user.status === "active");
  select.innerHTML = '<option value="">Choose a team member…</option>' +
    activeUsers.map(user => `<option value="${esc(user.id)}">${esc(user.fullName)}</option>`).join("");
}

function renderTasks() {
  const search = (document.getElementById("task-search")?.value || "").toLowerCase();
  const statusFilter = document.getElementById("task-status-filter")?.value || "all";

  const filtered = allTasks.filter(task => {
    const matchSearch = !search ||
      (task.title || "").toLowerCase().includes(search) ||
      (task.assigneeName || "").toLowerCase().includes(search);
    const matchStatus = statusFilter === "all" || task.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const tbody = document.getElementById("tasks-table-body");
  if (tbody) {
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="small" style="padding:16px">No tasks match.</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(task => `
        <tr>
          <td><b>${esc(task.title)}</b></td>
          <td>${esc(isManager ? (task.assigneeName || "—") : "Assigned to you")}</td>
          <td>${esc(task.dueDate || "—")}</td>
          <td>${esc(task.priority || "Normal")}</td>
          <td>${pillFor(task.status)}</td>
          <td>${isManager ? `<button class="btn sm danger" data-delete="${esc(task.id)}">Delete</button>` : ""}</td>
        </tr>
      `).join("");
    }
  }

  const cards = document.getElementById("task-cards");
  if (cards) {
    cards.innerHTML = filtered.map(task => `
      <div class="task-card">
        <div class="top"><b>${esc(task.title)}</b>${pillFor(task.status)}</div>
        <div class="meta">${esc(isManager ? (task.assigneeName || "Unassigned") : "Assigned to you")} · Due ${esc(task.dueDate || "—")} · ${esc(task.priority || "Normal")}</div>
      </div>
    `).join("");
  }

  document.getElementById("no-tasks")?.classList.toggle("hidden", filtered.length > 0);

  document.querySelectorAll("[data-delete]").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isManager || !confirm("Delete this task?")) return;
      try {
        await deleteTask(button.dataset.delete);
      } catch (error) {
        alert("Could not delete: " + error.message);
      }
    });
  });
}

function showTaskError(error) {
  console.error("Task Vault task data:", error);
  const tbody = document.getElementById("tasks-table-body");
  if (tbody) tbody.innerHTML =
    `<tr><td colspan="6" class="small" style="padding:16px">Could not load tasks: ${esc(error.message)}</td></tr>`;
}

document.getElementById("task-search")?.addEventListener("input", renderTasks);
document.getElementById("task-status-filter")?.addEventListener("change", renderTasks);

function pillFor(status) {
  const classes = {
    "Not started": "pill gray",
    "In progress": "pill amber",
    "Submitted": "pill blue",
    "Approved": "pill",
    "Needs correction": "pill red"
  };
  return `<span class="${classes[status] || "pill gray"}">${esc(status)}</span>`;
}

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[character]));
}
