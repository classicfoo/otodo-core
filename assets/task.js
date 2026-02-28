import { getTask, putTask, deleteTask, addOutbox } from './db_local.js';
import { ensureClientId, syncAll } from './sync.js';
import { updateSyncIndicator } from './sync_indicator.js';
import { initTaskDescriptionEditor } from './task_description_editor.js';

const form = document.getElementById('edit-form');
const titleInput = document.getElementById('edit-title');
const dueInput = document.getElementById('edit-due');
const completedInput = document.getElementById('edit-completed');
const priorityInput = document.getElementById('edit-priority');
const starInput = document.getElementById('edit-star');
const descriptionInput = document.getElementById('edit-description');
const archiveInput = document.getElementById('edit-archive');
const descriptionEditorRoot = document.getElementById('edit-description-editor');
const archiveEditorRoot = document.getElementById('edit-archive-editor');
const editorShell = document.querySelector('.editor-shell');
const descriptionPanel = document.getElementById('description-panel');
const archivePanel = document.getElementById('archive-panel');
const settingsPanel = document.getElementById('settings-panel');
const editorToggleButtons = Array.from(document.querySelectorAll('[data-editor-target]'));
const hueSlider = document.getElementById('editor-hue');
const saturationSlider = document.getElementById('editor-saturation');
const valueSlider = document.getElementById('editor-value');
const editorBackgroundInput = document.getElementById('editor-background-color');
const hueValue = document.getElementById('editor-hue-value');
const saturationValue = document.getElementById('editor-saturation-value');
const valueValue = document.getElementById('editor-value-value');
const editorSwatch = document.getElementById('editor-swatch');
const deleteButton = document.getElementById('delete-task');
const missingTask = document.getElementById('missing-task');
const offlineIndicator = document.getElementById('offline-indicator');
const toast = document.getElementById('toast');

const starStorageKey = 'otodo_starred_tasks';
const taskUpdatedEvent = 'otodo-task-updated';
const taskDeletedEvent = 'otodo-task-deleted';
const defaultEditorBackground = { hue: 210, saturation: 33, value: 98 };
const editorBackgroundFromServer = typeof window.OTODO_EDITOR_BACKGROUND === 'string'
  ? window.OTODO_EDITOR_BACKGROUND
  : '#F8FAFC';
let editorBackgroundSaveTimeout = null;

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
let descriptionEditor = null;
let archiveEditor = null;
const customLineRules = Array.isArray(window.OTODO_LINE_RULES) ? window.OTODO_LINE_RULES : [];
const customDateFormats = Array.isArray(window.OTODO_DATE_FORMATS) ? window.OTODO_DATE_FORMATS : [];
const customDateColor = typeof window.OTODO_DATE_COLOR === 'string' ? window.OTODO_DATE_COLOR : '#FDA90D';
const capitalizeSentences = window.OTODO_CAPITALIZE_SENTENCES !== false;
let activeEditorPanel = 'description';

function showToast(message) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2200);
}

function nowIso() {
  return new Date().toISOString();
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
      void updateSyncIndicator();
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

function hsvToHex(hue, saturation, value) {
  const s = saturation / 100;
  const v = value / 100;
  const chroma = v * s;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = v - chroma;
  let red = 0;
  let green = 0;
  let blue = 0;

  if (hue >= 0 && hue < 60) {
    red = chroma;
    green = x;
  } else if (hue < 120) {
    red = x;
    green = chroma;
  } else if (hue < 180) {
    green = chroma;
    blue = x;
  } else if (hue < 240) {
    green = x;
    blue = chroma;
  } else if (hue < 300) {
    red = x;
    blue = chroma;
  } else {
    red = chroma;
    blue = x;
  }

  const toHex = (channel) => Math.round((channel + match) * 255).toString(16).padStart(2, '0');
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

function hexToHsv(hex) {
  const normalized = String(hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { ...defaultEditorBackground };
  }
  const red = parseInt(normalized.slice(0, 2), 16) / 255;
  const green = parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = parseInt(normalized.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === red) {
      hue = 60 * (((green - blue) / delta) % 6);
    } else if (max === green) {
      hue = 60 * (((blue - red) / delta) + 2);
    } else {
      hue = 60 * (((red - green) / delta) + 4);
    }
  }
  if (hue < 0) hue += 360;

  const saturation = max === 0 ? 0 : (delta / max) * 100;
  const value = max * 100;
  return {
    hue: Math.round(hue),
    saturation: Math.round(saturation),
    value: Math.round(value),
  };
}

function mixHexColors(baseHex, targetHex, ratio) {
  const base = String(baseHex || '').replace('#', '');
  const target = String(targetHex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(base) || !/^[0-9a-fA-F]{6}$/.test(target)) {
    return baseHex;
  }
  const clampRatio = Math.max(0, Math.min(1, ratio));
  const mixChannel = (start, end) => {
    const value = Math.round(start + (end - start) * clampRatio);
    return value.toString(16).padStart(2, '0');
  };
  const baseRed = parseInt(base.slice(0, 2), 16);
  const baseGreen = parseInt(base.slice(2, 4), 16);
  const baseBlue = parseInt(base.slice(4, 6), 16);
  const targetRed = parseInt(target.slice(0, 2), 16);
  const targetGreen = parseInt(target.slice(2, 4), 16);
  const targetBlue = parseInt(target.slice(4, 6), 16);

  return `#${mixChannel(baseRed, targetRed)}${mixChannel(baseGreen, targetGreen)}${mixChannel(baseBlue, targetBlue)}`;
}

function applyEditorBackground(hsv) {
  const hex = hsvToHex(hsv.hue, hsv.saturation, hsv.value);
  const panelHex = mixHexColors(hex, '#ffffff', 0.58);
  if (editorShell) {
    editorShell.style.setProperty('--editor-shell-bg', hex);
    editorShell.style.setProperty('--editor-panel-bg', panelHex);
  }
  if (editorSwatch) {
    editorSwatch.style.backgroundColor = hex;
  }
  if (hueSlider) hueSlider.value = String(hsv.hue);
  if (saturationSlider) saturationSlider.value = String(hsv.saturation);
  if (valueSlider) valueSlider.value = String(hsv.value);
  if (hueValue) hueValue.textContent = String(hsv.hue);
  if (saturationValue) saturationValue.textContent = String(hsv.saturation);
  if (valueValue) valueValue.textContent = String(hsv.value);
  if (editorBackgroundInput) editorBackgroundInput.value = hex;
}

function currentEditorBackground() {
  return {
    hue: Number(hueSlider ? hueSlider.value : defaultEditorBackground.hue),
    saturation: Number(saturationSlider ? saturationSlider.value : defaultEditorBackground.saturation),
    value: Number(valueSlider ? valueSlider.value : defaultEditorBackground.value),
  };
}

async function persistEditorBackgroundColor(hex) {
  const response = await fetch('/editor_preferences.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.OTODO_CSRF || '',
    },
    body: JSON.stringify({ editor_background_color: hex }),
    credentials: 'same-origin',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload || payload.ok !== true) {
    throw new Error('Failed to save editor background color');
  }
}

