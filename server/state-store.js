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
  const archived = new Set(state.archivedProjectIds || []);
  const projectIds = new Set();
  for (const project of state.projects || []) {
    projectIds.add(String(project.id));
    insertProject.run(String(project.id), String(project.name), archived.has(project.id) ? 1 : 0, updatedAt);
  }
  pruneMissingRows("projects", "id", projectIds);

  const scopeIds = new Set();
  for (const [projectId, scope] of Object.entries(state.projectScopes || {})) {
    scopeIds.add(String(projectId));
    insertScope.run(projectId, JSON.stringify(scope || {}), updatedAt);
  }
  pruneMissingRows("project_scopes", "project_id", scopeIds);

  const taskIds = new Set();
  for (const task of state.tasks || []) {
    taskIds.add(String(task.id));
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
  pruneMissingRows("tasks", "id", taskIds);

  const issueIds = new Set();
  for (const issue of state.issues || []) {
    issueIds.add(String(issue.id));
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
  pruneMissingRows("issues", "id", issueIds);

  const auditIds = new Set();
  for (const log of state.auditLogs || []) {
    const id = String(log.id || `${log.time}-${log.action}`);
    auditIds.add(id);
    insertAuditLog.run(
      id,
      log.projectId || "",
      String(log.action || "操作"),
      log.role || "",
      log.detail || "",
      log.time || updatedAt
    );
  }
  pruneMissingRows("audit_logs", "id", auditIds);
}

function pruneMissingRows(table, column, keepIds) {
  if (!keepIds.size) {
    db.prepare(`DELETE FROM ${table}`).run();
    return;
  }
  const existing = db.prepare(`SELECT ${column} AS id FROM ${table}`).all().map((row) => String(row.id));
  const remove = existing.filter((id) => !keepIds.has(id));
  const statement = db.prepare(`DELETE FROM ${table} WHERE ${column} = ?`);
  for (const id of remove) statement.run(id);
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
