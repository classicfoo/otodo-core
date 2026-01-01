import { getMeta, setMeta } from './db_local.js';

const OFFLINE_AUTH_KEY = 'offline_auth';
const OFFLINE_SESSION_KEY = 'offline_session';
const PENDING_PASSWORD_KEY = 'otodo_pending_password';

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveVerifier(password, salt, iterations) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return bufferToBase64(derivedBits);
}

async function createCredential(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 120000;
  const verifier = await deriveVerifier(password, salt, iterations);
  return {
    salt: bufferToBase64(salt),
    iterations,
    hash: 'SHA-256',
    verifier,
  };
}

async function storeOfflineAuth(payload, password) {
  if (!payload || !payload.user) return;
  const user = {
    id: payload.user.id,
    email: (payload.user.email || '').toLowerCase(),
  };
  const offlineAuth = {
    user,
    issued_at: payload.issued_at,
    credential: password ? await createCredential(password) : null,
  };
  await setMeta(OFFLINE_AUTH_KEY, offlineAuth);
  await setMeta(OFFLINE_SESSION_KEY, {
    user,
    issued_at: payload.issued_at,
    mode: 'online',
  });
}

async function verifyOfflineLogin(email, password) {
  const stored = await getMeta(OFFLINE_AUTH_KEY);
  if (!stored || !stored.credential) {
    return { ok: false, message: 'No offline login is available yet.' };
  }
  const normalizedEmail = (email || '').toLowerCase();
  if (normalizedEmail !== stored.user.email) {
    return { ok: false, message: 'Email does not match offline profile.' };
  }
  const salt = base64ToBuffer(stored.credential.salt);
  const verifier = await deriveVerifier(password, new Uint8Array(salt), stored.credential.iterations);
  if (verifier !== stored.credential.verifier) {
    return { ok: false, message: 'Invalid email or password.' };
  }
  await setMeta(OFFLINE_SESSION_KEY, {
    user: stored.user,
    issued_at: new Date().toISOString(),
    mode: 'offline',
  });
  return { ok: true };
}

async function getOfflineSession() {
  return getMeta(OFFLINE_SESSION_KEY);
}

async function clearOfflineSession() {
  await setMeta(OFFLINE_SESSION_KEY, null);
}

async function checkOnline() {
  if (!navigator.onLine) {
    return false;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);
  try {
    await fetch('/api.php?action=ping', {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });
    return true;
  } catch (error) {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function showOfflineError(message) {
  const alert = document.getElementById('offline-login-error');
  if (!alert) return;
  alert.textContent = message;
  alert.classList.remove('hidden');
}

function rememberPendingPassword(form) {
  const passwordInput = form.querySelector('#login-password');
  if (passwordInput && passwordInput.value) {
    sessionStorage.setItem(PENDING_PASSWORD_KEY, passwordInput.value);
  }
}

function clearPendingPassword() {
  sessionStorage.removeItem(PENDING_PASSWORD_KEY);
}

async function handleLoginPayload() {
  const payload = window.OTODO_LOGIN_PAYLOAD;
  if (!payload) {
    clearPendingPassword();
    return;
  }
  const pendingPassword = sessionStorage.getItem(PENDING_PASSWORD_KEY);
  await storeOfflineAuth(payload, pendingPassword);
  clearPendingPassword();
  window.location.href = '/index.php';
}

function attachLoginFormHandler() {
  const form = document.getElementById('login-form');
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    if (navigator.onLine) {
      rememberPendingPassword(form);
      return;
    }
    event.preventDefault();
    const email = form.querySelector('#login-email')?.value || '';
    const password = form.querySelector('#login-password')?.value || '';
    const result = await verifyOfflineLogin(email, password);
    if (result.ok) {
      window.location.href = '/index.php';
    } else {
      showOfflineError(result.message);
    }
  });
}

function attachLogoutHandlers() {
  const forms = document.querySelectorAll('form[data-offline-logout="true"]');
  if (!forms.length) return;
  forms.forEach((form) => {
    form.addEventListener('submit', async (event) => {
      if (navigator.onLine) return;
      event.preventDefault();
      await clearOfflineSession();
      window.location.href = '/login.php';
    });
  });
}

async function applyOfflineUi(session, isOnline) {
  if (!session) return;
  const online = isOnline ?? navigator.onLine;
  if (online && session.mode !== 'offline') {
    return;
  }
  const banner = document.getElementById('offline-banner');
  if (banner) {
    banner.classList.remove('hidden');
  }
  const indicator = document.getElementById('offline-indicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
  const emailNode = document.getElementById('menu-user-email');
  if (emailNode && session.user?.email) {
    emailNode.textContent = session.user.email;
  }
}

async function enforceAppSession() {
  if (window.OTODO_SERVER_AUTH) {
    return { allowed: true, session: null, isOnline: true };
  }
  const session = await getOfflineSession();
  if (!session) {
    window.location.href = '/login.php';
    return { allowed: false, session: null, isOnline: false };
  }
  const isOnline = await checkOnline();
  return { allowed: true, session, isOnline };
}

async function initAuth() {
  const gate = window.OTODO_AUTH_GATE;
  if (gate === 'login') {
    attachLoginFormHandler();
    attachLogoutHandlers();
    await handleLoginPayload();
    return;
  }
  if (gate === 'app') {
    attachLogoutHandlers();
    const result = await enforceAppSession();
    if (!result?.allowed) {
      return;
    }
    const session = result.session ?? await getOfflineSession();
    await applyOfflineUi(session, result.isOnline);
  }
}

initAuth();