function scheduleEditorBackgroundSave(hex) {
  if (!window.OTODO_SERVER_AUTH) return;
  if (editorBackgroundSaveTimeout) {
    clearTimeout(editorBackgroundSaveTimeout);
  }
  editorBackgroundSaveTimeout = setTimeout(() => {
    persistEditorBackgroundColor(hex).catch((error) => {
      console.error(error);
      showToast('Editor background save failed');
    });
  }, 250);
}

function setActiveEditorPanel(panelName) {
  activeEditorPanel = ['archive', 'settings'].includes(panelName) ? panelName : 'description';
  if (descriptionPanel) {
    descriptionPanel.classList.toggle('hidden', activeEditorPanel !== 'description');
  }
  if (archivePanel) {
    archivePanel.classList.toggle('hidden', activeEditorPanel !== 'archive');
  }
  if (settingsPanel) {
    settingsPanel.classList.toggle('hidden', activeEditorPanel !== 'settings');
  }
  editorToggleButtons.forEach((button) => {
    const isActive = button.dataset.editorTarget === activeEditorPanel;
    button.classList.toggle('is-active', isActive);
    button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
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
    if (descriptionEditor && typeof descriptionEditor.updateDescription === 'function') {
      descriptionEditor.updateDescription();
    }
  }
  if (archiveInput) {
    archiveInput.value = loadedTask.description_archive || '';
    if (archiveEditor && typeof archiveEditor.updateDescription === 'function') {
      archiveEditor.updateDescription();
    }
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
  if (archiveInput && updated.description_archive !== (task.description_archive || '')) return true;
  return false;
}

function hasNonEditorChanges(updated) {
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
  if (archiveInput) {
    updated.description_archive = archiveInput.value || '';
  }
  return updated;
}

async function persistTaskChanges({ showToastOnSave = false, triggerSyncOnSave = false } = {}) {
  if (!task) return false;
  const updated = buildUpdatedTask();
  if (!updated || !hasTaskChanges(updated)) return false;
  const descriptionChanged = descriptionInput && updated.description !== task.description;
  const archiveChanged = archiveInput && updated.description_archive !== (task.description_archive || '');
  const editorContentChanged = descriptionChanged || archiveChanged;
  const nonEditorChanged = hasNonEditorChanges(updated);
  await putTask(updated);
  if (editorContentChanged) {
    await addOutboxOp({
      op_id: `${buildOutboxKey(updated.id, 'details')}:${updated.updated_at}`,
      client_id: clientId,
      type: 'upsert',
      task: updated,
    });
  }
  if (!editorContentChanged && nonEditorChanged) {
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
  editorToggleButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setActiveEditorPanel(button.dataset.editorTarget || 'description');
    });
  });

  if (descriptionEditorRoot) {
    descriptionEditor = initTaskDescriptionEditor(descriptionEditorRoot, scheduleAutosave, {
      lineRules: customLineRules,
      dateFormats: customDateFormats,
      dateColor: customDateColor,
      capitalizeSentences,
    });
  }
  if (archiveEditorRoot) {
    archiveEditor = initTaskDescriptionEditor(archiveEditorRoot, scheduleAutosave, {
      lineRules: customLineRules,
      dateFormats: customDateFormats,
      dateColor: customDateColor,
      capitalizeSentences,
    });
  }
  [hueSlider, saturationSlider, valueSlider].forEach((slider) => {
    if (!slider) return;
    slider.addEventListener('input', () => {
      const hsv = currentEditorBackground();
      applyEditorBackground(hsv);
      scheduleEditorBackgroundSave(hsvToHex(hsv.hue, hsv.saturation, hsv.value));
    });
  });
  applyEditorBackground(hexToHsv(editorBackgroundFromServer));
  setActiveEditorPanel(activeEditorPanel);

  registerAutosaveInput(titleInput, ['input']);
  registerAutosaveInput(dueInput, ['input', 'change']);
  registerAutosaveInput(completedInput, ['change']);
  registerAutosaveInput(priorityInput, ['change']);
  registerAutosaveInput(starInput, ['change']);

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
