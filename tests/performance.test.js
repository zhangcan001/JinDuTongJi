const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function createContext() {
  const stateCache = { version: 0, projectItems: new Map() };
  const context = {
    console,
    structuredClone,
    window: {},
    document: { querySelector: () => null, querySelectorAll: () => [] },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    requestAnimationFrame: (callback) => setTimeout(callback, 0),
    stateCache,
    selectedTaskIds: new Set(),
    taskFilters: { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc", page: 1, pageSize: 20 },
    invalidateStateCache() {
      stateCache.projectItems = new Map();
      stateCache.version += 1;
    },
    renderSavedTaskViewOptions() {},
    persistUiPreferences() {},
    syncTaskFilterControls() {},
    syncAuditFilterControls() {}
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

const context = createContext();
loadScripts(context, [
  "js/business-rules.js",
  "js/project-helpers.js",
  "js/app-core.js",
  "js/data.js",
  "js/validation-schema.js",
  "js/dashboard.js",
  "js/state-import.js",
  "js/scope-maintenance.js",
  "js/scope-model.js",
  "js/records-chart.js"
]);

vm.runInContext(`
  globalThis.__perfApi = {
    cloneData,
    demoState,
    migrateState,
    currentProjectItems,
    currentProjectFilteredTasks,
    avoidLabelOverlap
  };
`, context);

const api = context.__perfApi;
function seedTasks(count) {
  context.state = api.migrateState(api.cloneData(api.demoState));
  context.state.selectedProjectId = "p1";
  context.state.tasks = Array.from({ length: count }, (_, index) => ({
    id: `perf-${count}-${index}`,
    projectId: "p1",
    name: `性能节点 ${index}`,
    discipline: index % 2 ? "机电" : "消防",
    owner: index % 2 ? "机电单位" : "消防单位",
    building: `A${(index % 6) + 1}`,
    floor: `${(index % 18) + 1}层`,
    system: index % 3 ? "管线安装" : "设备安装",
    planned: `2026-05-${String((index % 28) + 1).padStart(2, "0")}`,
    actual: "",
    progress: index % 101,
    note: index % 17 === 0 ? "材料未进场" : ""
  }));
  context.invalidateStateCache();
}

const results = [1000, 5000, 10000].map((count) => {
  seedTasks(count);
  const tasks = api.currentProjectItems("tasks");
  const started = performance.now();
  const filtered = api.currentProjectFilteredTasks(tasks, {
    query: "安装",
    status: "all",
    building: "all",
    owner: "all",
    sort: "progressAsc"
  });
  const elapsed = performance.now() - started;
  assert.equal(tasks.length, count);
  assert.ok(filtered.length > 0);
  assert.ok(elapsed < 750, `Filtering ${count} tasks took ${elapsed.toFixed(1)}ms`);
  return `${count}:${elapsed.toFixed(1)}ms`;
});

function createElementMock() {
  return {
    innerHTML: "",
    textContent: "",
    value: "",
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {} },
    querySelectorAll: () => [],
    querySelector: () => null,
    addEventListener() {}
  };
}

context.els = {
  taskTable: createElementMock(),
  taskCount: createElementMock(),
  taskColumnToggles: createElementMock(),
  taskPagination: createElementMock(),
  selectAllTasks: createElementMock(),
  bulkTaskToolbar: createElementMock(),
  bulkTaskSummary: createElementMock(),
  issueBoard: createElementMock(),
  issueTaskSelect: createElementMock()
};

seedTasks(5000);
context.taskFilters = { query: "", status: "all", building: "all", owner: "all", smart: "all", sort: "plannedAsc", page: 1, pageSize: 120 };
const renderStarted = performance.now();
vm.runInContext("renderTasks()", context);
const renderElapsed = performance.now() - renderStarted;
assert.ok(renderElapsed < 1000, `Rendering task table took ${renderElapsed.toFixed(1)}ms`);
assert.ok(context.els.taskTable.innerHTML.includes("性能节点"), "rendered task table should contain seeded rows");

context.modelState = { labelRects: [{ x: 10, y: 10, width: 100, height: 42 }], canvasRect: { width: 120, height: 64 } };
const labelStarted = performance.now();
for (let index = 0; index < 200; index += 1) {
  api.avoidLabelOverlap({ canvas: { getBoundingClientRect: () => ({ width: 120, height: 64 }) } }, 10, 10, 100, 42);
}
const labelElapsed = performance.now() - labelStarted;
assert.ok(labelElapsed < 100, `Model label overlap avoidance took ${labelElapsed.toFixed(1)}ms`);

console.log(`performance checks passed (${results.join(", ")}, render5000:${renderElapsed.toFixed(1)}ms, labels:${labelElapsed.toFixed(1)}ms)`);
