const { app, BrowserWindow, Menu, ipcMain, dialog, shell, screen, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const isDev = process.env.NODE_ENV === "development";

if (process.platform === "win32") {
  app.setAppUserModelId("com.mabykiosco.app");
}

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, "../assets/icon.ico"),
    path.join(__dirname, "../assets/icon.png"),
    path.join(__dirname, "../src/assets/brand/maby-icon.png"),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }

  return null;
}

const DATA_DIR_NAME = "Maby Kiosco";
const DB_FILE_NAME = "mabykiosco.db";

let mainWindow;
let db;
let dbPath;

function resolveDataDir() {
  const dataDir = path.join(app.getPath("documents"), DATA_DIR_NAME, "datos");
  fs.mkdirSync(dataDir, { recursive: true });
  return dataDir;
}

function resolveDbPath() {
  return path.join(resolveDataDir(), DB_FILE_NAME);
}

function resolveIndexHtml() {
  const candidates = [
    path.join(__dirname, "../dist/maby-kiosco/browser/index.html"),
    path.join(__dirname, "../dist/ferreteria-app/browser/index.html"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function initDatabase() {
  try {
    dbPath = resolveDbPath();
    db = new Database(dbPath);

    db.prepare(`
      CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        precio REAL,
        stock INTEGER
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS ventas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        producto_id INTEGER,
        cantidad INTEGER,
        fecha TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    db.prepare(`
      CREATE TABLE IF NOT EXISTS kv (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT
      )
    `).run();

    console.log("[main] Base de datos inicializada en:", dbPath);
  } catch (e) {
    console.error("[main] Error al inicializar DB:", e);
  }
}

function createWindow() {
  const appIcon = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    backgroundColor: '#FFAA55',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: appIcon || path.join(__dirname, "../assets/icon.ico"),
    title: "Maby Kiosco",
  });

  if (mainWindow.setMenuBarVisibility) {
    mainWindow.setMenuBarVisibility(false);
  }

  if (mainWindow && !mainWindow.isMaximized()) {
    mainWindow.maximize();
  }

  if (isDev) {
    mainWindow.loadURL("http://localhost:4200");
    mainWindow.webContents.openDevTools();
  } else {
    const indexHtml = resolveIndexHtml();
    if (!indexHtml) {
      dialog.showErrorBox(
        "No se encontró la aplicación",
        "Ejecutá primero: npm run build\n\nLuego: npm run electron\n\nO usá modo desarrollo: npm run electron:dev"
      );
      app.quit();
      return;
    }
    mainWindow.loadFile(indexHtml);
  }

  // Aplicar zoom tipo Ctrl+- con factor dinámico según resolución
  try {
    const computeZoom = ({ width, height }) => {
      if (width >= 1900 && height >= 1000) return 1.0;
      if (width >= 1600 && height >= 900) return 0.9;
      if (width >= 1366 && height >= 768) return 0.8;
      return 0.75;
    };
    const applyZoom = () => {
      const { workAreaSize } = screen.getPrimaryDisplay();
      const z = computeZoom(workAreaSize || { width: 1920, height: 1080 });
      try { mainWindow.webContents.setZoomFactor(z); } catch {}
    };
    mainWindow.webContents.on('did-finish-load', applyZoom);
    // Reaplicar zoom al restaurar/minimizar para evitar que quede chico
    mainWindow.on('restore', applyZoom);
    mainWindow.on('focus', applyZoom);
    app.on('browser-window-focus', applyZoom);
  } catch {}

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createMenu() {
  const template = [
    {
      label: "Archivo",
      submenu: [
        {
          label: "Nueva Venta",
          accelerator: "CmdOrCtrl+N",
          click: () => {
            mainWindow.webContents.send("new-sale");
          },
        },
        {
          label: "Nuevo Producto",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => {
            mainWindow.webContents.send("new-product");
          },
        },
        { type: "separator" },
        {
          label: "Salir",
          accelerator: process.platform === "darwin" ? "Cmd+Q" : "Ctrl+Q",
          click: () => {
            app.quit();
          },
        },
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "Ver",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Ventana",
      submenu: [{ role: "minimize" }, { role: "close" }],
    },
  ];

  Menu.setApplicationMenu(null);
}

app.whenReady().then(() => {
  initDatabase();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});


// Guardar PDF directamente (elige ruta primero, luego genera y guarda)
ipcMain.handle('ticket:pdf:save', async (_event, payload) => {
  try {
    const html = payload?.html || '<html><body>Ticket vacío</body></html>';
    const defaultName = payload?.fileName || `Ticket_${Date.now()}.pdf`;
    try { if (mainWindow) mainWindow.focus(); } catch {}
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow ?? undefined, {
      title: 'Guardar ticket en PDF',
      defaultPath: defaultName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const win = new BrowserWindow({
      width: 360,
      height: 800,
      show: true,
      focusable: false,
      skipTaskbar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false },
      backgroundColor: '#ffffff',
      opacity: 0.01
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((res) => {
      const waitDom = async () => {
        try {
          await new Promise(r => setTimeout(r, 150));
          await win.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>true) : Promise.resolve(true)', true);
          await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>r(true)))', true);
        } catch {}
        setTimeout(res, 100);
      };
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', waitDom); else waitDom();
    });

    const tryPrint = async (opts) => await win.webContents.printToPDF(opts);
    // Altura dinámica del contenido → micrones
    let heightPx = 1000;
    try {
      const result = await win.webContents.executeJavaScript(`(function(){
        const h = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        );
        return Math.ceil(h);
      })()`);
      if (typeof result === 'number' && result > 100) heightPx = result + 40;
    } catch {}
    const pxToMicrons = (px) => Math.ceil((px / 96) * 25400);
    const heightMicrons = Math.min(pxToMicrons(heightPx), 1000000);

    let pdf;
    try {
      pdf = await tryPrint({ marginsType: 1, pageSize: { width: 58000, height: heightMicrons }, printBackground: true, landscape: false, preferCSSPageSize: true });
    } catch (e1) {
      pdf = await tryPrint({ marginsType: 1, pageSize: 'A4', printBackground: true, landscape: false, preferCSSPageSize: true });
    }
    await fs.promises.writeFile(filePath, pdf);
    try { win.destroy(); } catch {}
    return { ok: true, filePath };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Guardar imagen PNG del ticket (elige ruta primero, luego genera y guarda)
ipcMain.handle('ticket:image:save', async (_event, payload) => {
  try {
    const html = payload?.html || '<html><body>Ticket vacío</body></html>';
    const format = (payload?.format || 'jpg').toLowerCase() === 'png' ? 'png' : 'jpg';
    const defaultNameBase = payload?.fileName || `Ticket_${Date.now()}.${format}`;
    const defaultName = defaultNameBase.replace(/\.(pdf|png|jpg|jpeg)$/i, `.${format}`);

    const win = new BrowserWindow({
      width: 360,
      height: 800,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false, offscreen: true },
      backgroundColor: '#ffffff'
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    await new Promise((res) => {
      const waitDom = async () => {
        try {
          await new Promise(r => setTimeout(r, 150));
          await win.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>true) : Promise.resolve(true)', true);
          await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>r(true)))', true);
        } catch {}
        setTimeout(res, 100);
      };
      if (win.webContents.isLoading()) win.webContents.once('did-finish-load', waitDom); else waitDom();
    });

    // Forzar ancho exacto de 58mm ~ 384 px y medir alto real del ticket
    try { await win.webContents.insertCSS('html,body{margin:0;background:#fff;} .t{width:384px !important;}'); } catch {}
    const measure = await win.webContents.executeJavaScript(`(function(){
      const el = document.querySelector('.t');
      const rect = el ? el.getBoundingClientRect() : { width: 384, height: document.body.scrollHeight };
      const h = Math.ceil(rect.height || document.body.scrollHeight || 800);
      return { heightPx: Math.max(200, Math.min(h + 20, 20000)) };
    })()`);
    const widthPx = 384;
    const heightPx = measure?.heightPx || 800;
    try { win.setContentSize(widthPx, heightPx); } catch {}
    await new Promise(r => setTimeout(r, 250));
    try { await win.webContents.executeJavaScript('window.scrollTo(0,0)'); } catch {}

    let image = await win.webContents.capturePage({ x: 0, y: 0, width: widthPx, height: heightPx });
    let size = image.getSize();
    if (!size || size.width < 10 || size.height < 10) {
      try { win.hide(); win.destroy(); } catch {}
      return { ok: false, error: 'empty-capture' };
    }
    // Rotación opcional (para drivers que invierten orientación)
    const rotate = (payload?.rotate || '').toLowerCase();
    if (rotate === 'cw' || rotate === 'ccw') {
      const base64 = image.toPNG().toString('base64');
      const rotatedDataUrl = await win.webContents.executeJavaScript(`new Promise(res=>{
        const img=new Image();
        img.onload=()=>{
          const w=${widthPx};
          const h=${heightPx};
          const c=document.createElement('canvas');
          const ctx=c.getContext('2d');
          if ('${rotate}'==='cw' || '${rotate}'==='ccw') { c.width=h; c.height=w; ctx.translate(c.width/2,c.height/2); ctx.rotate(('${rotate}'==='cw'?90:-90)*Math.PI/180); ctx.drawImage(img,-w/2,-h/2); }
          else { c.width=w; c.height=h; ctx.drawImage(img,0,0); }
          res(c.toDataURL('${format==='jpg'?'image/jpeg':'image/png'}'${format==='jpg'?',0.92':''}));
        };
        img.src='data:image/png;base64,${'${base64}'}';
      })`);
      if (typeof rotatedDataUrl === 'string' && rotatedDataUrl.startsWith('data:')) {
        const comma = rotatedDataUrl.indexOf(',');
        const b64 = rotatedDataUrl.slice(comma+1);
        const rotatedBuf = Buffer.from(b64, 'base64');
        image = require('electron').nativeImage.createFromBuffer(rotatedBuf);
        size = image.getSize();
      }
    }
    let buf = format === 'jpg' ? image.toJPEG(92) : image.toPNG();
    // Si es JPG, inyectar DPI=203 en el header JFIF para tamaño real en el visor
    if (format === 'jpg') {
      try {
        const setJpegDPI = (b, dpi) => {
          if (b.length < 20) return b;
          let i = 2; // saltar SOI
          while (i + 9 < b.length && b[i] === 0xFF) {
            const marker = b[i + 1];
            if (marker === 0xD8 || marker === 0xD9) { i += 2; continue; }
            if (marker >= 0xD0 && marker <= 0xD7) { i += 2; continue; }
            const len = (b[i + 2] << 8) | b[i + 3];
            if (marker === 0xE0 && i + 2 + len <= b.length) {
              if (b[i + 4] === 0x4A && b[i + 5] === 0x46 && b[i + 6] === 0x49 && b[i + 7] === 0x46 && b[i + 8] === 0x00) {
                // APP0 JFIF
                const unitsOff = i + 9;
                const xDenOff = i + 10;
                const yDenOff = i + 12;
                b[unitsOff] = 1; // dpi
                b[xDenOff] = (dpi >> 8) & 0xFF;
                b[xDenOff + 1] = dpi & 0xFF;
                b[yDenOff] = (dpi >> 8) & 0xFF;
                b[yDenOff + 1] = dpi & 0xFF;
                return b;
              }
            }
            i += 2 + len;
          }
          return b;
        };
        buf = setJpegDPI(Buffer.from(buf), 203);
      } catch {}
    }
    const tempPath = path.join(app.getPath('temp'), `ticket_preview_${Date.now()}.${format}`);
    await fs.promises.writeFile(tempPath, buf);

    // Modo auto: guardar directamente en Escritorio sin mostrar diálogo
    if (payload?.auto) {
      const desktop = app.getPath('desktop');
      const finalPath = path.join(desktop, defaultName);
      try { await fs.promises.copyFile(tempPath, finalPath); } catch (e) {
        try { await fs.promises.rename(tempPath, finalPath); } catch {}
      }
      try { win.destroy(); } catch {}
      try { await shell.openPath(finalPath); } catch {}
      return { ok: true, filePath: finalPath, width: size.width, height: size.height, format, saved: true };
    }

    // Si no es auto, abrir diálogo de guardado
    try { if (mainWindow) mainWindow.focus(); } catch {}
    const saveDialog = await dialog.showSaveDialog(mainWindow ?? undefined, {
      title: 'Guardar ticket como imagen',
      defaultPath: defaultName,
      filters: [format === 'jpg' ? { name: 'JPG', extensions: ['jpg', 'jpeg'] } : { name: 'PNG', extensions: ['png'] }]
    });
    if (!saveDialog.canceled && saveDialog.filePath) {
      await fs.promises.copyFile(tempPath, saveDialog.filePath);
    }
    try { win.destroy(); } catch {}
    return { ok: true, filePath: saveDialog.filePath || null, previewPath: tempPath, width: size.width, height: size.height, format, saved: !saveDialog.canceled };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// ===============================
// IPC handlers
// ===============================

// Info de la app
ipcMain.handle("get-app-version", async () => {
  return app.getVersion();
});

ipcMain.handle("get-app-name", async () => {
  return app.getName();
});

// ESC/POS: imprimir directo por USB (XP-58)
ipcMain.handle('escpos:print-ticket', async (_event, payload) => {
  try {
    let escpos;
    let USB;
    try {
      escpos = require('escpos');
      USB = require('escpos-usb');
    } catch (e) {
      return { ok: false, error: 'Faltan dependencias escpos/escpos-usb' };
    }

    escpos.USB = USB;
    const device = new escpos.USB();
    const printer = new escpos.Printer(device, { encoding: 'CP858' });

    const {
      negocio = { nombre: 'Maby - Kiosco' },
      fecha = '',
      numero = '',
      vendedor = '',
      items = [], // { cantidad, detalle, precio, subtotal }
      subtotalSinDescuento = 0,
      total = 0,
      pagos = [], // { metodo, monto } (ya no se imprime)
      redondeo = 0,
      descuentoPct = 0,
      descuentoMonto = 0,
      aplicarRedondeo = false,
    } = payload || {};

    const padRight = (txt, len) => (String(txt || '')).slice(0, len).padEnd(len, ' ');
    const padLeft = (txt, len) => (String(txt || '')).slice(0, len).padStart(len, ' ');
    const money = (n) => Math.round(Number(n || 0));
    const moneyStr = (n) => money(n).toLocaleString('es-AR');
    const fmtCant = (n) => {
      const num = Number(n);
      if (!isFinite(num)) return '0';
      if (Math.abs(num - Math.round(num)) < 0.001) return String(Math.round(num));
      return String(Number(num.toFixed(3)));
    };
    const wrapText = (text, maxLen) => {
      const words = String(text || '').trim().split(/\s+/).filter(Boolean);
      if (!words.length) return [];
      const lines = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (next.length <= maxLen) {
          cur = next;
        } else {
          if (cur) lines.push(cur);
          cur = w.length > maxLen ? w.slice(0, maxLen) : w;
        }
      }
      if (cur) lines.push(cur);
      return lines;
    };

    // 58mm común ≈ 32 caracteres
    const COLS = 32;
    const SUB_W = 9;
    const DET_W = COLS - SUB_W;
    const line = () => printer.text('-'.repeat(COLS));

    await new Promise((resolve, reject) => {
      device.open(function(err){
        if (err) return reject(err);
        try {
          printer
            .encode('cp858')
            .align('ct')
            .style('b')
            .size(0,0)
            .text(negocio.nombre)
            .style('normal');
          if (fecha) printer.text(fecha);
          if (numero) printer.text(`Ticket: ${numero}`);

          line();
          printer.align('lt');

          for (const it of items) {
            const nombre = String(it.detalle || '').trim();
            if (!nombre) continue;
            const cantStr = fmtCant(it.cantidad);
            const puStr = moneyStr(it.precio);
            const subtStr = moneyStr(it.subtotal);

            for (const nl of wrapText(nombre, COLS)) {
              if (nl.trim()) printer.text(nl);
            }

            const detalleLinea = `Cant. x${cantStr}  P.U $${puStr}`;
            printer.text(`${padRight(detalleLinea, DET_W)}${padLeft('$' + subtStr, SUB_W)}`);
          }

          line();
          const subtotalBruto = money(subtotalSinDescuento) || (items || []).reduce(
            (acc, it) => acc + money(it.subtotal || (Number(it.cantidad || 0) * Number(it.precio || 0))),
            0
          );

          let descuentoCalc = 0;
          const pct = Number(descuentoPct || 0);
          const montoDesc = money(descuentoMonto || 0);
          if (pct > 0) {
            descuentoCalc = Math.round(subtotalBruto * pct / 100);
          } else if (montoDesc > 0) {
            descuentoCalc = montoDesc;
          }

          const subtotalNeto = Math.max(0, subtotalBruto - descuentoCalc);
          let redondeoCalc = 0;
          if (aplicarRedondeo) {
            const resto50 = subtotalNeto % 50;
            redondeoCalc = resto50 === 0 ? 0 : (50 - resto50);
          }
          const totalCalculado = subtotalNeto + redondeoCalc;
          const totalFinal = money(total) > 0 ? money(total) : totalCalculado;

          const summaryRow = (label, valueStr) => {
            printer.text(`${padRight(label, DET_W)}${padLeft(valueStr, SUB_W)}`);
          };

          printer.align('lt');
          if (descuentoCalc > 0) {
            summaryRow('Subtotal:', '$' + moneyStr(subtotalBruto));
            const descLabel = pct > 0 ? `Descuento (${pct}%):` : 'Descuento:';
            summaryRow(descLabel, '-$' + moneyStr(descuentoCalc));
          }

          printer.align('rt').style('b').text(`TOTAL: $${moneyStr(totalFinal)}`).style('normal').align('lt');
          printer.text('');
          printer.align('ct').text('Gracias por su compra!');
          printer.align('ct').text('Ticket no valido como factura');
          printer.text('');
          printer.cut();
          printer.close((closeErr) => {
            if (closeErr) reject(closeErr);
            else resolve();
          });
        } catch(e) {
          try { printer.close(); } catch {}
          reject(e);
        }
      });
    });
    return { ok: true };
  } catch (e) {
    console.error('[main] escpos:print-ticket error', e);
    return { ok: false, error: e?.message || String(e) };
  }
});

// Impresión con electron-pos-printer

// Generar PDF de ticket desde HTML
ipcMain.handle('ticket:pdf', async (_event, payload) => {
  try {
    const html = payload?.html || '<html><body>Ticket vacío</body></html>';
    const fileName = payload?.fileName || `Ticket_${Date.now()}.pdf`;
    const win = new BrowserWindow({
      width: 360,
      height: 800,
      show: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true, backgroundThrottling: false },
      backgroundColor: '#ffffff'
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    // Espera robusta: did-finish-load + dom-ready + fonts ready + pequeño delay
    await new Promise((res) => {
      const waitDom = async () => {
        try {
          await new Promise(r => setTimeout(r, 150));
          await win.webContents.executeJavaScript('document.fonts && document.fonts.ready ? document.fonts.ready.then(()=>true) : Promise.resolve(true)', true);
          await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>r(true)))', true);
        } catch {}
        setTimeout(res, 100);
      };
      if (win.webContents.isLoading()) {
        win.webContents.once('did-finish-load', waitDom);
      } else {
        waitDom();
      }
    });

    const tryPrint = async (opts) => await win.webContents.printToPDF(opts);
    // Altura dinámica del contenido → micrones
    let heightPx = 1000;
    try {
      const result = await win.webContents.executeJavaScript(`(function(){
        const h = Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight,
          document.body.offsetHeight,
          document.documentElement.offsetHeight
        );
        return Math.ceil(h);
      })()`);
      if (typeof result === 'number' && result > 100) heightPx = result + 40;
    } catch {}
    const pxToMicrons = (px) => Math.ceil((px / 96) * 25400);
    const heightMicrons = Math.min(pxToMicrons(heightPx), 1000000);

    let pdf;
    try {
      pdf = await tryPrint({
        marginsType: 1,
        pageSize: { width: 58000, height: heightMicrons },
        printBackground: true,
        landscape: false,
        preferCSSPageSize: true
      });
    } catch (e1) {
      // Reintento con tamaño estándar A4 para máxima compatibilidad
      try {
        pdf = await tryPrint({
          marginsType: 1,
          pageSize: 'A4',
          printBackground: true,
          landscape: false,
          preferCSSPageSize: true
        });
      } catch (e2) {
        try { win.destroy(); } catch {}
        return { ok: false, error: (e1?.message || e2?.message || 'printToPDF failed') };
      }
    }
    try { win.destroy(); } catch {}
    return { ok: true, data: pdf, fileName };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Imprimir PDF silenciosamente con pdf-to-printer
ipcMain.handle('printer:print-pdf', async (_event, payload) => {
  try {
    const { print } = require('pdf-to-printer');
    const buf = payload?.data;
    const preferred = payload?.printerName || payload?.deviceName || 'XP-58';
    if (!buf) return { ok: false, error: 'Sin datos PDF' };

    // Elegir impresora disponible
    let printers = [];
    try {
      const wc = mainWindow?.webContents;
      if (wc && typeof wc.getPrintersAsync === 'function') printers = await wc.getPrintersAsync();
      else if (wc && typeof wc.getPrinters === 'function') printers = wc.getPrinters();
    } catch {}
    let deviceName = preferred;
    if (Array.isArray(printers) && printers.length) {
      const exact = printers.find(p => (p.name || '') === preferred)
        || printers.find(p => (p.name || '') === 'XP-58 (copy 1)')
        || printers.find(p => (p.name || '') === 'XP-58 (copy 2)');
      if (exact) deviceName = exact.name;
    }

    // Escribir a archivo temporal
    const tempDir = app.getPath('temp');
    const filePath = path.join(tempDir, `ticket_${Date.now()}.pdf`);
    await fs.promises.writeFile(filePath, Buffer.from(new Uint8Array(buf)));

    // Imprimir de forma no bloqueante
    const chosen = deviceName || 'predeterminada';
    print(filePath, { printer: deviceName, silent: true })
      .then(() => { try { fs.unlink(filePath, () => {}); } catch {} })
      .catch(async (e1) => {
        try { await print(filePath, { silent: true }); } catch {}
        try { fs.unlink(filePath, () => {}); } catch {}
      });
    return { ok: true, printer: chosen };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Listar impresoras disponibles
ipcMain.handle("printers:list", async () => {
  try {
    if (!mainWindow) return [];
    const wc = mainWindow.webContents;
    if (typeof wc.getPrintersAsync === 'function') {
      const list = await wc.getPrintersAsync();
      return Array.isArray(list) ? list : [];
    }
    const list = (wc.getPrinters && wc.getPrinters()) || [];
    return list;
  } catch (e) {
    console.error("[main] printers:list error", e);
    return [];
  }
});

// Imprimir ticket HTML en impresora térmica
ipcMain.handle("print-ticket", async (_event, payload) => {
  try {
    const html = payload?.html || '<html><body>Ticket vacío</body></html>';
    const preferredName = payload?.preferredName || payload?.deviceName || '';
    const silentFlag = typeof payload?.silent === 'boolean' ? !!payload.silent : true;
    const createPrintWindow = () => {
      const win = new BrowserWindow({
        width: 320,
        height: 600,
        show: !silentFlag,
        alwaysOnTop: !silentFlag,
        frame: !silentFlag,
        backgroundColor: '#ffffff',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });
      return win;
    };

    let printers = [];
    try {
      const wc = mainWindow?.webContents;
      if (wc && typeof wc.getPrintersAsync === 'function') {
        printers = await wc.getPrintersAsync();
      } else if (wc && typeof wc.getPrinters === 'function') {
        printers = wc.getPrinters();
      }
    } catch {}
    let deviceName = undefined;
    if (Array.isArray(printers) && printers.length) {
      // 1) Preferir coincidencia EXACTA con XP-58
      const exactCandidates = ['XP-58', 'XP-58 (copy 1)', 'XP-58 (copy 2)'];
      const exact = printers.find(p => exactCandidates.some(c => (p.name || '') === c));
      if (exact) {
        deviceName = exact.name;
      } else {
        // 2) Si el payload trae preferredName exacto, usarlo
        const prefer = (preferredName || '').toLowerCase();
        const byPreferred = printers.find(p => (p.name || '').toLowerCase() === prefer);
        if (byPreferred) {
          deviceName = byPreferred.name;
        } else {
          // 3) Heurística por incluye
          const match = printers.find(p => {
            const n = (p.name || '').toLowerCase();
            return prefer ? n.includes(prefer) : (n.includes('xp-58') || n.includes('xprinter') || n.includes('80mm') || n.includes('58mm'));
          });
          deviceName = match?.name;
        }
      }
    }

    const printWin = createPrintWindow();
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    const options = {
      silent: silentFlag,
      printBackground: true,
      color: false,
      margins: { marginType: 'none' },
      dpi: { horizontal: 203, vertical: 203 },
      pageSize: {
        width: 58000,  // 58mm en micrones
        height: 1000000 // alto largo (1m) para que corte por contenido
      }
    };
    if (deviceName) {
      options['deviceName'] = deviceName;
    }

    // Esperar a que el contenido esté listo realmente antes de imprimir
    await new Promise(res => {
      const done = () => setTimeout(res, 350);
      if (printWin.webContents.isLoading()) {
        printWin.webContents.once('did-finish-load', done);
      } else {
        done();
      }
    });

    // Imprimir: con diálogo si silent=false, o silencioso si true
    return await new Promise((resolve) => {
      try {
        const opts = { ...options, silent: silentFlag };
        if (!silentFlag) {
          try { printWin.setAlwaysOnTop(true, 'screen-saver'); } catch {}
          try { printWin.show(); printWin.focus(); } catch {}
          // Disparar diálogo del sistema (dos caminos por compatibilidad)
          try { printWin.webContents.print({ ...opts, silent: false }); } catch {}
          setTimeout(() => {
            try { printWin.webContents.executeJavaScript("try{window.focus(); window.print();}catch(e){}"); } catch {}
          }, 80);
          // No esperamos callback del diálogo, devolvemos ok y dejamos que el usuario continúe
          setTimeout(() => {
            try { printWin.setAlwaysOnTop(false); } catch {}
            try { printWin.destroy(); } catch {}
            resolve({ ok: true, manual: true });
          }, 1000);
          return;
        }

        printWin.webContents.print(opts, (success, failureReason) => {
          try { printWin.destroy(); } catch {}
          if (!success) {
            console.error('[main] print-ticket failed:', failureReason);
            resolve({ ok: false, error: failureReason || 'Error de impresión', deviceName: opts['deviceName'] || null, printers });
          } else {
            resolve({ ok: true, printer: opts['deviceName'] || null });
          }
        });
      } catch (e) {
        try { printWin.destroy(); } catch {}
        resolve({ ok: false, error: e?.message || String(e) });
      }
    });
  } catch (e) {
    console.error('[main] print-ticket error', e);
    return { ok: false, error: e?.message || String(e) };
  }
});

// Guardar archivo desde Angular
ipcMain.handle("save-file", async (_event, { data, defaultPath, filters }) => {
  try {
    try { if (mainWindow) { mainWindow.focus(); } } catch {}
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow ?? undefined, {
      title: "Guardar archivo",
      defaultPath,
      filters: Array.isArray(filters) ? filters : [],
    });
    if (canceled || !filePath) return { ok: false, canceled: true };

    const buffer = Buffer.from(new Uint8Array(data));
    await fs.promises.writeFile(filePath, buffer);
    return { ok: true, filePath };
  } catch (e) {
    console.error("[main] save-file error", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

// ===============================
// IPC: Base de datos
// ===============================

// Obtener productos
ipcMain.handle("productos:get", async () => {
  try {
    return db.prepare("SELECT * FROM productos").all();
  } catch (e) {
    console.error("[main] productos:get error", e);
    return [];
  }
});

// Agregar producto
ipcMain.handle("productos:add", async (_event, producto) => {
  try {
    const stmt = db.prepare(
      "INSERT INTO productos (nombre, precio, stock) VALUES (?, ?, ?)"
    );
    const result = stmt.run(producto.nombre, producto.precio, producto.stock);
    return { ok: true, id: result.lastInsertRowid };
  } catch (e) {
    console.error("[main] productos:add error", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

// KV get/set para persistencia JSON
ipcMain.handle("kv:get", async (_event, key) => {
  try {
    const row = db.prepare("SELECT value FROM kv WHERE key = ?").get(key);
    return row ? row.value : null;
  } catch (e) {
    console.error("[main] kv:get error", e);
    return null;
  }
});

ipcMain.handle("kv:set", async (_event, { key, value }) => {
  try {
    const now = new Date().toISOString();
    db.prepare("REPLACE INTO kv (key, value, updated_at) VALUES (?, ?, ?)").run(key, String(value ?? ''), now);
    return { ok: true };
  } catch (e) {
    console.error("[main] kv:set error", e);
    return { ok: false, error: e?.message || String(e) };
  }
});

// Abrir caja registradora (RJ11) vía pulso ESC/POS
ipcMain.handle('escpos:open-drawer', async () => {
  try {
    let escpos; let USB;
    try { escpos = require('escpos'); USB = require('escpos-usb'); }
    catch (e) { return { ok: false, error: 'Faltan dependencias escpos/escpos-usb' }; }
    escpos.USB = USB;
    const device = new escpos.USB();
    const printer = new escpos.Printer(device, { encoding: 'CP858' });
    await new Promise((resolve, reject) => {
      device.open(function(err){
        if (err) return reject(err);
        try {
          // Enviar pulso a cajón (pin 2). Algunas impresoras usan 2 o 5
          try { printer.cashdraw(2); } catch { try { printer.cashdraw(); } catch {} }
          try { printer.close(); } catch {}
          resolve();
        } catch (e) {
          try { printer.close(); } catch {}
          reject(e);
        }
      });
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
});

// Abrir carpeta de datos de la app o resaltar el archivo de base de datos
ipcMain.handle("open-data-folder", async () => {
  try {
    const dataDir = resolveDataDir();
    if (dbPath && fs.existsSync(dbPath)) {
      shell.showItemInFolder(dbPath);
    } else {
      await shell.openPath(dataDir);
    }
    return { ok: true };
  } catch (e) {
    console.error("[main] open-data-folder error", e);
    return { ok: false };
  }
});

