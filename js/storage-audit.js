function scheduleStateMirrorToIndexedDB() {
  if (!window.indexedDB) return;
  pendingIndexedDbSnapshot = {
    id: "latest",
    savedAt: new Date().toISOString(),
    state: cloneData(state)
  };
  clearTimeout(pendingIndexedDbMirrorTimer);
  pendingIndexedDbMirrorTimer = setTimeout(flushStateMirrorToIndexedDB, 300);
}

function openStateMirrorDB() {
  if (indexedDbConnectionPromise) return indexedDbConnectionPromise;
  indexedDbConnectionPromise = new Promise((resolve) => {
    const request = indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("snapshots")) {
        request.result.createObjectStore("snapshots", { keyPath: "id" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        indexedDbConnectionPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      indexedDbConnectionPromise = null;
      resolve(null);
    };
    request.onblocked = () => resolve(null);
  });
  return indexedDbConnectionPromise;
}

async function flushStateMirrorToIndexedDB() {
  const snapshot = pendingIndexedDbSnapshot;
  pendingIndexedDbMirrorTimer = null;
  pendingIndexedDbSnapshot = null;
  if (!snapshot || !window.indexedDB) return;
  try {
    const db = await openStateMirrorDB();
    if (!db) return;
    const tx = db.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put(snapshot);
  } catch {
    indexedDbConnectionPromise = null;
  }
}

window.addEventListener?.("pagehide", flushLocalStateWrite);
window.addEventListener?.("pagehide", flushStateMirrorToBackend);
window.addEventListener?.("pagehide", flushBackendAuditQueue);
window.addEventListener?.("online", resumePendingBackendWork);

function mirrorStateToIndexedDB() {
  scheduleStateMirrorToIndexedDB();
}

async function readLatestStateMirrorFromIndexedDB() {
  if (!window.indexedDB) return null;
  try {
    const db = await openStateMirrorDB();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction("snapshots", "readonly");
      const request = tx.objectStore("snapshots").get("latest");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
      tx.onerror = () => resolve(null);
    });
  } catch {
    indexedDbConnectionPromise = null;
    return null;
  }
}

async function hydrateStateFromIndexedDB() {
  if (loadedStateFromLocalStorage) return false;
  const snapshot = await readLatestStateMirrorFromIndexedDB();
  if (!snapshot?.state || !Array.isArray(snapshot.state.projects) || !Array.isArray(snapshot.state.tasks)) return false;
  state = migrateState(cloneData(snapshot.state));
  saveState();
  return true;
}

function canUseBackendState() {
  return !backendApiUnavailable && (location.protocol === "http:" || location.protocol === "https:");
}

function scheduleStateMirrorToBackend(options = {}) {
  if (!canUseBackendState()) return;
  pendingBackendStateSnapshot = cloneData(state);
  persistPendingBackendState(pendingBackendStateSnapshot);
  clearTimeout(pendingBackendStateWriteTimer);
  clearTimeout(backendRetryTimer);
  if (!backendCanWrite()) {
    updateBackendSaveStatus("idle", "未登录");
    return;
  }
  updateBackendSaveStatus("saving", "保存中");
  if (options.immediate) {
    flushStateMirrorToBackend();
  } else {
    pendingBackendStateWriteTimer = setTimeout(flushStateMirrorToBackend, 500);
  }
}

async function flushStateMirrorToBackend() {
  if (backendSaveInFlight) return false;
  const snapshot = pendingBackendStateSnapshot || readPendingBackendState();
  pendingBackendStateSnapshot = null;
  clearTimeout(pendingBackendStateWriteTimer);
  pendingBackendStateWriteTimer = null;
  if (!snapshot || !canUseBackendState()) return false;
  if (!backendCanWrite()) {
    updateBackendSaveStatus("idle", "未登录");
    showAuthPrompt("请先登录后再同步到本机数据库。");
    pendingBackendStateSnapshot = snapshot;
    persistPendingBackendState(snapshot);
    return false;
  }
  backendSaveInFlight = true;
  try {
    const response = await fetch("./api/state", {
      method: "PUT",
      headers: backendJsonHeaders(),
      body: JSON.stringify({ state: snapshot, baseVersion: backendStateVersion }),
      keepalive: true
    });
    if (response.status === 409) {
      const payload = await response.json().catch(() => ({}));
      backendStateVersion = Number(payload.currentVersion || backendStateVersion);
      updateBackendSaveStatus("error", "保存冲突");
      notifyUser("数据库已有新版本，请刷新页面后再继续编辑。", "warn");
      return false;
    }
    if (response.status === 403) {
      updateBackendSaveStatus("error", "角色受限");
      notifyUser("当前角色无权写入后端数据库，修改已保存在浏览器本地。", "warn");
      pendingBackendStateSnapshot = snapshot;
      persistPendingBackendState(snapshot);
      return false;
    }
    if (response.status === 401) {
      backendAuthState = { enabled: true, authenticated: false, loading: false };
      updateAuthUi();
      updateBackendSaveStatus("error", "未登录");
      showAuthPrompt("请先登录后再同步到本机数据库。");
      pendingBackendStateSnapshot = snapshot;
      persistPendingBackendState(snapshot);
      return false;
    }
    if (response.status === 404) {
      markBackendApiUnavailable();
      return false;
    }
    if (!response.ok) throw new Error("backend save failed");
    const payload = await response.json().catch(() => ({}));
    backendStateVersion = Number(payload.version || backendStateVersion);
    backendRetryAttempt = 0;
    clearPendingBackendState();
    state.uiPreferences = state.uiPreferences || {};
    state.uiPreferences.lastBackendSaveAt = payload.updatedAt || new Date().toISOString();
    updateBackendSaveStatus("saved", "已保存");
    flushBackendAuditQueue();
    return true;
  } catch {
    pendingBackendStateSnapshot = snapshot;
    persistPendingBackendState(snapshot);
    scheduleBackendRetry();
    updateBackendSaveStatus("error", `待重试 ${pendingBackendStateLabel()}`);
    notifyUser("后端数据库保存失败，已加入自动重试队列。", "warn");
    return false;
  } finally {
    backendSaveInFlight = false;
  }
}

