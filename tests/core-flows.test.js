const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");

function createBrowserContext() {
  const context = {
    console,
    setTimeout,
    clearTimeout,
    structuredClone,
    crypto: { randomUUID: () => `test-id-${Math.random().toString(16).slice(2)}` },
    performance: { now: () => Date.now() },
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
  "js/vendor/xlsx.full.min.js",
  "js/business-rules.js",
  "js/project-helpers.js",
  "js/app-core.js",
  "js/data.js",
  "js/validation-schema.js",
  "js/dashboard.js",
  "js/state-import.js",
  "js/storage-core.js",
  "js/storage-audit.js",
  "js/import-file-reader.js",
  "js/import-options.js",
  "js/import-normalize.js",
  "js/import-preview.js",
  "js/import-apply.js",
  "js/import-template.js",
  "js/scope-maintenance.js",
  "js/scope-model.js",
  "js/import-excel.js"
]);

vm.runInContext(`
  globalThis.__testApi = {
    cloneData,
    demoState,
    validateImportRows,
    normalizeImportRow,
    previewImportedRows,
    applyImportedRows,
    stageImportedRowsForReview,
    readWorkbookRows,
    inferImportFieldMap,
    buildImportHeaderMap,
    isImportFileTooLarge,
    migrateState,
    currentProjectItems,
    saveState,
    flushStateMirrorToIndexedDB,
    hydrateStateFromIndexedDB,
    escapeAttr,
    splitScopedSystem,
    normalizedOwnerKey,
    taskMatchesScopeUnit,
    averageProgress,
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

const workbook = context.XLSX.utils.book_new();
context.XLSX.utils.book_append_sheet(workbook, context.XLSX.utils.json_to_sheet([
  {
    楼栋: "A1",
    楼层: "1层",
    专业: "机电",
    施工单位: "机电单位",
    施工内容: "真实Excel解析测试",
    计划完成时间: "2026-05-25",
    实际完成情况: "施工中"
  }
]), "机电单位");
context.XLSX.utils.book_append_sheet(workbook, context.XLSX.utils.aoa_to_sheet([["说明"], ["忽略"]]), "填报说明");
const workbookBuffer = context.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
const parsedWorkbook = context.XLSX.read(workbookBuffer, { type: "array", cellDates: true });
const workbookRows = api.readWorkbookRows(parsedWorkbook);
assert.equal(workbookRows.length, 1);
assert.equal(workbookRows[0].来源工作表, "机电单位");
assert.equal(api.normalizeImportRow(workbookRows[0]).system, "真实Excel解析测试");

const looseWorkbook = context.XLSX.utils.book_new();
context.XLSX.utils.book_append_sheet(looseWorkbook, context.XLSX.utils.aoa_to_sheet([
  ["汽车科技总部产业园进度统计表"],
  ["填报日期", "2026-05-12"],
  ["楼号名称", "所在楼层", "责任班组", "作业内容", "计划完工日期", "当前状态", "完成比例", "情况说明"],
  ["B1", "3层", "消防单位", "喷淋系统", "2026/05/30", "施工中", "45%", "材料已进场"]
]), "周报统计");
const looseRows = api.readWorkbookRows(looseWorkbook);
assert.equal(looseRows.length, 1);
assert.equal(looseRows[0].__importRowNumber, 4);
const looseMap = api.inferImportFieldMap(looseRows);
assert.equal(looseMap.building, "楼号名称");
assert.equal(looseMap.floor, "所在楼层");
assert.equal(looseMap.owner, "责任班组");
assert.equal(looseMap.system, "作业内容");
assert.equal(looseMap.planned, "计划完工日期");
assert.equal(looseMap.completionStatus, "当前状态");
assert.equal(looseMap.progress, "完成比例");
const looseNormalized = api.normalizeImportRow({
  ...looseRows[0],
  __importHeaderMap: api.buildImportHeaderMap(looseRows)
});
assert.equal(looseNormalized.building, "B1");
assert.equal(looseNormalized.floor, "3层");
assert.equal(looseNormalized.owner, "消防单位");
assert.equal(looseNormalized.system, "喷淋系统");
assert.equal(looseNormalized.planned, "2026-05-30");
assert.equal(looseNormalized.progress, 50);
assert.equal(looseNormalized.note, "材料已进场");

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
assert.ok(validation.invalidRows[0].problems.some((item) => item.includes("实际完成情况只能为")));
assert.ok(validation.warnings.some((item) => item.includes("A1 层数将按导入表更新为 99 层")));

const percentStatus = api.normalizeImportRow({
  楼栋: "A1",
  楼层: "3层",
  专业: "机电",
  施工单位: "机电单位",
  施工内容: "百分比导入测试",
  计划完成时间: "2026-05-26",
  实际完成情况: "35%"
});
assert.equal(percentStatus.progress, 35);
const numericStatus = api.normalizeImportRow({
  楼栋: "A1",
  楼层: "4层",
  专业: "机电",
  施工单位: "机电单位",
  施工内容: "数字导入测试",
  计划完成时间: "2026-05-27",
  实际完成情况: "0.5"
});
assert.equal(numericStatus.progress, 50);
const scopedSystemRow = api.normalizeImportRow({
  楼栋: "A1",
  楼层: "5层",
  专业: "机电",
  施工内容: "机电单位｜导管内穿线",
  计划完成时间: "2026-05-28",
  实际完成情况: "60%"
});
assert.equal(scopedSystemRow.owner, "机电单位");
assert.equal(scopedSystemRow.system, "导管内穿线");

const duplicatePreview = api.previewImportedRows([
  {
    项目: "城东综合体一期",
    楼栋: "A1",
    楼层: "1层",
    专业: "机电",
    施工单位: "机电单位",
    施工内容: "室内给水系统",
    计划完成时间: "2026-05-12",
    实际完成情况: "施工中"
  },
  {
    项目: "城东综合体一期",
    楼栋: "A1",
    楼层: "1层",
    专业: "机电",
    施工单位: "机电单位",
    施工内容: "室内给水系统",
    计划完成时间: "2026-05-13",
    实际完成情况: "已完成"
  }
]);
assert.equal(duplicatePreview.duplicateItems.length, 1);

const importRows = [{
  项目: "城东综合体一期",
  楼栋: "A1",
  楼层: "1层",
  专业: "机电",
  施工单位: "机电单位",
  施工内容: "UI导入测试系统",
  计划完成时间: "2026-05-23",
  实际完成情况: "未开始"
}];
const beforeImportCount = context.state.tasks.length;
assert.equal(api.applyImportedRows(importRows, "updateOnly").skipped, 1);
assert.equal(context.state.tasks.length, beforeImportCount);
assert.equal(api.applyImportedRows(importRows, "appendOnly").created, 1);
assert.equal(api.applyImportedRows(importRows, "appendOnly").skipped, 1);
assert.equal(context.state.projectScopes.p1.buildings.map((building) => `${building.name}:${building.floors}`).join(","), "A1:1");
const staged = api.stageImportedRowsForReview([{ ...importRows[0], 施工内容: "UI待复核系统" }], "review.csv");
assert.equal(staged.created, 1);
assert.ok(context.state.pendingImports.some((item) => item.fileName === "review.csv"));
assert.equal(context.state.projectScopes.p1.buildings.map((building) => `${building.name}:${building.floors}`).join(","), "A1:1");
const floorSyncResult = api.applyImportedRows([{
  ...importRows[0],
  楼栋: "A2",
  楼层: "9层",
  施工内容: "楼层同步测试"
}], "appendOnly", { scope: "current", updatePolicy: "all", duplicatePolicy: "last" });
assert.equal(floorSyncResult.created, 1);
assert.equal(context.state.projectScopes.p1.buildings.find((building) => building.name === "A2").floors, 9);
const newBuildingSyncResult = api.applyImportedRows([{
  ...importRows[0],
  楼栋: "C1",
  楼层: "12层",
  施工内容: "新增楼栋层数测试"
}], "appendOnly", { scope: "current", updatePolicy: "all", duplicatePolicy: "last" });
assert.equal(newBuildingSyncResult.created, 1);
const c1ScopeBuilding = context.state.projectScopes.p1.buildings.find((building) => building.name === "C1");
assert.equal(c1ScopeBuilding.name, "C1");
assert.equal(c1ScopeBuilding.floors, 12);
assert.equal(context.state.projectScopes.p1.buildings.map((building) => `${building.name}:${building.floors}`).join(","), "A1:1,A2:9,C1:12");
const elevatorImportResult = api.applyImportedRows([{
  ...importRows[0],
  施工单位: "电梯单位",
  施工内容: "电梯轿厢安装"
}], "appendOnly", { scope: "current", updatePolicy: "all", duplicatePolicy: "last" });
assert.equal(elevatorImportResult.created, 0);
assert.equal(elevatorImportResult.skipped, 1);
assert.equal(context.state.tasks.some((task) => `${task.owner || ""}${task.system || ""}`.includes("电梯")), false);

const scopedImportRow = {
  项目: "表内新项目",
  楼栋: "A2",
  楼层: "1层",
  专业: "机电",
  施工单位: "机电单位",
  施工内容: "导入口径测试",
  计划完成时间: "2026-05-24",
  实际完成情况: "施工中"
};
const projectCountBeforeScopedImport = context.state.projects.length;
const currentProjectScoped = api.applyImportedRows([scopedImportRow], "appendOnly", { scope: "current", updatePolicy: "all", duplicatePolicy: "last" });
assert.equal(currentProjectScoped.created, 1);
assert.equal(context.state.projects.length, projectCountBeforeScopedImport);
assert.ok(context.state.tasks.some((task) => task.projectId === "p1" && task.system === "导入口径测试"));

const fromFileScoped = api.applyImportedRows([{ ...scopedImportRow, 施工内容: "表内项目导入测试" }], "appendOnly", { scope: "fromFile", updatePolicy: "all", duplicatePolicy: "last" });
assert.equal(fromFileScoped.created, 1);
const importedProject = context.state.projects.find((project) => project.name === "表内新项目");
assert.ok(importedProject);
assert.ok(context.state.tasks.some((task) => task.projectId === importedProject.id && task.system === "表内项目导入测试"));

const updateTarget = context.state.tasks.find((task) => task.projectId === "p1" && task.system === "导入口径测试");
const originalPlan = updateTarget.planned;
api.applyImportedRows([{ ...scopedImportRow, 施工内容: "导入口径测试", 计划完成时间: "2026-06-01", 实际完成情况: "已完成" }], "upsert", { scope: "current", updatePolicy: "progressOnly", duplicatePolicy: "last" });
assert.equal(updateTarget.progress, 100);
assert.equal(updateTarget.planned, originalPlan);
api.applyImportedRows([{ ...scopedImportRow, 施工内容: "导入口径测试", 计划完成时间: "2026-06-02", 实际完成情况: "未开始" }], "upsert", { scope: "current", updatePolicy: "planOnly", duplicatePolicy: "last" });
assert.equal(updateTarget.planned, "2026-06-02");
assert.equal(updateTarget.progress, 100);
const duplicatePolicyResult = api.applyImportedRows([
  { ...scopedImportRow, 施工内容: "重复策略测试", 实际完成情况: "施工中" },
  { ...scopedImportRow, 施工内容: "重复策略测试", 实际完成情况: "已完成" }
], "appendOnly", { scope: "current", updatePolicy: "all", duplicatePolicy: "maxProgress" });
assert.equal(duplicatePolicyResult.created, 1);
assert.ok(context.state.tasks.some((task) => task.system === "重复策略测试" && task.progress === 100));
const scopedDuplicateNames = api.applyImportedRows([
  { ...scopedImportRow, 专业: "机电", 施工单位: "机电单位", 施工内容: "导管内穿线", 楼层: "6层", 实际完成情况: "20%" },
  { ...scopedImportRow, 专业: "智能化", 施工单位: "智能化单位", 施工内容: "导管内穿线", 楼层: "6层", 实际完成情况: "80%" }
], "appendOnly", { scope: "current", updatePolicy: "all", duplicatePolicy: "last" });
assert.equal(scopedDuplicateNames.created, 2);
assert.ok(context.state.tasks.some((task) => task.owner === "机电单位" && task.system === "导管内穿线" && task.progress === 20));
assert.ok(context.state.tasks.some((task) => task.owner === "智能化单位" && task.system === "导管内穿线" && task.progress === 80));
const mepUnit = { name: "机电单位", systems: ["导管内穿线"] };
const smartUnit = { name: "智能化单位", systems: ["导管内穿线"] };
const mepWireTask = context.state.tasks.find((task) => task.owner === "机电单位" && task.system === "导管内穿线");
const smartWireTask = context.state.tasks.find((task) => task.owner === "智能化单位" && task.system === "导管内穿线");
assert.equal(api.taskMatchesScopeUnit(mepWireTask, mepUnit), true);
assert.equal(api.taskMatchesScopeUnit(mepWireTask, smartUnit), false);
assert.equal(api.taskMatchesScopeUnit(smartWireTask, smartUnit), true);
const splitSmartSystem = api.splitScopedSystem("智能化单位｜导管内穿线");
assert.equal(splitSmartSystem.owner, "智能化单位");
assert.equal(splitSmartSystem.system, "导管内穿线");
assert.equal(api.averageProgress([
  { owner: "机电单位", system: "设备安装", progress: 20 },
  { owner: "机电单位", system: "管线安装", progress: 100 }
]), 60);

const desktopTemplate = path.join(os.homedir(), "Desktop", "进度导入模板-汽车科技总部产业园-2026-05-11.xlsx");
if (fs.existsSync(desktopTemplate)) {
  const workbook = context.XLSX.read(fs.readFileSync(desktopTemplate), { type: "buffer", cellDates: true });
  const templateRows = api.readWorkbookRows(workbook);
  assert.ok(templateRows.length > 100, "provided workbook should parse data rows");
  const mepRow = templateRows.find((row) => row.来源工作表 === "机电单位" && row.施工内容 === "导管内穿线");
  const normalizedMep = api.normalizeImportRow(mepRow);
  assert.equal(normalizedMep.owner, "机电单位");
  assert.equal(normalizedMep.system, "导管内穿线");
  assert.equal(normalizedMep.progress, 10);
  ["机电单位", "消防单位", "智能化单位"].forEach((unitName) => {
    const unit = context.state.projectScopes.p1.units.find((item) => item.name === unitName);
    const templateSystems = new Set(templateRows
      .filter((row) => row.来源工作表 === unitName && row.施工内容)
      .map((row) => row.施工内容));
    templateSystems.forEach((system) => {
      assert.ok(unit.systems.includes(system), `${unitName} should include template system ${system}`);
    });
  });
  const removedUnitSheetName = `${String.fromCharCode(30005, 26799)}单位`;
  assert.equal(templateRows.some((row) => row.来源工作表 === removedUnitSheetName), false);
}
const conflictPolicyResult = api.applyImportedRows([
  { ...scopedImportRow, 施工内容: "冲突策略测试", 实际完成情况: "施工中" },
  { ...scopedImportRow, 施工内容: "冲突策略测试", 实际完成情况: "已完成" }
], "appendOnly", { scope: "current", updatePolicy: "all", duplicatePolicy: "conflict" });
assert.equal(conflictPolicyResult.created, 0);
assert.equal(context.state.tasks.some((task) => task.system === "冲突策略测试"), false);

const migrated = api.migrateState({
  projects: [{ id: "p-custom", name: "测试项目" }],
  selectedProjectId: "p-custom",
  projectScopes: {
    "p-custom": {
      basement: "",
      buildings: [{ name: "A1", floors: 3 }],
      units: [
        { name: "电梯单位", code: "LIFT", systems: ["电梯安装"] },
        { name: "机电单位", code: "MEP", systems: ["室内给水系统", "电梯厅照明"] }
      ]
    }
  },
  tasks: [
    { id: "t-1", projectId: "p-custom", name: "节点", planned: "2026-05-01", progress: 25 },
    { id: "t-elevator", projectId: "p-custom", name: "电梯调试", owner: "电梯单位", system: "曳引机安装", planned: "2026-05-02", progress: 10 }
  ],
  issues: [
    { id: "i-1", projectId: "p-custom", title: "问题", action: "材料未进场", status: "跟踪中" },
    { id: "i-elevator", projectId: "p-custom", title: "电梯井道整改", action: "电梯安装滞后", status: "跟踪中" }
  ]
});

assert.equal(migrated.currentRole, "admin");
assert.equal(migrated.uiPreferences.activeView, "dashboard");
assert.equal(migrated.tasks.find((task) => task.id === "t-1").reviewStatus, "approved");
assert.equal(migrated.tasks.some((task) => task.id === "t-elevator"), false);
assert.equal(migrated.issues[0].status, "整改中");
assert.equal(migrated.issues[0].category, "材料");
assert.equal(migrated.issues.some((issue) => issue.id === "i-elevator"), false);
assert.equal(migrated.projectScopes["p-custom"].units.some((unit) => unit.name.includes("电梯")), false);
assert.equal(migrated.projectScopes["p-custom"].units[0].systems.some((system) => system.includes("电梯")), false);

const legacyFixture = JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "state-v1-minimal.json"), "utf8"));
const migratedFixture = api.migrateState(legacyFixture);
assert.equal(migratedFixture.schemaVersion, context.STATE_SCHEMA_VERSION);
assert.equal(migratedFixture.tasks[0].reviewStatus, "approved");
assert.equal(migratedFixture.issues[0].status, "整改中");

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
    "js/app-core.js",
    "js/data.js",
    "js/validation-schema.js",
    "js/dashboard.js",
    "js/state-import.js",
    "js/storage-core.js",
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
