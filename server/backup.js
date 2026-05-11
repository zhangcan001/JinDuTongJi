function createStartupBackup() {
  if (!fs.existsSync(DB_PATH) || fs.statSync(DB_PATH).size === 0) return;
  fs.copyFileSync(DB_PATH, path.join(BACKUP_DIR, `jindu-startup-${dateStamp()}.sqlite`));
  pruneBackups();
  logEvent("backup.startup", "created startup backup");
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter((name) => name.endsWith(".sqlite"))
    .map((name) => ({ name, path: path.join(BACKUP_DIR, name), time: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.time - a.time);
}

function pruneBackups() {
  for (const backup of listBackups().slice(BACKUP_KEEP_COUNT)) {
    fs.rmSync(backup.path, { force: true });
  }
}

function createManualBackup() {
  const target = path.join(BACKUP_DIR, `jindu-manual-${dateStamp()}.sqlite`);
  checkpointDatabase();
  if (fs.existsSync(DB_PATH)) fs.copyFileSync(DB_PATH, target);
  else fs.writeFileSync(target, "");
  pruneBackups();
  logEvent("backup.manual", path.basename(target));
  return { name: path.basename(target), path: target, time: fs.statSync(target).mtimeMs };
}

function checkpointDatabase() {
  try {
    db.exec("PRAGMA wal_checkpoint(FULL)");
  } catch (error) {
    logEvent("sqlite.checkpoint.error", error.message || "unknown");
  }
}

function backupInfo(item) {
  return {
    name: item.name,
    size: fs.statSync(item.path).size,
    createdAt: new Date(item.time).toISOString()
  };
}

function restoreSqliteBackup(name) {
  if (!/^[\w.-]+\.sqlite$/.test(name)) throw new ApiError(400, "备份名称不合法");
  const source = path.join(BACKUP_DIR, name);
  if (!fs.existsSync(source)) throw new ApiError(404, "备份不存在");
  const backupDb = new DatabaseSync(source, { readOnly: true });
  try {
    const row = backupDb.prepare("SELECT payload FROM app_state WHERE id = 'latest'").get();
    if (!row?.payload) throw new ApiError(400, "备份中没有可恢复状态");
    const state = JSON.parse(row.payload);
    const validation = validateState(state);
    if (!validation.ok) throw new ApiError(400, validation.error);
    createManualBackup();
    saveStateToDatabase(state, new Date().toISOString());
    logEvent("backup.restore", name);
  } finally {
    backupDb.close();
  }
}

function checkDatabaseHealth() {
  const checks = [];
  const problems = [];
  const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name);
  for (const table of ["app_state", "projects", "tasks", "issues", "schema_migrations"]) {
    const ok = tableNames.includes(table);
    checks.push({ name: `table:${table}`, ok });
    if (!ok) problems.push(`缺少表 ${table}`);
  }
  const row = readState.get();
  if (row?.payload) {
    try {
      const parsed = JSON.parse(row.payload);
      const validation = validateState(parsed);
      checks.push({ name: "state-json", ok: validation.ok });
      if (!validation.ok) problems.push(validation.error);
    } catch {
      checks.push({ name: "state-json", ok: false });
      problems.push("最新状态 JSON 无法解析");
    }
  } else {
    checks.push({ name: "state-json", ok: true, note: "暂无状态" });
  }
  const integrity = db.prepare("PRAGMA integrity_check").get();
  const integrityOk = Object.values(integrity || {})[0] === "ok";
  checks.push({ name: "sqlite-integrity", ok: integrityOk });
  if (!integrityOk) problems.push("SQLite 完整性检查未通过");
  return { ok: problems.length === 0, checks, problems };
}
