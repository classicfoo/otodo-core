import { getAllTasks, putTask, addOutbox } from './db_local.js';
import { dueStatus } from './dates.js';
import { syncAll, ensureClientId } from './sync.js';
import { updateSyncIndicator } from './sync_indicator.js';

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
const pageBody = document.body;

const taskUpdatedEvent = 'otodo-task-updated';
const taskDeletedEvent = 'otodo-task-deleted';

const state = {
  tasks: new Map(),
  rows: new Map(),
  clientId: null,
  searchQuery: '',
};

let listFilter = 'active';
let dueOverlay = null;
let activeDueTaskId = null;
let contextMenu = null;
let contextTask = null;

function ensureDueOverlay() {
  if (dueOverlay) return dueOverlay;
  const overlay = document.createElement('div');
  overlay.className = 'due-date-overlay hidden';
  overlay.innerHTML = `
    <div class="due-date-overlay-card shadow-sm">
      <input type="date" class="due-date-overlay-input form-control form-control-sm" aria-label="Choose due date" />
    </div>
  `;
  pageBody.appendChild(overlay);
  const input = overlay.querySelector('.due-date-overlay-input');
  dueOverlay = { overlay, input };

  document.addEventListener('click', (event) => {
    if (!dueOverlay || dueOverlay.overlay.classList.contains('hidden')) return;
    if (dueOverlay.overlay.contains(event.target)) return;
    closeDueOverlay();
  });

  window.addEventListener('scroll', closeDueOverlay, true);
  window.addEventListener('resize', closeDueOverlay);

  if (input) {
    input.addEventListener('click', (event) => {
      event.stopPropagation();
    });
    input.addEventListener('change', (event) => {
      event.stopPropagation();
      void updateTaskDueDate(activeDueTaskId, event.target.value);
      closeDueOverlay();
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeDueOverlay();
      }
    });
  }

  return dueOverlay;
}

function closeDueOverlay() {
  if (!dueOverlay) return;
  dueOverlay.overlay.classList.add('hidden');
  dueOverlay.overlay.classList.remove('calendar-only');
  activeDueTaskId = null;
}

function openDueOverlay(badge, taskId) {
  if (!badge) return;
  const overlay = ensureDueOverlay();
  const task = taskId ? state.tasks.get(taskId) : null;
  activeDueTaskId = taskId || null;
  if (overlay.input) {
    overlay.input.value = task?.due_date || '';
  }
  const rect = badge.getBoundingClientRect();
  overlay.overlay.style.top = `${window.scrollY + rect.top + rect.height / 2}px`;
  overlay.overlay.style.left = `${window.scrollX + rect.left + rect.width / 2}px`;
  overlay.overlay.style.transform = 'translate(-50%, -50%)';
  overlay.overlay.classList.remove('hidden');
  requestAnimationFrame(() => {
    const input = overlay.input;
    if (!input) return;
    input.focus({ preventScroll: true });
    if (typeof input.showPicker === 'function') {
      overlay.overlay.classList.add('calendar-only');
      input.showPicker();
    } else {
      overlay.overlay.classList.remove('calendar-only');
    }
  });
}

function isoDateFromToday(offsetDays) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDueIso(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match && match[1]) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function setListFilter(nextFilter) {
  listFilter = nextFilter === 'completed' ? 'completed' : 'active';
  refreshList();
}

export function getListFilter() {
  return listFilter;
}

export function resetListSearch() {
  applySearchFilter('');
  collapseSearch(true);
}

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
  if (aDue !== null && bDue !== null && aDue !== bDue) {
    return aDue - bDue;
  }
  if (aDue !== null && bDue === null) return -1;
  if (aDue === null && bDue !== null) return 1;
  const priorityOrder = { high: 3, med: 2, medium: 2, low: 1, none: 0 };
  const aPriority = priorityOrder[(a.priority || 'none').toLowerCase()] ?? 0;
  const bPriority = priorityOrder[(b.priority || 'none').toLowerCase()] ?? 0;
  if (aPriority !== bPriority) {
    return bPriority - aPriority;
  }
  const aStarred = Number(a.starred) === 1 ? 1 : 0;
  const bStarred = Number(b.starred) === 1 ? 1 : 0;
  if (aStarred !== bStarred) {
    return bStarred - aStarred;
  }
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

