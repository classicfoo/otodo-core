import { getTask, putTask, deleteTask, addOutbox, getOutbox } from './db_local.js';
import { ensureClientId, syncAll } from './sync.js';

const form = document.getElementById('edit-form');
const titleInput = document.getElementById('edit-title');
const dueInput = document.getElementById('edit-due');
const completedInput = document.getElementById('edit-completed');
const priorityInput = document.getElementById('edit-priority');
const starInput = document.getElementById('edit-star');
const descriptionInput = document.getElementById('edit-description');
const deleteButton = document.getElementById('delete-task');
const missingTask = document.getElementById('missing-task');
const offlineIndicator = document.getElementById('offline-indicator');
const syncIndicator = document.getElementById('sync-indicator');
const toast = document.getElementById('toast');

const starStorageKey = 'otodo_starred_tasks';
const taskUpdatedEvent = 'otodo-task-updated';
const taskDeletedEvent = 'otodo-task-deleted';

function loadStarState() {
  try {
    const raw = localStorage.getItem(starStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.error(error);
  }
  return {};
}

const starState = loadStarState();

let task = null;
let clientId = null;
let ready = false;
let autosaveTimeout = null;
let navigateToList = null;

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

function showTaskForm() {
  form.classList.remove('hidden');
  missingTask.classList.add('hidden');
}

async function migrateStarStateForTask(loadedTask) {
  if (!loadedTask) return loadedTask;
  const id = String(loadedTask.id);
  if (!Object.prototype.hasOwnProperty.call(starState, id)) return loadedTask;
  if (loadedTask.starred !== undefined && loadedTask.starred !== null) return loadedTask;
  const updated = {
    ...loadedTask,
    starred: starState[id] ? 1 : 0,
    updated_at: nowIso(),
  };
  await putTask(updated);
  await addOutboxOp({
    op_id: crypto.randomUUID(),
    client_id: clientId,
    type: 'upsert',
    task: updated,
  });
  try {
    const next = { ...starState };
    delete next[id];
    localStorage.setItem(starStorageKey, JSON.stringify(next));
  } catch (error) {
    console.error(error);
  }
  return updated;
}

function populateForm(loadedTask) {
  titleInput.value = loadedTask.title;
  dueInput.value = loadedTask.due_date || '';
  completedInput.checked = loadedTask.completed === 1;
  if (priorityInput) {
    priorityInput.value = loadedTask.priority || 'low';
  }
  if (starInput) {
    starInput.checked = Boolean(loadedTask.starred);
  }
  if (descriptionInput) {
    descriptionInput.value = loadedTask.description || '';
  }
}

async function loadTask(id) {
  showTaskForm();
  task = await getTask(id);
  if (!task) {
    showMissingTask();
    return;
  }
  task = await migrateStarStateForTask(task);
  ready = false;
  populateForm(task);
  ready = true;
}

function hasTaskChanges(updated) {
  if (!task) return false;
  if (updated.title !== task.title) return true;
  if ((updated.due_date || null) !== (task.due_date || null)) return true;
  if (updated.completed !== task.completed) return true;
  if ((updated.starred || 0) !== (task.starred || 0)) return true;
  if (priorityInput && updated.priority !== task.priority) return true;
  if (descriptionInput && updated.description !== task.description) return true;
  return false;
}

function hasNonDescriptionChanges(updated) {
  if (!task) return false;
  if (updated.title !== task.title) return true;
  if ((updated.due_date || null) !== (task.due_date || null)) return true;
  if (updated.completed !== task.completed) return true;
  if ((updated.starred || 0) !== (task.starred || 0)) return true;
  if (priorityInput && updated.priority !== task.priority) return true;
  return false;
}

function buildOutboxKey(id, type) {
  return `${type}:${id}`;
}

function buildUpdatedTask() {
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
  if (starInput) {
    updated.starred = starInput.checked ? 1 : 0;
  }
  if (priorityInput) {
    updated.priority = priorityInput.value || task.priority || 'low';
  }
  if (descriptionInput) {
    updated.description = descriptionInput.value || '';
  }
  return updated;
}

async function persistTaskChanges({ showToastOnSave = false, triggerSyncOnSave = false } = {}) {
  if (!task) return false;
  const updated = buildUpdatedTask();
  if (!updated || !hasTaskChanges(updated)) return false;
  const descriptionChanged = descriptionInput && updated.description !== task.description;
  const nonDescriptionChanged = hasNonDescriptionChanges(updated);
  await putTask(updated);
  if (descriptionChanged) {
    await addOutboxOp({
      op_id: `${buildOutboxKey(updated.id, 'description')}:${updated.updated_at}`,
      client_id: clientId,
      type: 'upsert',
      task: updated,
    });
  }
  if (!descriptionChanged && nonDescriptionChanged) {
    await addOutboxOp({
      op_id: crypto.randomUUID(),
      client_id: clientId,
      type: 'upsert',
      task: updated,
    });
  }
  window.dispatchEvent(new CustomEvent(taskUpdatedEvent, { detail: { task: updated } }));
  task = updated;
  if (showToastOnSave) {
    showToast('Saved');
  }
  if (triggerSyncOnSave) {
    triggerSync();
  }
  return true;
}

function clearAutosaveTimeout() {
  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
  }
}