function persistPendingBackendState(snapshot) {
  try {
    localStorage.setItem(BACKEND_PENDING_STATE_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      baseVersion: backendStateVersion,
      state: snapshot
    }));
  } catch {
    // 本地状态本身已经保存过；队列写入失败时保持内存重试。
  }
}

function readPendingBackendState() {
  try {
    const payload = JSON.parse(localStorage.getItem(BACKEND_PENDING_STATE_KEY) || "null");
    if (!payload?.state || !Array.isArray(payload.state.projects) || !Array.isArray(payload.state.tasks)) return null;
    if (Number.isFinite(Number(payload.baseVersion))) backendStateVersion = Number(payload.baseVersion);
    return migrateState(cloneData(payload.state));
  } catch {
    localStorage.removeItem(BACKEND_PENDING_STATE_KEY);
    return null;
  }
}

function clearPendingBackendState() {
  localStorage.removeItem(BACKEND_PENDING_STATE_KEY);
}

function pendingBackendStateLabel() {
  const snapshot = pendingBackendStateSnapshot || readPendingBackendState();
  if (!snapshot) return "";
  const tasks = snapshot.tasks?.length || 0;
  return `(${tasks} 条节点)`;
}

function scheduleBackendRetry() {
  if (!canUseBackendState()) return;
  clearTimeout(backendRetryTimer);
  backendRetryAttempt = Math.min(backendRetryAttempt + 1, 6);
  const delay = Math.min(30000, 1000 * (2 ** (backendRetryAttempt - 1)));
  backendRetryTimer = setTimeout(flushStateMirrorToBackend, delay);
}

function markBackendApiUnavailable() {
  backendApiUnavailable = true;
  pendingBackendStateSnapshot = null;
  clearTimeout(pendingBackendStateWriteTimer);
  clearTimeout(backendRetryTimer);
  clearPendingBackendState();
  localStorage.removeItem(BACKEND_PENDING_AUDIT_KEY);
  updateBackendSaveStatus("idle", "本地模式");
}

function resumePendingBackendWork() {
  if (!canUseBackendState()) return;
  const snapshot = readPendingBackendState();
  if (snapshot) {
    updateBackendSaveStatus("saving", "补交中");
    pendingBackendStateSnapshot = snapshot;
    scheduleBackendRetry();
  }
  pendingBackendAuditQueue = readPendingBackendAuditQueue();
  if (pendingBackendAuditQueue.length) flushBackendAuditQueue();
}

function backendJsonHeaders() {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("jindu-auth-token");
  if (token) headers["X-Jindu-Token"] = token;
  headers["X-Jindu-Actor"] = currentRole();
  return headers;
}

async function readStateFromBackend() {
  if (!canUseBackendState()) return null;
  try {
    const response = await fetch("./api/state", { cache: "no-store" });
    if (response.status === 404) {
      markBackendApiUnavailable();
      return null;
    }
    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.state || !Array.isArray(payload.state.projects) || !Array.isArray(payload.state.tasks)) return null;
    backendStateVersion = Number(payload.version || 0);
    return payload;
  } catch {
    return null;
  }
}

async function hydrateStateFromBackend() {
  const payload = await readStateFromBackend();
  if (!payload?.state) {
    await migrateLocalStateToBackendIfNeeded();
    return false;
  }
  const localStamp = state.uiPreferences?.lastBackendSaveAt || "";
  if (loadedStateFromLocalStorage && localStamp && payload.updatedAt && localStamp >= payload.updatedAt) {
    backendStateLoaded = true;
    return false;
  }
  state = migrateState(cloneData(payload.state));
  backendStateVersion = Number(payload.version || 0);
  backendStateLoaded = true;
  pendingLocalStateSnapshot = JSON.stringify(state);
  flushLocalStateWrite();
  mirrorStateToIndexedDB();
  await refreshAuthState();
  updateBackendSaveStatus("saved", "已连接");
  return true;
}

