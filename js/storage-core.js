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
let pendingBackendAuditQueue = [];
let backendApiUnavailable = false;
let backendPageStats = null;
let backendConflict = null;

const BACKEND_PENDING_STATE_KEY = `${STORAGE_KEY}:pending-backend-state`;
const BACKEND_PENDING_AUDIT_KEY = `${STORAGE_KEY}:pending-backend-audit`;
const BACKEND_KEEPALIVE_BODY_LIMIT = 60 * 1024;

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
    const snapshotState = compactStateForStorage(state);
    pendingLocalStateSnapshot = JSON.stringify(snapshotState);
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
var INDEXED_DB_VERSION = 1;
var indexedDbConnectionPromise = null;
var pendingIndexedDbMirrorTimer = null;
var pendingIndexedDbSnapshot = null;
