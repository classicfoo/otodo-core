import { getTask, putTask, deleteTask, addOutbox, getOutbox } from './db_local.js';
import { ensureClientId, syncAll } from './sync.js';

const form = document.getElementById('edit-form');
const titleInput = document.getElementById('edit-title');
const dueInput = document.getElementById('edit-due');
const completedInput = document.getElementById('edit-completed');
const deleteButton = document.getElementById('delete-task');
const missingTask = document.getElementById('missing-task');
const offlineIndicator = document.getElementById('offline-indicator');
const syncIndicator = document.getElementById('sync-indicator');
const toast = document.getElementById('toast');

let task = null;
let clientId = null;

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function nowIso() {
  return new Date().toISOString();
}

async function updateSyncIndicator() {
  const outbox = await getOutbox();
  if (outbox.length) {
    syncIndicator.textContent = `${outbox.length} pending`;
    syncIndicator.classList.remove('hidden');
  } else {
    syncIndicator.classList.add('hidden');
  }
}

async function addOutboxOp(op) {
  await addOutbox(op);
  await updateSyncIndicator();
}

function updateOfflineIndicator() {
  offlineIndicator.classList.toggle('hidden', navigator.onLine);
  if (navigator.onLine) {
    triggerSync();
  }
}

function triggerSync() {
  if (!navigator.onLine) return;
  syncAll()
    .then(() => updateSyncIndicator())
    .catch((error) => {
      console.error(error);
      showToast('Sync failed');
    });
}

function showMissingTask() {
  form.classList.add('hidden');
  missingTask.classList.remove('hidden');
}

function populateForm(loadedTask) {
  titleInput.value = loadedTask.title;
  dueInput.value = loadedTask.due_date || '';
  completedInput.checked = loadedTask.completed === 1;
}

async function loadTask(id) {
  task = await getTask(id);
  if (!task) {
    showMissingTask();
    return;
  }
  populateForm(task);
}

async function handleSave(event) {
  event.preventDefault();
  if (!task) return;
  const title = titleInput.value.trim();
  if (!title) return;
  const updated = {
    ...task,
    title,
    due_date: dueInput.value || null,
    completed: completedInput.checked ? 1 : 0,
    updated_at: nowIso(),
  };
  await putTask(updated);
  await addOutboxOp({
    op_id: crypto.randomUUID(),
    client_id: clientId,
    type: 'upsert',
    task: updated,
  });
  task = updated;
  showToast('Saved');
  triggerSync();
}

async function handleDelete() {
  if (!task) return;
  await deleteTask(task.id);
  await addOutboxOp({
    op_id: crypto.randomUUID(),
    client_id: clientId,
    type: 'delete',
    id: task.id,
  });
  triggerSync();
  window.location.href = '/index.php';
}

async function init() {
  clientId = await ensureClientId();
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) {
    showMissingTask();
    return;
  }
  await loadTask(id);
  await updateSyncIndicator();
  updateOfflineIndicator();

  form.addEventListener('submit', handleSave);
  deleteButton.addEventListener('click', handleDelete);

  window.addEventListener('online', updateOfflineIndicator);
  window.addEventListener('offline', updateOfflineIndicator);
}

init();
