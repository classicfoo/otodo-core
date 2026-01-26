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
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }
  if (response.status === 401) {
    const unauthorizedError = new Error((data && data.error) || 'Unauthorized');
    unauthorizedError.status = 401;
    unauthorizedError.code = 'unauthorized';
    throw unauthorizedError;
  }
  if (!response.ok) {
    const httpError = new Error((data && data.error) || `Request failed (${response.status})`);
    httpError.status = response.status;
    throw httpError;
  }
  if (!data || !data.ok) {
    const apiError = new Error((data && data.error) || 'Request failed');
    apiError.status = response.status;
    if (data && data.code) {
      apiError.code = data.code;
    }
    throw apiError;
  }
  return data.data;
}

function serializeSyncError(error) {
  if (!error || typeof error !== 'object') {
    return { message: 'Sync failed', status: null, code: null };
  }
  return {
    message: error.message || 'Sync failed',
    status: Number.isFinite(error.status) ? error.status : null,
    code: typeof error.code === 'string' ? error.code : null,
  };
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
  try {
    await flushOutbox();
    const tasks = await fetchRemoteTasks();
    await setMeta('last_sync_error', null);
    return tasks;
  } catch (error) {
    await setMeta('last_sync_error', serializeSyncError(error));
    throw error;
  }
}
