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

function authorizeRole(request, route, method) {
  if (!WRITE_METHODS.has(method)) return true;
  if (route === "/api/audit") return true;
  const role = actorFromRequest(request);
  return WRITE_ROLES.has(role);
}

function actorFromRequest(request) {
  return request.headers["x-jindu-actor"] || "local";
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
