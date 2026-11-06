'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch) => (...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('mauproject', {
  platform: process.platform,
  db: {
    loadAll: invoke('db:loadAll'),
    create: invoke('db:create'),
    update: invoke('db:update'),
    remove: invoke('db:remove'),
    bulkUpdate: invoke('db:bulkUpdate'),
    removeMany: invoke('db:removeMany'),
    createMany: invoke('db:createMany'),
    setSetting: invoke('db:setSetting'),
    comments: invoke('db:comments'),
    saveDashboard: invoke('db:saveDashboard'),
    deleteSpace: invoke('db:deleteSpace'),
    duplicateProject: invoke('db:duplicateProject'),
    importDataset: invoke('db:importDataset'),
    reset: invoke('db:reset'),
    info: invoke('db:info'),
    backup: invoke('db:backup'),
  },
  files: {
    saveText: invoke('file:saveText'),
    exportPdf: invoke('report:pdf'),
    exportXlsx: invoke('report:xlsx'),
    pickImportXlsx: invoke('import:pickXlsx'),
    applyImport: invoke('import:apply'),
    reveal: invoke('shell:reveal'),
    open: invoke('shell:open'),
  },
  on(channel, cb) {
    const allowed = ['menu:navigate', 'menu:action'];
    if (!allowed.includes(channel)) return () => {};
    const listener = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