const starState = loadStarState();

function setStarAppearance(button, starred) {
  if (!button) return;
  button.classList.toggle('starred', Boolean(starred));
  button.setAttribute('aria-pressed', starred ? 'true' : 'false');
  button.setAttribute('aria-label', starred ? 'Unstar task' : 'Star task');
  const icon = button.querySelector('.star-icon');
  if (icon) icon.textContent = starred ? '★' : '☆';
}

async function toggleStar(taskId, button) {
  const task = state.tasks.get(taskId);
  if (!task) return;
  const next = !Boolean(task.starred);
  const updated = {
    ...task,
    starred: next ? 1 : 0,
    updated_at: nowIso(),
  };
  state.tasks.set(taskId, updated);
  setStarAppearance(button, next);
  try {
    await putTask(updated);
    await addOutboxOp({
      op_id: crypto.randomUUID(),
      client_id: state.clientId,
      type: 'upsert',
      task: updated,
    });
    triggerSync();
  } catch (error) {
    console.error(error);
  }
}

async function migrateStarStateFromStorage() {
  if (!starState || Object.keys(starState).length === 0) return;
  let migrated = false;
  for (const task of state.tasks.values()) {
    const id = String(task.id);
    if (!Object.prototype.hasOwnProperty.call(starState, id)) continue;
    if (task.starred !== undefined && task.starred !== null) continue;
    const updated = {
      ...task,
      starred: starState[id] ? 1 : 0,
      updated_at: nowIso(),
    };
    state.tasks.set(task.id, updated);
    await putTask(updated);
    await addOutboxOp({
      op_id: crypto.randomUUID(),
      client_id: state.clientId,
      type: 'upsert',
      task: updated,
    });
    migrated = true;
  }
  if (migrated) {
    try {
      localStorage.removeItem(starStorageKey);
    } catch (error) {
      console.error(error);
    }
  }
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
      <span class="due-date-badge" role="button" tabindex="0" aria-label="Edit due date"></span>
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
      void toggleStar(task.id, starButton);
    });
  }
  const dueBadge = row.querySelector('.due-date-badge');
  if (dueBadge) {
    dueBadge.addEventListener('click', (event) => {
      if (window.matchMedia('(pointer: fine)').matches) return;
      event.preventDefault();
      event.stopPropagation();
      openDueOverlay(dueBadge, row.dataset.id);
    });
    dueBadge.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        openDueOverlay(dueBadge, row.dataset.id);
      }
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
  row.dataset.dueDate = task.due_date || '';
  row.dataset.priority = (task.priority || 'none').toLowerCase();
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
    setStarAppearance(starButton, Boolean(task.starred));
  }
  row.classList.toggle('completed', isCompleted(task));
  return row;
}

async function updateTaskDueDate(taskId, nextDate) {
  if (!taskId) return;
  const task = state.tasks.get(taskId);
  if (!task) return;
  const normalized = nextDate || null;
  if ((task.due_date || null) === normalized) return;
  const updated = {
    ...task,
    due_date: normalized,
    updated_at: nowIso(),
  };
  state.tasks.set(task.id, updated);
  refreshList();
  try {
    await putTask(updated);
    await addOutboxOp({
      op_id: crypto.randomUUID(),
      client_id: state.clientId,
      type: 'upsert',
      task: updated,
    });
    triggerSync();
  } catch (error) {
    console.error(error);
    showToast('Due date not saved');
  }
}

