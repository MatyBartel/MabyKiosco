const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => {
    try {
      console.log('[preload] getAppVersion → invoke');
      return ipcRenderer.invoke('get-app-version').then(v => {
        console.log('[preload] getAppVersion ←', v);
        return v;
      });
    } catch (e) {
      console.error('[preload] getAppVersion error', e);
      throw e;
    }
  },
  ticketToPdf: async (html, fileName = `Ticket_${Date.now()}.pdf`) => {
    try { return await ipcRenderer.invoke('ticket:pdf', { html, fileName }); } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  },
  ticketToPdfAndSave: async (html, fileName = `Ticket_${Date.now()}.pdf`) => {
    try { return await ipcRenderer.invoke('ticket:pdf:save', { html, fileName }); } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  },
  ticketToImageAndSave: async (html, fileName = `Ticket_${Date.now()}.png`, options = { format: 'png', preview: true }) => {
    try { return await ipcRenderer.invoke('ticket:image:save', { html, fileName, ...(options || {}) }); } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  },
  printPdf: async (data, printerName) => {
    try { return await ipcRenderer.invoke('printer:print-pdf', { data, printerName }); } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  },
  escposPrint: async (payload) => {
    try { return await ipcRenderer.invoke('escpos:print-ticket', payload); } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  },
  openCashDrawer: async () => {
    try { return await ipcRenderer.invoke('escpos:open-drawer'); } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  },
  saveFile: async (data, options = {}) => {
    try {
      return await ipcRenderer.invoke('save-file', {
        data,
        defaultPath: options.defaultPath || 'archivo.xlsx',
        filters: options.filters || [{ name: 'Excel', extensions: ['xlsx'] }]
      });
    } catch (e) {
      console.error('[preload] saveFile error', e);
      return { ok: false, error: e?.message || String(e) };
    }
  },
  kvGet: async (key) => {
    try { return await ipcRenderer.invoke('kv:get', key); } catch { return null; }
  },
  kvSet: async (key, value) => {
    try { return await ipcRenderer.invoke('kv:set', { key, value }); } catch { return { ok:false }; }
  },
  openDataFolder: async () => {
    try { return await ipcRenderer.invoke('open-data-folder'); } catch { return { ok:false }; }
  },
  backupGetStatus: async () => {
    try { return await ipcRenderer.invoke('backup:get-status'); } catch { return { ok: false }; }
  },
  backupRunNow: async () => {
    try { return await ipcRenderer.invoke('backup:run-now'); } catch (e) { return { ok: false, error: e?.message || String(e) }; }
  },
  backupOpenFolder: async () => {
    try { return await ipcRenderer.invoke('backup:open-folder'); } catch { return { ok: false }; }
  },
  getAppName: () => {
    try {
      console.log('[preload] getAppName → invoke');
      return ipcRenderer.invoke('get-app-name').then(v => {
        console.log('[preload] getAppName ←', v);
        return v;
      });
    } catch (e) {
      console.error('[preload] getAppName error', e);
      throw e;
    }
  },
  listPrinters: async () => {
    try { return await ipcRenderer.invoke('printers:list'); } catch { return []; }
  },
  printTicket: async (html, optionsOrPreferred) => {
    try {
      let payload;
      if (typeof optionsOrPreferred === 'string') {
        payload = { html, preferredName: optionsOrPreferred };
      } else if (optionsOrPreferred && typeof optionsOrPreferred === 'object') {
        payload = { html, ...optionsOrPreferred };
      } else {
        payload = { html };
      }
      return await ipcRenderer.invoke('print-ticket', payload);
    } catch (e) { return { ok:false, error: e?.message || String(e) }; }
  },
  onNewSale: (callback) => {
    console.log('[preload] adding onNewSale listener');
    ipcRenderer.on('new-sale', callback);
  },
  onNewProduct: (callback) => {
    console.log('[preload] adding onNewProduct listener');
    ipcRenderer.on('new-product', callback);
  },
  removeAllListeners: (channel) => {
    console.log('[preload] removeAllListeners', channel);
    ipcRenderer.removeAllListeners(channel);
  },
  showNotification: (title, body) => {
    if ('Notification' in window) {
      new Notification(title, { body });
    }
  }
});

if ('Notification' in window) {
  Notification.requestPermission();
} 