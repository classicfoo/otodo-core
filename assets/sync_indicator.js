import { getOutbox } from './db_local.js';

export async function updateSyncIndicator() {
  const syncIndicator = document.getElementById('sync-indicator');
  if (!syncIndicator) return;
  const outbox = await getOutbox();
  if (outbox.length) {
    syncIndicator.textContent = `${outbox.length} pending`;
    syncIndicator.classList.remove('hidden');
  } else {
    syncIndicator.classList.add('hidden');
  }
}