async function updateTaskPriority(taskId, nextPriority) {
  if (!taskId) return;
  const task = state.tasks.get(taskId);
  if (!task) return;
  const normalized = String(nextPriority || 'none').toLowerCase();
  if (!['none', 'low', 'med', 'high'].includes(normalized)) return;
  if ((task.priority || 'none').toLowerCase() === normalized) return;
  const updated = {
    ...task,
    priority: normalized,
    updated_at: nowIso(),
  };
  state.tasks.set(task.id, updated);
  refreshList();
  try {
    await putTask(updated);
    await addOutboxOp({
      op_id: crypto.randomUUID(),
      client_id: state.clientId,
      type: 'upsert',
      task: updated,
    });
    triggerSync();
  } catch (error) {
    console.error(error);
    showToast('Priority not saved');
  }
}

async function applyDueShortcut(taskId, shortcut) {
  if (!taskId) return;
  if (shortcut === 'today') {
    await updateTaskDueDate(taskId, isoDateFromToday(0));
    return;
  }
  if (shortcut === 'tomorrow') {
    await updateTaskDueDate(taskId, isoDateFromToday(1));
    return;
  }
  if (shortcut === 'next-week') {
    await updateTaskDueDate(taskId, isoDateFromToday(7));
    return;
  }
  if (shortcut === 'clear') {
    await updateTaskDueDate(taskId, null);
  }
}

function ensureContextMenu() {
  if (contextMenu) return contextMenu;
  const menu = document.createElement('div');
  menu.className = 'task-context-menu hidden';
  menu.innerHTML = `
    <div class="context-header">Quick edit</div>
    <div class="context-group" data-group="due">
      <div class="context-label">Due date</div>
      <button type="button" data-action="due" data-value="today">Today <span class="badge bg-success-subtle text-success">Today</span></button>
      <button type="button" data-action="due" data-value="tomorrow">Tomorrow <span class="badge bg-primary-subtle text-primary">Tomorrow</span></button>
      <button type="button" data-action="due" data-value="next-week">Next week <span class="badge bg-primary-subtle text-primary">Later</span></button>
      <button type="button" data-action="due" data-value="clear">No due date</button>
    </div>
    <div class="context-group" data-group="priority">
      <div class="context-label">Priority</div>
      <button type="button" data-action="priority" data-value="high">High</button>
      <button type="button" data-action="priority" data-value="med">Medium</button>
      <button type="button" data-action="priority" data-value="low">Low</button>
      <button type="button" data-action="priority" data-value="none">None</button>
    </div>
  `;
  pageBody.appendChild(menu);
  contextMenu = menu;
  return menu;
}

function hideContextMenu() {
  if (!contextMenu) return;
  contextMenu.classList.add('hidden');
  contextTask = null;
}

function setContextMode(mode) {
  if (!contextMenu) return;
  const header = contextMenu.querySelector('.context-header');
  if (header) {
    header.textContent = mode === 'priority' ? 'Set priority' : 'Set due date';
  }
  contextMenu.dataset.mode = mode;
  contextMenu.querySelectorAll('.context-group').forEach((group) => {
    group.classList.toggle('hidden', group.dataset.group !== mode);
  });
}

function setActiveOption(group, value) {
  if (!contextMenu) return;
  contextMenu.querySelectorAll(`.context-group[data-group="${group}"] button`).forEach((button) => {
    button.classList.toggle('active', button.dataset.value === value);
  });
}

function updateContextActiveOptions(taskEl) {
  const priorityValue = String(taskEl?.dataset?.priority || 'none').toLowerCase();
  setActiveOption('priority', priorityValue);

  const dueDate = normalizeDueIso(taskEl?.dataset?.dueDate || '');
  let dueChoice = '';
  if (!dueDate) {
    dueChoice = 'clear';
  } else if (dueDate === isoDateFromToday(0)) {
    dueChoice = 'today';
  } else if (dueDate === isoDateFromToday(1)) {
    dueChoice = 'tomorrow';
  } else if (dueDate === isoDateFromToday(7)) {
    dueChoice = 'next-week';
  }
  setActiveOption('due', dueChoice);
}

