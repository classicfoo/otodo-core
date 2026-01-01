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
const offlineIndicator = document.getElementById('offline-indicator');
const syncIndicator = document.getElementById('sync-indicator');
const toast = document.getElementById('toast');
const tabs = document.querySelectorAll('.tab');
const menuButton = document.getElementById('menu-button');
const filterMenu = document.getElementById('filter-menu');

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
    <td class="task-title"><a class="task-link"></a></td>
    <td class="due"></td>
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
  const taskLink = row.querySelector('.task-link');
  taskLink.textContent = task.title;
  taskLink.href = `/task.php?id=${encodeURIComponent(task.id)}`;
  const due = dueStatus(task.due_date);
  const dueCell = row.querySelector('.due');
  if (due.label) {
    dueCell.innerHTML = `<span class="due-label ${due.status}">${due.label}</span>`;
  } else {
    dueCell.textContent = '';
  }
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
    priority: 'low',
    start_date: null,
    due_date: null,
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
      return;
    }
    if (event.target.closest('a')) return;
    window.location.href = `/task.php?id=${encodeURIComponent(id)}`;
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      state.filter = tab.dataset.filter;
      refreshList();
      filterMenu.classList.add('hidden');
      menuButton.setAttribute('aria-expanded', 'false');
    });
  });

  menuButton.addEventListener('click', () => {
    const isHidden = filterMenu.classList.toggle('hidden');
    menuButton.setAttribute('aria-expanded', String(!isHidden));
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
