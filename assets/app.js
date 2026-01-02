import { getAllTasks, putTask, addOutbox } from './db_local.js';
import { dueStatus } from './dates.js';
import { syncAll, ensureClientId } from './sync.js';

const taskBody = document.getElementById('task-body');
const emptyState = document.getElementById('empty-state');
const addForm = document.getElementById('add-form');
const titleInput = document.getElementById('title-input');
const toast = document.getElementById('toast');
const clearCacheBtn = document.getElementById('clear-cache-btn');

const state = {
  tasks: new Map(),
  rows: new Map(),
  clientId: null,
};

const listFilter = new URLSearchParams(window.location.search).get('view') === 'completed'
  ? 'completed'
  : 'all';

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

function createRow(task) {
  const row = document.createElement('tr');
  row.dataset.id = task.id;
  row.innerHTML = `
    <td class="task-title"><a class="task-link"></a></td>
    <td class="due"></td>
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
  const taskUrl = new URL('/task.php', window.location.origin);
  taskUrl.searchParams.set('id', task.id);
  if (listFilter === 'completed') {
    taskUrl.searchParams.set('view', 'completed');
  }
  taskLink.href = `${taskUrl.pathname}${taskUrl.search}`;
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
  const tasks = Array.from(state.tasks.values())
    .filter((task) => (listFilter === 'completed' ? task.completed === 1 : task.completed !== 1))
    .sort(compareTasks);
  const fragment = document.createDocumentFragment();
  tasks.forEach((task) => {
    const row = updateRow(task);
    fragment.appendChild(row);
  });
  taskBody.innerHTML = '';
  taskBody.appendChild(fragment);
  if (emptyState) {
    emptyState.textContent = listFilter === 'completed' ? 'No completed tasks yet.' : 'No tasks yet.';
  }
  emptyState.classList.toggle('hidden', tasks.length > 0);
}

async function addOutboxOp(op) {
  await addOutbox(op);
}

async function saveTask(task) {
  state.tasks.set(task.id, task);
  await putTask(task);
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

function triggerSync() {
  if (!navigator.onLine) return;
  syncAll()
    .then((tasks) => {
      state.tasks.clear();
      tasks.forEach((task) => state.tasks.set(task.id, task));
      refreshList();
      showToast('Synced');
    })
    .catch((error) => {
      console.error(error);
      showToast('Sync failed');
    });
}

async function init() {
  state.clientId = await ensureClientId();
  const tasks = await getAllTasks();
  tasks.forEach((task) => state.tasks.set(task.id, task));
  refreshList();
  if (navigator.onLine) {
    triggerSync();
  }

  addForm.addEventListener('submit', handleAdd);
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      const originalLabel = clearCacheBtn.textContent;
      clearCacheBtn.disabled = true;
      clearCacheBtn.textContent = 'Clearing...';
      try {
        if ('serviceWorker' in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        if ('caches' in window) {
          const cacheKeys = await caches.keys();
          await Promise.all(cacheKeys.map((key) => caches.delete(key)));
        }
        showToast('Cache cleared');
        setTimeout(() => window.location.reload(), 200);
      } catch (error) {
        console.error(error);
        showToast('Cache clear failed');
        clearCacheBtn.disabled = false;
        clearCacheBtn.textContent = originalLabel;
      }
    });
  }

  taskBody.addEventListener('click', (event) => {
    const row = event.target.closest('tr');
    if (!row) return;
    const id = row.dataset.id;
    if (event.target.closest('a')) return;
    const taskUrl = new URL('/task.php', window.location.origin);
    taskUrl.searchParams.set('id', id);
    if (listFilter === 'completed') {
      taskUrl.searchParams.set('view', 'completed');
    }
    window.location.href = `${taskUrl.pathname}${taskUrl.search}`;
  });

  window.addEventListener('online', triggerSync);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  }
}

init();
