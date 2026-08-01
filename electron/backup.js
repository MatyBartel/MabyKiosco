const path = require("path");
const fs = require("fs");
const { app, net } = require("electron");

const DATA_DIR_NAME = "Maby Kiosco";
const DB_FILE_NAME = "mabykiosco.db";
const BACKUP_SUBDIR = "backup";
const CLOUD_FOLDER_NAME = "Maby Kiosco Backup";
const BACKUP_HOUR = 12;
const BACKUP_MINUTE = 0;
const CHECK_INTERVAL_MS = 60 * 1000;

let schedulerTimer = null;
let backupInProgress = false;
let lastScheduledDay = null;

function resolveLocalBackupDir() {
  const dir = path.join(app.getPath("documents"), DATA_DIR_NAME, BACKUP_SUBDIR);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveStatusPath() {
  return path.join(resolveLocalBackupDir(), "backup-status.json");
}

function readStatus() {
  try {
    const raw = fs.readFileSync(resolveStatusPath(), "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeStatus(partial) {
  const current = readStatus();
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  fs.writeFileSync(resolveStatusPath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatTimestamp(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

function backupFileName(d = new Date()) {
  return `mabykiosco_${formatTimestamp(d)}.db`;
}

function listBackupFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith("mabykiosco_") && name.endsWith(".db"))
    .map((name) => path.join(dir, name));
}

function removeBackupFiles(dir, keepPath = null) {
  for (const filePath of listBackupFiles(dir)) {
    if (keepPath && path.resolve(filePath) === path.resolve(keepPath)) continue;
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("[backup] No se pudo borrar backup anterior:", filePath, e?.message || e);
    }
  }
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".db.tmp")) {
      try {
        fs.unlinkSync(path.join(dir, name));
      } catch {}
    }
  }
}

function pathExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/** Detecta Google Drive / OneDrive sin pedir ruta al usuario. */
function resolveCloudBackupDir() {
  const home = app.getPath("home");
  const candidates = [
    path.join(home, "Google Drive", CLOUD_FOLDER_NAME),
    path.join(home, "Google Drive", "My Drive", CLOUD_FOLDER_NAME),
    path.join(home, "Google Drive", "Mi unidad", CLOUD_FOLDER_NAME),
    path.join(home, "OneDrive", CLOUD_FOLDER_NAME),
  ];

  for (const target of candidates) {
    const parent = path.dirname(target);
    const cloudRoot = path.basename(parent) === CLOUD_FOLDER_NAME ? path.dirname(parent) : parent;
    if (pathExists(cloudRoot)) {
      fs.mkdirSync(target, { recursive: true });
      return target;
    }
  }

  for (let code = 71; code <= 90; code++) {
    const letter = `${String.fromCharCode(code)}:\\`;
    if (!pathExists(letter)) continue;
    for (const sub of ["My Drive", "Mi unidad", ""]) {
      const base = sub ? path.join(letter, sub) : letter.slice(0, -1);
      if (!pathExists(base)) continue;
      const target = path.join(base, CLOUD_FOLDER_NAME);
      try {
        fs.mkdirSync(target, { recursive: true });
        return target;
      } catch {}
    }
  }

  return null;
}

