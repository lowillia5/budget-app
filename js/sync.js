// sync.js — keeps the local store in sync with a JSON file that lives in a
// folder the user's Dropbox/OneDrive/Google Drive app already syncs for them.
//
// Two strategies, chosen automatically by feature detection:
//  - Desktop (Chrome/Edge, File System Access API): the app reads/writes
//    budget-data.json directly in a folder the user picks, automatically,
//    on every change and on a short poll.
//  - Everywhere else (iPhone/Android/Safari/Firefox): the browser sandbox
//    doesn't allow writing into another app's synced folder, so we offer a
//    one-tap "Export & Share" (uses the OS share sheet to hand the file to
//    Dropbox/Drive/Files) and an "Import" file picker.

import { store } from './store.js';
import { idbGet, idbSet, idbDelete } from './idb.js';

const FILE_NAME = 'budget-data.json';
const DIR_HANDLE_KEY = 'syncDirHandle';
const POLL_MS = 20000;
const DEBOUNCE_MS = 1200;

export const canUseFileSystemAccess = 'showDirectoryPicker' in window;
export const canShareFiles = !!(navigator.canShare && navigator.share);

const listeners = new Set();
function emit(status) {
  for (const fn of listeners) fn(status);
}
export function onSyncStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const state = {
  dirHandle: null,
  folderName: null,
  lastSyncedAt: null,
  lastError: null,
  connected: false,
};
export function getSyncState() { return { ...state }; }

// ---------------------------------------------------------------------
// Desktop: File System Access API
// ---------------------------------------------------------------------

async function verifyPermission(handle, mode = 'readwrite') {
  const opts = { mode };
  if ((await handle.queryPermission(opts)) === 'granted') return true;
  if ((await handle.requestPermission(opts)) === 'granted') return true;
  return false;
}

/** User-gesture required: call from a click handler. */
export async function connectFolder() {
  if (!canUseFileSystemAccess) throw new Error('not-supported');
  const dirHandle = await window.showDirectoryPicker({ id: 'budget-sync', mode: 'readwrite' });
  await idbSet(DIR_HANDLE_KEY, dirHandle);
  state.dirHandle = dirHandle;
  state.folderName = dirHandle.name;
  state.connected = true;
  await syncNow();
  startPolling();
  emit(getSyncState());
  return dirHandle;
}

export async function disconnectFolder() {
  await idbDelete(DIR_HANDLE_KEY);
  state.dirHandle = null;
  state.folderName = null;
  state.connected = false;
  stopPolling();
  emit(getSyncState());
}

/** Try to silently resume a previously-connected folder on app load. */
export async function tryResumeFolder() {
  if (!canUseFileSystemAccess) return false;
  try {
    const handle = await idbGet(DIR_HANDLE_KEY);
    if (!handle) return false;
    const granted = (await handle.queryPermission({ mode: 'readwrite' })) === 'granted';
    state.dirHandle = handle;
    state.folderName = handle.name;
    state.connected = granted;
    emit(getSyncState());
    if (granted) {
      await syncNow();
      startPolling();
    }
    return granted;
  } catch (e) {
    console.warn('Could not resume sync folder', e);
    return false;
  }
}

/** Call from a click handler when permission needs to be re-granted. */
export async function reconnectFolder() {
  if (!state.dirHandle) return false;
  const granted = await verifyPermission(state.dirHandle, 'readwrite');
  state.connected = granted;
  emit(getSyncState());
  if (granted) {
    await syncNow();
    startPolling();
  }
  return granted;
}

async function readRemoteFile(dirHandle) {
  const fileHandle = await dirHandle.getFileHandle(FILE_NAME, { create: true });
  const file = await fileHandle.getFile();
  const text = await file.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch (e) {
    console.warn('Sync file was not valid JSON, leaving it untouched.', e);
    return null;
  }
}

async function writeRemoteFile(dirHandle, data) {
  const fileHandle = await dirHandle.getFileHandle(FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(data, null, 2));
  await writable.close();
}

let syncing = false;
export async function syncNow() {
  if (!state.dirHandle || syncing) return;
  syncing = true;
  try {
    const granted = await state.dirHandle.queryPermission({ mode: 'readwrite' }) === 'granted';
    if (!granted) { state.connected = false; emit(getSyncState()); return; }
    const remote = await readRemoteFile(state.dirHandle);
    if (remote) store.mergeSnapshot(remote);
    await writeRemoteFile(state.dirHandle, store.exportSnapshot());
    state.lastSyncedAt = new Date().toISOString();
    state.lastError = null;
    state.connected = true;
  } catch (e) {
    console.error('Sync failed', e);
    state.lastError = e.message || String(e);
  } finally {
    syncing = false;
    emit(getSyncState());
  }
}

let debounceTimer = null;
function scheduleSync() {
  if (!state.dirHandle) return;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(syncNow, DEBOUNCE_MS);
}

let pollTimer = null;
function startPolling() {
  stopPolling();
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, POLL_MS);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

store.addEventListener('change', scheduleSync);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.dirHandle) syncNow();
});

// ---------------------------------------------------------------------
// Mobile: export via share sheet / download, import via file picker
// ---------------------------------------------------------------------

const MOBILE_META_KEY = 'budgetapp:mobileSyncMeta';
function getMobileMeta() {
  try { return JSON.parse(localStorage.getItem(MOBILE_META_KEY)) || {}; }
  catch { return {}; }
}
function setMobileMeta(patch) {
  const meta = { ...getMobileMeta(), ...patch };
  localStorage.setItem(MOBILE_META_KEY, JSON.stringify(meta));
  return meta;
}
export function getMobileSyncMeta() { return getMobileMeta(); }

function snapshotFile() {
  const json = JSON.stringify(store.exportSnapshot(), null, 2);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  return new File([json], `budget-data.json`, { type: 'application/json' });
}

/** Share the current data as a file via the OS share sheet, or fall back to download. */
export async function exportAndShare() {
  const file = snapshotFile();
  if (canShareFiles && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'Budget data',
        text: 'Save this into your synced folder (Dropbox, iCloud Drive, or Google Drive).',
      });
      setMobileMeta({ lastExportAt: new Date().toISOString() });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // fall through to download
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  setMobileMeta({ lastExportAt: new Date().toISOString() });
  return 'downloaded';
}

/** Opens a file picker and merges the chosen JSON file into local data. */
export function importFromFile() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return resolve(null);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const changed = store.mergeSnapshot(data);
        setMobileMeta({ lastImportAt: new Date().toISOString() });
        resolve({ changed });
      } catch (e) {
        reject(e);
      }
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/** Always-available full backup download, regardless of platform. */
export function downloadBackup() {
  const file = snapshotFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = `budget-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function initSync() {
  if (canUseFileSystemAccess) {
    await tryResumeFolder();
  }
}
