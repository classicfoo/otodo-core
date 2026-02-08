import { getOutbox, getMeta } from './db_local.js';

export async function updateSyncIndicator() {
  const syncIndicator = document.getElementById('sync-indicator');
  const loginTop = document.getElementById('sync-login-top');
  if (!syncIndicator) return;
  const outbox = await getOutbox();
  const lastSyncError = await getMeta('last_sync_error');
  const unauthorized =
    lastSyncError && (lastSyncError.code === 'unauthorized' || lastSyncError.status === 401);
  if (outbox.length) {
    syncIndicator.textContent = `${outbox.length} pending`;
    syncIndicator.classList.remove('hidden');
  } else {
    syncIndicator.classList.add('hidden');
  }
  if (loginTop) {
    loginTop.classList.toggle('hidden', !unauthorized);
  }
}