function hasInternet() {
  try {
    return net.isOnline();
  } catch {
    return false;
  }
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function alreadyBackedUpToday() {
  const status = readStatus();
  return status.lastRunDay === todayKey();
}

async function createSafeBackup(db, destPath) {
  const tempPath = `${destPath}.tmp`;
  if (fs.existsSync(tempPath)) {
    try {
      fs.unlinkSync(tempPath);
    } catch {}
  }

  await db.backup(tempPath);

  const stat = fs.statSync(tempPath);
  if (!stat.isFile() || stat.size < 512) {
    throw new Error("El backup generado es inválido o está vacío");
  }

  if (fs.existsSync(destPath)) {
    fs.unlinkSync(destPath);
  }
  fs.renameSync(tempPath, destPath);

  return destPath;
}

async function runBackup(db) {
  if (!db || backupInProgress) {
    return { ok: false, error: backupInProgress ? "Backup en curso" : "Base de datos no disponible" };
  }

  backupInProgress = true;
  const started = new Date();
  const fileName = backupFileName(started);
  const localDir = resolveLocalBackupDir();
  const localPath = path.join(localDir, fileName);

  try {
    removeBackupFiles(localDir);
    await createSafeBackup(db, localPath);

    const status = {
      lastRunDay: todayKey(started),
      lastLocalBackup: started.toISOString(),
      lastLocalFile: fileName,
      localPath,
      lastError: null,
    };

    let cloudResult = { ok: false, skipped: true, reason: "Nube no detectada" };
    const cloudDir = resolveCloudBackupDir();

    if (cloudDir) {
      status.cloudPath = cloudDir;
      if (hasInternet()) {
        try {
          removeBackupFiles(cloudDir);
          const cloudPath = path.join(cloudDir, fileName);
          fs.copyFileSync(localPath, cloudPath);
          cloudResult = { ok: true, path: cloudPath };
          status.lastCloudBackup = new Date().toISOString();
          status.lastCloudFile = fileName;
        } catch (e) {
          cloudResult = { ok: false, error: e?.message || String(e) };
          status.lastCloudError = cloudResult.error;
        }
      } else {
        cloudResult = { ok: false, skipped: true, reason: "Sin conexión a internet" };
        status.lastCloudError = cloudResult.reason;
      }
    }

    writeStatus(status);
    console.log("[backup] Backup local OK:", localPath, cloudResult);

    return {
      ok: true,
      localPath,
      fileName,
      cloud: cloudResult,
      cloudPath: cloudDir,
    };
  } catch (e) {
    const message = e?.message || String(e);
    writeStatus({ lastError: message });
    console.error("[backup] Error:", message);
    return { ok: false, error: message };
  } finally {
    backupInProgress = false;
  }
}

function shouldRunScheduledBackup(now = new Date()) {
  const afterScheduledTime =
    now.getHours() > BACKUP_HOUR ||
    (now.getHours() === BACKUP_HOUR && now.getMinutes() >= BACKUP_MINUTE);

  if (!afterScheduledTime) return false;
  if (alreadyBackedUpToday()) return false;
  return true;
}

function tickScheduledBackup(db) {
  const now = new Date();
  const day = todayKey(now);

  const trigger = () => {
    if (alreadyBackedUpToday()) {
      lastScheduledDay = day;
      return;
    }
    runBackup(db)
      .then((result) => {
        if (result?.ok) lastScheduledDay = day;
      })
      .catch((e) => console.error("[backup] scheduled error", e));
  };

  if (now.getHours() === BACKUP_HOUR && now.getMinutes() === BACKUP_MINUTE) {
    if (lastScheduledDay !== day) trigger();
    return;
  }

  if (shouldRunScheduledBackup(now) && lastScheduledDay !== day) {
    trigger();
  }
}

function startBackupScheduler(getDb) {
  if (schedulerTimer) clearInterval(schedulerTimer);

  const tick = () => {
    try {
      const db = typeof getDb === "function" ? getDb() : getDb;
      if (db) tickScheduledBackup(db);
    } catch (e) {
      console.error("[backup] scheduler tick error", e);
    }
  };

  tick();
  schedulerTimer = setInterval(tick, CHECK_INTERVAL_MS);
  console.log(`[backup] Programado diariamente a las ${pad2(BACKUP_HOUR)}:${pad2(BACKUP_MINUTE)}`);
}

function stopBackupScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}

function getBackupStatus() {
  const status = readStatus();
  const localDir = resolveLocalBackupDir();
  const cloudDir = resolveCloudBackupDir();
  return {
    scheduledTime: `${pad2(BACKUP_HOUR)}:${pad2(BACKUP_MINUTE)}`,
    localDir,
    cloudDir,
    cloudDetected: !!cloudDir,
    online: hasInternet(),
    inProgress: backupInProgress,
    ...status,
  };
}

module.exports = {
  resolveLocalBackupDir,
  resolveCloudBackupDir,
  runBackup,
  startBackupScheduler,
  stopBackupScheduler,
  getBackupStatus,
  BACKUP_HOUR,
  BACKUP_MINUTE,
};
