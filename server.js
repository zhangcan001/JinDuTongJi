const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "jindu.sqlite");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const LOG_DIR = path.join(DATA_DIR, "logs");
const LOG_PATH = path.join(LOG_DIR, "server.log");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const BACKUP_KEEP_COUNT = 30;
const VERSION_KEEP_COUNT = 80;
const BACKEND_AUDIT_KEEP_COUNT = 2000;
const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const WRITE_ROLES = new Set(["admin", "pm", "supervisor"]);

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(BACKUP_DIR, { recursive: true });
fs.mkdirSync(LOG_DIR, { recursive: true });

createStartupBackup();
const appConfig = loadConfig();

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS app_state_versions (
    version INTEGER PRIMARY KEY,
    payload TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS project_scopes (
    project_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    owner TEXT,
    discipline TEXT,
    building TEXT,
    floor TEXT,
    system TEXT,
    progress REAL,
    planned TEXT,
    actual TEXT,
    review_status TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS issues (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    owner TEXT,
    status TEXT,
    severity TEXT,
    deadline TEXT,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    action TEXT NOT NULL,
    role TEXT,
    detail TEXT,
    time TEXT
  );

  CREATE TABLE IF NOT EXISTS backend_audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT,
    actor TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_project ON audit_logs(project_id);
  CREATE INDEX IF NOT EXISTS idx_backend_audit_logs_created_at ON backend_audit_logs(created_at);
`);
ensureAppStateVersionColumn();
recordMigration(1, "initial backend schema");
recordMigration(2, "state indexes and optimistic versioning");
recordMigration(3, "backup restore export health and logs");
recordMigration(4, "auth maintenance versions wal retry support");
recordMigration(5, "cookie session auth and login gate");

const upsertState = db.prepare(`
  INSERT INTO app_state (id, payload, updated_at, version)
  VALUES ('latest', ?, ?, 1)
  ON CONFLICT(id) DO UPDATE SET
    payload = excluded.payload,
    updated_at = excluded.updated_at,
    version = app_state.version + 1
`);
const readState = db.prepare("SELECT payload, updated_at, version FROM app_state WHERE id = 'latest'");
const insertStateVersion = db.prepare("INSERT OR REPLACE INTO app_state_versions (version, payload, summary, created_at) VALUES (?, ?, ?, ?)");
const readVersions = db.prepare("SELECT version, summary, created_at FROM app_state_versions ORDER BY version DESC LIMIT ?");
const readVersion = db.prepare("SELECT version, payload, created_at FROM app_state_versions WHERE version = ?");
const clearProjects = db.prepare("DELETE FROM projects");
const clearScopes = db.prepare("DELETE FROM project_scopes");
const clearTasks = db.prepare("DELETE FROM tasks");
const clearIssues = db.prepare("DELETE FROM issues");
const clearAuditLogs = db.prepare("DELETE FROM audit_logs");
const insertProject = db.prepare("INSERT INTO projects (id, name, archived, updated_at) VALUES (?, ?, ?, ?)");
const insertScope = db.prepare("INSERT INTO project_scopes (project_id, payload, updated_at) VALUES (?, ?, ?)");
const insertTask = db.prepare(`
  INSERT INTO tasks (id, project_id, name, owner, discipline, building, floor, system, progress, planned, actual, review_status, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertIssue = db.prepare(`
  INSERT INTO issues (id, project_id, title, owner, status, severity, deadline, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const insertAuditLog = db.prepare("INSERT INTO audit_logs (id, project_id, action, role, detail, time) VALUES (?, ?, ?, ?, ?, ?)");
const insertBackendAuditLog = db.prepare("INSERT INTO backend_audit_logs (action, detail, actor, created_at) VALUES (?, ?, ?, ?)");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
};

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendApiError(response, error) {
  const status = Number(error?.status || 500);
  const safeStatus = status >= 400 && status < 600 ? status : 500;
  sendJson(response, safeStatus, { error: error?.message || "服务异常" });
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 30 * 1024 * 1024) {
        request.destroy();
        reject(new Error("请求数据过大"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

async function readJsonBody(request) {
  const body = await readBody(request);
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new ApiError(400, "请求 JSON 格式不正确");
  }
}

async function handleApi(request, response) {
  const parsedUrl = new URL(request.url, `http://${HOST}:${PORT}`);
  const route = parsedUrl.pathname;

  if (route === "/api/auth/status" && request.method === "GET") {
    return sendJson(response, 200, { enabled: authEnabled(), authenticated: isAuthenticated(request) });
  }

  if (route === "/api/auth/login" && request.method === "POST") {
    const payload = await readJsonBody(request);
    if (!authEnabled() || payload.password === appConfig.password) {
      setAuthCookie(response, appConfig.token);
      return sendJson(response, 200, { ok: true, authenticated: true });
    }
    logBackendAudit("auth.failed", "password rejected");
    return sendJson(response, 401, { error: "密码不正确" });
  }

  if (route === "/api/auth/logout" && request.method === "POST") {
    clearAuthCookie(response);
    return sendJson(response, 200, { ok: true, authenticated: false });
  }

  if (!authorize(request, route, request.method)) return sendJson(response, 401, { error: "未授权" });
  if (!authorizeRole(request, route, request.method)) return sendJson(response, 403, { error: "当前角色无权执行该后端操作" });

  if (route === "/api/state" && request.method === "GET") {
    const row = readState.get();
    if (!row) return sendJson(response, 200, { state: null, updatedAt: null, version: 0 });
    return sendJson(response, 200, { state: JSON.parse(row.payload), updatedAt: row.updated_at, version: row.version });
  }

  if (route === "/api/state" && request.method === "PUT") {
    const payload = await readJsonBody(request);
    const validation = validateState(payload.state);
    if (!validation.ok) return sendJson(response, 400, { error: validation.error });
    const current = readState.get();
    if (!payload.force && Number.isFinite(Number(payload.baseVersion)) && current && Number(payload.baseVersion) !== Number(current.version)) {
      return sendJson(response, 409, {
        error: "数据库已有更新，请刷新页面后再保存。",
        currentVersion: current.version,
        updatedAt: current.updated_at
      });
    }
    const updatedAt = new Date().toISOString();
    saveStateToDatabase(payload.state, updatedAt);
    const saved = readState.get();
    logEvent("state.save", `version=${saved.version} projects=${payload.state.projects.length} tasks=${payload.state.tasks.length}`);
    logBackendAudit("state.save", `version=${saved.version}`, actorFromRequest(request));
    return sendJson(response, 200, { ok: true, updatedAt, version: saved.version });
  }

  if (route === "/api/health" && request.method === "GET") {
    const row = readState.get();
    const health = checkDatabaseHealth();
    return sendJson(response, 200, {
      ok: health.ok,
      database: DB_PATH,
      updatedAt: row?.updated_at || null,
      version: row?.version || 0,
      backups: listBackups().length,
      checks: health.checks,
      problems: health.problems,
      authEnabled: authEnabled(),
      wal: getPragmaValue("journal_mode"),
      structuredTables: ["projects", "project_scopes", "tasks", "issues", "audit_logs"]
    });
  }

  if (route === "/api/projects" && request.method === "GET") {
    const includeArchived = parsedUrl.searchParams.get("archived") === "1";
    const rows = includeArchived
      ? db.prepare("SELECT id, name, archived, updated_at FROM projects ORDER BY name").all()
      : db.prepare("SELECT id, name, archived, updated_at FROM projects WHERE archived = 0 ORDER BY name").all();
    return sendJson(response, 200, { projects: rows });
  }

  if (route === "/api/backups" && request.method === "GET") {
    return sendJson(response, 200, { backups: listBackups().map((item) => backupInfo(item)) });
  }

  if (route === "/api/backups" && request.method === "POST") {
    const backup = createManualBackup();
    return sendJson(response, 200, { ok: true, backup: backupInfo(backup) });
  }

  if (route.startsWith("/api/backups/") && route.endsWith("/restore") && request.method === "POST") {
    const name = decodeURIComponent(route.replace("/api/backups/", "").replace("/restore", ""));
    restoreSqliteBackup(name);
    const row = readState.get();
    return sendJson(response, 200, { ok: true, updatedAt: row?.updated_at || null, version: row?.version || 0 });
  }

  if (route === "/api/versions" && request.method === "GET") {
    return sendJson(response, 200, { versions: readVersions.all(VERSION_KEEP_COUNT) });
  }

  if (route.startsWith("/api/versions/") && route.endsWith("/restore") && request.method === "POST") {
    const version = Number(route.replace("/api/versions/", "").replace("/restore", ""));
    const row = readVersion.get(version);
    if (!row?.payload) return sendJson(response, 404, { error: "版本不存在" });
    const state = JSON.parse(row.payload);
    const validation = validateState(state);
    if (!validation.ok) return sendJson(response, 400, { error: validation.error });
    createManualBackup();
    saveStateToDatabase(state, new Date().toISOString());
    logBackendAudit("version.restore", `version=${version}`, actorFromRequest(request));
    const saved = readState.get();
    return sendJson(response, 200, { ok: true, updatedAt: saved.updated_at, version: saved.version });
  }

  if (route === "/api/export/json" && request.method === "GET") {
    const row = readState.get();
    if (!row) return sendJson(response, 404, { error: "暂无数据库状态" });
    const payload = {
      app: "JinDuTongJi",
      exportedAt: new Date().toISOString(),
      backendVersion: row.version,
      state: JSON.parse(row.payload)
    };
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="jindu-state-${dateStamp()}.json"`
    });
    response.end(JSON.stringify(payload, null, 2));
    return;
  }

  if (route === "/api/export/sqlite" && request.method === "GET") {
    checkpointDatabase();
    return sendFile(response, DB_PATH, `jindu-${dateStamp()}.sqlite`, "application/vnd.sqlite3");
  }

  if (route === "/api/import/json" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const nextState = payload.state || payload;
    const validation = validateState(nextState);
    if (!validation.ok) return sendJson(response, 400, { error: validation.error });
    createManualBackup();
    saveStateToDatabase(nextState, new Date().toISOString());
    const row = readState.get();
    logEvent("state.import-json", `version=${row.version}`);
    logBackendAudit("state.import-json", `version=${row.version}`, actorFromRequest(request));
    return sendJson(response, 200, { ok: true, updatedAt: row.updated_at, version: row.version });
  }

  if (route === "/api/logs" && request.method === "GET") {
    const lines = fs.existsSync(LOG_PATH) ? fs.readFileSync(LOG_PATH, "utf8").trim().split(/\r?\n/).slice(-200) : [];
    return sendJson(response, 200, { lines });
  }

  if (route === "/api/audit" && request.method === "GET") {
    const rows = db.prepare("SELECT action, detail, actor, created_at FROM backend_audit_logs ORDER BY id DESC LIMIT 200").all();
    return sendJson(response, 200, { logs: rows });
  }

  if (route === "/api/audit" && request.method === "POST") {
    const payload = await readJsonBody(request);
    const action = String(payload.action || "").trim();
    if (!action) return sendJson(response, 400, { error: "操作名称不能为空" });
    const detailParts = [];
    if (payload.projectId) detailParts.push(`project=${payload.projectId}`);
    if (payload.role) detailParts.push(`role=${payload.role}`);
    if (payload.detail) detailParts.push(String(payload.detail));
    logBackendAudit(`ui.${action}`, detailParts.join(" | "), actorFromRequest(request));
    return sendJson(response, 200, { ok: true });
  }

  if (route === "/api/maintenance" && request.method === "POST") {
    const before = checkDatabaseHealth();
    db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    db.exec("VACUUM");
    pruneBackups();
    pruneVersions();
    const after = checkDatabaseHealth();
    logBackendAudit("maintenance.run", `ok=${after.ok}`, actorFromRequest(request));
    return sendJson(response, 200, { ok: after.ok, before, after });
  }

  if (route === "/api/tasks" && request.method === "GET") {
    const projectId = parsedUrl.searchParams.get("projectId") || "";
    const owner = parsedUrl.searchParams.get("owner") || "";
    const limit = clampNumber(parsedUrl.searchParams.get("limit"), 1, 5000, 500);
    const offset = clampNumber(parsedUrl.searchParams.get("offset"), 0, 1000000, 0);
    const where = [];
    const params = [];
    if (projectId) {
      where.push("project_id = ?");
      params.push(projectId);
    }
    if (owner) {
      where.push("owner = ?");
      params.push(owner);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) AS count FROM tasks ${clause}`).get(...params).count;
    const rows = db.prepare(`SELECT * FROM tasks ${clause} ORDER BY project_id, planned, name LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return sendJson(response, 200, { tasks: rows, total, limit, offset });
  }

  if (route === "/api/issues" && request.method === "GET") {
    const projectId = parsedUrl.searchParams.get("projectId") || "";
    const status = parsedUrl.searchParams.get("status") || "";
    const limit = clampNumber(parsedUrl.searchParams.get("limit"), 1, 5000, 500);
    const offset = clampNumber(parsedUrl.searchParams.get("offset"), 0, 1000000, 0);
    const where = [];
    const params = [];
    if (projectId) {
      where.push("project_id = ?");
      params.push(projectId);
    }
    if (status) {
      where.push("status = ?");
      params.push(status);
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = db.prepare(`SELECT COUNT(*) AS count FROM issues ${clause}`).get(...params).count;
    const rows = db.prepare(`SELECT * FROM issues ${clause} ORDER BY project_id, deadline, title LIMIT ? OFFSET ?`).all(...params, limit, offset);
    return sendJson(response, 200, { issues: rows, total, limit, offset });
  }

  return sendJson(response, 404, { error: "接口不存在" });
}

function validateState(state) {
  if (!state || typeof state !== "object") return { ok: false, error: "状态数据不能为空" };
  if (!Array.isArray(state.projects)) return { ok: false, error: "状态数据缺少 projects 数组" };
  if (!Array.isArray(state.tasks)) return { ok: false, error: "状态数据缺少 tasks 数组" };
  if (state.issues && !Array.isArray(state.issues)) return { ok: false, error: "issues 必须是数组" };
  if (state.projectScopes && (typeof state.projectScopes !== "object" || Array.isArray(state.projectScopes))) {
    return { ok: false, error: "projectScopes 格式不正确" };
  }
  const projectIds = new Set();
  for (const project of state.projects) {
    if (!project?.id || !project?.name) return { ok: false, error: "项目必须包含 id 和 name" };
    projectIds.add(String(project.id));
  }
  for (const task of state.tasks) {
    if (!task?.id || !task?.projectId) return { ok: false, error: "节点必须包含 id 和 projectId" };
    if (projectIds.size && !projectIds.has(String(task.projectId))) return { ok: false, error: `节点 ${task.id} 关联的项目不存在` };
    const taskValidation = validateTaskRecord(task);
    if (!taskValidation.ok) return taskValidation;
  }
  for (const issue of state.issues || []) {
    const issueValidation = validateIssueRecord(issue, projectIds);
    if (!issueValidation.ok) return issueValidation;
  }
  return { ok: true };
}

function validateTaskRecord(task) {
  const progress = Number(task.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return { ok: false, error: `节点 ${task.id} 完成率必须在 0-100 之间` };
  for (const field of ["planned", "actual"]) {
    if (task[field] && !isDateText(task[field])) return { ok: false, error: `节点 ${task.id} 的${field}日期格式不正确` };
  }
  if (task.actual && task.planned && progress < 100) return { ok: false, error: `节点 ${task.id} 已填实际日期但完成率未达 100%` };
  return { ok: true };
}

function validateIssueRecord(issue, projectIds) {
  if (!issue?.id || !issue?.projectId) return { ok: false, error: "整改项必须包含 id 和 projectId" };
  if (projectIds.size && !projectIds.has(String(issue.projectId))) return { ok: false, error: `整改项 ${issue.id} 关联的项目不存在` };
  if (issue.deadline && !isDateText(issue.deadline)) return { ok: false, error: `整改项 ${issue.id} 的要求日期格式不正确` };
  if (issue.closedAt && !isDateText(issue.closedAt)) return { ok: false, error: `整改项 ${issue.id} 的闭合日期格式不正确` };
  if (issue.rectifyCount != null && (!Number.isFinite(Number(issue.rectifyCount)) || Number(issue.rectifyCount) < 0)) {
    return { ok: false, error: `整改项 ${issue.id} 的整改次数不正确` };
  }
  return { ok: true };
}

function isDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

function saveStateToDatabase(state, updatedAt) {
  db.exec("BEGIN IMMEDIATE");
  try {
    upsertState.run(JSON.stringify(state), updatedAt);
    const saved = readState.get();
    rebuildIndexes(state, updatedAt);
    insertStateVersion.run(saved.version, JSON.stringify(state), summarizeState(state), updatedAt);
    pruneVersions();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function summarizeState(state) {
  const projects = state.projects?.length || 0;
  const tasks = state.tasks?.length || 0;
  const issues = state.issues?.length || 0;
  return `项目 ${projects} 个，节点 ${tasks} 条，整改 ${issues} 条`;
}

function rebuildIndexes(state, updatedAt) {
  clearProjects.run();
  clearScopes.run();
  clearTasks.run();
  clearIssues.run();
  clearAuditLogs.run();

  const archived = new Set(state.archivedProjectIds || []);
  for (const project of state.projects || []) {
    insertProject.run(String(project.id), String(project.name), archived.has(project.id) ? 1 : 0, updatedAt);
  }
  for (const [projectId, scope] of Object.entries(state.projectScopes || {})) {
    insertScope.run(projectId, JSON.stringify(scope || {}), updatedAt);
  }
  for (const task of state.tasks || []) {
    insertTask.run(
      String(task.id),
      String(task.projectId),
      String(task.name || task.system || "未命名节点"),
      task.owner || "",
      task.discipline || "",
      task.building || "",
      task.floor || "",
      task.system || "",
      Number(task.progress || 0),
      task.planned || "",
      task.actual || "",
      task.reviewStatus || "",
      updatedAt
    );
  }
  for (const issue of state.issues || []) {
    insertIssue.run(
      String(issue.id),
      String(issue.projectId || ""),
      String(issue.title || "未命名整改项"),
      issue.owner || "",
      issue.status || "",
      issue.severity || "",
      issue.deadline || "",
      updatedAt
    );
  }
  for (const log of state.auditLogs || []) {
    insertAuditLog.run(
      String(log.id || `${log.time}-${log.action}`),
      log.projectId || "",
      String(log.action || "操作"),
      log.role || "",
      log.detail || "",
      log.time || updatedAt
    );
  }
}

function ensureAppStateVersionColumn() {
  const columns = db.prepare("PRAGMA table_info(app_state)").all().map((item) => item.name);
  if (!columns.includes("version")) db.exec("ALTER TABLE app_state ADD COLUMN version INTEGER NOT NULL DEFAULT 1");
}

function recordMigration(version, name) {
  db.prepare("INSERT OR IGNORE INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(version, name, new Date().toISOString());
}

function pruneVersions() {
  db.prepare(`
    DELETE FROM app_state_versions
    WHERE version NOT IN (
      SELECT version FROM app_state_versions ORDER BY version DESC LIMIT ?
    )
  `).run(VERSION_KEEP_COUNT);
}

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

function sendFile(response, filePath, downloadName, contentType) {
  if (!fs.existsSync(filePath)) return sendJson(response, 404, { error: "文件不存在" });
  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${downloadName}"`
  });
  fs.createReadStream(filePath).pipe(response);
}

function logEvent(action, detail = "") {
  const line = `${new Date().toISOString()} ${action}${detail ? ` ${detail}` : ""}\n`;
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

function logBackendAudit(action, detail = "", actor = "local") {
  insertBackendAuditLog.run(action, detail, actor, new Date().toISOString());
  pruneBackendAuditLogs();
  logEvent(`audit.${action}`, detail);
}

function pruneBackendAuditLogs() {
  db.prepare(`
    DELETE FROM backend_audit_logs
    WHERE id NOT IN (
      SELECT id FROM backend_audit_logs ORDER BY id DESC LIMIT ?
    )
  `).run(BACKEND_AUDIT_KEEP_COUNT);
}

function loadConfig() {
  const token = process.env.JINDU_TOKEN || randomToken();
  const password = process.env.JINDU_PASSWORD || "";
  const config = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")) : {};
  const next = {
    password: password || config.password || "",
    token: process.env.JINDU_TOKEN || config.token || token
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ token: next.token, password: next.password }, null, 2));
  return next;
}

function authEnabled() {
  return Boolean(appConfig.password);
}

function authorize(request, route, method) {
  if (!authEnabled()) return true;
  if (method === "GET" && ["/api/health", "/api/auth/status"].includes(route)) return true;
  return isAuthenticated(request);
}

function authorizeRole(request, route, method) {
  if (!WRITE_METHODS.has(method)) return true;
  if (route === "/api/auth/login" || route === "/api/auth/logout" || route === "/api/audit") return true;
  const role = actorFromRequest(request);
  return WRITE_ROLES.has(role);
}

function isAuthenticated(request) {
  if (!authEnabled()) return true;
  const token = request.headers["x-jindu-token"] || parseCookies(request.headers.cookie || "").jindu_session;
  return token === appConfig.token;
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const index = item.indexOf("=");
      if (index > 0) cookies[item.slice(0, index)] = decodeURIComponent(item.slice(index + 1));
      return cookies;
    }, {});
}

