import { getAllTasks, putTask, addOutbox } from './db_local.js';
import { dueStatus } from './dates.js';
import { syncAll, ensureClientId } from './sync.js';

const taskBody = document.getElementById('task-body');
const emptyState = document.getElementById('empty-state');
const addForm = document.getElementById('add-form');
const titleInput = document.getElementById('title-input');
const toast = document.getElementById('toast');
const clearCacheBtn = document.getElementById('clear-cache-btn');
const searchContainer = document.getElementById('task-search');
const searchToggle = document.getElementById('task-search-toggle');
const searchInput = document.getElementById('task-search-input');
const searchClear = document.getElementById('task-search-clear');

const state = {
  tasks: new Map(),
  rows: new Map(),
  clientId: null,
  searchQuery: '',
};

const listFilter = new URLSearchParams(window.location.search).get('view') === 'completed'
  ? 'completed'
  : 'active';

function isCompleted(task) {
  return Number(task.completed) === 1;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function nowIso() {
  return new Date().toISOString();
}

function todayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function compareTasks(a, b) {
  const aCompleted = isCompleted(a);
  const bCompleted = isCompleted(b);
  if (aCompleted !== bCompleted) {
    return aCompleted ? 1 : -1;
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

const priorityLabels = {
  none: { label: 'None', short: 'Non', className: 'text-secondary' },
  low: { label: 'Low', short: 'Low', className: 'text-success' },
  med: { label: 'Medium', short: 'Med', className: 'text-warning' },
  medium: { label: 'Medium', short: 'Med', className: 'text-warning' },
  high: { label: 'High', short: 'Hig', className: 'text-danger' },
};

function priorityLabel(value) {
  const priority = (value || 'none').toLowerCase();
  return priorityLabels[priority] || priorityLabels.none;
}

function dueBadgeClass(status) {
  if (status === 'overdue') return 'bg-danger-subtle text-danger';
  if (status === 'today') return 'bg-success-subtle text-success';
  if (status === 'soon') return 'bg-primary-subtle text-primary';
  return 'bg-secondary-subtle text-secondary';
}

const starStorageKey = 'otodo_starred_tasks';

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

function saveStarState(next) {
  try {
    localStorage.setItem(starStorageKey, JSON.stringify(next));
  } catch (error) {
    console.error(error);
  }
}

const starState = loadStarState();

function setStarAppearance(button, starred) {
  if (!button) return;
  button.classList.toggle('starred', Boolean(starred));
  button.setAttribute('aria-pressed', starred ? 'true' : 'false');
  button.setAttribute('aria-label', starred ? 'Unstar task' : 'Star task');
  const icon = button.querySelector('.star-icon');
  if (icon) icon.textContent = starred ? '★' : '☆';
}

function createRow(task) {
  const row = document.createElement('a');
  row.dataset.id = task.id;
  row.className = 'list-group-item list-group-item-action task-row';
  row.innerHTML = `
    <div class="task-main">
      <div class="task-title"></div>
      <div class="task-hashtags"></div>
    </div>
    <div class="task-meta">
      <span class="due-date-badge"></span>
      <span class="small priority-text"></span>
      <button type="button" class="task-star star-toggle" aria-pressed="false" aria-label="Star task">
        <span class="star-icon" aria-hidden="true">☆</span>
      </button>
    </div>
  `;
  const starButton = row.querySelector('.star-toggle');
  if (starButton) {
    starButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = starButton.getAttribute('aria-pressed') === 'true';
      const next = !current;
      const id = String(task.id);
      starState[id] = next;
      saveStarState(starState);
      setStarAppearance(starButton, next);
    });
  }
  state.rows.set(task.id, row);
  return row;
}

function updateRow(task) {
  let row = state.rows.get(task.id);
  if (!row) {
    row = createRow(task);
  }
  const taskTitle = row.querySelector('.task-title');
  taskTitle.textContent = task.title;
  const taskUrl = new URL('/task.php', window.location.origin);
  taskUrl.searchParams.set('id', task.id);
  if (listFilter === 'completed') {
    taskUrl.searchParams.set('view', 'completed');
  }
  row.href = `${taskUrl.pathname}${taskUrl.search}`;
  row.dataset.searchText = task.title.toLowerCase();
  const due = dueStatus(task.due_date);
  const dueBadge = row.querySelector('.due-date-badge');
  if (dueBadge) {
    if (due.label) {
      dueBadge.className = `badge due-date-badge ${dueBadgeClass(due.status)}`.trim();
      dueBadge.textContent = due.label;
      dueBadge.setAttribute('aria-label', due.label);
    } else {
      dueBadge.className = 'due-date-badge';
      dueBadge.textContent = '';
      dueBadge.removeAttribute('aria-label');
    }
  }
  const priority = priorityLabel(task.priority);
  const priorityBadge = row.querySelector('.priority-text');
  if (priorityBadge) {
    priorityBadge.className = `small priority-text ${priority.className}`.trim();
    priorityBadge.innerHTML = `<span class="d-none d-md-inline">${priority.label}</span><span class="d-inline d-md-none">${priority.short}</span>`;
    priorityBadge.setAttribute('aria-label', priority.label);
  }
  const starButton = row.querySelector('.star-toggle');
  if (starButton) {
    const storedStar = starState[String(task.id)] || false;
    setStarAppearance(starButton, storedStar);
  }
  row.classList.toggle('completed', isCompleted(task));
  return row;
}

function refreshList() {
  const tasks = Array.from(state.tasks.values())
    .filter((task) => (listFilter === 'completed' ? isCompleted(task) : !isCompleted(task)))
    .sort(compareTasks);
  const fragment = document.createDocumentFragment();
  tasks.forEach((task) => {
    const row = updateRow(task);
    fragment.appendChild(row);
  });
  taskBody.innerHTML = '';
  taskBody.appendChild(fragment);
  if (emptyState) {
    emptyState.textContent = listFilter === 'completed' ? 'No completed tasks yet.' : 'No active tasks yet.';
  }
  emptyState.classList.toggle('hidden', tasks.length > 0);
  applySearchFilter(state.searchQuery);
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
    due_date: todayDateString(),
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
    const row = event.target.closest('.task-row');
    if (!row) return;
    if (event.target.closest('.star-toggle')) return;
  });

  window.addEventListener('online', triggerSync);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('Service worker registration failed', error);
    });
  }
}

