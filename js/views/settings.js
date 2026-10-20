import { store } from '../store.js';
import { relativeTime } from '../format.js';
import { toast } from '../components.js';
import {
  canUseFileSystemAccess, canShareFiles, getSyncState, onSyncStatus,
  connectFolder, disconnectFolder, reconnectFolder, syncNow,
  exportAndShare, importFromFile, downloadBackup, getMobileSyncMeta,
} from '../sync.js';

export function renderSettings(container, { getTheme, setTheme }) {
  let unsubscribe = null;

  function draw() {
    const theme = getTheme();
    container.innerHTML = `
      <h1 class="page-title">Settings</h1>

      <div class="settings-section card">
        <div class="card-title">Sync between devices</div>
        <div id="sync-panel"></div>
      </div>

      <div class="settings-section card">
        <div class="card-title">Appearance</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Theme</div>
            <div class="settings-row-sub">Applies on this device only</div>
          </div>
          <div class="theme-choice" id="theme-choice">
            <button type="button" data-t="system" class="${theme === 'system' ? 'active' : ''}">System</button>
            <button type="button" data-t="light" class="${theme === 'light' ? 'active' : ''}">Light</button>
            <button type="button" data-t="dark" class="${theme === 'dark' ? 'active' : ''}">Dark</button>
          </div>
        </div>
      </div>

      <div class="settings-section card">
        <div class="card-title">Your data</div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Download a backup</div>
            <div class="settings-row-sub">Saves a full copy of your data as a .json file</div>
          </div>
          <button type="button" class="btn btn-sm" id="btn-backup">Download</button>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Reset all data</div>
            <div class="settings-row-sub">Erases everything on this device</div>
          </div>
          <button type="button" class="btn btn-sm btn-danger" id="btn-reset">Reset</button>
        </div>
      </div>

      <p class="muted" style="font-size:12px; text-align:center; margin-top:8px;">Budget · a personal budgeting app</p>
    `;

    drawSyncPanel();

    container.querySelector('#theme-choice').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-t]');
      if (!btn) return;
      setTheme(btn.dataset.t);
      draw();
    });
    container.querySelector('#btn-backup').addEventListener('click', () => {
      downloadBackup();
      toast('Backup downloaded');
    });
    container.querySelector('#btn-reset').addEventListener('click', () => {
      if (confirm('This deletes all accounts, categories, and transactions on this device. This cannot be undone. Continue?')) {
        store.resetAll();
        toast('All data reset');
        draw();
      }
    });
  }

  function drawSyncPanel() {
    const panel = container.querySelector('#sync-panel');
    if (!panel) return;

    if (canUseFileSystemAccess) {
      const s = getSyncState();
      if (s.connected) {
        panel.innerHTML = `
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Synced folder</div>
              <div class="settings-row-sub">📁 ${escapeHtml(s.folderName)} · last synced ${relativeTime(s.lastSyncedAt)}</div>
            </div>
            <span class="badge connected">Connected</span>
          </div>
          <div class="btn-group" style="margin-top:10px;">
            <button type="button" class="btn btn-sm" id="btn-sync-now">Sync now</button>
            <button type="button" class="btn btn-sm" id="btn-disconnect">Disconnect</button>
          </div>
          ${s.lastError ? `<p class="muted" style="font-size:12px; margin-top:8px; color:var(--status-critical);">Last sync error: ${escapeHtml(s.lastError)}</p>` : ''}
        `;
        panel.querySelector('#btn-sync-now').addEventListener('click', async () => { await syncNow(); toast('Synced'); drawSyncPanel(); });
        panel.querySelector('#btn-disconnect').addEventListener('click', async () => { await disconnectFolder(); toast('Sync folder disconnected'); drawSyncPanel(); });
      } else if (s.folderName) {
        panel.innerHTML = `
          <div class="settings-row">
            <div>
              <div class="settings-row-label">Synced folder</div>
              <div class="settings-row-sub">📁 ${escapeHtml(s.folderName)} · permission needed</div>
            </div>
            <span class="badge">Paused</span>
          </div>
          <button type="button" class="btn btn-sm btn-primary btn-block" id="btn-reconnect" style="margin-top:10px;">Tap to resume sync</button>
        `;
        panel.querySelector('#btn-reconnect').addEventListener('click', async () => {
          const ok = await reconnectFolder();
          toast(ok ? 'Sync resumed' : 'Permission not granted');
          drawSyncPanel();
        });
      } else {
        panel.innerHTML = `
          <p class="settings-row-sub" style="margin-bottom:10px;">Pick a folder inside your Dropbox, OneDrive, or Google Drive app. Budget will read and write a small <code>budget-data.json</code> file there automatically, so your other device picks up the changes.</p>
          <button type="button" class="btn btn-primary btn-block" id="btn-connect">Connect a sync folder</button>
        `;
        panel.querySelector('#btn-connect').addEventListener('click', async () => {
          try {
            await connectFolder();
            toast('Sync folder connected');
          } catch (e) {
            if (e && e.name !== 'AbortError') toast('Could not connect folder');
          }
          drawSyncPanel();
        });
      }
    } else {
      const meta = getMobileSyncMeta();
      panel.innerHTML = `
        <p class="settings-row-sub" style="margin-bottom:10px;">
          Mobile browsers can't write straight into Dropbox/iCloud/Drive, so sync here is two taps:
          <strong>Export</strong> sends today's data to your synced folder via the share sheet, and
          <strong>Import</strong> pulls in the latest file from your other device.
        </p>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Last exported</div>
            <div class="settings-row-sub">${relativeTime(meta.lastExportAt)}</div>
          </div>
        </div>
        <div class="settings-row">
          <div>
            <div class="settings-row-label">Last imported</div>
            <div class="settings-row-sub">${relativeTime(meta.lastImportAt)}</div>
          </div>
        </div>
        <div class="btn-group" style="margin-top:10px;">
          <button type="button" class="btn btn-primary" id="btn-export">${canShareFiles ? 'Export & Share' : 'Export'}</button>
          <button type="button" class="btn" id="btn-import">Import</button>
        </div>
      `;
      panel.querySelector('#btn-export').addEventListener('click', async () => {
        const result = await exportAndShare();
        if (result === 'shared') toast('Shared — save it into your synced folder');
        else if (result === 'downloaded') toast('Downloaded — move it into your synced folder');
        drawSyncPanel();
      });
      panel.querySelector('#btn-import').addEventListener('click', async () => {
        try {
          const result = await importFromFile();
          if (result) toast(result.changed ? 'Import complete' : 'Already up to date');
          drawSyncPanel();
          if (result && result.changed) draw();
        } catch (e) {
          toast('Could not read that file');
        }
      });
    }
  }

  draw();
  unsubscribe = onSyncStatus(() => drawSyncPanel());
  return () => { if (unsubscribe) unsubscribe(); };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