async function migrateLocalStateToBackendIfNeeded() {
  if (!loadedStateFromLocalStorage || !canUseBackendState() || state.uiPreferences?.backendMigratedAt) return false;
  const validationReady = Array.isArray(state.projects) && Array.isArray(state.tasks);
  if (!validationReady) return false;
  await refreshAuthState();
  if (!backendCanWrite()) {
    showAuthPrompt("请先登录后再把浏览器旧数据迁移到本机数据库。");
    return false;
  }
  state.uiPreferences = state.uiPreferences || {};
  state.uiPreferences.backendMigratedAt = new Date().toISOString();
  pendingBackendStateSnapshot = cloneData(state);
  persistPendingBackendState(pendingBackendStateSnapshot);
  const saved = await flushStateMirrorToBackend();
  if (saved) {
    recordAudit("迁移浏览器旧数据", "已首次写入本地数据库");
    showToast("已把浏览器旧数据迁移到本地数据库");
  }
  return saved;
}

function updateBackendSaveStatus(tone, text) {
  if (!els.saveStatus) return;
  els.saveStatus.dataset.tone = tone;
  const label = els.saveStatus.querySelector("small");
  if (label) label.textContent = text;
  clearTimeout(backendSaveStatusTimer);
  if (tone === "saved") {
    backendSaveStatusTimer = setTimeout(() => {
      if (els.saveStatus?.dataset.tone === "saved" && label) label.textContent = "已保存";
    }, 1800);
  }
}

async function refreshBackendHealth() {
  if (!canUseBackendState()) return null;
  try {
    const response = await fetch("./api/health", { cache: "no-store" });
    if (!response.ok) return null;
    backendHealth = await response.json();
    return backendHealth;
  } catch {
    backendHealth = null;
    return null;
  }
}

