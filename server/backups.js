const fs = require('fs/promises');
const path = require('path');
const { BACKUPS_DIR } = require('./config');
const { getDb, getDbPath } = require('./db');

async function createDatabaseBackup() {
    const db = getDb();
    const backupDir = await ensureBackupsDirectory();
    const backupFileName = buildBackupFileName();
    const backupFilePath = path.join(backupDir, backupFileName);

    await db.backup(backupFilePath);

    return getBackupFileInfo(backupFileName);
}

async function listDatabaseBackups() {
    const backupDir = await ensureBackupsDirectory();
    const entries = await fs.readdir(backupDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        if (!entry.isFile()) {
            continue;
        }

        if (!entry.name.endsWith('.db')) {
            continue;
        }

        files.push(await getBackupFileInfo(entry.name));
    }

    return files.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

async function getBackupDownloadPath(fileName) {
    const backupDir = await ensureBackupsDirectory();
    const safeFileName = path.basename(fileName);
    const resolvedPath = path.join(backupDir, safeFileName);
    const stat = await fs.stat(resolvedPath);

    if (!stat.isFile()) {
        throw new Error('Backup file is not a regular file');
    }

    return resolvedPath;
}

async function getBackupFileInfo(fileName) {
    const backupDir = await ensureBackupsDirectory();
    const safeFileName = path.basename(fileName);
    const resolvedPath = path.join(backupDir, safeFileName);
    const stat = await fs.stat(resolvedPath);

    return {
        file_name: safeFileName,
        size_bytes: stat.size,
        created_at: stat.mtime.toISOString()
    };
}

async function ensureBackupsDirectory() {
    const backupDir = BACKUPS_DIR || path.join(path.dirname(getDbPath()), 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    return backupDir;
}

function buildBackupFileName() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `schedule-backup-${year}${month}${day}-${hours}${minutes}${seconds}.db`;
}

module.exports = {
    createDatabaseBackup,
    getBackupDownloadPath,
    listDatabaseBackups
};
