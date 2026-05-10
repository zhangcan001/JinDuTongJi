let loadedStateFromLocalStorage = false;

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

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    invalidateStateCache();
    scheduleStateMirrorToIndexedDB();
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
    state: snapshot
  });
  state.restorePoints = state.restorePoints.slice(0, 5);
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
  const payload = {
    app: "JinDuTongJi",
    version: APP_VERSION,
    schemaVersion: STATE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = datedFileName("监理进度数据备份", currentProjectName(), "json", today);
  link.click();
  URL.revokeObjectURL(url);
  state.uiPreferences.lastBackupAt = new Date().toISOString();
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
  return [
    `文件：${fileName}`,
    `导出时间：${exportedAt}`,
    `项目 ${projectCount} 个｜节点 ${taskCount} 条｜整改 ${issueCount} 条｜范围 ${scopeCount} 组`,
    `数据版本：${schema}`
  ].join("\n");
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
            <small>${new Date(point.createdAt).toLocaleString()}｜节点 ${point.taskCount}｜整改 ${point.issueCount}</small>
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