async function flushPendingTaskChanges() {
  clearAutosaveTimeout();
  if (!ready) return false;
  return persistTaskChanges();
}

async function performAutosave() {
  await persistTaskChanges({ showToastOnSave: true, triggerSyncOnSave: true });
}

function scheduleAutosave() {
  if (!ready) return;
  clearAutosaveTimeout();
  autosaveTimeout = setTimeout(() => {
    performAutosave().catch((error) => {
      console.error(error);
      showToast('Save failed');
    });
  }, 400);
}

function registerAutosaveInput(input, events = ['input']) {
  if (!input) return;
  events.forEach((eventName) => {
    input.addEventListener(eventName, scheduleAutosave);
  });
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
  window.dispatchEvent(new CustomEvent(taskDeletedEvent, { detail: { id: task.id } }));
  triggerSync();
  if (navigateToList) {
    navigateToList();
  } else {
    window.location.href = '/index.php';
  }
}

export async function initTaskView(options = {}) {
  clientId = await ensureClientId();
  await updateSyncIndicator();
  updateOfflineIndicator();
  navigateToList = typeof options.onNavigateToList === 'function'
    ? options.onNavigateToList
    : null;
  const registerBeforeNavigate = typeof options.onBeforeNavigate === 'function'
    ? options.onBeforeNavigate
    : null;
  if (registerBeforeNavigate) {
    registerBeforeNavigate(() => flushPendingTaskChanges().catch((error) => {
      console.error(error);
    }));
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  deleteButton.addEventListener('click', handleDelete);

  registerAutosaveInput(titleInput, ['input']);
  registerAutosaveInput(dueInput, ['input', 'change']);
  registerAutosaveInput(completedInput, ['change']);
  registerAutosaveInput(priorityInput, ['change']);
  registerAutosaveInput(starInput, ['change']);
  registerAutosaveInput(descriptionInput, ['input']);

  window.addEventListener('online', updateOfflineIndicator);
  window.addEventListener('offline', updateOfflineIndicator);
  window.addEventListener('beforeunload', () => {
    flushPendingTaskChanges().catch((error) => {
      console.error(error);
    });
  });
  window.addEventListener('pagehide', () => {
    flushPendingTaskChanges().catch((error) => {
      console.error(error);
    });
  });

  return {
    async loadTaskById(id) {
      if (!id) {
        showMissingTask();
        return;
      }
      await loadTask(id);
    },
  };
}

export function showMissingTaskView() {
  showMissingTask();
}
