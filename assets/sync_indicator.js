import { getOutbox } from './db_local.js';

export async function updateSyncIndicator() {
  const syncIndicator = document.getElementById('sync-indicator');
  if (!syncIndicator) return;
  const outbox = await getOutbox();
  if (outbox.length) {
    const online = navigator.onLine;
    syncIndicator.textContent = online
      ? `Syncing ${outbox.length}…`
      : `${outbox.length} pending`;
    syncIndicator.title = online
      ? 'Changes are syncing in the background'
      : 'Changes will sync when you are back online';
    syncIndicator.classList.remove('hidden');
  } else {
    syncIndicator.classList.add('hidden');
    syncIndicator.title = '';
  }
}
