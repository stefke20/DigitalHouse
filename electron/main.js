// HouseVault desktop shell. The web app is served from a private app:// scheme (ES modules, workers and
// IndexedDB need a real origin – file:// is blocked by Chromium).
const { app, BrowserWindow, protocol, shell, Menu, net, dialog } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }]);

const ROOT = path.resolve(__dirname, '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.gz': 'application/octet-stream', '.traineddata': 'application/octet-stream' };

if (!app.requestSingleInstanceLock()) app.quit();
let win;
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1480, height: 920, minWidth: 980, minHeight: 640, backgroundColor: '#0f1624', title: 'HouseVault', autoHideMenuBar: true,
    icon: path.join(ROOT, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadURL('app://housevault/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
  win.on('closed', () => { win = null; });
}

function buildMenu() {
  const about = () => dialog.showMessageBox(win, { type: 'info', title: 'About HouseVault', message: `HouseVault ${app.getVersion()}`, detail: 'Digital library for your house documents with a 3D plan viewer, lighting simulation and a Belgian electrical symbol library.\n\nYour files stay on this computer.', buttons: ['OK'] });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() }, { type: 'separator' }, { role: 'quit' }] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }, { role: 'toggleDevTools' }] },
    { label: 'Help', submenu: [{ label: `About HouseVault ${app.getVersion()}`, click: about }] },
  ]));
}

app.whenReady().then(() => {
  protocol.handle('app', async req => {
    const u = new URL(req.url); let p = decodeURIComponent(u.pathname); if (p === '/' || p === '') p = '/index.html';
    const fp = path.normalize(path.join(ROOT, p));
    if (!fp.startsWith(ROOT)) return new Response('Forbidden', { status: 403 });
    try {
      const res = await net.fetch(pathToFileURL(fp).toString());
      if (!res.ok) return new Response('Not found', { status: 404 });
      return new Response(res.body, { status: 200, headers: { 'content-type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' } });
    } catch { return new Response('Not found', { status: 404 }); }
  });
  buildMenu(); createWindow();
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
