let loadedStateFromLocalStorage = false;
let pendingLocalStateWriteTimer = null;
let pendingLocalStateSnapshot = "";
let undoStack = [];
let redoStack = [];

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    loadedStateFromLocalStorage = Boolean(saved);
    const parsed = saved ? JSON.parse(saved) : cloneData(demoState);
    return migrateState(parsed);
  } catch {
    loadedStateFromLocalStorage = false;
    localStorage.removeItem(STORAGE_KEY);
    return migrateState(cloneData(demoState));
  }
}

function saveState(options = {}) {
  try {
    pendingLocalStateSnapshot = JSON.stringify(state);
    if (options.immediate) {
      flushLocalStateWrite();
    } else {
      clearTimeout(pendingLocalStateWriteTimer);
      pendingLocalStateWriteTimer = setTimeout(flushLocalStateWrite, 120);
    }
    invalidateStateCache();
    scheduleStateMirrorToIndexedDB();
  } catch {
    notifyUser("本地存储空间不足，当前修改可能无法保存。建议先导出节点台账或清理浏览器存储。");
  }
}

function pushUndoSnapshot(reason = "") {
  const snapshot = cloneData(state);
  undoStack.push({ id: createId(), reason, time: new Date().toISOString(), state: snapshot });
  undoStack = undoStack.slice(-20);
  redoStack = [];
}

function undoLastStateChange() {
  if (!undoStack.length) {
    showToast("没有可撤销的操作", "warn");
    return;
  }
  const currentSnapshot = cloneData(state);
  const previous = undoStack.pop();
  redoStack.push({ id: createId(), reason: previous.reason, time: new Date().toISOString(), state: currentSnapshot });
  redoStack = redoStack.slice(-20);
  state = migrateState(cloneData(previous.state));
  recordAudit("撤销操作", previous.reason || "最近一次修改");
  saveState({ immediate: true });
  render();
  showToast("已撤销");
}

function redoLastStateChange() {
  if (!redoStack.length) {
    showToast("没有可重做的操作", "warn");
    return;
  }
  const currentSnapshot = cloneData(state);
  const next = redoStack.pop();
  undoStack.push({ id: createId(), reason: next.reason, time: new Date().toISOString(), state: currentSnapshot });
  undoStack = undoStack.slice(-20);
  state = migrateState(cloneData(next.state));
  recordAudit("重做操作", next.reason || "最近一次修改");
  saveState({ immediate: true });
  render();
  showToast("已重做");
}

function clearRedoHistory() {
  redoStack = [];
}

function flushLocalStateWrite() {
  if (!pendingLocalStateSnapshot) return;
  clearTimeout(pendingLocalStateWriteTimer);
  pendingLocalStateWriteTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, pendingLocalStateSnapshot);
    pendingLocalStateSnapshot = "";
  } catch {
    notifyUser("本地存储空间不足，当前修改可能无法保存。建议先导出节点台账或清理浏览器存储。");
  }
}

function showToast(message, tone = "ok") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.dataset.tone = tone;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function invalidateStateCache() {
  if (!stateCache) return;
  stateCache.version += 1;
  stateCache.projectItems = new Map();
}

function recordEntityHistory(entityType, entityId, title, changes, summary = "") {
  state.entityHistory = state.entityHistory || [];
  state.entityHistory.unshift({
    id: createId(),
    projectId: state.selectedProjectId,
    entityType,
    entityId,
    title,
    changes,
    summary,
    time: new Date().toISOString()
  });
  state.entityHistory = state.entityHistory.slice(0, 120);
}

const INDEXED_DB_NAME = "JinDuTongJiDB";
const INDEXED_DB_VERSION = 1;
let indexedDbConnectionPromise = null;
let pendingIndexedDbMirrorTimer = null;
let pendingIndexedDbSnapshot = null;

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

function recordAudit(action, detail = "") {
  state.auditLogs = state.auditLogs || [];
  state.auditLogs.unshift({
    id: createId(),
    projectId: state.selectedProjectId,
    role: currentRole(),
    action,
    detail,
    time: new Date().toISOString()
  });
  state.auditLogs = state.auditLogs.slice(0, 80);
}

function createRestorePoint(reason) {
  pushUndoSnapshot(reason);
  state.restorePoints = state.restorePoints || [];
  const snapshot = cloneData(state);
  snapshot.restorePoints = [];
  state.restorePoints.unshift({
    id: createId(),
    reason,
    createdAt: new Date().toISOString(),
    projectId: state.selectedProjectId,
    taskCount: state.tasks?.length || 0,
    issueCount: state.issues?.length || 0,
    health: backupHealthSummary(state),
    state: snapshot
  });
  state.restorePoints = state.restorePoints.slice(0, 14);
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
    els.importResult.textContent = `恢复失败：${error.message || "请检查 JSON 备份文件"}`;
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
  return [
    `文件：${fileName}`,
    `导出时间：${exportedAt}`,
    `项目 ${projectCount} 个｜节点 ${taskCount} 条｜整改 ${issueCount} 条｜范围 ${scopeCount} 组`,
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
  const logs = (state.auditLogs || []).filter((item) => item.projectId === state.selectedProjectId).slice(0, 12);
  els.auditLogPanel.innerHTML = `
    <strong>操作记录</strong>
    <div>
      ${logs.length ? logs.map((log) => `
        <article>
          <div>
            <strong>${escapeHtml(log.action)}</strong>
            <small>${new Date(log.time).toLocaleString()}｜${escapeHtml(roleLabel(log.role))}｜${escapeHtml(log.detail || "")}</small>
          </div>
        </article>
      `).join("") : `<article><div><strong>暂无操作记录</strong><small>新增、编辑、删除、导入和恢复会自动记录。</small></div></article>`}
    </div>
  `;
}

function renderRestorePointPanel() {
  if (!els.restorePointPanel) return;
  const points = state.restorePoints || [];
  els.restorePointPanel.innerHTML = `
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
  `;
  els.restorePointPanel.querySelectorAll("[data-restore-point]").forEach((button) => {
    button.addEventListener("click", () => restoreFromPoint(button.dataset.restorePoint));
  });
}
