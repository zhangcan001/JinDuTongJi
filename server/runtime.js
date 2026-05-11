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