function setAuthCookie(response, token) {
  const secure = isSecureCookieEnabled() ? "; Secure" : "";
  response.setHeader("Set-Cookie", `jindu_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax${secure}`);
}

function clearAuthCookie(response) {
  const secure = isSecureCookieEnabled() ? "; Secure" : "";
  response.setHeader("Set-Cookie", `jindu_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
}

function isSecureCookieEnabled() {
  return process.env.JINDU_SECURE_COOKIE === "1";
}

function actorFromRequest(request) {
  return request.headers["x-jindu-actor"] || "local";
}

function randomToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function getPragmaValue(name) {
  const row = db.prepare(`PRAGMA ${name}`).get();
  return Object.values(row || {})[0] || "";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(number)));
}

function dateStamp() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
}

function resolveStaticPath(url) {
  const parsed = new URL(url, `http://${HOST}:${PORT}`);
  const pathname = decodeURIComponent(parsed.pathname);
  const target = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolved = path.resolve(ROOT, target);
  const relative = path.relative(ROOT, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return resolved;
}

function serveStatic(request, response) {
  const filePath = resolveStaticPath(request.url);
  if (!filePath) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500);
      response.end(error.code === "ENOENT" ? "Not found" : "Server error");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const started = performance.now();
  response.on("finish", () => {
    const elapsed = Math.round(performance.now() - started);
    if (request.url.startsWith("/api/") || elapsed > 1000) {
      logEvent("request", `${request.method} ${request.url} ${response.statusCode} ${elapsed}ms`);
    }
  });
  if (request.url.startsWith("/api/")) {
    handleApi(request, response).catch((error) => sendApiError(response, error));
    return;
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405);
    response.end("Method not allowed");
    return;
  }
  serveStatic(request, response);
});

server.listen(PORT, HOST, () => {
  console.log(`JinDu server running at http://${HOST}:${PORT}/`);
  console.log(`SQLite data: ${DB_PATH}`);
  logEvent("server.start", `port=${PORT}`);
});

setInterval(() => {
  try {
    createManualBackup();
    const health = checkDatabaseHealth();
    logBackendAudit("scheduled.health", `ok=${health.ok}`);
  } catch (error) {
    logEvent("scheduled.error", error.message || "unknown");
  }
}, 24 * 60 * 60 * 1000);