async function fetchBackendBackups() {
  if (!canUseBackendState()) return [];
  try {
    const response = await fetch("./api/backups", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json();
    backendBackups = payload.backups || [];
    return backendBackups;
  } catch {
    backendBackups = [];
    return backendBackups;
  }
}

async function fetchBackendVersions() {
  if (!canUseBackendState()) return [];
  try {
    const response = await fetch("./api/versions", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json();
    const versions = payload.versions || [];
    if (state?.uiPreferences) state.uiPreferences.systemVersions = versions;
    return versions;
  } catch {
    return [];
  }
}

async function fetchBackendLogs() {
  if (!canUseBackendState()) return [];
  try {
    const response = await fetch("./api/logs", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json();
    const lines = payload.lines || [];
    if (state?.uiPreferences) state.uiPreferences.systemLogs = lines;
    return lines;
  } catch {
    return [];
  }
}

async function refreshAuthState() {
  if (!canUseBackendState()) {
    backendAuthState = { enabled: false, authenticated: false, loading: false };
    updateAuthUi();
    return backendAuthState;
  }
  backendAuthState = { ...backendAuthState, loading: true };
  updateAuthUi();
  try {
    const response = await fetch("./api/auth/status", { cache: "no-store" });
    if (!response.ok) throw new Error("status failed");
    backendAuthState = { ...(await response.json()), loading: false };
  } catch {
    backendAuthState = { enabled: false, authenticated: false, loading: false };
  }
  updateAuthUi();
  return backendAuthState;
}

async function loginWithPassword(password) {
  const response = await fetch("./api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "登录失败");
  }
  backendAuthState = { enabled: true, authenticated: true, loading: false };
  updateAuthUi();
  resumePendingBackendWork();
  return true;
}

async function logoutBackendSession() {
  if (!canUseBackendState()) return false;
  await fetch("./api/auth/logout", { method: "POST" }).catch(() => {});
  backendAuthState = { enabled: true, authenticated: false, loading: false };
  updateAuthUi();
  return true;
}

function backendCanWrite() {
  if (backendAuthState.loading) return false;
  return !backendAuthState.enabled || backendAuthState.authenticated;
}

function updateAuthUi() {
  if (els.authStatusTitle) {
    els.authStatusTitle.textContent = backendAuthState.loading ? "认证中" : backendAuthState.enabled ? (backendAuthState.authenticated ? "已登录" : "未登录") : "本地模式";
  }
  if (els.authStatusText) {
    els.authStatusText.textContent = backendAuthState.loading ? "正在检查登录状态" : backendAuthState.enabled ? (backendAuthState.authenticated ? "可写入数据库" : "仅可查看") : "无需登录";
  }
  if (els.loginBtn) els.loginBtn.hidden = backendAuthState.loading ? false : backendAuthState.enabled && backendAuthState.authenticated;
  if (els.logoutBtn) els.logoutBtn.hidden = !(backendAuthState.enabled && backendAuthState.authenticated);
  if (els.authStatus) els.authStatus.dataset.tone = backendAuthState.loading ? "saving" : backendAuthState.enabled ? (backendAuthState.authenticated ? "saved" : "error") : "idle";
}

function showAuthPrompt(message = "") {
  if (els.loginOverlay) els.loginOverlay.hidden = false;
  if (els.authHint && message) els.authHint.textContent = message;
}

function hideAuthPrompt() {
  if (els.loginOverlay) els.loginOverlay.hidden = true;
  if (els.loginForm?.elements.password) els.loginForm.elements.password.value = "";
  if (els.authHint) els.authHint.textContent = "登录后可写入数据库并同步操作审计。";
}

function renderSystemSettingsPanel() {
  if (!els.systemHealthPanel || !els.systemBackupPanel || !els.systemLogPanel || !els.systemRestorePanel) return;
  const checks = backendHealth?.checks || [];
  const backups = backendBackups || [];
  const versions = (state.uiPreferences?.systemVersions || []).slice(0, 6);
  const logs = (state.uiPreferences?.systemLogs || []).slice(0, 8);
  els.systemHealthPanel.innerHTML = `
    <p>${backendHealth ? `数据库：${escapeHtml(backendHealth.database || "未知")}` : "数据库：读取中"}</p>
    <p>${backendHealth ? `WAL：${escapeHtml(backendHealth.wal || "未知")}｜备份 ${backendHealth.backups || 0} 份` : "WAL：读取中"}</p>
    <div class="health-grid">
      ${checks.length ? checks.slice(0, 8).map((item) => `
        <article class="${item.ok ? "ok" : "warn"}">
          <strong>${escapeHtml(item.name)}</strong>
          <small>${item.ok ? "正常" : escapeHtml(item.note || "异常")}</small>
        </article>
      `).join("") : `<article class="ok"><strong>等待刷新</strong><small>点击“刷新状态”后读取数据库健康信息。</small></article>`}
    </div>
  `;
  els.systemBackupPanel.innerHTML = `
    <p>${backups.length ? `已保留 ${backups.length} 份数据库备份。` : "暂无数据库备份。"}</p>
    <div>
      ${backups.slice(0, 6).map((backup) => `
        <article>
          <div>
            <strong>${escapeHtml(backup.name)}</strong>
            <small>${new Date(backup.createdAt).toLocaleString()}｜${Math.max(1, Math.round((backup.size || 0) / 1024))} KB</small>
          </div>
          <button type="button" data-system-restore-backup="${escapeAttr(backup.name)}">恢复</button>
        </article>
      `).join("") || `<article><div><strong>暂无备份</strong><small>可先执行一次数据库备份。</small></div></article>`}
    </div>
  `;
  els.systemBackupPanel.querySelectorAll("[data-system-restore-backup]").forEach((button) => {
    button.addEventListener("click", () => restoreBackendBackup(button.dataset.systemRestoreBackup));
  });
  els.systemRestorePanel.innerHTML = `
    <p>最近状态版本 ${versions.length || 0} 条，可按时间线查看与恢复。</p>
    <div>
      ${versions.length ? versions.map((item) => `
        <article>
          <div>
            <strong>版本 ${escapeHtml(String(item.version))}</strong>
            <small>${new Date(item.created_at || item.createdAt || Date.now()).toLocaleString()}｜${escapeHtml(item.summary || "")}</small>
          </div>
        </article>
      `).join("") : `<article><div><strong>暂无版本摘要</strong><small>点击“刷新状态”会读取最近的状态版本。</small></div></article>`}
    </div>
  `;
  els.systemLogPanel.innerHTML = `
    <div>
      ${logs.length ? logs.map((line) => `<article><div><strong>${escapeHtml(String(line))}</strong></div></article>`).join("") : `<article><div><strong>暂无日志</strong><small>点击“刷新状态”或“执行维护”查看系统日志。</small></div></article>`}
    </div>
  `;
  renderPerformancePanel();
}

async function createBackendBackup() {
  if (!canUseBackendState()) return showToast("后端服务未连接", "warn");
  if (backendAuthState.enabled && !backendAuthState.authenticated) return showAuthPrompt("请先登录后再创建数据库备份。");
  try {
    const response = await fetch("./api/backups", { method: "POST" });
    if (!response.ok) throw new Error("backup failed");
    await fetchBackendBackups();
    renderBackendBackupPanel();
    showToast("数据库备份已创建");
  } catch {
    showToast(userFacingError(null, "数据库备份失败"), "warn");
  }
}

async function runBackendMaintenance() {
  if (!canUseBackendState()) return showToast("后端服务未连接", "warn");
  if (backendAuthState.enabled && !backendAuthState.authenticated) return showAuthPrompt("请先登录后再执行系统维护。");
  try {
    const response = await fetch("./api/maintenance", { method: "POST" });
    if (!response.ok) throw new Error("maintenance failed");
    await refreshBackendHealth();
    await fetchBackendBackups();
    await fetchBackendVersions();
    await fetchBackendLogs();
    renderSystemSettingsPanel();
    showToast("系统维护已执行");
  } catch (error) {
    showToast(userFacingError(error, "系统维护失败"), "warn");
  }
}

async function restoreBackendBackup(name) {
  if (!ensureCanEdit("恢复数据库备份")) return;
  if (!(await confirmAction(`确定恢复数据库备份“${name}”吗？当前数据库会先自动备份。`, { title: "恢复数据库备份", okText: "恢复" }))) return;
  try {
    const response = await fetch(`./api/backups/${encodeURIComponent(name)}/restore`, { method: "POST" });
    if (!response.ok) throw new Error("restore failed");
    const restored = await readStateFromBackend();
    if (!restored?.state) throw new Error("restored state missing");
    state = migrateState(cloneData(restored.state));
    backendStateVersion = Number(restored.version || 0);
    pendingLocalStateSnapshot = JSON.stringify(state);
    flushLocalStateWrite();
    mirrorStateToIndexedDB();
    recordAudit("恢复数据库备份", name);
    await fetchBackendBackups();
    render();
    showToast("数据库备份已恢复");
  } catch (error) {
    showToast(userFacingError(error, "数据库备份恢复失败"), "warn");
  }
}

async function importBackendJsonBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const nextState = payload.state || payload;
    const preview = backupPreviewText(nextState, payload, file.name);
    if (!(await confirmAction(`${preview}\n\n导入会先自动备份当前数据库，然后替换数据库状态。确定继续吗？`, { title: "导入数据库 JSON", okText: "导入" }))) return;
    const response = await fetch("./api/import/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("import failed");
    const restored = await readStateFromBackend();
    state = migrateState(cloneData(restored.state));
    backendStateVersion = Number(restored.version || 0);
    pendingLocalStateSnapshot = JSON.stringify(state);
    flushLocalStateWrite();
    mirrorStateToIndexedDB();
    render();
    showToast("数据库 JSON 已导入");
  } catch (error) {
    showToast(userFacingError(error, "导入失败"), "warn");
  } finally {
    event.target.value = "";
  }
}

async function refreshSystemState() {
  await Promise.all([
    refreshAuthState(),
    refreshBackendHealth(),
    fetchBackendBackups(),
    fetchBackendVersions(),
    fetchBackendLogs(),
    refreshBackendPageStats()
  ]);
  renderSystemSettingsPanel();
}

async function refreshBackendPageStats() {
  if (!canUseBackendState()) return null;
  try {
    const [tasksResponse, issuesResponse] = await Promise.all([
      fetch(`./api/tasks?projectId=${encodeURIComponent(state.selectedProjectId)}&limit=1`),
      fetch(`./api/issues?projectId=${encodeURIComponent(state.selectedProjectId)}&limit=1`)
    ]);
    if (!tasksResponse.ok || !issuesResponse.ok) throw new Error("page probe failed");
    const [tasks, issues] = await Promise.all([tasksResponse.json(), issuesResponse.json()]);
    backendPageStats = { tasks: tasks.total || 0, issues: issues.total || 0 };
    return backendPageStats;
  } catch {
    backendPageStats = null;
    return null;
  }
}

function recordAudit(action, detail = "") {
  const log = {
    id: createId(),
    projectId: state.selectedProjectId,
    role: currentRole(),
    action,
    detail,
    time: new Date().toISOString()
  };
  state.auditLogs = state.auditLogs || [];
  state.auditLogs.unshift(log);
  state.auditLogs = state.auditLogs.slice(0, 80);
  queueBackendAudit(log);
}

function queueBackendAudit(log) {
  if (!canUseBackendState()) return;
  pendingBackendAuditQueue = readPendingBackendAuditQueue();
  pendingBackendAuditQueue.push(log);
  pendingBackendAuditQueue = pendingBackendAuditQueue.slice(-200);
  persistPendingBackendAuditQueue();
  flushBackendAuditQueue();
}

async function flushBackendAuditQueue() {
  if (!canUseBackendState()) return false;
  pendingBackendAuditQueue = readPendingBackendAuditQueue();
  if (!pendingBackendAuditQueue.length) return true;
  const remaining = [];
  for (const log of pendingBackendAuditQueue) {
    try {
      const response = await fetch("./api/audit", {
        method: "POST",
        headers: backendJsonHeaders(),
        body: JSON.stringify(log),
        keepalive: true
      });
      if (response.status === 404) {
        markBackendApiUnavailable();
        return false;
      }
      if (!response.ok) throw new Error("audit save failed");
    } catch {
      remaining.push(log);
    }
  }
  pendingBackendAuditQueue = remaining.slice(-200);
  persistPendingBackendAuditQueue();
  return remaining.length === 0;
}

function readPendingBackendAuditQueue() {
  try {
    const items = JSON.parse(localStorage.getItem(BACKEND_PENDING_AUDIT_KEY) || "[]");
    return Array.isArray(items) ? items : [];
  } catch {
    localStorage.removeItem(BACKEND_PENDING_AUDIT_KEY);
    return [];
  }
}

function persistPendingBackendAuditQueue() {
  try {
    localStorage.setItem(BACKEND_PENDING_AUDIT_KEY, JSON.stringify(pendingBackendAuditQueue));
  } catch {
    pendingBackendAuditQueue = pendingBackendAuditQueue.slice(-50);
    try {
      localStorage.setItem(BACKEND_PENDING_AUDIT_KEY, JSON.stringify(pendingBackendAuditQueue));
    } catch {
      pendingBackendAuditQueue = [];
    }
  }
}

function createRestorePoint(reason) {
  pushUndoSnapshot(reason);
  state.restorePoints = state.restorePoints || [];
  const snapshot = cloneData(state);
  snapshot.restorePoints = [];
  const id = createId();
  state.restorePoints.unshift({
    id,
    reason,
    createdAt: new Date().toISOString(),
    projectId: state.selectedProjectId,
    taskCount: state.tasks?.length || 0,
    issueCount: state.issues?.length || 0,
    health: backupHealthSummary(state),
    state: snapshot
  });
  state.restorePoints = state.restorePoints.slice(0, 14);
  return id;
}

function createDailyRestorePointIfNeeded() {
  state.uiPreferences = state.uiPreferences || {};
  const todayKey = localDateText(today);
  if (state.uiPreferences.lastDailyRestorePoint === todayKey) return;
  createRestorePoint(`每日自动快照 ${todayKey}`);
  state.uiPreferences.lastDailyRestorePoint = todayKey;
  saveState({ immediate: true });
}

function clearOldLocalData() {
  if (!ensureCanEdit("清理旧数据")) return;
  state.restorePoints = (state.restorePoints || []).slice(0, 5);
  state.importVersions = (state.importVersions || []).slice(0, 5);
  state.auditLogs = (state.auditLogs || []).slice(0, 40);
  state.entityHistory = (state.entityHistory || []).slice(0, 60);
  state.projectTemplates = (state.projectTemplates || []).slice(0, 10);
  clearRedoHistory();
  recordAudit("清理旧数据", "压缩恢复点、导入版本和历史记录");
  saveState();
  render();
  showToast("旧数据已清理");
}

function renderEntityHistoryPanel(entityType, entityId, title) {
  if (!els.detailOverlay || !els.detailOverlayBody || !els.detailOverlayTitle) return;
  const items = (state.entityHistory || [])
    .filter((item) => item.projectId === state.selectedProjectId && item.entityType === entityType && item.entityId === entityId)
    .slice(0, 20);
  els.detailOverlayTitle.textContent = `${title}变更历史`;
  els.detailOverlayBody.innerHTML = items.length
    ? `<div class="history-list">${items.map((item) => `
        <article class="history-item">
          <strong>${escapeHtml(item.summary || item.title || "变更记录")}</strong>
          <small>${new Date(item.time).toLocaleString()}</small>
          ${item.changes?.length ? `<ul>${item.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>` : ""}
        </article>
      `).join("")}</div>`
    : `<div class="empty-state"><strong>暂无变更历史</strong><small>该条目还没有可追踪的单条修改记录。</small></div>`;
  els.detailOverlay.hidden = false;
}

function renderAttachmentPreview(items, title = "附件预览") {
  if (!els.detailOverlay || !els.detailOverlayBody || !els.detailOverlayTitle) return;
  const attachments = (items || []).filter(Boolean);
  els.detailOverlayTitle.textContent = title;
  els.detailOverlayBody.innerHTML = attachments.length
    ? `<div class="detail-gallery">${attachments.map((item) => `
        <figure>
          ${String(item.type || "").startsWith("image/") ? `<img src="${escapeAttr(item.dataUrl)}" alt="${escapeAttr(item.name || "附件")}" />` : `<div class="empty-state"><strong>${escapeHtml(item.name || "附件")}</strong><small>${escapeHtml(item.type || "文件")}</small></div>`}
          <figcaption>
            <div>${escapeHtml(item.name || "附件")}</div>
            <small>${Math.round((item.size || 0) / 1024)} KB</small>
          </figcaption>
        </figure>
      `).join("")}</div>`
    : `<div class="empty-state"><strong>暂无附件</strong></div>`;
  els.detailOverlay.hidden = false;
}

function closeDetailOverlay() {
  if (!els.detailOverlay) return;
  els.detailOverlay.hidden = true;
}

async function restoreFromPoint(pointId) {
  if (!ensureCanEdit("恢复自动恢复点")) return;
  const point = (state.restorePoints || []).find((item) => item.id === pointId);
  if (!point) return;
  if (!(await confirmAction(`确定恢复到“${point.reason}”之前的状态吗？`, { title: "恢复自动恢复点", okText: "恢复" }))) return;
  const keepPoints = state.restorePoints || [];
  state = migrateState(cloneData(point.state));
  state.restorePoints = keepPoints;
  recordAudit("恢复自动恢复点", point.reason);
  selectedBuildingName = "";
  selectedModelFloor = "";
  lastImportFocus = null;
  pendingImport = null;
  saveState();
  render();
}

function exportDataBackup() {
  const exportedAt = new Date().toISOString();
  const payload = {
    app: "JinDuTongJi",
    version: APP_VERSION,
    schemaVersion: STATE_SCHEMA_VERSION,
    exportedAt,
    summary: backupHealthSummary(state),
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = datedFileName("监理进度数据备份", currentProjectName(), "json", today);
  link.click();
  URL.revokeObjectURL(url);
  state.uiPreferences.lastBackupAt = exportedAt;
  saveState();
  showToast("数据备份已导出");
}

async function importDataBackup(event) {
  if (!ensureCanEdit("恢复备份")) {
    event.target.value = "";
    return;
  }
  const file = event.target.files[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const nextState = payload.state || payload;
    if (!Array.isArray(nextState.projects) || !Array.isArray(nextState.tasks)) {
      throw new Error("备份文件格式不正确");
    }
    const preview = backupPreviewText(nextState, payload, file.name);
    if (!(await confirmAction(`${preview}\n\n恢复备份会替换当前浏览器中的全部数据，确定继续吗？`, { title: "恢复数据备份", okText: "恢复" }))) return;
    createRestorePoint(`恢复备份 ${file.name}`);
    const keepRestorePoints = state.restorePoints || [];
    state = migrateState(nextState);
    state.restorePoints = [...keepRestorePoints, ...(state.restorePoints || [])].slice(0, 5);
    recordAudit("恢复数据备份", file.name);
    selectedBuildingName = "";
    selectedModelFloor = "";
    lastImportFocus = null;
    pendingImport = null;
    saveState();
    render();
    els.importResult.textContent = `已恢复备份：${file.name}`;
    renderImportPreview(null);
  } catch (error) {
    els.importResult.textContent = userFacingError(error, "恢复失败");
  } finally {
    event.target.value = "";
  }
}

function backupPreviewText(nextState, payload, fileName) {
  const projectCount = Array.isArray(nextState.projects) ? nextState.projects.length : 0;
  const taskCount = Array.isArray(nextState.tasks) ? nextState.tasks.length : 0;
  const issueCount = Array.isArray(nextState.issues) ? nextState.issues.length : 0;
  const scopeCount = Object.keys(nextState.projectScopes || {}).length;
  const exportedAt = payload.exportedAt ? new Date(payload.exportedAt).toLocaleString() : "未知时间";
  const schema = payload.schemaVersion || nextState.schemaVersion || 1;
  const summary = payload.summary || backupHealthSummary(nextState);
  const currentProjectIds = new Set((state.projects || []).map((item) => item.id));
  const nextProjectIds = new Set((nextState.projects || []).map((item) => item.id));
  const currentTaskIds = new Set((state.tasks || []).map((item) => item.id));
  const nextTaskIds = new Set((nextState.tasks || []).map((item) => item.id));
  const currentIssueIds = new Set((state.issues || []).map((item) => item.id));
  const nextIssueIds = new Set((nextState.issues || []).map((item) => item.id));
  const diff = [
    `项目 +${[...nextProjectIds].filter((id) => !currentProjectIds.has(id)).length}/-${[...currentProjectIds].filter((id) => !nextProjectIds.has(id)).length}`,
    `节点 +${[...nextTaskIds].filter((id) => !currentTaskIds.has(id)).length}/-${[...currentTaskIds].filter((id) => !nextTaskIds.has(id)).length}`,
    `整改 +${[...nextIssueIds].filter((id) => !currentIssueIds.has(id)).length}/-${[...currentIssueIds].filter((id) => !nextIssueIds.has(id)).length}`
  ].join("｜");
  return [
    `文件：${fileName}`,
    `导出时间：${exportedAt}`,
    `项目 ${projectCount} 个｜节点 ${taskCount} 条｜整改 ${issueCount} 条｜范围 ${scopeCount} 组`,
    `恢复差异：${diff}`,
    `健康摘要：${summary}`,
    `数据版本：${schema}`
  ].join("\n");
}

function backupHealthSummary(targetState) {
  const projects = targetState.projects?.length || 0;
  const tasks = targetState.tasks?.length || 0;
  const issues = targetState.issues?.length || 0;
  const unfinishedIssues = (targetState.issues || []).filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合").length;
  return `项目 ${projects} 个，节点 ${tasks} 条，整改 ${issues} 条，未闭合 ${unfinishedIssues} 条`;
}

function renderAuditLogPanel() {
  if (!els.auditLogPanel) return;
  syncAuditFilterControls();
  const filters = currentAuditFilters();
  const query = filters.query.toLowerCase();
  const logs = (state.auditLogs || [])
    .filter((item) => item.projectId === state.selectedProjectId)
    .filter((item) => filters.action === "all" || item.action === filters.action)
    .filter((item) => filters.role === "all" || item.role === filters.role)
    .filter((item) => {
      if (!query) return true;
      return [item.action, item.detail, roleLabel(item.role), item.time].join(" ").toLowerCase().includes(query);
    })
    .slice(0, 40);
  setSafeHtml(els.auditLogPanel, safeTemplateHtml`
    <strong>操作记录</strong>
    <div>
      ${safeListHtml(logs.slice(0, 20), (log) => `
        <article>
          <div>
            <strong>${escapeHtml(log.action)}</strong>
            <small>${new Date(log.time).toLocaleString()}｜${escapeHtml(roleLabel(log.role))}｜${escapeHtml(log.detail || "")}</small>
          </div>
        </article>
      `, `<article><div><strong>暂无操作记录</strong><small>新增、编辑、删除、导入和恢复会自动记录。</small></div></article>`)}
    </div>
  `);
}

function currentAuditFilters() {
  return {
    query: String(els.auditSearchInput?.value || state.uiPreferences?.auditFilters?.query || "").trim(),
    action: String(els.auditActionFilter?.value || state.uiPreferences?.auditFilters?.action || "all"),
    role: String(els.auditRoleFilter?.value || state.uiPreferences?.auditFilters?.role || "all")
  };
}

function syncAuditFilterControls() {
  const actions = uniqueSorted((state.auditLogs || [])
    .filter((item) => item.projectId === state.selectedProjectId)
    .map((item) => item.action)
    .filter(Boolean));
  const filters = state.uiPreferences?.auditFilters || {};
  if (els.auditActionFilter) {
    const previous = els.auditActionFilter.value || filters.action || "all";
    setSafeHtml(els.auditActionFilter, [
      `<option value="all">全部动作</option>`,
      ...actions.map((action) => `<option value="${escapeAttr(action)}">${escapeHtml(action)}</option>`)
    ].join(""));
    els.auditActionFilter.value = actions.includes(previous) ? previous : "all";
  }
  if (els.auditRoleFilter && filters.role) els.auditRoleFilter.value = filters.role;
  if (els.auditSearchInput && document.activeElement !== els.auditSearchInput) els.auditSearchInput.value = filters.query || "";
}

function renderPerformancePanel() {
  if (!els.performancePanel || typeof perfMetrics === "undefined") return;
  const cacheBuckets = stateCache?.projectItems?.size || 0;
  const pendingBackend = readPendingBackendAuditQueue().length;
  setSafeHtml(els.performancePanel, safeTemplateHtml`
    <div class="health-grid">
      <article class="ok"><strong>节点</strong><small>${currentProjectItems("tasks").length} 条</small></article>
      <article class="ok"><strong>整改</strong><small>${currentProjectItems("issues").length} 条</small></article>
      <article class="ok"><strong>渲染</strong><small>${perfMetrics.lastRenderMs} ms｜${escapeHtml(perfMetrics.lastRenderScope)}</small></article>
      <article class="ok"><strong>保存</strong><small>${perfMetrics.lastSaveMs} ms</small></article>
      <article class="ok"><strong>缓存</strong><small>${cacheBuckets} 组｜v${stateCache?.version || 0}</small></article>
      <article class="${pendingBackend ? "warn" : "ok"}"><strong>审计队列</strong><small>${pendingBackend} 条待同步</small></article>
      <article class="${backendPageStats ? "ok" : "warn"}"><strong>后端分页</strong><small>${backendPageStats ? `节点 ${backendPageStats.tasks}｜整改 ${backendPageStats.issues}` : "未连接"}</small></article>
    </div>
  `);
}

function renderRestorePointPanel() {
  if (!els.restorePointPanel) return;
  const points = state.restorePoints || [];
  setSafeHtml(els.restorePointPanel, safeTemplateHtml`
    <strong>自动恢复点</strong>
    <div>
      ${points.length ? points.map((point) => `
        <article>
          <div>
            <strong>${escapeHtml(point.reason)}</strong>
            <small>${new Date(point.createdAt).toLocaleString()}｜节点 ${point.taskCount}｜整改 ${point.issueCount}｜${escapeHtml(point.health || "")}</small>
          </div>
          <button type="button" data-restore-point="${escapeAttr(point.id)}">恢复</button>
        </article>
      `).join("") : `<article><div><strong>暂无恢复点</strong><small>导入、删除和恢复前会自动保存最近 5 次状态。</small></div></article>`}
    </div>
  `);
  els.restorePointPanel.querySelectorAll("[data-restore-point]").forEach((button) => {
    button.addEventListener("click", () => restoreFromPoint(button.dataset.restorePoint));
  });
}

function renderBackendBackupPanel() {
  if (!els.backendBackupPanel) return;
  const backups = backendBackups || [];
  els.backendBackupPanel.innerHTML = `
    <strong>数据库备份</strong>
    <p>${backups.length ? `已保留 ${backups.length} 份数据库备份` : "暂无数据库备份"}｜支持一键恢复，恢复前会自动备份当前库。</p>
    <div>
      ${backups.length ? backups.slice(0, 8).map((backup) => `
        <article>
          <div>
            <strong>${escapeHtml(backup.name)}</strong>
            <small>${new Date(backup.createdAt).toLocaleString()}｜${Math.max(1, Math.round((backup.size || 0) / 1024))} KB</small>
          </div>
          <button type="button" data-restore-db-backup="${escapeAttr(backup.name)}">恢复</button>
        </article>
      `).join("") : `<article><div><strong>暂无备份</strong><small>点击“数据库备份”后会生成一份 SQLite 备份。</small></div></article>`}
    </div>
  `;
  els.backendBackupPanel.querySelectorAll("[data-restore-db-backup]").forEach((button) => {
    button.addEventListener("click", () => restoreBackendBackup(button.dataset.restoreDbBackup));
  });
  fetchBackendBackups().then((items) => {
    if (items.length !== backups.length) renderBackendBackupPanel();
  });
}
