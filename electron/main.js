'use strict';
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const { MauProjectDB } = require('./db');
const { buildWorkbook } = require('./xlsx-export');
const { parseWorkbook } = require('./xlsx-import');

const APP_NAME = 'MauProject';
const APP_ID = 'com.mauproject.desktop';
const DB_FILE = 'mauproject.db';

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

let mainWindow = null;
let db = null;

function dbPath() {
  if (process.env.MAUPROJECT_DB) return path.resolve(process.env.MAUPROJECT_DB);
  return path.join(app.getPath('userData'), DB_FILE);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: APP_NAME,
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#f6f7fb',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 18 },
    show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Keep the window title as the product name regardless of the document title.
  mainWindow.on('page-title-updated', (e) => e.preventDefault());
  mainWindow.once('ready-to-show', () => { if (!process.env.MAUPROJECT_SHOTS) mainWindow.show(); });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  if (process.env.MAUPROJECT_SHOTS) runScreenshots(process.env.MAUPROJECT_SHOTS);
}

/** Verification helper: MAUPROJECT_SHOTS=<dir> captures each main view to PNG and quits. */
function runScreenshots(dir) {
  const routes = (process.env.MAUPROJECT_ROUTES || 'dashboard,projects,project/1/gantt,project/1/wbs,project/1/board,project/1/list,tasks,workload,capacity,team,reports,settings').split(',');
  fs.mkdirSync(dir, { recursive: true });
  const wc = mainWindow.webContents;
  const errors = [];
  wc.on('console-message', (_e, level, message) => { if (level >= 2) errors.push(message); });
  wc.once('did-finish-load', async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    await wait(1500);
    for (const spec of routes) {
      // "route|button text|button text" navigates, then clicks buttons by their visible text
      const [r, ...clicks] = spec.split('|');
      await wc.executeJavaScript(`window.location.hash = '#/${r}'`);
      await wait(900);
      for (const label of clicks) {
        await wc.executeJavaScript(`(() => { const b = [...document.querySelectorAll('button, .dash-add')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); if (b) b.click(); return !!b; })()`);
        await wait(600);
      }
      const img = await wc.capturePage();
      fs.writeFileSync(path.join(dir, spec.replace(/[\/| ]/g, '_') + '.png'), img.toPNG());
    }
    if (process.env.MAUPROJECT_XLSX_OUT) {
      wc.send('menu:action', 'export-xlsx');
      await wait(800);
      fs.writeFileSync(path.join(dir, 'export_modal.png'), (await wc.capturePage()).toPNG());
      await wc.executeJavaScript(`document.querySelector('.modal-f .btn.primary').click()`);
      for (let i = 0; i < 60 && !fs.existsSync(process.env.MAUPROJECT_XLSX_OUT); i++) await wait(500);
      await wait(500);
    }
    fs.writeFileSync(path.join(dir, 'console-errors.txt'), errors.join('\n'));
    app.quit();
  });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const send = (route) => () => mainWindow && mainWindow.webContents.send('menu:navigate', route);
  const template = [
    ...(isMac ? [{
      label: APP_NAME,
      submenu: [
        { role: 'about', label: `About ${APP_NAME}` },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Cmd+,', click: send('settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${APP_NAME}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${APP_NAME}` },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Project…', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('menu:action', 'new-project') },
        { label: 'New Task…', accelerator: 'CmdOrCtrl+T', click: () => mainWindow.webContents.send('menu:action', 'new-task') },
        { type: 'separator' },
        { label: 'Upload WBS & Workload (Excel)…', accelerator: 'CmdOrCtrl+U', click: () => mainWindow.webContents.send('menu:action', 'import-xlsx') },
        { label: 'Export WBS & Workload (Excel)…', accelerator: 'CmdOrCtrl+E', click: () => mainWindow.webContents.send('menu:action', 'export-xlsx') },
        { label: 'Back Up Database…', click: () => mainWindow.webContents.send('menu:action', 'backup') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Dashboard', accelerator: 'CmdOrCtrl+1', click: send('dashboard') },
        { label: 'Projects', accelerator: 'CmdOrCtrl+2', click: send('projects') },
        { label: 'Tasks', accelerator: 'CmdOrCtrl+3', click: send('tasks') },
        { label: 'Workload', accelerator: 'CmdOrCtrl+4', click: send('workload') },
        { label: 'Capacity Planning', accelerator: 'CmdOrCtrl+5', click: send('capacity') },
        { label: 'Team', accelerator: 'CmdOrCtrl+6', click: send('team') },
        { label: 'Reports', accelerator: 'CmdOrCtrl+7', click: send('reports') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: `${APP_NAME} User Guide`, click: () => shell.openPath(path.join(__dirname, '..', 'docs', 'USER_GUIDE.md')) }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function registerIpc() {
  const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...args) => fn(...args));

  handle('db:loadAll', () => db.loadAll());
  handle('db:create', (table, obj) => db.create(table, obj));
  handle('db:update', (table, id, patch) => db.update(table, id, patch));
  handle('db:remove', (table, id) => db.remove(table, id));
  handle('db:bulkUpdate', (table, items) => db.bulkUpdate(table, items));
  handle('db:setSetting', (k, v) => db.setSetting(k, v));
  handle('db:comments', (taskId) => db.commentsFor(taskId));
  handle('db:saveDashboard', (t, id, w) => db.saveDashboard(t, id, w));
  handle('db:deleteSpace', (id) => db.deleteSpace(id));
  handle('db:duplicateProject', (id) => db.duplicateProject(id));
  handle('db:importDataset', (ds) => db.importDataset(ds));
  handle('db:reset', () => db.reset());
  handle('db:info', () => {
    const file = dbPath();
    let size = 0;
    try { size = fs.statSync(file).size; } catch { /* new db */ }
    return { file, size, version: app.getVersion(), name: APP_NAME, appId: APP_ID };
  });

  handle('db:backup', async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Back Up MauProject Database',
      defaultPath: `mauproject-backup-${stamp}.db`,
      filters: [{ name: 'MauProject Database', extensions: ['db'] }],
    });
    if (canceled || !filePath) return null;
    await db.backupTo(filePath);
    return filePath;
  });

  handle('file:saveText', async (defaultName, content, filterName, ext) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: filterName || 'File', extensions: [ext || 'txt'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, content, 'utf8');
    return filePath;
  });

  handle('report:pdf', async (html, defaultName) => {
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export MauProject Report',
      defaultPath: defaultName || 'MauProject Report.pdf',
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, javascript: false } });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      landscape: true,
      margins: { marginType: 'custom', top: 0.4, bottom: 0.4, left: 0.4, right: 0.4 },
    });
    win.destroy();
    fs.writeFileSync(filePath, pdf);
    return filePath;
  });

  handle('report:xlsx', async (model, defaultName) => {
    const buf = await buildWorkbook(model);
    if (process.env.MAUPROJECT_XLSX_OUT) { // non-interactive export for automated checks
      fs.writeFileSync(process.env.MAUPROJECT_XLSX_OUT, Buffer.from(buf));
      return process.env.MAUPROJECT_XLSX_OUT;
    }
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'Export MauProject WBS & Workload',
      defaultPath: defaultName || 'MauProject WBS-Workload.xlsx',
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, Buffer.from(buf));
    return filePath;
  });

  handle('import:pickXlsx', async () => {
    let file = process.env.MAUPROJECT_IMPORT_FILE; // non-interactive path for automated checks
    if (!file) {
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
        title: 'Upload WBS & Workload (Excel)',
        properties: ['openFile'],
        filters: [{ name: 'Excel Workbook', extensions: ['xlsx', 'xlsm', 'xls'] }],
      });
      if (canceled || !filePaths[0]) return null;
      file = filePaths[0];
    }
    return parseWorkbook(file);
  });
  handle('import:apply', (plan, opts) => db.importPlan(plan, opts));

  handle('shell:reveal', (p) => shell.showItemInFolder(p));
  handle('shell:open', (p) => shell.openPath(p));
}

app.whenReady().then(() => {
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
    applicationVersion: app.getVersion(),
    copyright: `© ${new Date().getFullYear()} ${APP_NAME}`,
    credits: 'Project Management & Engineering Resource Planning',
  });
  nativeTheme.themeSource = 'light';
  try {
    fs.mkdirSync(path.dirname(dbPath()), { recursive: true });
    db = new MauProjectDB(dbPath());
  } catch (err) {
    dialog.showErrorBox(`${APP_NAME} could not open its database`, `${dbPath()}\n\n${err.message}`);
    app.exit(1);
    return;
  }
  registerIpc();
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || process.env.MAUPROJECT_SHOTS) app.quit();
});

app.on('will-quit', () => { try { db && db.close(); } catch { /* ignore */ } });
