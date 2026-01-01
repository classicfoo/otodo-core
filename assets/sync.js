import { getOutbox, clearOutbox, putTasks, clearTasks, getMeta, setMeta } from './db_local.js';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': window.OTODO_CSRF,
      ...(options.headers || {}),
    },
    ...options,
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data.data;
}

export async function ensureClientId() {
  let clientId = await getMeta('client_id');
  if (!clientId) {
    clientId = crypto.randomUUID();
    await setMeta('client_id', clientId);
  }
  return clientId;
}

export async function fetchRemoteTasks() {
  const data = await fetchJson('/api.php?action=list');
  const tasks = data.tasks || [];
  await clearTasks();
  await putTasks(tasks);
  return tasks;
}

export async function flushOutbox() {
  const ops = await getOutbox();
  if (!ops.length) {
    return { applied: 0, remaining: 0 };
  }
  const payload = { ops };
  await fetchJson('/api.php?action=sync_outbox', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  await clearOutbox();
  return { applied: ops.length, remaining: 0 };
}

export async function syncAll() {
  await flushOutbox();
  const tasks = await fetchRemoteTasks();
  return tasks;
}
