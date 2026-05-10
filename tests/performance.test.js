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
    stateCache,
    taskFilters: { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc", page: 1, pageSize: 20 },
    invalidateStateCache() {
      stateCache.projectItems = new Map();
      stateCache.version += 1;
    }
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
  "js/data.js",
  "js/dashboard.js",
  "js/state-import.js",
  "js/records-chart.js"
]);

vm.runInContext(`
  globalThis.__perfApi = {
    cloneData,
    demoState,
    migrateState,
    currentProjectItems,
    currentProjectFilteredTasks
  };
`, context);

const api = context.__perfApi;
context.state = api.migrateState(api.cloneData(api.demoState));
context.state.selectedProjectId = "p1";
context.state.tasks = Array.from({ length: 10000 }, (_, index) => ({
  id: `perf-${index}`,
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

assert.equal(tasks.length, 10000);
assert.ok(filtered.length > 0);
assert.ok(elapsed < 750, `Filtering 10000 tasks took ${elapsed.toFixed(1)}ms`);

console.log(`performance checks passed (${elapsed.toFixed(1)}ms)`);
