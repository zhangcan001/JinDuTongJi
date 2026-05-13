let loadedStateFromLocalStorage = false;
let pendingLocalStateWriteTimer = null;
let pendingLocalStateSnapshot = "";
let undoStack = [];
let redoStack = [];
let backendStateLoaded = false;
let pendingBackendStateWriteTimer = null;
let pendingBackendStateSnapshot = null;
let backendStateVersion = 0;
let backendSaveStatusTimer = null;
let backendBackups = [];
let backendHealth = null;
let backendRetryTimer = null;
let backendRetryAttempt = 0;
let backendSaveInFlight = false;
let pendingBackendStatePersistId = 0;
let pendingBackendAuditQueue = [];
let backendApiUnavailable = false;
let backendPageStats = null;
let backendConflict = null;

const BACKEND_PENDING_STATE_KEY = `${STORAGE_KEY}:pending-backend-state`;
const BACKEND_PENDING_AUDIT_KEY = `${STORAGE_KEY}:pending-backend-audit`;
const BACKEND_KEEPALIVE_BODY_LIMIT = 60 * 1024;
const LOCAL_STORAGE_STATE_LIMIT = 2 * 1024 * 1024;
const LOCAL_STORAGE_EXTERNAL_STATE = "__jinduExternalState";
const LOCAL_STORAGE_UI_KEY = `${STORAGE_KEY}:ui`;

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : (localUiStateMarker() || cloneData(demoState));
    if (parsed?.[LOCAL_STORAGE_EXTERNAL_STATE]) {
      loadedStateFromLocalStorage = false;
      return migrateState({
        ...cloneData(demoState),
        currentRole: parsed.currentRole || demoState.currentRole,
        selectedProjectId: parsed.selectedProjectId || demoState.selectedProjectId,
        selectedContractorUnit: parsed.selectedContractorUnit || demoState.selectedContractorUnit,
        uiPreferences: parsed.uiPreferences || {}
      });
    }
    loadedStateFromLocalStorage = Boolean(saved);
    return migrateState(parsed);
  } catch {
    loadedStateFromLocalStorage = false;
    localStorage.removeItem(STORAGE_KEY);
    return migrateState(cloneData(demoState));
  }
}

function saveState(options = {}) {
  try {
    const snapshotState = compactStateForStorage(state);
    pendingLocalStateSnapshot = serializeStateForLocalStorage(snapshotState);
    if (options.immediate) {
      flushLocalStateWrite();
    } else {
      clearTimeout(pendingLocalStateWriteTimer);
      pendingLocalStateWriteTimer = setTimeout(flushLocalStateWrite, 120);
    }
    invalidateStateCache(options.scope || options.refresh || "all");
    scheduleStateMirrorToIndexedDB();
    scheduleStateMirrorToBackend(options);
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
  const startedAt = performance.now();
  clearTimeout(pendingLocalStateWriteTimer);
  pendingLocalStateWriteTimer = null;
  try {
    localStorage.setItem(STORAGE_KEY, pendingLocalStateSnapshot);
    if (typeof perfMetrics !== "undefined") perfMetrics.lastSaveMs = Math.round((performance.now() - startedAt) * 10) / 10;
    pendingLocalStateSnapshot = "";
  } catch {
    const fallback = serializeExternalStateMarker(state);
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.setItem(STORAGE_KEY, fallback);
      pendingLocalStateSnapshot = "";
      notifyUser("浏览器本地缓存已切换为轻量索引，完整数据会继续保存到本地数据库。", "warn");
    } catch {
      notifyUser("本地存储空间不足，当前修改会优先保存到本地数据库，请保持服务或浏览器存储可用。", "warn");
    }
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

function invalidateStateCache(scope = "all") {
  if (!stateCache) return;
  stateCache.version += 1;
  if (scope !== "all" && state.selectedProjectId) {
    invalidateStateCacheByScope(scope, state.selectedProjectId);
    return;
  }
  stateCache.projectItems = new Map();
}

function invalidateStateCacheByScope(scope, projectId) {
  const prefixes = {
    tasks: [`tasks:${projectId}`, `index:tasks:${projectId}`, `filtered:${projectId}`],
    issues: [`issues:${projectId}`, `index:issues:${projectId}`],
    scope: [`scope:${projectId}`, `model-tasks:${projectId}`, `basement:${projectId}`, `dictionary:${projectId}`],
    data: [`tasks:${projectId}`, `issues:${projectId}`, `index:tasks:${projectId}`, `index:issues:${projectId}`, `filtered:${projectId}`, `scope:${projectId}`],
    prefs: ["filtered:"]
  }[scope] || [];
  if (!prefixes.length) {
    stateCache.projectItems = new Map();
    return;
  }
  for (const key of [...stateCache.projectItems.keys()]) {
    if (prefixes.some((prefix) => key.startsWith(prefix) || key.includes(prefix))) stateCache.projectItems.delete(key);
  }
}

function compactStateForStorage(source) {
  const next = cloneData(source);
  stripDerivedTaskFields(next.tasks);
  stripDerivedTaskFields(next.pendingImports?.map((item) => item.task));
  return next;
}

function queueLocalStateWrite(source = state) {
  pendingLocalStateSnapshot = serializeStateForLocalStorage(compactStateForStorage(source));
  flushLocalStateWrite();
}

function serializeStateForLocalStorage(snapshotState) {
  const serialized = JSON.stringify(snapshotState);
  if (canUseExternalStateStorage()) return serializeExternalStateMarker(snapshotState);
  if (serialized.length <= LOCAL_STORAGE_STATE_LIMIT) return serialized;
  return serializeExternalStateMarker(snapshotState);
}

function serializeExternalStateMarker(source) {
  const marker = {
    [LOCAL_STORAGE_EXTERNAL_STATE]: true,
    savedAt: new Date().toISOString(),
    currentRole: source.currentRole || "",
    selectedProjectId: source.selectedProjectId || "",
    selectedContractorUnit: source.selectedContractorUnit || "all",
    uiPreferences: source.uiPreferences || {}
  };
  persistUiStateMarker(marker);
  return JSON.stringify(marker);
}

function persistUiStateMarker(marker) {
  try {
    localStorage.setItem(LOCAL_STORAGE_UI_KEY, JSON.stringify(marker));
  } catch {}
}

function localUiStateMarker() {
  try {
    const marker = JSON.parse(localStorage.getItem(LOCAL_STORAGE_UI_KEY) || "null");
    if (marker?.[LOCAL_STORAGE_EXTERNAL_STATE]) return marker;
  } catch {
    localStorage.removeItem(LOCAL_STORAGE_UI_KEY);
  }
  return null;
}

function canUseExternalStateStorage() {
  return Boolean(window.indexedDB) || (typeof canUseBackendState === "function" && canUseBackendState());
}

function stripDerivedTaskFields(tasks) {
  (tasks || []).forEach((task) => {
    delete task._searchText;
    delete task._statusClass;
    delete task._buildingKey;
    delete task._ownerKey;
  });
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

var INDEXED_DB_NAME = "JinDuTongJiDB";
var INDEXED_DB_VERSION = 2;
var indexedDbConnectionPromise = null;
var pendingIndexedDbMirrorTimer = null;
var pendingIndexedDbSnapshot = null;