function isTypingField(element) {
  if (!element) return false;
  const tag = element.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable;
}

function applySearchFilter(value) {
  const query = (value || '').trim().toLowerCase();
  state.searchQuery = query;
  const rows = Array.from(taskBody?.querySelectorAll('.task-row') || []);
  rows.forEach((row) => {
    const text = row.dataset.searchText || '';
    row.style.display = !query || text.includes(query) ? '' : 'none';
  });
}

function expandSearch() {
  if (!searchContainer) return;
  if (searchContainer.classList.contains('expanded')) return;
  searchContainer.classList.add('expanded');
  searchContainer.setAttribute('aria-expanded', 'true');
  if (searchInput) {
    searchInput.removeAttribute('tabindex');
    requestAnimationFrame(() => {
      searchInput.focus({ preventScroll: true });
      searchInput.select();
    });
  }
}

function collapseSearch(clearValue) {
  if (!searchContainer) return;
  searchContainer.classList.remove('expanded');
  searchContainer.setAttribute('aria-expanded', 'false');
  if (searchInput) {
    searchInput.setAttribute('tabindex', '-1');
    if (clearValue && searchInput.value !== '') {
      searchInput.value = '';
      applySearchFilter('');
    }
  }
}

function bindSearch() {
  if (!searchContainer || !searchToggle || !searchInput || !searchClear) return;
  searchToggle.addEventListener('click', () => expandSearch());
  searchClear.addEventListener('click', () => collapseSearch(true));

  searchInput.addEventListener('input', (event) => {
    applySearchFilter(event.target.value);
  });

  searchInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      collapseSearch(true);
    }
  });

  document.addEventListener('keydown', (event) => {
    const typing = isTypingField(document.activeElement);
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (!typing) {
        event.preventDefault();
        expandSearch();
      }
      return;
    }
    if ((event.key === 'f' || event.key === 'F') && (event.ctrlKey || event.metaKey) && !event.shiftKey) {
      if (!typing) {
        event.preventDefault();
        expandSearch();
      }
      return;
    }
    if (event.key === 'Escape' && searchContainer.classList.contains('expanded')) {
      event.preventDefault();
      collapseSearch(true);
    }
  });

  document.addEventListener('click', (event) => {
    if (!searchContainer.classList.contains('expanded')) return;
    if (searchContainer.contains(event.target)) return;
    if (searchInput.value.trim() === '') {
      collapseSearch(true);
    }
  });
}

init().catch((error) => {
  console.error(error);
});

bindSearch();
