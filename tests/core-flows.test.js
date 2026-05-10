const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function createBrowserContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    structuredClone,
    crypto: { randomUUID: () => `test-id-${Math.random().toString(16).slice(2)}` },
    document: { querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    indexedDB: null,
    stateCache: { version: 0, projectItems: new Map() },
    taskFilters: {},
    invalidateStateCache() {
      context.stateCache.version += 1;
      context.stateCache.projectItems = new Map();
    },
    notifyUser() {},
    showToast() {}
  };
  context.window = context;
  context.globalThis = context;
  vm.createContext(context);
  return context;
}

function loadScripts(context, files) {
  files.forEach((file) => {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    vm.runInContext(source, context, { filename: file });
  });
}

const context = createBrowserContext();
loadScripts(context, [
  "js/business-rules.js",
  "js/project-helpers.js",
  "js/data.js",
  "js/dashboard.js",
  "js/state-import.js",
  "js/storage-audit.js",
  "js/import-excel.js"
]);

vm.runInContext(`
  globalThis.__testApi = {
    cloneData,
    demoState,
    validateImportRows,
    normalizeImportRow,
    isImportFileTooLarge,
    migrateState,
    currentProjectItems,
    saveState,
    flushStateMirrorToIndexedDB,
    hydrateStateFromIndexedDB,
    escapeAttr,
    runCanvasModelLoop: globalThis.runCanvasModelLoop,
    drawCanvasBuildingModel: globalThis.drawCanvasBuildingModel
  };
`, context);

const api = context.__testApi;
context.state = api.migrateState(api.cloneData(api.demoState));

const normalized = api.normalizeImportRow({
  " 项目名称 ": "城东综合体一期",
  楼栋: "A1（6层）",
  楼层: "2层",
  专业: "机电",
  施工单位: "机电单位",
  施工内容: "室内给水系统",
  计划完成时间: "2026/05/12",
  实际完成情况: "施工中",
  备注: "深化图纸待复核"
});

assert.equal(normalized.projectName, "城东综合体一期");
assert.equal(normalized.building, "A1（6层）");
assert.equal(normalized.floor, "2层");
assert.equal(normalized.progress, 50);
assert.equal(normalized.planned, "2026-05-12");
assert.equal(normalized.note, "深化图纸待复核");
assert.equal(api.isImportFileTooLarge({ size: 8 * 1024 * 1024 + 1 }), true);
assert.equal(api.isImportFileTooLarge({ size: 1024 }), false);
assert.equal(api.escapeAttr('p"1`<x>'), "p&quot;1&#096;&lt;x&gt;");

const validation = api.validateImportRows([
  {
    项目: "城东综合体一期",
    楼栋: "A1（6层）",
    楼层: "2层",
    专业: "机电",
    施工单位: "机电单位",
    施工内容: "室内给水系统",
    计划完成时间: "2026-05-12",
    实际完成情况: "施工中"
  },
  {
    项目: "城东综合体一期",
    楼栋: "A1（6层）",
    楼层: "99层",
    专业: "机电",
    施工单位: "机电单位",
    施工内容: "室内给水系统",
    实际完成情况: "乱填"
  }
]);

assert.equal(validation.validRows.length, 1);
assert.equal(validation.invalidRows.length, 1);
assert.ok(validation.invalidRows[0].problems.some((item) => item.includes("楼层超出楼栋范围")));
assert.ok(validation.invalidRows[0].problems.some((item) => item.includes("实际完成情况只能为")));

const migrated = api.migrateState({
  projects: [{ id: "p-custom", name: "测试项目" }],
  selectedProjectId: "p-custom",
  projectScopes: {},
  tasks: [{ id: "t-1", projectId: "p-custom", name: "节点", planned: "2026-05-01", progress: 25 }],
  issues: [{ id: "i-1", projectId: "p-custom", title: "问题", action: "材料未进场", status: "跟踪中" }]
});

assert.equal(migrated.currentRole, "admin");
assert.equal(migrated.uiPreferences.activeView, "dashboard");
assert.equal(migrated.tasks.find((task) => task.id === "t-1").reviewStatus, "approved");
assert.equal(migrated.issues[0].status, "整改中");
assert.equal(migrated.issues[0].category, "材料");

context.state.currentRole = "contractor";
context.state.selectedContractorUnit = "机电单位";
context.state.selectedProjectId = "p1";
context.stateCache = { version: 0, projectItems: new Map() };
const contractorTasks = api.currentProjectItems("tasks");

assert.ok(contractorTasks.length > 0);
assert.ok(contractorTasks.every((task) => `${task.owner || ""}${task.discipline || ""}`.includes("机电")));

function createIndexedDbMock(initialLatest = null) {
  const calls = { open: 0, put: 0, get: 0, latest: initialLatest };
  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    transaction() {
      return {
        objectStore() {
          return {
            put(snapshot) {
              calls.put += 1;
              calls.latest = snapshot;
            },
            get() {
              calls.get += 1;
              const request = { result: calls.latest, onsuccess: null, onerror: null };
              setTimeout(() => request.onsuccess?.(), 0);
              return request;
            }
          };
        }
      };
    },
    close() {}
  };
  return {
    calls,
    open() {
      calls.open += 1;
      const request = { result: db, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    }
  };
}

async function runAsyncChecks() {
  const indexedDbMock = createIndexedDbMock();
  context.indexedDB = indexedDbMock;
  context.window.indexedDB = indexedDbMock;
  context.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  context.window.localStorage = context.localStorage;
  context.state = { projects: [], tasks: [{ id: "first" }], issues: [], selectedProjectId: "p1", uiPreferences: {} };
  api.saveState();
  context.state.tasks = [{ id: "second" }];
  api.saveState();
  await api.flushStateMirrorToIndexedDB();

  assert.equal(indexedDbMock.calls.open, 1);
  assert.equal(indexedDbMock.calls.put, 1);
  assert.equal(indexedDbMock.calls.latest.state.tasks[0].id, "second");

  const mirrorState = {
    projects: [{ id: "p-mirror", name: "镜像项目" }],
    selectedProjectId: "p-mirror",
    projectScopes: {},
    tasks: [{ id: "from-indexeddb", projectId: "p-mirror", name: "镜像节点" }],
    issues: []
  };
  const hydratedContext = createBrowserContext();
  loadScripts(hydratedContext, [
    "js/business-rules.js",
    "js/project-helpers.js",
    "js/data.js",
    "js/dashboard.js",
    "js/state-import.js",
    "js/storage-audit.js"
  ]);
  const hydratedDbMock = createIndexedDbMock({ id: "latest", savedAt: "2026-05-10T00:00:00.000Z", state: mirrorState });
  hydratedContext.indexedDB = hydratedDbMock;
  hydratedContext.window.indexedDB = hydratedDbMock;
  hydratedContext.state = hydratedContext.migrateState(api.cloneData(api.demoState));
  const restored = await hydratedContext.hydrateStateFromIndexedDB();

  assert.equal(restored, true);
  assert.equal(hydratedContext.state.selectedProjectId, "p-mirror");
  assert.ok(hydratedContext.state.tasks.some((task) => task.id === "from-indexeddb"));

  console.log("core flow tests passed");
}

runAsyncChecks().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
