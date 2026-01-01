const DB_NAME = 'otodo_local';
const DB_VERSION = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('tasks')) {
        db.createObjectStore('tasks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('outbox')) {
        db.createObjectStore('outbox', { keyPath: 'op_id' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllTasks() {
  return withStore('tasks', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function putTask(task) {
  return withStore('tasks', 'readwrite', (store) => store.put(task));
}

export async function putTasks(tasks) {
  return withStore('tasks', 'readwrite', (store) => {
    tasks.forEach((task) => store.put(task));
  });
}

export async function deleteTask(id) {
  return withStore('tasks', 'readwrite', (store) => store.delete(id));
}

export async function clearTasks() {
  return withStore('tasks', 'readwrite', (store) => store.clear());
}

export async function addOutbox(op) {
  return withStore('outbox', 'readwrite', (store) => store.put(op));
}

export async function getOutbox() {
  return withStore('outbox', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  });
}

export async function clearOutbox() {
  return withStore('outbox', 'readwrite', (store) => store.clear());
}

export async function deleteOutbox(opId) {
  return withStore('outbox', 'readwrite', (store) => store.delete(opId));
}

export async function setMeta(key, value) {
  return withStore('meta', 'readwrite', (store) => store.put({ key, value }));
}

export async function getMeta(key) {
  return withStore('meta', 'readonly', (store) => {
    return new Promise((resolve, reject) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => reject(request.error);
    });
  });
}
