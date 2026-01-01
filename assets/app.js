import {
  getAllTasks,
  putTask,
  deleteTask,
  addOutbox,
  getOutbox,
} from './db_local.js';
import { dueStatus } from './dates.js';
import { syncAll, ensureClientId } from './sync.js';

const taskBody = document.getElementById('task-body');
const emptyState = document.getElementById('empty-state');
const addForm = document.getElementById('add-form');
const titleInput = document.getElementById('title-input');
const priorityInput = document.getElementById('priority-input');
const startInput = document.getElementById('start-input');
const dueInput = document.getElementById('due-input');
const offlineIndicator = document.getElementById('offline-indicator');
const syncIndicator = document.getElementById('sync-indicator');
const toast = document.getElementById('toast');
const tabs = document.querySelectorAll('.tab');

const state = {
  tasks: new Map(),
  rows: new Map(),
  filter: 'all',
  clientId: null,
};

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function nowIso() {
  return new Date().toISOString();
}

function compareTasks(a, b) {
  if (a.completed !== b.completed) {
    return a.completed - b.completed;
  }
  const aDue = a.due_date ? new Date(a.due_date).getTime() : null;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const aOverdue = aDue !== null && aDue < today;
  const bOverdue = bDue !== null && bDue < today;
  if (aOverdue !== bOverdue) {
    return aOverdue ? -1 : 1;
  }
  if (aDue !== null && bDue !== null && aDue !== bDue) {
    return aDue - bDue;
  }
  if (aDue !== null && bDue === null) return -1;
  if (aDue === null && bDue !== null) return 1;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

function filterTasks(task) {
  if (state.filter === 'active') return task.completed === 0;
  if (state.filter === 'completed') return task.completed === 1;
  return true;
}

function createRow(task) {
  const row = document.createElement('tr');
  row.dataset.id = task.id;
  row.innerHTML = `
    <td class="task-title"></td>
    <td class="priority"></td>
    <td class="start"></td>
    <td class="due"></td>
    <td class="done"><input class="checkbox" type="checkbox" /></td>
    <td class="actions"><button class="delete-btn" type="button">Delete</button></td>
  `;
  state.rows.set(task.id, row);
  return row;
}

function updateRow(task) {
  let row = state.rows.get(task.id);
  if (!row) {
    row = createRow(task);
  }
  row.querySelector('.task-title').textContent = task.title;
  const priorityEl = row.querySelector('.priority');
  priorityEl.textContent = task.priority;
  priorityEl.className = `priority ${task.priority}`;
  row.querySelector('.start').textContent = task.start_date || '';
  const due = dueStatus(task.due_date);
  const dueCell = row.querySelector('.due');
  if (due.label) {
    dueCell.innerHTML = `<span class="due-label ${due.status}">${due.label}</span>`;
  } else {
    dueCell.textContent = '';
  }
  row.querySelector('.checkbox').checked = task.completed === 1;
  row.classList.toggle('completed', task.completed === 1);
  return row;
}

function refreshList() {
  const tasks = Array.from(state.tasks.values()).filter(filterTasks).sort(compareTasks);
  const fragment = document.createDocumentFragment();
  tasks.forEach((task) => {
    const row = updateRow(task);
    fragment.appendChild(row);
  });
  taskBody.innerHTML = '';
  taskBody.appendChild(fragment);
  emptyState.classList.toggle('hidden', tasks.length > 0);
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

async function saveTask(task) {
  state.tasks.set(task.id, task);
  await putTask(task);
  refreshList();
}

async function removeTask(id) {
  state.tasks.delete(id);
  await deleteTask(id);
  const row = state.rows.get(id);
  if (row) row.remove();
  refreshList();
}

async function handleAdd(event) {
  event.preventDefault();
  const title = titleInput.value.trim();
  if (!title) return;
  const task = {
    id: crypto.randomUUID(),
    title,
    priority: priorityInput.value,
    start_date: startInput.value || null,
    due_date: dueInput.value || null,
    completed: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  await saveTask(task);
  await addOutboxOp({
    op_id: crypto.randomUUID(),
    client_id: state.clientId,
    type: 'upsert',
    task,
  });
  addForm.reset();
  titleInput.focus();
  triggerSync();
}

async function handleToggle(id, completed) {
  const task = state.tasks.get(id);
  if (!task) return;
  const updated = { ...task, completed: completed ? 1 : 0, updated_at: nowIso() };
  await saveTask(updated);
  await addOutboxOp({
    op_id: crypto.randomUUID(),
    client_id: state.clientId,
    type: 'toggle',
    id,
    completed: updated.completed,
    updated_at: updated.updated_at,
  });
  triggerSync();
}

async function handleDelete(id) {
  await removeTask(id);
  await addOutboxOp({
    op_id: crypto.randomUUID(),
    client_id: state.clientId,
    type: 'delete',
    id,
  });
  triggerSync();
}

function editTitle(cell, task) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = task.title;
  input.className = 'inline-edit';
  cell.textContent = '';
  cell.appendChild(input);
  input.focus();
  input.select();

  const commit = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== task.title) {
      const updated = { ...task, title: newTitle, updated_at: nowIso() };
      await saveTask(updated);
      await addOutboxOp({
        op_id: crypto.randomUUID(),
        client_id: state.clientId,
        type: 'upsert',
        task: updated,
      });
      triggerSync();
    }
    cell.textContent = state.tasks.get(task.id)?.title || task.title;
  };

  input.addEventListener('blur', commit, { once: true });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      input.blur();
    }
    if (event.key === 'Escape') {
      cell.textContent = task.title;
    }
  });
}

function triggerSync() {
  if (!navigator.onLine) return;
  syncAll()
    .then((tasks) => {
      state.tasks.clear();
      tasks.forEach((task) => state.tasks.set(task.id, task));
      refreshList();
      updateSyncIndicator();
      showToast('Synced');
    })
    .catch((error) => {
      console.error(error);
      showToast('Sync failed');
    });
}

function updateOfflineIndicator() {
  offlineIndicator.classList.toggle('hidden', navigator.onLine);
  if (navigator.onLine) {
    triggerSync();
  }
}

async function init() {
  state.clientId = await ensureClientId();
  const tasks = await getAllTasks();
  tasks.forEach((task) => state.tasks.set(task.id, task));
  refreshList();
  updateSyncIndicator();
  updateOfflineIndicator();
  if (navigator.onLine) {
    triggerSync();
  }

  addForm.addEventListener('submit', handleAdd);

  taskBody.addEventListener('click', (event) => {
    const row = event.target.closest('tr');
    if (!row) return;
    const id = row.dataset.id;
    if (event.target.classList.contains('delete-btn')) {
      handleDelete(id);
    }
    if (event.target.classList.contains('task-title')) {
      const task = state.tasks.get(id);
      if (task) editTitle(event.target, task);
    }
  });

  taskBody.addEventListener('change', (event) => {
    if (!event.target.classList.contains('checkbox')) return;
    const row = event.target.closest('tr');
    const id = row?.dataset.id;
    if (id) {
      handleToggle(id, event.target.checked);
    }
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      refreshList();
    });
  });

  window.addEventListener('online', updateOfflineIndicator);
  window.addEventListener('offline', updateOfflineIndicator);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  }
}

init();