function showContextMenu(taskEl, x, y, mode) {
  const menu = ensureContextMenu();
  contextTask = taskEl;
  setContextMode(mode);
  updateContextActiveOptions(taskEl);
  menu.classList.remove('hidden');
  menu.style.left = '0px';
  menu.style.top = '0px';
  const rect = menu.getBoundingClientRect();
  const padding = 8;
  const maxLeft = window.innerWidth - rect.width - padding;
  const maxTop = window.innerHeight - rect.height - padding;
  const left = Math.min(Math.max(padding, x), Math.max(padding, maxLeft));
  const top = Math.min(Math.max(padding, y), Math.max(padding, maxTop));
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
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

function handleTaskUpdated(event) {
  const updated = event?.detail?.task;
  if (!updated || !updated.id) return;
  state.tasks.set(updated.id, updated);
  refreshList();
}

function handleTaskDeleted(event) {
  const id = event?.detail?.id;
  if (!id) return;
  state.tasks.delete(id);
  const row = state.rows.get(id);
  if (row) {
    row.remove();
    state.rows.delete(id);
  }
  refreshList();
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
    starred: 0,
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
      return updateSyncIndicator();
    })
    .then(() => {
      showToast('Synced');
    })
    .catch((error) => {
      console.error(error);
      void updateSyncIndicator();
      showToast('Sync failed');
    });
}

export async function initListView() {
  state.clientId = await ensureClientId();
  const tasks = await getAllTasks();
  tasks.forEach((task) => state.tasks.set(task.id, task));
  await migrateStarStateFromStorage();
  await updateSyncIndicator();
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

  const quickEditMenu = ensureContextMenu();
  quickEditMenu.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !contextTask) return;
    event.preventDefault();
    const taskId = contextTask.dataset.id;
    hideContextMenu();
    if (!taskId) return;
    if (button.dataset.action === 'priority') {
      void updateTaskPriority(taskId, button.dataset.value);
      return;
    }
    if (button.dataset.action === 'due') {
      void applyDueShortcut(taskId, button.dataset.value);
    }
  });

  document.addEventListener('contextmenu', (event) => {
    const targetDue = event.target.closest('.due-date-badge');
    const targetPriority = event.target.closest('.priority-text');
    const targetGroup = targetDue ? 'due' : (targetPriority ? 'priority' : null);
    if (!targetGroup) return;
    const row = event.target.closest('.task-row');
    if (!row) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    event.preventDefault();
    showContextMenu(row, event.clientX, event.clientY, targetGroup);
  });

  document.addEventListener('click', (event) => {
    if (!contextMenu) return;
    if (contextMenu.contains(event.target)) return;
    hideContextMenu();
  });

  window.addEventListener('scroll', hideContextMenu, true);
  window.addEventListener('resize', hideContextMenu);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideContextMenu();
  });

  window.addEventListener('online', triggerSync);
  window.addEventListener(taskUpdatedEvent, handleTaskUpdated);
  window.addEventListener(taskDeletedEvent, handleTaskDeleted);

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

  const brandLink = document.querySelector('.app-brand');
  if (brandLink && brandLink.dataset.searchBind !== 'true') {
    brandLink.dataset.searchBind = 'true';
    const handleBrandEvent = (event) => {
      const hasQuery = searchInput.value.trim() !== '' || state.searchQuery !== '';
      if (hasQuery || searchContainer.classList.contains('expanded')) {
        event.preventDefault();
        collapseSearch(true);
      }
    };
    brandLink.addEventListener('pointerdown', handleBrandEvent);
    brandLink.addEventListener('pointerup', handleBrandEvent);
    brandLink.addEventListener('touchend', handleBrandEvent, { passive: false });
    brandLink.addEventListener('click', handleBrandEvent);
  }

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

export function initSearch() {
  bindSearch();
}
