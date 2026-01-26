import { getOutbox, getMeta } from './db_local.js';

export async function updateSyncIndicator() {
  const syncIndicator = document.getElementById('sync-indicator');
  const syncStatus = document.getElementById('sync-status');
  const loginCta = document.getElementById('sync-login-cta');
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
  if (syncStatus) {
    if (!outbox.length) {
      syncStatus.textContent = 'All changes saved';
    } else if (unauthorized) {
      syncStatus.textContent = 'Sign in to sync changes';
    } else {
      syncStatus.textContent = `${outbox.length} change${outbox.length === 1 ? '' : 's'} pending`;
    }
  }
  if (loginCta) {
    loginCta.classList.toggle('hidden', !(outbox.length && unauthorized));
  }
}
