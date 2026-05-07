const STORAGE_KEY = "supervision-progress-app-v1";
const today = new Date();

const demoState = {
  projects: [
    { id: "p1", name: "城东综合体一期" },
    { id: "p2", name: "滨河学校扩建工程" }
  ],
  selectedProjectId: "p1",
  projectScopes: {
    p1: {
      basement: "地下室一层",
      buildings: [
        { name: "A1", floors: 6 },
        { name: "A2", floors: 4 },
        { name: "B1", floors: 11 },
        { name: "B2", floors: 11 },
        { name: "B3", floors: 11 },
        { name: "B4", floors: 11 },
        { name: "B5", floors: 6 }
      ],
      units: [
        {
          name: "机电单位",
          code: "MEP",
          systems: [
            "室内给水系统",
            "热水系统",
            "室内排水系统",
            "建筑中水系统",
            "水系统末端设备安装",
            "空调风管安装",
            "空调设备安装"
          ]
        },
        {
          name: "消防单位",
          code: "FIRE",
          systems: [
            "喷淋系统",
            "消火栓系统",
            "自动跟踪灭火系统",
            "水系统末端设备安装",
            "桥架敷设",
            "电缆敷设",
            "导管内穿线",
            "电气末端安装",
            "防排烟风管安装"
          ]
        },
        {
          name: "智能化单位",
          code: "IBMS",
          systems: [
            "智能化桥架敷设",
            "智能化线缆敷设",
            "导管内穿线",
            "智能化末端设备安装"
          ]
        },
        {
          name: "电梯单位",
          code: "LIFT",
          systems: ["设备安装"]
        }
      ]
    },
    p2: {
      basement: "地下室一层",
      buildings: [
        { name: "教学楼", floors: 5 },
        { name: "综合楼", floors: 4 }
      ],
      units: [
        { name: "施工总承包", code: "GC", systems: ["基础工程", "主体结构", "装饰装修"] }
      ]
    }
  },
  tasks: [
    {
      id: crypto.randomUUID(),
      projectId: "p1",
      name: "地下室结构封顶",
      discipline: "土建",
      owner: "总包一标段",
      planned: "2026-05-03",
      actual: "",
      progress: 82,
      note: "劳动力投入不足，要求补充木工班组并提交赶工计划。"
    },
    {
      id: crypto.randomUUID(),
      projectId: "p1",
      name: "二层机电综合支架完成",
      discipline: "机电",
      owner: "机电分包",
      planned: "2026-05-12",
      actual: "",
      progress: 46,
      note: "深化图纸需在本周内完成监理复核。"
    },
    {
      id: crypto.randomUUID(),
      projectId: "p1",
      name: "样板间装饰验收",
      discipline: "装饰",
      owner: "精装单位",
      planned: "2026-05-18",
      actual: "",
      progress: 20,
      note: "材料进场报验资料不完整。"
    },
    {
      id: crypto.randomUUID(),
      projectId: "p2",
      name: "教学楼基础验槽",
      discipline: "土建",
      owner: "施工总承包",
      planned: "2026-05-09",
      actual: "2026-05-07",
      progress: 100,
      note: "已完成，资料同步归档。"
    }
  ],
  issues: [
    {
      id: crypto.randomUUID(),
      projectId: "p1",
      title: "钢筋班组人数不足影响地下室封顶",
      owner: "总包一标段",
      deadline: "2026-05-09",
      severity: "紧急",
      status: "未闭合",
      action: "5 月 8 日前补足作业人员，提交夜间施工计划和材料保障清单。"
    },
    {
      id: crypto.randomUUID(),
      projectId: "p1",
      title: "机电深化图纸滞后",
      owner: "机电分包",
      deadline: "2026-05-11",
      severity: "重要",
      status: "跟踪中",
      action: "组织专题协调会，明确各专业碰撞问题关闭责任人。"
    }
  ],
  diaries: [
    {
      id: crypto.randomUUID(),
      projectId: "p1",
      date: "2026-05-07",
      weather: "晴，现场劳动力 126 人，塔吊 2 台正常",
      content: "地下室 B 区墙柱钢筋绑扎完成约 70%。监理要求施工单位增加夜间作业照明并完善隐蔽验收资料。"
    }
  ],
  meetings: [
    {
      id: crypto.randomUUID(),
      projectId: "p1",
      date: "2026-05-06",
      type: "周例会",
      summary: "总包承诺 5 月 10 日完成地下室结构封顶；机电单位 5 月 9 日提交综合支架深化成果；业主协调临电增容。"
    }
  ]
};

const FLOOR_DEMO_SOURCE = "floor-demo-v2";

function createFloorDemoTasks(projectId = "p1") {
  const buildings = [
    { name: "A1", floors: 6 },
    { name: "A2", floors: 4 },
    { name: "B1", floors: 11 },
    { name: "B2", floors: 11 },
    { name: "B3", floors: 11 },
    { name: "B4", floors: 11 },
    { name: "B5", floors: 6 }
  ];
  const units = [
    {
      discipline: "\u673a\u7535",
      owner: "\u673a\u7535\u5355\u4f4d",
      systems: [
        "\u5ba4\u5185\u7ed9\u6c34\u7cfb\u7edf",
        "\u70ed\u6c34\u7cfb\u7edf",
        "\u5ba4\u5185\u6392\u6c34\u7cfb\u7edf",
        "\u5efa\u7b51\u4e2d\u6c34\u7cfb\u7edf",
        "\u6c34\u7cfb\u7edf\u672b\u7aef\u8bbe\u5907\u5b89\u88c5",
        "\u7a7a\u8c03\u98ce\u7ba1\u5b89\u88c5",
        "\u7a7a\u8c03\u8bbe\u5907\u5b89\u88c5"
      ]
    },
    {
      discipline: "\u6d88\u9632",
      owner: "\u6d88\u9632\u5355\u4f4d",
      systems: [
        "\u55b7\u6dcb\u7cfb\u7edf",
        "\u6d88\u706b\u6813\u7cfb\u7edf",
        "\u81ea\u52a8\u8ddf\u8e2a\u706d\u706b\u7cfb\u7edf",
        "\u6865\u67b6\u6577\u8bbe",
        "\u7535\u7f06\u6577\u8bbe",
        "\u5bfc\u7ba1\u5185\u7a7f\u7ebf",
        "\u7535\u6c14\u672b\u7aef\u5b89\u88c5",
        "\u9632\u6392\u70df\u98ce\u7ba1\u5b89\u88c5"
      ]
    },
    {
      discipline: "\u667a\u80fd\u5316",
      owner: "\u667a\u80fd\u5316\u5355\u4f4d",
      systems: [
        "\u667a\u80fd\u5316\u6865\u67b6\u6577\u8bbe",
        "\u667a\u80fd\u5316\u7ebf\u7f06\u6577\u8bbe",
        "\u5bfc\u7ba1\u5185\u7a7f\u7ebf",
        "\u667a\u80fd\u5316\u672b\u7aef\u8bbe\u5907\u5b89\u88c5"
      ]
    },
    {
      discipline: "\u7535\u68af",
      owner: "\u7535\u68af\u5355\u4f4d",
      systems: ["\u8bbe\u5907\u5b89\u88c5"]
    }
  ];
  const tasks = [];
  buildings.forEach((building, buildingIndex) => {
    for (let floor = 1; floor <= building.floors; floor += 1) {
      units.forEach((unit, unitIndex) => {
        const system = unit.systems[(floor + buildingIndex + unitIndex) % unit.systems.length];
        const base = 108 - floor * 7 - buildingIndex * 4 - unitIndex * 10;
        const wave = ((buildingIndex + 1) * (floor + unitIndex + 2)) % 19;
        const progress = clampProgress(base + wave);
        const plannedDay = String(Math.min(28, 3 + floor + buildingIndex + unitIndex * 2)).padStart(2, "0");
        const actual = progress >= 100 ? `2026-05-${String(Math.max(1, Number(plannedDay) - 1)).padStart(2, "0")}` : "";
        const floorLabel = `${floor}\u5c42`;
        tasks.push({
          id: crypto.randomUUID(),
          projectId,
          name: `${building.name}${floorLabel}${system}`,
          discipline: unit.discipline,
          owner: unit.owner,
          building: `${building.name}\uff08${building.floors}\u5c42\uff09`,
          floor: floorLabel,
          system,
          planned: `2026-05-${plannedDay}`,
          actual,
          progress,
          plannedProgress: floor <= 3 ? 100 : floor <= 7 ? 80 : 55,
          evidence: `demo://${building.name}/${floor}/${unit.discipline}`,
          note: buildFloorDemoNote(progress, unit.discipline, system),
          source: FLOOR_DEMO_SOURCE
        });
      });
    }
  });

  [
    ["\u673a\u7535", "\u673a\u7535\u5355\u4f4d", "\u5ba4\u5185\u7ed9\u6c34\u7cfb\u7edf", 82],
    ["\u6d88\u9632", "\u6d88\u9632\u5355\u4f4d", "\u55b7\u6dcb\u7cfb\u7edf", 76],
    ["\u667a\u80fd\u5316", "\u667a\u80fd\u5316\u5355\u4f4d", "\u667a\u80fd\u5316\u7ebf\u7f06\u6577\u8bbe", 58],
    ["\u7535\u68af", "\u7535\u68af\u5355\u4f4d", "\u8bbe\u5907\u5b89\u88c5", 34]
  ].forEach(([discipline, owner, system, progress], index) => {
    tasks.push({
      id: crypto.randomUUID(),
      projectId,
      name: `\u5730\u4e0b\u5ba4${system}`,
      discipline,
      owner,
      building: "\u5730\u4e0b\u5ba4\u4e00\u5c42",
      floor: "\u5730\u4e0b\u5ba4",
      system,
      planned: `2026-05-${String(8 + index * 3).padStart(2, "0")}`,
      actual: progress >= 100 ? "2026-05-07" : "",
      progress,
      plannedProgress: index < 2 ? 90 : 70,
      evidence: `demo://basement/${discipline}`,
      note: buildFloorDemoNote(progress, discipline, system),
      source: FLOOR_DEMO_SOURCE
    });
  });

  return tasks;
}

function buildFloorDemoNote(progress, discipline, system) {
  if (progress >= 100) return `${discipline}${system}\u5df2\u5b8c\u6210\uff0c\u5f85\u76d1\u7406\u590d\u6838\u5f52\u6863\u3002`;
  if (progress >= 70) return `${discipline}${system}\u57fa\u672c\u6210\u578b\uff0c\u8bf7\u8ddf\u8fdb\u9690\u853d\u9a8c\u6536\u548c\u5f71\u50cf\u8d44\u6599\u3002`;
  if (progress >= 35) return `${discipline}${system}\u6b63\u5728\u65bd\u5de5\uff0c\u9700\u534f\u8c03\u7a7f\u63d2\u4f5c\u4e1a\u9762\u3002`;
  return `${discipline}${system}\u8fdb\u5ea6\u504f\u6162\uff0c\u8981\u6c42\u8d23\u4efb\u5355\u4f4d\u8865\u5145\u8d44\u6e90\u3002`;
}

function mergeFloorDemoTasks(nextState) {
  const currentTasks = nextState.tasks || [];
  const demoTasks = createFloorDemoTasks("p1");
  const hasEnoughFloorDemo = currentTasks.filter((task) => task.source === FLOOR_DEMO_SOURCE).length >= 40;
  if (hasEnoughFloorDemo) return currentTasks;
  const existingKeys = new Set(currentTasks.map(taskKey));
  const additions = demoTasks.filter((task) => !existingKeys.has(taskKey(task)));
  return [...currentTasks, ...additions];
}

let state = loadState();

const els = {
  pageTitle: document.querySelector("#pageTitle"),
  projectFilter: document.querySelector("#projectFilter"),
  overallProgress: document.querySelector("#overallProgress"),
  progressTrend: document.querySelector("#progressTrend"),
  delayedCount: document.querySelector("#delayedCount"),
  dueSoonCount: document.querySelector("#dueSoonCount"),
  openIssueCount: document.querySelector("#openIssueCount"),
  warningList: document.querySelector("#warningList"),
  taskTable: document.querySelector("#taskTable"),
  taskCount: document.querySelector("#taskCount"),
  taskBuildingSelect: document.querySelector("#taskBuildingSelect"),
  taskSystemSelect: document.querySelector("#taskSystemSelect"),
  excelInput: document.querySelector("#excelInput"),
  importResult: document.querySelector("#importResult"),
  importValidationReport: document.querySelector("#importValidationReport"),
  downloadTemplateBtn: document.querySelector("#downloadTemplateBtn"),
  saveBaselineBtn: document.querySelector("#saveBaselineBtn"),
  exportDelayBtn: document.querySelector("#exportDelayBtn"),
  exportTasksBtn: document.querySelector("#exportTasksBtn"),
  importDiffPanel: document.querySelector("#importDiffPanel"),
  baselinePanel: document.querySelector("#baselinePanel"),
  issueBoard: document.querySelector("#issueBoard"),
  diaryList: document.querySelector("#diaryList"),
  diaryCount: document.querySelector("#diaryCount"),
  diaryBuildingSelect: document.querySelector("#diaryBuildingSelect"),
  diarySystemSelect: document.querySelector("#diarySystemSelect"),
  meetingList: document.querySelector("#meetingList"),
  buildingGrid: document.querySelector("#buildingGrid"),
  buildingModel: document.querySelector("#buildingModel"),
  modelDetail: document.querySelector("#modelDetail"),
  modelSummary: document.querySelector("#modelSummary"),
  modelBuildingFilter: document.querySelector("#modelBuildingFilter"),
  modelUnitFilter: document.querySelector("#modelUnitFilter"),
  modelSystemFilter: document.querySelector("#modelSystemFilter"),
  modelStatusFilter: document.querySelector("#modelStatusFilter"),
  modelAutoRotateBtn: document.querySelector("#modelAutoRotateBtn"),
  modelResetFilterBtn: document.querySelector("#modelResetFilterBtn"),
  modelTooltip: document.querySelector("#modelTooltip"),
  disciplineLegend: document.querySelector("#disciplineLegend"),
  scopeUnitGrid: document.querySelector("#scopeUnitGrid"),
  scopeSummary: document.querySelector("#scopeSummary"),
  deviationSummary: document.querySelector("#deviationSummary"),
  deviationList: document.querySelector("#deviationList"),
  dependencyList: document.querySelector("#dependencyList"),
  unitRanking: document.querySelector("#unitRanking"),
  generateWeeklyBtn: document.querySelector("#generateWeeklyBtn"),
  copyWeeklyBtn: document.querySelector("#copyWeeklyBtn"),
  carouselBtn: document.querySelector("#carouselBtn"),
  weeklyReportOutput: document.querySelector("#weeklyReportOutput"),
  weeklySummary: document.querySelector("#weeklySummary"),
  inspectionGrid: document.querySelector("#inspectionGrid"),
  basementSummary: document.querySelector("#basementSummary"),
  basementCutaway: document.querySelector("#basementCutaway"),
  chart: document.querySelector("#progressChart")
};

let modelState = null;
let selectedBuildingName = "";
let selectedModelFloor = "";
let lastImportFocus = null;

Object.assign(els, {
  screenProjectName: document.querySelector("#screenProjectName"),
  missionStatus: document.querySelector("#missionStatus"),
  screenProgress: document.querySelector("#screenProgress"),
  screenCriticalTask: document.querySelector("#screenCriticalTask"),
  screenCriticalMeta: document.querySelector("#screenCriticalMeta"),
  screenCommand: document.querySelector("#screenCommand"),
  screenCommandMeta: document.querySelector("#screenCommandMeta"),
  screenScope: document.querySelector("#screenScope"),
  screenScopeMeta: document.querySelector("#screenScopeMeta")
});

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => switchView(button.dataset.view));
});

document.querySelector('select[name="discipline"]').addEventListener("change", renderTaskScopeFields);
els.excelInput.addEventListener("change", importProgressExcel);
els.downloadTemplateBtn.addEventListener("click", downloadExcelTemplate);
els.saveBaselineBtn?.addEventListener("click", savePlanBaseline);
els.exportDelayBtn?.addEventListener("click", () => exportCsv("滞后清单.csv", buildDelayExportRows()));
els.exportTasksBtn?.addEventListener("click", () => exportCsv("节点台账.csv", buildTaskExportRows(currentProjectItems("tasks"))));
[
  els.modelBuildingFilter,
  els.modelUnitFilter,
  els.modelSystemFilter,
  els.modelStatusFilter
].forEach((select) => {
  select?.addEventListener("change", () => {
    if (select === els.modelBuildingFilter) {
      selectedBuildingName = select.value;
      selectedModelFloor = "";
    }
    renderProjectScope();
  });
});

els.modelResetFilterBtn?.addEventListener("click", () => {
  [els.modelBuildingFilter, els.modelUnitFilter, els.modelSystemFilter, els.modelStatusFilter].forEach((select) => {
    if (select) select.value = "all";
  });
  selectedBuildingName = "";
  selectedModelFloor = "";
  lastImportFocus = null;
  renderProjectScope();
});

els.modelAutoRotateBtn?.addEventListener("click", () => {
  if (!modelState?.isCanvasModel) initCanvasBuildingModel();
  modelState.autoRotate = !modelState.autoRotate;
  updateAutoRotateButton();
  if (modelState.autoRotate) runCanvasModelLoop();
});

document.querySelectorAll("[data-model-view]").forEach((button) => {
  button.addEventListener("click", () => {
    setModelView(button.dataset.modelView);
  });
});

els.generateWeeklyBtn?.addEventListener("click", () => {
  els.weeklyReportOutput.value = generateWeeklyReport();
});

els.copyWeeklyBtn?.addEventListener("click", async () => {
  if (!els.weeklyReportOutput.value) els.weeklyReportOutput.value = generateWeeklyReport();
  await navigator.clipboard?.writeText(els.weeklyReportOutput.value);
  els.weeklySummary.textContent = "周报已复制";
});

els.carouselBtn?.addEventListener("click", () => {
  document.body.classList.toggle("carousel-mode");
  els.carouselBtn.textContent = document.body.classList.contains("carousel-mode") ? "退出轮播" : "中控轮播";
  if (document.body.classList.contains("carousel-mode")) startDashboardCarousel();
});

els.projectFilter.addEventListener("change", (event) => {
  state.selectedProjectId = event.target.value;
  selectedBuildingName = "";
  selectedModelFloor = "";
  lastImportFocus = null;
  saveState();
  render();
});

document.querySelector("#resetDemoBtn").addEventListener("click", () => {
  state = migrateState(structuredClone(demoState));
  saveState();
  render();
});

document.querySelector("#taskForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.tasks.push({
    id: crypto.randomUUID(),
    projectId: state.selectedProjectId,
    ...data,
    progress: Number(data.progress || 0)
  });
  event.target.reset();
  saveState();
  render();
});

document.querySelector("#issueForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.issues.push({
    id: crypto.randomUUID(),
    projectId: state.selectedProjectId,
    status: "未整改",
    category: classifyDelayReason(`${data.title || ""}${data.action || ""}`),
    ...data
  });
  event.target.reset();
  saveState();
  render();
});

document.querySelector("#diaryForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.diaries.unshift({
    id: crypto.randomUUID(),
    projectId: state.selectedProjectId,
    ...data
  });
  event.target.reset();
  setDefaultDates();
  saveState();
  render();
});

document.querySelector("#meetingForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target));
  state.meetings.unshift({
    id: crypto.randomUUID(),
    projectId: state.selectedProjectId,
    ...data
  });
  event.target.reset();
  setDefaultDates();
  saveState();
  render();
});

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const parsed = saved ? JSON.parse(saved) : structuredClone(demoState);
  return migrateState(parsed);
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeIssueStatus(status) {
  if (status === "已闭合") return "已闭合";
  if (status === "跟踪中") return "整改中";
  if (status === "待复验") return "待复验";
  if (status === "整改中") return "整改中";
  return "未整改";
}

function nextIssueStatus(status) {
  const flow = ["未整改", "整改中", "待复验", "已闭合"];
  const index = flow.indexOf(normalizeIssueStatus(status));
  return flow[(index + 1) % flow.length];
}

function classifyDelayReason(text) {
  const value = String(text || "");
  if (/材料|进场|报验/.test(value)) return "材料";
  if (/人|劳动力|班组|资源/.test(value)) return "劳动力";
  if (/图纸|深化|设计|碰撞/.test(value)) return "图纸";
  if (/穿插|交叉|作业面|协调/.test(value)) return "穿插";
  if (/验收|资料|隐蔽|影像/.test(value)) return "验收资料";
  return "综合";
}

function currentProjectItems(key) {
  return state[key].filter((item) => item.projectId === state.selectedProjectId);
}

function currentProjectScope() {
  return state.projectScopes?.[state.selectedProjectId] || { basement: "", buildings: [], units: [] };
}

function migrateState(nextState) {
  nextState.projectScopes = {
    ...structuredClone(demoState.projectScopes),
    ...(nextState.projectScopes || {})
  };
  nextState.importHistory = nextState.importHistory || [];
  nextState.planBaselines = nextState.planBaselines || [];
  nextState.tasks = mergeFloorDemoTasks(nextState);
  nextState.tasks = (nextState.tasks || []).map((task) => ({
    plannedProgress: expectedProgress({ planned: task.planned, actual: task.actual }),
    evidence: "",
    ...task
  }));
  nextState.issues = (nextState.issues || []).map((issue) => ({
    category: classifyDelayReason(issue.action || issue.title || ""),
    ...issue,
    status: normalizeIssueStatus(issue.status)
  }));
  nextState.diaries = nextState.diaries || [];
  nextState.meetings = nextState.meetings || [];
  return nextState;
}

async function importProgressExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!window.XLSX) {
    els.importResult.textContent = "Excel 解析库未加载成功，请确认当前网络可访问 jsdelivr 后重试。";
    event.target.value = "";
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
    const validation = validateImportRows(rows);
    const result = applyImportedRows(validation.validRows);
    lastImportFocus = result.changed[0] || null;
    if (lastImportFocus) {
      state.selectedProjectId = lastImportFocus.projectId;
      selectedBuildingName = lastImportFocus.buildingName;
      selectedModelFloor = lastImportFocus.floorLabel;
    }
    recordImportHistory(result, file.name);
    saveState();
    render();
    els.importResult.textContent = `已导入 ${rows.length} 行：成功 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行；新增 ${result.created} 个节点，更新 ${result.updated} 个节点。`;
    renderImportValidation(validation);
    renderImportDiff(result);
  } catch (error) {
    els.importResult.textContent = `导入失败：${error.message || "请检查表头和文件格式"}`;
  } finally {
    event.target.value = "";
  }
}

function validateImportRows(rows) {
  const scope = currentProjectScope();
  const knownBuildings = scope.buildings.map((building) => building.name);
  const knownSystems = scope.units.flatMap((unit) => unit.systems);
  const validRows = [];
  const invalidRows = [];
  const warnings = [];

  rows.forEach((row, index) => {
    const normalized = normalizeImportRow(row);
    const rowNumber = index + 2;
    const problems = [];
    if (!normalized.building) problems.push("缺少施工部位");
    if (!normalized.floor) problems.push("缺少楼层");
    if (!normalized.system && !normalized.name) problems.push("缺少施工内容或节点名称");
    if (normalized.progress && Number.isNaN(Number(String(normalized.progress).replace("%", "")))) problems.push("完成率不是数字");

    const buildingMatched = normalized.building.includes("地下")
      || knownBuildings.some((building) => normalized.building.includes(building));
    if (normalized.building && !buildingMatched) warnings.push(`第 ${rowNumber} 行：楼栋未在项目范围内，已自动补充或待复核`);
    if (normalized.system && knownSystems.length && !knownSystems.includes(normalized.system)) {
      warnings.push(`第 ${rowNumber} 行：施工内容“${normalized.system}”不在既有清单中`);
    }

    if (problems.length) invalidRows.push({ rowNumber, problems, normalized });
    else validRows.push(row);
  });

  return { validRows, invalidRows, warnings };
}

function renderImportValidation(validation) {
  if (!els.importValidationReport) return;
  const issueHtml = [
    ...validation.invalidRows.map((item) => `<li class="danger">第 ${item.rowNumber} 行：${escapeHtml(item.problems.join("、"))}</li>`),
    ...validation.warnings.map((item) => `<li>${escapeHtml(item)}</li>`)
  ].join("");
  els.importValidationReport.innerHTML = `
    <strong>导入校验报告</strong>
    <p>成功 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行，提示 ${validation.warnings.length} 条。</p>
    <ul>${issueHtml || "<li>未发现字段缺失或范围异常。</li>"}</ul>
  `;
}

function recordImportHistory(result, fileName) {
  state.importHistory = state.importHistory || [];
  const locations = [...new Set(result.changed.map((item) => `${item.buildingName}|${item.floorLabel}`))];
  state.importHistory.unshift({
    id: crypto.randomUUID(),
    projectId: state.selectedProjectId,
    fileName,
    time: new Date().toISOString(),
    created: result.created,
    updated: result.updated,
    scopeAdded: result.scopeAdded,
    locations: locations.slice(0, 30)
  });
  state.importHistory = state.importHistory.slice(0, 12);
}

function renderImportDiff(result) {
  if (!els.importDiffPanel) return;
  const locations = [...new Set(result.changed.map((item) => `${item.buildingName}｜${item.floorLabel}`))].slice(0, 12);
  els.importDiffPanel.innerHTML = `
    <strong>本次导入变化</strong>
    <p>新增 ${result.created} 项｜更新 ${result.updated} 项｜范围补充 ${result.scopeAdded} 项</p>
    <div class="diff-tags">
      ${locations.length ? locations.map((item) => `<button type="button" data-focus-location="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("") : "<span>暂无变化楼层</span>"}
    </div>
  `;
  els.importDiffPanel.querySelectorAll("[data-focus-location]").forEach((button) => {
    button.addEventListener("click", () => {
      const [buildingName, floorLabel] = button.dataset.focusLocation.split("｜");
      selectedBuildingName = buildingName;
      selectedModelFloor = floorLabel;
      switchView("scope");
      renderProjectScope();
    });
  });
}

function applyImportedRows(rows) {
  const result = { created: 0, updated: 0, scopeAdded: 0, changed: [] };
  rows.forEach((row) => {
    const normalized = normalizeImportRow(row);
    if (!normalized.name && !normalized.system) return;

    const project = findOrCreateProject(normalized.projectName || currentProjectName());
    const scope = ensureProjectScope(project.id);
    result.scopeAdded += ensureScopeItems(scope, normalized);

    const importedTask = {
      id: crypto.randomUUID(),
      projectId: project.id,
      name: normalized.name || `${normalized.building} ${normalized.system}`,
      discipline: normalized.discipline || inferDiscipline(normalized.owner, normalized.system),
      owner: normalized.owner || normalized.discipline || "未填责任单位",
      building: normalized.building,
      floor: normalized.floor,
      system: normalized.system,
      planned: normalized.planned || localDateText(today),
      actual: normalized.actual,
      progress: clampProgress(normalized.progress),
      note: normalized.note,
      evidence: normalized.evidence,
      plannedProgress: clampProgress(normalized.plannedProgress || expectedProgress({ planned: normalized.planned || localDateText(today) }))
    };

    const existing = state.tasks.find((task) => taskKey(task) === taskKey(importedTask));
    if (existing) {
      Object.assign(existing, importedTask, { id: existing.id });
      result.updated += 1;
    } else {
      state.tasks.push(importedTask);
      result.created += 1;
    }
    result.changed.push({
      projectId: project.id,
      buildingName: resolveBuildingName(normalized.building),
      floorLabel: normalized.building.includes("地下") || normalized.floor.includes("地下")
        ? "地下室"
        : `${parseFloorNumber(normalized.floor) || 1}层`
    });
  });
  return result;
}

function normalizeImportRow(row) {
  return {
    projectName: pickCell(row, ["项目", "项目名称", "工程名称"]),
    building: pickCell(row, ["施工部位", "部位", "楼栋", "楼号", "单体"]),
    floor: pickCell(row, ["楼层", "层数", "施工楼层"]),
    discipline: pickCell(row, ["专业", "专业/分部", "分部", "单位类型"]),
    owner: pickCell(row, ["责任单位", "施工单位", "单位", "参建单位"]),
    system: pickCell(row, ["施工内容", "系统", "系统名称", "工作内容"]),
    name: pickCell(row, ["节点名称", "节点", "任务名称", "进度节点"]),
    planned: normalizeDate(pickCell(row, ["计划完成", "计划完成日期", "计划日期", "计划时间"])),
    actual: normalizeDate(pickCell(row, ["实际完成", "实际完成日期", "实际日期", "完成日期"])),
    progress: pickCell(row, ["完成率", "进度", "实际进度", "完成百分比"]),
    note: pickCell(row, ["监理意见", "备注", "说明", "偏差原因"])
    ,
    evidence: pickCell(row, ["照片", "照片链接", "影像资料", "验收资料"]),
    plannedProgress: pickCell(row, ["计划完成率", "计划进度"])
  };
}

function pickCell(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => candidate.trim() === name);
    if (key && String(row[key]).trim()) return String(row[key]).trim();
  }
  return "";
}

function normalizeDate(value) {
  if (!value) return "";
  const text = String(value).trim();
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return localDateText(date);
  const match = text.match(/(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})/);
  if (!match) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function clampProgress(value) {
  const parsed = Number(String(value || "0").replace("%", ""));
  if (Number.isNaN(parsed)) return 0;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function taskKey(task) {
  return [task.projectId, task.building || "", task.floor || "", task.system || "", task.name || ""]
    .map((part) => String(part).trim())
    .join("|");
}

function currentProjectName() {
  return state.projects.find((project) => project.id === state.selectedProjectId)?.name || "未命名项目";
}

function findOrCreateProject(name) {
  const existing = state.projects.find((project) => project.name === name);
  if (existing) return existing;
  const project = { id: `p-${Date.now()}-${state.projects.length}`, name };
  state.projects.push(project);
  state.projectScopes[project.id] = { basement: "", buildings: [], units: [] };
  return project;
}

function ensureProjectScope(projectId) {
  if (!state.projectScopes[projectId]) {
    state.projectScopes[projectId] = { basement: "", buildings: [], units: [] };
  }
  return state.projectScopes[projectId];
}

function ensureScopeItems(scope, imported) {
  let added = 0;
  if (imported.building) {
    if (imported.building.includes("地下")) {
      if (!scope.basement) {
        scope.basement = imported.building;
        added += 1;
      }
    } else if (!scope.buildings.some((building) => imported.building.includes(building.name))) {
      scope.buildings.push(parseBuilding(imported.building));
      added += 1;
    }
  }

  const discipline = imported.discipline || inferDiscipline(imported.owner, imported.system);
  const unitName = discipline.includes("单位") ? discipline : `${discipline || "其他"}单位`;
  let unit = scope.units.find((item) => item.name === unitName || item.name.includes(discipline));
  if (!unit) {
    unit = { name: unitName, code: unitCode(unitName), systems: [] };
    scope.units.push(unit);
    added += 1;
  }
  if (imported.system && !unit.systems.includes(imported.system)) {
    unit.systems.push(imported.system);
    added += 1;
  }
  return added;
}

function parseBuilding(value) {
  const text = String(value);
  const floorMatch = text.match(/(\d+)\s*层/);
  const name = text.replace(/[（(]?\d+\s*层[）)]?/g, "").trim();
  return { name: name || text, floors: floorMatch ? Number(floorMatch[1]) : 1 };
}

function inferDiscipline(owner, system) {
  const text = `${owner || ""}${system || ""}`;
  if (text.includes("消防") || text.includes("喷淋") || text.includes("消火栓") || text.includes("防排烟")) return "消防";
  if (text.includes("智能") || text.includes("线缆")) return "智能化";
  if (text.includes("电梯")) return "电梯";
  if (text.includes("机电") || text.includes("空调") || text.includes("给水") || text.includes("排水") || text.includes("热水")) return "机电";
  return "其他";
}

function unitCode(name) {
  if (name.includes("机电")) return "MEP";
  if (name.includes("消防")) return "FIRE";
  if (name.includes("智能")) return "IBMS";
  if (name.includes("电梯")) return "LIFT";
  return "UNIT";
}

function downloadExcelTemplate() {
  const headers = ["项目", "施工部位", "楼层", "专业", "责任单位", "施工内容", "节点名称", "计划完成", "实际完成", "计划完成率", "完成率", "监理意见", "照片链接", "验收资料"];
  const examples = [
    ["城东综合体一期", "A1（6层）", "3层", "机电", "机电单位", "室内给水系统", "A1 3层室内给水系统安装", "2026-05-20", "", "60", "35", "按楼层推进，关注材料进场", "现场照片-001", "隐蔽验收记录-001"],
    ["城东综合体一期", "地下室一层", "地下1层", "消防", "消防单位", "喷淋系统", "地下室喷淋主管安装", "2026-05-18", "", "80", "60", "需与机电桥架综合排布", "地下喷淋-照片", "消防验收资料"]
  ];
  const csv = [headers, ...examples]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "进度导入模板.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function savePlanBaseline() {
  const tasks = currentProjectItems("tasks");
  const baseline = {
    id: crypto.randomUUID(),
    projectId: state.selectedProjectId,
    name: `计划基线 ${localDateText(today)}`,
    createdAt: new Date().toISOString(),
    taskCount: tasks.length,
    overall: tasks.length ? averageProgress(tasks) : 0,
    delayed: tasks.filter((task) => getTaskStatus(task).className === "delay").length,
    dueSoon: tasks.filter((task) => getTaskStatus(task).className === "risk").length,
    items: tasks.map((task) => ({
      key: taskKey(task),
      planned: task.planned,
      plannedProgress: expectedProgress(task),
      progress: Number(task.progress || 0)
    }))
  };
  state.planBaselines = [baseline, ...(state.planBaselines || [])].slice(0, 8);
  saveState();
  renderBaselinePanel();
}

function renderBaselinePanel() {
  if (!els.baselinePanel) return;
  const baselines = (state.planBaselines || []).filter((item) => item.projectId === state.selectedProjectId);
  const latest = baselines[0];
  const currentTasks = currentProjectItems("tasks");
  const currentOverall = currentTasks.length ? averageProgress(currentTasks) : 0;
  const content = latest
    ? `
      <article>
        <strong>${escapeHtml(latest.name)}</strong>
        <small>${latest.taskCount} 项｜基线 ${latest.overall}%｜当前 ${currentOverall}%｜偏差 ${currentOverall - latest.overall}%</small>
      </article>
      ${baselines.slice(1, 4).map((item) => `<article><strong>${escapeHtml(item.name)}</strong><small>${item.taskCount} 项｜${item.overall}%｜${new Date(item.createdAt).toLocaleString()}</small></article>`).join("")}
    `
    : `<article><strong>暂无计划基线</strong><small>导入或调整计划后，可保存一次基线用于后续对比。</small></article>`;
  els.baselinePanel.innerHTML = `<strong>计划基线管理</strong><div>${content}</div>`;
}

function buildTaskExportRows(tasks) {
  return tasks.map((task) => ({
    项目: currentProjectName(),
    施工部位: task.building || "",
    楼层: task.floor || "",
    专业: task.discipline || "",
    责任单位: task.owner || "",
    施工内容: task.system || "",
    节点名称: task.name || "",
    计划完成: task.planned || "",
    实际完成: task.actual || "",
    计划完成率: expectedProgress(task),
    完成率: task.progress || 0,
    状态: getTaskStatus(task).label,
    滞后原因: classifyDelayReason(`${task.note || ""}${task.name || ""}`),
    监理意见: task.note || "",
    资料: task.evidence || task.photo || ""
  }));
}

function buildDelayExportRows() {
  return buildTaskExportRows(currentProjectItems("tasks").filter((task) => getTaskStatus(task).className === "delay"));
}

function exportCsv(fileName, rows) {
  const data = rows.length ? rows : [{ 提示: "当前筛选条件下暂无数据" }];
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(","),
    ...data.map((row) => headers.map((header) => csvCell(row[header])).join(","))
  ].join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "").replace(/"/g, '""');
  return `"${text}"`;
}

function daysBetween(dateText) {
  const target = new Date(`${dateText}T00:00:00`);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.ceil((target - startOfToday) / 86400000);
}

function getTaskStatus(task) {
  if (task.actual || Number(task.progress) >= 100) return { label: "已完成", className: "done" };
  const delta = daysBetween(task.planned);
  if (delta < 0) return { label: "已滞后", className: "delay" };
  if (delta <= 7) return { label: "临期", className: "risk" };
  return { label: "正常", className: "normal" };
}

function switchView(view) {
  const titles = {
    dashboard: "总览",
    scope: "项目部位",
    schedule: "计划节点",
    issues: "滞后与整改",
    diary: "监理日志",
    meetings: "会议纪要"
  };
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.pageTitle.textContent = titles[view];
}

function renderProjectFilter() {
  els.projectFilter.innerHTML = state.projects
    .map((project) => `<option value="${project.id}">${project.name}</option>`)
    .join("");
  els.projectFilter.value = state.selectedProjectId;
  renderTaskScopeFields();
}

function renderTaskScopeFields() {
  const scope = currentProjectScope();
  const discipline = document.querySelector('select[name="discipline"]').value;
  const matchedUnit = scope.units.find((unit) => unit.name.includes(discipline));
  const systems = matchedUnit
    ? matchedUnit.systems
    : scope.units.flatMap((unit) => unit.systems);

  els.taskBuildingSelect.innerHTML = [
    ...scope.buildings.map((building) => `${building.name}（${building.floors}层）`),
    scope.basement
  ]
    .filter(Boolean)
    .map((label) => `<option>${escapeHtml(label)}</option>`)
    .join("");

  els.taskSystemSelect.innerHTML = systems.length
    ? systems.map((system) => `<option>${escapeHtml(system)}</option>`).join("")
    : `<option>未设置施工内容</option>`;
}

function renderDiaryScopeFields() {
  if (!els.diaryBuildingSelect || !els.diarySystemSelect) return;
  const scope = currentProjectScope();
  const buildings = [
    ...scope.buildings.map((building) => `${building.name}（${building.floors}层）`),
    scope.basement
  ].filter(Boolean);
  els.diaryBuildingSelect.innerHTML = buildings.map((label) => `<option>${escapeHtml(label)}</option>`).join("");
  const systems = [...new Set(scope.units.flatMap((unit) => unit.systems))];
  els.diarySystemSelect.innerHTML = systems.map((system) => `<option>${escapeHtml(system)}</option>`).join("");
}

function renderDashboard() {
  const tasks = currentProjectItems("tasks");
  const issues = currentProjectItems("issues");
  const statuses = tasks.map(getTaskStatus);
  const overall = tasks.length
    ? Math.round(tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length)
    : 0;
  const delayed = statuses.filter((status) => status.className === "delay").length;
  const dueSoon = statuses.filter((status) => status.className === "risk").length;
  const openIssues = issues.filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合").length;

  els.overallProgress.textContent = `${overall}%`;
  els.progressTrend.textContent = overall >= 85 ? "整体接近计划" : "需关注关键线路";
  els.delayedCount.textContent = delayed;
  els.dueSoonCount.textContent = dueSoon;
  els.openIssueCount.textContent = openIssues;
  renderCommandScreen(tasks, issues, { overall, delayed, dueSoon, openIssues });

  const warnings = [
    ...tasks
      .filter((task) => ["delay", "risk"].includes(getTaskStatus(task).className))
      .map((task) => ({
        title: task.name,
        meta: `${task.owner}，计划 ${task.planned}，完成率 ${task.progress}%`,
        danger: getTaskStatus(task).className === "delay"
      })),
    ...issues
      .filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合")
      .map((issue) => ({
        title: issue.title,
        meta: `${issue.owner}，要求 ${issue.deadline} 前闭合`,
        danger: issue.severity === "紧急"
      }))
  ];

  els.warningList.innerHTML = warnings.length
    ? warnings
        .map(
          (warning) => `
            <div class="warning-item ${warning.danger ? "danger" : ""}">
              <strong>${escapeHtml(warning.title)}</strong>
              <small>${escapeHtml(warning.meta)}</small>
            </div>
          `
        )
        .join("")
    : `<div class="warning-item"><strong>暂无预警</strong><small>当前项目没有滞后或临期事项</small></div>`;

  drawChart(tasks);
  renderOperationsDashboard(tasks);
}

function renderOperationsDashboard(tasks) {
  renderDeviationPanel(tasks);
  renderDependencyPanel(tasks);
  renderUnitRanking(tasks);
  if (els.weeklyReportOutput && !els.weeklyReportOutput.value) {
    els.weeklyReportOutput.value = generateWeeklyReport();
  }
}

function renderDeviationPanel(tasks) {
  if (!els.deviationList) return;
  const deviations = tasks
    .map((task) => ({ task, status: getTaskStatus(task), days: daysBetween(task.planned) }))
    .filter((item) => item.status.className === "delay" || item.status.className === "risk" || Number(item.task.progress || 0) < expectedProgress(item.task))
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);
  els.deviationSummary.textContent = `${deviations.length} 项需关注`;
  els.deviationList.innerHTML = deviations.length
    ? deviations.map(({ task, status }) => `
        <article class="ops-item ${status.className}">
          <strong>${escapeHtml(task.building || "-")}｜${escapeHtml(task.floor || "-")}｜${escapeHtml(task.system || task.name)}</strong>
          <small>计划 ${escapeHtml(task.planned)}｜实际 ${escapeHtml(task.actual || "未完成")}｜当前 ${Number(task.progress || 0)}%｜建议 ${expectedProgress(task)}%</small>
        </article>
      `).join("")
    : `<article class="ops-item"><strong>暂无明显偏差</strong><small>当前计划与实际推进基本匹配</small></article>`;
}

function expectedProgress(task) {
  if (task.plannedProgress !== undefined && task.plannedProgress !== "") return Number(task.plannedProgress || 0);
  if (task.actual) return 100;
  const delta = daysBetween(task.planned);
  if (delta < 0) return 100;
  if (delta <= 7) return 80;
  return 40;
}

function renderDependencyPanel(tasks) {
  if (!els.dependencyList) return;
  const risks = buildDependencyRisks(tasks).slice(0, 6);
  els.dependencyList.innerHTML = risks.length
    ? risks.map((risk) => `
        <article class="ops-item ${risk.level}">
          <strong>${escapeHtml(risk.location)}｜${escapeHtml(risk.blocker)}</strong>
          <small>${escapeHtml(risk.message)}</small>
        </article>
      `).join("")
    : `<article class="ops-item"><strong>暂无穿插阻塞</strong><small>当前前置施工内容未发现明显影响项</small></article>`;
}

function buildDependencyRisks(tasks) {
  const rules = [
    { before: "桥架", after: "电缆", message: "桥架未完成会影响电缆敷设" },
    { before: "风管", after: "末端", message: "风管未完成会影响末端设备安装" },
    { before: "导管内穿线", after: "末端", message: "穿线未完成会影响末端设备安装" },
    { before: "喷淋", after: "防排烟", message: "消防水系统滞后需关注防排烟穿插" }
  ];
  const risks = [];
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = `${task.building || ""}|${task.floor || ""}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  grouped.forEach((floorTasks) => {
    rules.forEach((rule) => {
      const before = floorTasks.find((task) => `${task.system || task.name}`.includes(rule.before));
      const after = floorTasks.find((task) => `${task.system || task.name}`.includes(rule.after));
      if (before && Number(before.progress || 0) < 80 && (!after || Number(after.progress || 0) > 0)) {
        risks.push({
          location: `${before.building || "未填部位"}｜${before.floor || "未填楼层"}`,
          blocker: before.system || before.name,
          message: rule.message,
          level: getTaskStatus(before).className === "delay" ? "delay" : "risk"
        });
      }
    });
  });
  return risks;
}

function renderUnitRanking(tasks) {
  if (!els.unitRanking) return;
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = task.owner || task.discipline || "未填单位";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  const ranking = Array.from(grouped.entries())
    .map(([unit, unitTasks]) => ({
      unit,
      progress: averageProgress(unitTasks),
      delayed: unitTasks.filter((task) => getTaskStatus(task).className === "delay").length,
      open: unitTasks.filter((task) => getTaskStatus(task).className !== "done").length
    }))
    .sort((a, b) => b.delayed - a.delayed || a.progress - b.progress)
    .slice(0, 6);
  els.unitRanking.innerHTML = ranking.length
    ? ranking.map((item, index) => `
        <article class="ops-item ${item.delayed ? "delay" : "normal"}">
          <strong>${index + 1}. ${escapeHtml(item.unit)}｜${item.progress}%</strong>
          <small>滞后 ${item.delayed} 项｜未完成 ${item.open} 项</small>
        </article>
      `).join("")
    : `<article class="ops-item"><strong>暂无单位数据</strong><small>录入节点后自动生成排名</small></article>`;
}

function renderCommandScreen(tasks, issues, stats) {
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const sortedRiskTasks = tasks
    .filter((task) => getTaskStatus(task).className !== "done")
    .sort((a, b) => {
      const statusWeight = { delay: 0, risk: 1, normal: 2 };
      return statusWeight[getTaskStatus(a).className] - statusWeight[getTaskStatus(b).className]
        || a.planned.localeCompare(b.planned);
    });
  const criticalTask = sortedRiskTasks[0];
  const urgentIssue = issues.find((issue) => normalizeIssueStatus(issue.status) !== "已闭合" && issue.severity === "紧急");

  els.screenProjectName.textContent = project ? `${project.name}｜中控大屏` : "项目中控大屏";
  els.screenProgress.textContent = `${stats.overall}%`;
  els.screenCriticalTask.textContent = criticalTask ? criticalTask.name : "暂无风险节点";
  els.screenCriticalMeta.textContent = criticalTask
    ? `${criticalTask.owner}｜计划 ${criticalTask.planned}｜完成率 ${criticalTask.progress}%`
    : "当前任务推进平稳";

  if (stats.delayed > 0) {
    els.missionStatus.textContent = "偏差警戒";
    els.screenCommand.textContent = "启动纠偏";
    els.screenCommandMeta.textContent = urgentIssue
      ? urgentIssue.action
      : "要求责任单位提交赶工计划，监理复核资源投入。";
  } else if (stats.dueSoon > 0 || stats.openIssues > 0) {
    els.missionStatus.textContent = "重点盯防";
    els.screenCommand.textContent = "锁定临期";
    els.screenCommandMeta.textContent = "跟踪 7 天内到期节点，会议纪要形成闭环事项。";
  } else {
    els.missionStatus.textContent = "航线稳定";
    els.screenCommand.textContent = "保持巡检";
  els.screenCommandMeta.textContent = "继续记录现场进展，保留影像和旁站证据。";
  }
  renderCommandScope();
}

function renderCommandScope() {
  const scope = currentProjectScope();
  const buildingCount = scope.buildings.length;
  const unitCount = scope.units.length;
  const systemCount = scope.units.reduce((sum, unit) => sum + unit.systems.length, 0);
  els.screenScope.textContent = `${buildingCount} 栋楼｜${scope.basement || "无地下室"}`;
  els.screenScopeMeta.textContent = `${unitCount} 个单位｜${systemCount} 项施工内容已纳入监控范围`;
}

function generateWeeklyReport() {
  const projectName = currentProjectName();
  const tasks = currentProjectItems("tasks");
  const issues = currentProjectItems("issues");
  const done = tasks.filter((task) => getTaskStatus(task).className === "done");
  const delayed = tasks.filter((task) => getTaskStatus(task).className === "delay");
  const dueSoon = tasks.filter((task) => getTaskStatus(task).className === "risk");
  const openIssues = issues.filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合");
  const overall = tasks.length ? averageProgress(tasks) : 0;
  const dependencyRisks = buildDependencyRisks(tasks);

  if (els.weeklySummary) {
    els.weeklySummary.textContent = `${done.length} 完成｜${delayed.length} 滞后｜${openIssues.length} 整改`;
  }

  return [
    `监理周报｜${projectName}`,
    `统计日期：${localDateText(today)}`,
    "",
    `一、本周总体进度：综合完成率 ${overall}%，已完成节点 ${done.length} 项，临期节点 ${dueSoon.length} 项，滞后节点 ${delayed.length} 项。`,
    "",
    "二、本周完成情况：",
    ...(done.slice(0, 8).map((task) => `- ${task.building || "-"} ${task.floor || "-"} ${task.system || task.name}，责任单位：${task.owner || "-"}`) || ["- 暂无完成项"]),
    "",
    "三、滞后与风险：",
    ...(delayed.slice(0, 8).map((task) => `- ${task.building || "-"} ${task.floor || "-"} ${task.system || task.name}，计划 ${task.planned}，完成率 ${task.progress}%`) || ["- 暂无滞后项"]),
    "",
    "四、穿插影响：",
    ...(dependencyRisks.slice(0, 6).map((risk) => `- ${risk.location}：${risk.message}`) || ["- 暂未发现关键穿插阻塞"]),
    "",
    "五、监理要求：",
    ...(openIssues.slice(0, 6).map((issue) => `- ${issue.owner}：${issue.action}`) || ["- 继续保持巡检和资料同步"]),
    "",
    "六、下周重点：优先复核滞后节点赶工资源、临期节点完成证明、隐蔽验收影像资料和整改闭合资料。"
  ].join("\n");
}

let carouselTimer = null;

function startDashboardCarousel() {
  clearInterval(carouselTimer);
  const views = ["dashboard", "scope", "schedule", "issues"];
  let index = 0;
  carouselTimer = setInterval(() => {
    if (!document.body.classList.contains("carousel-mode")) {
      clearInterval(carouselTimer);
      return;
    }
    index = (index + 1) % views.length;
    switchView(views[index]);
  }, 6000);
}

function renderProjectScope() {
  const scope = currentProjectScope();
  const systemCount = scope.units.reduce((sum, unit) => sum + unit.systems.length, 0);
  const tasks = currentProjectItems("tasks");
  els.scopeSummary.textContent = `${scope.buildings.length} 栋楼｜${scope.units.length} 个单位｜${systemCount} 项内容`;
  els.buildingGrid.innerHTML = [
    ...scope.buildings.map(
      (building) => `
        <article class="building-chip">
          <strong>${escapeHtml(building.name)}</strong>
          <small>${building.floors} 层</small>
        </article>
      `
    ),
    scope.basement
      ? `<article class="building-chip basement"><strong>地下室</strong><small>${escapeHtml(scope.basement)}</small></article>`
      : ""
  ].join("");

  els.scopeUnitGrid.innerHTML = scope.units
    .map(
      (unit) => {
        const unitTasks = tasks.filter((task) => taskMatchesUnit(task, unit));
        const progress = unitTasks.length
          ? Math.round(unitTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / unitTasks.length)
          : 0;
        const detailRows = buildUnitProgressRows(unitTasks);
        return `
        <article class="unit-card">
          <div class="unit-card-header">
            <span>${escapeHtml(unit.code)}</span>
            <div>
              <strong>${escapeHtml(unit.name)}</strong>
              <small>${unitTasks.length} 个进度节点｜完成率 ${progress}%</small>
            </div>
          </div>
          <div class="unit-progress">
            <span style="width: ${progress}%"></span>
          </div>
          <div class="system-list">
            ${unit.systems.map((system) => `<span>${escapeHtml(system)}</span>`).join("")}
          </div>
          <div class="floor-progress-list">
            ${
              detailRows.length
                ? detailRows
                    .map(
                      (row) => `
                        <div class="floor-progress-row">
                          <strong>${escapeHtml(row.location)}</strong>
                          <span>${escapeHtml(row.system)}</span>
                          <small>${row.progress}%｜${escapeHtml(row.status)}</small>
                        </div>
                      `
                    )
                    .join("")
                : `<div class="floor-progress-row empty"><strong>暂无楼层进度</strong><span>导入或新增节点后显示具体楼栋、楼层、施工内容</span></div>`
            }
          </div>
        </article>
      `;
      }
    )
    .join("");

  renderBuildingModel(scope, tasks);
  renderInspectionGrid(scope, tasks);
  renderBasementCutaway(scope, tasks);
}

function taskMatchesUnit(task, unit) {
  return unit.systems.includes(task.system) || unit.name.includes(task.discipline) || task.owner === unit.name;
}

function buildUnitProgressRows(tasks) {
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = `${task.building || "未填部位"}|${task.floor || "未填楼层"}|${task.system || task.name}`;
    const current = grouped.get(key) || {
      location: `${task.building || "未填部位"}｜${task.floor || "未填楼层"}`,
      system: task.system || task.name,
      progressValues: [],
      done: false,
      delayed: false
    };
    current.progressValues.push(Number(task.progress || 0));
    current.done = current.done || Boolean(task.actual) || Number(task.progress) >= 100;
    current.delayed = current.delayed || getTaskStatus(task).className === "delay";
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((row) => {
      const progress = Math.round(row.progressValues.reduce((sum, value) => sum + value, 0) / row.progressValues.length);
      return {
        location: row.location,
        system: row.system,
        progress,
        status: row.done ? "已完成" : row.delayed ? "已滞后" : progress > 0 ? "施工中" : "未开始"
      };
    })
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 8);
}

function renderInspectionGrid(scope, tasks) {
  if (!els.inspectionGrid) return;
  const stats = getBuildingStats(scope, tasks);
  const cards = stats.flatMap((building) => {
    const floors = building.isBasement ? ["地下室"] : Array.from({ length: building.floors }, (_, index) => `${index + 1}层`);
    return floors.map((floorLabel) => {
      const floorTasks = building.related.filter((task) => taskMatchesFloor(task, floorLabel, building));
      const progress = floorTasks.length ? averageProgress(floorTasks) : floorProgressValue(building, floorLabel);
      const status = aggregateFloorStatus(floorTasks, progress);
      return { building, floorLabel, floorTasks, progress, status };
    });
  });

  els.inspectionGrid.innerHTML = cards.slice(0, 18).map((card) => `
    <article class="inspection-card ${card.status}">
      <div>
        <strong>${escapeHtml(card.building.name)}｜${escapeHtml(card.floorLabel)}</strong>
        <small>${card.floorTasks.length} 项｜${card.progress}%｜${statusLabel(card.status)}</small>
      </div>
      <button class="ghost-btn" type="button" data-inspect-building="${escapeHtml(card.building.name)}" data-inspect-floor="${escapeHtml(card.floorLabel)}">查看</button>
    </article>
  `).join("");

  document.querySelectorAll("[data-inspect-building]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedBuildingName = button.dataset.inspectBuilding;
      selectedModelFloor = button.dataset.inspectFloor;
      renderProjectScope();
    });
  });
}

function renderBasementCutaway(scope, tasks) {
  if (!els.basementCutaway) return;
  const basementTasks = tasks.filter((task) => `${task.building || ""}${task.floor || ""}${task.name || ""}`.includes("地下"));
  const grouped = new Map();
  basementTasks.forEach((task) => {
    const key = task.system || task.discipline || "未分类";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  const rows = Array.from(grouped.entries()).map(([system, systemTasks]) => ({
    system,
    progress: averageProgress(systemTasks),
    status: aggregateFloorStatus(systemTasks, averageProgress(systemTasks)),
    count: systemTasks.length
  }));
  if (els.basementSummary) els.basementSummary.textContent = `${rows.length} 个系统｜${basementTasks.length} 个节点`;
  els.basementCutaway.innerHTML = rows.length
    ? rows.map((row) => `
        <article class="basement-segment ${row.status}">
          <strong>${escapeHtml(row.system)}</strong>
          <span><i style="width:${row.progress}%"></i></span>
          <small>${row.progress}%｜${row.count} 项｜${statusLabel(row.status)}</small>
        </article>
      `).join("")
    : `<article class="basement-segment"><strong>暂无地下室节点</strong><small>导入地下室楼层后显示剖面进度</small></article>`;
}

function statusLabel(status) {
  const labels = { delay: "滞后", risk: "临期", done: "完成", active: "施工中", normal: "未开始" };
  return labels[status] || "正常";
}

function renderBuildingModel(scope, tasks) {
  if (!els.buildingModel) return;
  renderModelFilters(scope);
  const filteredTasks = filterModelTasks(tasks);
  const buildingStats = getBuildingStats(scope, filteredTasks);
  const selected = buildingStats.find((item) => item.name === selectedBuildingName);
  const activeFilterCount = [
    els.modelBuildingFilter?.value !== "all",
    els.modelUnitFilter?.value !== "all",
    els.modelSystemFilter?.value !== "all",
    els.modelStatusFilter?.value !== "all"
  ].filter(Boolean).length;

  els.modelSummary.textContent = `${buildingStats.length} 个部位｜${filteredTasks.length} 个节点｜${activeFilterCount ? `${activeFilterCount} 项筛选` : "全量视图"}`;
  renderDisciplineLegend(filteredTasks);
  renderModelDetail(selected, buildingStats);
  renderCanvasBuildingModel(buildingStats);
  return;

  if (!window.THREE) {
    els.modelDetail.innerHTML = `
      <span>3D 模型未加载</span>
      <strong>请确认网络可访问 Three.js</strong>
      <p>模型库加载成功后，将自动显示楼栋三维进度模型。</p>
    `;
    return;
  }

  if (!modelState) initBuildingModel();
  buildModelScene(buildingStats);
}

function renderCssBuildingModel(buildingStats) {
  els.buildingModel.innerHTML = `
    <div class="model-stage">
      <div class="site-deck">
        ${buildingStats
          .map(
            (building, index) => `
              <button
                class="tower ${building.isBasement ? "basement" : ""} ${building.name === selectedBuildingName ? "selected" : ""}"
                type="button"
                style="--tower-x:${index % 4}; --tower-y:${Math.floor(index / 4)};"
                data-building-model="${escapeHtml(building.name)}"
              >
                <span class="tower-hit"></span>
                <span class="tower-stack" style="--floors:${Math.max(1, building.floors)};">
                  ${building.floorProgress
                    .map(
                      (progress, floorIndex) => `
                        <i
                          style="--floor:${floorIndex}; --progress:${progress}; --floor-color:${cssColorForProgress(progress)};"
                          title="${escapeHtml(building.name)} ${floorIndex + 1}层 ${progress}%"
                        ></i>
                      `
                    )
                    .join("")}
                </span>
                <span class="tower-label">
                  <b>${escapeHtml(building.name)}</b>
                  <small>${building.progress}%</small>
                </span>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;

}

function renderCanvasBuildingModel(buildingStats) {
  if (!modelState || !modelState.isCanvasModel) initCanvasBuildingModel();
  modelState.stats = buildingStats;
  drawCanvasBuildingModel();
}

function renderDisciplineLegend(tasks) {
  if (!els.disciplineLegend) return;
  const disciplines = [...new Set(tasks.map((task) => task.discipline || task.owner || "其他"))].slice(0, 6);
  els.disciplineLegend.innerHTML = disciplines.map((discipline) => `
    <span><i style="background:${disciplineColor(discipline)}"></i>${escapeHtml(discipline)}</span>
  `).join("");
}

function disciplineColor(discipline) {
  const text = String(discipline || "");
  if (text.includes("机电")) return "#44d7ff";
  if (text.includes("消防")) return "#ff5c6c";
  if (text.includes("智能")) return "#a78bfa";
  if (text.includes("电梯")) return "#ffb84a";
  if (text.includes("土建")) return "#7dffcb";
  return "#8ff5ff";
}

function renderModelFilters(scope) {
  if (!els.modelBuildingFilter) return;
  const buildings = [
    ...scope.buildings.map((building) => building.name),
    scope.basement ? "地下室" : ""
  ].filter(Boolean);
  syncSelectOptions(els.modelBuildingFilter, [["all", "全部楼栋"], ...buildings.map((name) => [name, name])]);
  syncSelectOptions(els.modelUnitFilter, [["all", "全部单位"], ...scope.units.map((unit) => [unit.name, unit.name])]);
  const systems = [...new Set(scope.units.flatMap((unit) => unit.systems))];
  syncSelectOptions(els.modelSystemFilter, [["all", "全部施工内容"], ...systems.map((system) => [system, system])]);
}

function syncSelectOptions(select, options) {
  const previous = select.value || "all";
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  select.value = options.some(([value]) => value === previous) ? previous : "all";
}

function filterModelTasks(tasks) {
  const buildingFilter = els.modelBuildingFilter?.value || "all";
  const unitFilter = els.modelUnitFilter?.value || "all";
  const systemFilter = els.modelSystemFilter?.value || "all";
  const statusFilter = els.modelStatusFilter?.value || "all";
  return tasks.filter((task) => {
    const status = getTaskStatus(task).className;
    if (buildingFilter !== "all" && !taskMatchesModelBuildingName(task, buildingFilter)) return false;
    if (unitFilter !== "all" && !`${task.owner || ""}${task.discipline || ""}`.includes(unitFilter.replace("单位", ""))) return false;
    if (systemFilter !== "all" && task.system !== systemFilter) return false;
    if (statusFilter === "active" && (status === "done" || Number(task.progress || 0) <= 0)) return false;
    if (statusFilter !== "all" && statusFilter !== "active" && status !== statusFilter) return false;
    return true;
  });
}

function taskMatchesModelBuildingName(task, buildingName) {
  const location = `${task.building || ""}${task.floor || ""}${task.name || ""}`;
  if (buildingName === "地下室") return location.includes("地下");
  return location.includes(buildingName);
}

function initCanvasBuildingModel() {
  const canvas = els.buildingModel;
  modelState = {
    isCanvasModel: true,
    angle: -0.7,
    pitch: 0.62,
    autoRotate: false,
    animating: false,
    dragging: false,
    moved: false,
    lastX: 0,
    hoverItem: null,
    hitItems: [],
    stats: []
  };

  canvas.addEventListener("pointerdown", (event) => {
    modelState.dragging = true;
    modelState.autoRotate = false;
    updateAutoRotateButton();
    modelState.moved = false;
    modelState.lastX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!modelState.dragging) {
      updateModelHover(event);
      return;
    }
    const delta = event.clientX - modelState.lastX;
    if (Math.abs(delta) > 2) modelState.moved = true;
    modelState.angle += delta * 0.01;
    modelState.lastX = event.clientX;
    drawCanvasBuildingModel();
  });

  canvas.addEventListener("pointerleave", () => {
    modelState.hoverItem = null;
    if (els.modelTooltip) els.modelTooltip.classList.remove("show");
    drawCanvasBuildingModel();
  });

  canvas.addEventListener("pointerup", (event) => {
    modelState.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("click", (event) => {
    if (modelState.moved) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = modelState.hitItems.find((item) => pointInPolygon(x, y, item.polygon));
    if (!hit) return;
    selectedBuildingName = hit.name;
    selectedModelFloor = hit.floorLabel;
    lastImportFocus = null;
    if (els.modelBuildingFilter) els.modelBuildingFilter.value = hit.name;
    render();
  });
}

function updateModelHover(event) {
  if (!modelState?.isCanvasModel) return;
  const rect = els.buildingModel.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = modelState.hitItems.find((item) => pointInPolygon(x, y, item.polygon));
  modelState.hoverItem = hit || null;
  if (els.modelTooltip) {
    if (hit) {
      els.modelTooltip.innerHTML = `
        <strong>${escapeHtml(hit.name)}｜${escapeHtml(hit.floorLabel)}</strong>
        <span>完成率 ${hit.progress}%｜${statusLabel(hit.status)}</span>
        <small>未完成 ${hit.openCount || 0} 项｜滞后 ${hit.delayCount || 0} 项</small>
      `;
      els.modelTooltip.style.left = `${Math.min(rect.width - 190, Math.max(12, x + 14))}px`;
      els.modelTooltip.style.top = `${Math.min(rect.height - 92, Math.max(12, y + 14))}px`;
      els.modelTooltip.classList.add("show");
    } else {
      els.modelTooltip.classList.remove("show");
    }
  }
  drawCanvasBuildingModel();
}

function runCanvasModelLoop() {
  if (!modelState?.isCanvasModel || modelState.animating) return;
  modelState.animating = true;
  const tick = () => {
    if (!modelState?.isCanvasModel) return;
    if (modelState.autoRotate && !modelState.dragging) {
      modelState.angle += 0.004;
      drawCanvasBuildingModel();
      requestAnimationFrame(tick);
      return;
    }
    modelState.animating = false;
  };
  requestAnimationFrame(tick);
}

function updateAutoRotateButton() {
  if (!els.modelAutoRotateBtn) return;
  const enabled = Boolean(modelState?.autoRotate);
  els.modelAutoRotateBtn.textContent = enabled ? "暂停旋转" : "自动旋转";
  els.modelAutoRotateBtn.classList.toggle("is-active", enabled);
}

function setModelView(view) {
  if (!modelState?.isCanvasModel) initCanvasBuildingModel();
  const views = {
    front: { angle: 0, pitch: 0.5 },
    top: { angle: -0.7, pitch: 0.18 },
    left: { angle: -Math.PI / 2, pitch: 0.56 },
    right: { angle: Math.PI / 2, pitch: 0.56 },
    reset: { angle: -0.7, pitch: 0.62 }
  };
  Object.assign(modelState, views[view] || views.reset, { autoRotate: false });
  updateAutoRotateButton();
  drawCanvasBuildingModel();
}

function drawCanvasBuildingModel() {
  const canvas = els.buildingModel;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const layout = getModelLayout(modelState.stats);
  const scale = Math.min(width / 15.2, height / 9.2);
  const floorHeight = Math.max(11, scale * 0.3);
  const blockWidth = Math.max(38, scale * 0.98);
  const blockDepth = Math.max(24, scale * 0.58);

  drawSitePlane(ctx, width, height);
  modelState.hitItems = [];
  modelState.labelRects = [];
  let selectedBadge = null;

  layout
    .map((item) => ({ ...item, center: projectPoint(item.x, 0, item.z, width, height), depth: rotatePoint(item.x, item.z).z }))
    .sort((a, b) => a.depth - b.depth)
    .forEach((item) => {
      const floorCount = Math.max(1, Math.min(item.floors, 12));
      for (let floorIndex = 0; floorIndex < floorCount; floorIndex += 1) {
        const progress = item.floorProgress[floorIndex] ?? item.progress;
        const y = item.center.y - floorIndex * floorHeight;
        const box = makeIsoBox(item.center.x, y, blockWidth * (item.isBasement ? 1.7 : 1), blockDepth, floorHeight);
        const floorLabel = item.isBasement ? "地下室" : `${floorIndex + 1}层`;
        const floorTasks = item.related.filter((task) => taskMatchesFloor(task, floorLabel, item));
        const floorStatus = aggregateFloorStatus(floorTasks, progress);
        const isSelected = item.name === selectedBuildingName && (!selectedModelFloor || selectedModelFloor === floorLabel);
        const isHovered = modelState.hoverItem?.name === item.name && modelState.hoverItem?.floorLabel === floorLabel;
        const isImportFocus = lastImportFocus?.buildingName === item.name && lastImportFocus.floorLabel === floorLabel;
        drawIsoBox(ctx, box, cssColorForProgress(progress), isSelected || isImportFocus || isHovered, floorStatus);
        drawFloorHeatmap(ctx, box, floorTasks, progress);
        const hitItem = {
          name: item.name,
          floorLabel,
          progress,
          polygon: hitPolygonForBox(box),
          status: floorStatus,
          openCount: floorTasks.filter((task) => getTaskStatus(task).className !== "done").length,
          delayCount: floorTasks.filter((task) => getTaskStatus(task).className === "delay").length
        };
        modelState.hitItems.unshift(hitItem);
        if (isSelected) selectedBadge = { ...hitItem, x: item.center.x, y: y - floorHeight - blockDepth - 18 };
      }
      drawModelLabel(ctx, item, item.center.x, item.center.y - floorCount * floorHeight - 26);
    });

  if (selectedBadge) drawSelectedFloorBadge(ctx, selectedBadge);
  drawModelHint(ctx, width);
}

function getModelLayout(stats) {
  return stats.map((building, index) => ({
    ...building,
    x: ((index % 4) - 1.5) * 3.1,
    z: (Math.floor(index / 4) - 0.5) * 3
  }));
}

function rotatePoint(x, z) {
  const cos = Math.cos(modelState.angle);
  const sin = Math.sin(modelState.angle);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

function projectPoint(x, y, z, width, height) {
  const rotated = rotatePoint(x, z);
  const scale = Math.min(width / 18, height / 11);
  return {
    x: width / 2 + rotated.x * scale,
    y: height * 0.76 + rotated.z * scale * modelState.pitch - y * scale
  };
}

function drawSitePlane(ctx, width, height) {
  const glow = ctx.createRadialGradient(width / 2, height * 0.44, 20, width / 2, height * 0.44, Math.max(width, height) * 0.62);
  glow.addColorStop(0, "rgba(68, 215, 255, 0.18)");
  glow.addColorStop(0.55, "rgba(68, 215, 255, 0.05)");
  glow.addColorStop(1, "rgba(68, 215, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const corners = [
    projectPoint(-7.4, 0, -3.8, width, height),
    projectPoint(7.4, 0, -3.8, width, height),
    projectPoint(7.4, 0, 3.8, width, height),
    projectPoint(-7.4, 0, 3.8, width, height)
  ];
  ctx.save();
  ctx.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(4, 15, 25, 0.9)";
  ctx.strokeStyle = "rgba(68, 215, 255, 0.58)";
  ctx.lineWidth = 1.25;
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = "rgba(68, 215, 255, 0.45)";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(68, 215, 255, 0.13)";
  for (let i = -7; i <= 7; i += 1) drawProjectedLine(ctx, i, -3.8, i, 3.8, width, height);
  for (let i = -3; i <= 3; i += 1) drawProjectedLine(ctx, -7.4, i, 7.4, i, width, height);
  ctx.restore();
}

function drawProjectedLine(ctx, x1, z1, x2, z2, width, height) {
  const a = projectPoint(x1, 0, z1, width, height);
  const b = projectPoint(x2, 0, z2, width, height);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function makeIsoBox(cx, cy, w, d, h) {
  const left = { x: cx - w / 2, y: cy };
  const right = { x: cx + w / 2, y: cy };
  const back = { x: cx, y: cy - d };
  const front = { x: cx, y: cy + d };
  const topLeft = { x: left.x, y: left.y - h };
  const topRight = { x: right.x, y: right.y - h };
  const topBack = { x: back.x, y: back.y - h };
  const topFront = { x: front.x, y: front.y - h };
  return {
    top: [topLeft, topBack, topRight, topFront],
    left: [left, back, topBack, topLeft],
    right: [right, front, topFront, topRight],
    front: [front, left, topLeft, topFront]
  };
}

function drawIsoBox(ctx, box, color, selected, status = "normal") {
  drawPolygon(ctx, box.left, shadeHex(color, -28), selected, status);
  drawPolygon(ctx, box.right, shadeHex(color, -12), selected, status);
  drawPolygon(ctx, box.front, shadeHex(color, -20), selected, status);
  drawPolygon(ctx, box.top, color, selected, status);
}

function drawPolygon(ctx, points, color, selected, status = "normal") {
  const statusStroke = {
    delay: "rgba(255,92,108,0.95)",
    risk: "rgba(255,184,74,0.92)",
    done: "rgba(125,255,203,0.82)",
    active: "rgba(68,215,255,0.72)",
    normal: "rgba(234,248,255,0.2)"
  };
  const pulse = status === "delay" ? 0.5 + Math.sin(Date.now() / 180) * 0.5 : 0;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = selected ? "rgba(255,255,255,0.95)" : statusStroke[status] || statusStroke.normal;
  ctx.lineWidth = selected ? 2.6 : status === "delay" ? 1.7 : 1;
  ctx.shadowColor = selected ? "rgba(125,255,203,0.82)" : statusStroke[status] || color;
  ctx.shadowBlur = selected ? 24 : status === "delay" ? 12 + pulse * 14 : 9;
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawFloorHeatmap(ctx, box, floorTasks, fallbackProgress) {
  const top = box.top;
  const left = top[0];
  const right = top[2];
  const bottom = top[3];
  const width = right.x - left.x;
  const baseY = bottom.y - 3;
  const groups = groupFloorTasksByUnit(floorTasks);
  const segments = groups.length
    ? groups
    : [{ unit: "综合", progress: fallbackProgress, status: "normal" }];
  const segmentWidth = width / Math.max(segments.length, 1);
  ctx.save();
  segments.slice(0, 5).forEach((segment, index) => {
    const x = left.x + index * segmentWidth + 2;
    ctx.fillStyle = segment.status === "delay" || segment.status === "risk"
      ? statusColor(segment.status, segment.progress)
      : disciplineColor(segment.unit);
    ctx.fillRect(x, baseY, Math.max(5, segmentWidth - 4), 4);
  });
  ctx.restore();
}

function drawSelectedFloorBadge(ctx, item) {
  const text = `${item.name}｜${item.floorLabel}｜完成率 ${item.progress}%`;
  ctx.save();
  ctx.font = "800 13px Microsoft YaHei, Arial";
  const width = Math.min(190, Math.max(138, ctx.measureText(text).width + 22));
  const x = Math.max(12, Math.min(item.x - width / 2, ctx.canvas.width - width - 12));
  const y = Math.max(14, item.y - 42);
  ctx.fillStyle = "rgba(3, 10, 18, 0.9)";
  roundedRect(ctx, x, y, width, 34, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(125,255,203,0.95)";
  ctx.lineWidth = 1.4;
  ctx.shadowColor = "rgba(125,255,203,0.58)";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#eaffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 11, y + 17);
  ctx.restore();
}

function drawModelLabel(ctx, item, x, y) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const rect = avoidLabelOverlap(x - 40, y - 18, 80, 36);
  ctx.fillStyle = "rgba(3, 10, 18, 0.78)";
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 7);
  ctx.fill();
  ctx.strokeStyle = item.name === selectedBuildingName ? "rgba(125,255,203,0.8)" : "rgba(139,235,255,0.28)";
  ctx.stroke();
  ctx.fillStyle = "#f4fcff";
  ctx.font = "800 14px Microsoft YaHei, Arial";
  ctx.fillText(item.name, rect.x + rect.width / 2, rect.y + 13);
  ctx.fillStyle = item.progress >= 100 ? "#7dffcb" : "#8ff5ff";
  ctx.font = "800 12px Microsoft YaHei, Arial";
  ctx.fillText(`${item.progress}%`, rect.x + rect.width / 2, rect.y + 29);
  ctx.restore();
}

function avoidLabelOverlap(x, y, width, height) {
  const rect = { x, y, width, height };
  while (modelState.labelRects?.some((used) => rectsOverlap(rect, used))) {
    rect.y -= height + 6;
  }
  modelState.labelRects.push(rect);
  return rect;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function drawModelHint(ctx, width) {
  ctx.save();
  ctx.fillStyle = "rgba(3, 10, 18, 0.72)";
  roundedRect(ctx, width - 214, 16, 194, 34, 17);
  ctx.fill();
  ctx.fillStyle = "#83a4b7";
  ctx.font = "800 13px Microsoft YaHei, Arial";
  ctx.fillText("拖拽旋转 360°｜点击楼层", width - 198, 37);
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function hitPolygonForBox(box) {
  const points = [...box.top, ...box.left, ...box.right, ...box.front];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  const minY = Math.min(...ys) - 4;
  const maxY = Math.max(...ys) + 4;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];
}

function shadeHex(hex, amount) {
  const raw = hex.replace("#", "");
  const number = parseInt(raw, 16);
  const r = Math.max(0, Math.min(255, (number >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (number & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function initBuildingModel() {
  const canvas = els.buildingModel;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x050911, 18, 52);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(8, 9, 15);
  camera.lookAt(0, 3.5, 0);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  scene.add(new THREE.AmbientLight(0x7bdfff, 0.72));
  const keyLight = new THREE.DirectionalLight(0x8ff5ff, 1.35);
  keyLight.position.set(7, 12, 8);
  scene.add(keyLight);
  const warmLight = new THREE.PointLight(0xffb84a, 1.2, 24);
  warmLight.position.set(-8, 5, 6);
  scene.add(warmLight);

  const siteGroup = new THREE.Group();
  siteGroup.rotation.x = -0.08;
  scene.add(siteGroup);

  modelState = {
    scene,
    camera,
    renderer,
    siteGroup,
    raycaster: new THREE.Raycaster(),
    pointer: new THREE.Vector2(),
    meshes: [],
    isDragging: false,
    lastX: 0,
    autoRotate: true
  };

  canvas.addEventListener("pointerdown", (event) => {
    modelState.isDragging = true;
    modelState.autoRotate = false;
    modelState.lastX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!modelState.isDragging) return;
    modelState.siteGroup.rotation.y += (event.clientX - modelState.lastX) * 0.008;
    modelState.lastX = event.clientX;
  });

  canvas.addEventListener("pointerup", (event) => {
    modelState.isDragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    modelState.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    modelState.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    modelState.raycaster.setFromCamera(modelState.pointer, modelState.camera);
    const hit = modelState.raycaster.intersectObjects(modelState.meshes, true)[0];
    if (!hit?.object?.userData?.buildingName) return;
    selectedBuildingName = hit.object.userData.buildingName;
    render();
  });

  animateBuildingModel();
}

function buildModelScene(buildingStats) {
  const { siteGroup } = modelState;
  while (siteGroup.children.length) siteGroup.remove(siteGroup.children[0]);
  modelState.meshes = [];

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(15.5, 0.18, 7.2),
    new THREE.MeshStandardMaterial({ color: 0x071826, roughness: 0.72, metalness: 0.22 })
  );
  base.position.y = -0.12;
  siteGroup.add(base);

  const grid = new THREE.GridHelper(16, 16, 0x44d7ff, 0x143447);
  grid.position.y = 0.01;
  siteGroup.add(grid);

  buildingStats.forEach((building, index) => {
    const group = new THREE.Group();
    const column = index % 4;
    const row = Math.floor(index / 4);
    group.position.set((column - 1.5) * 3.3, 0, (row - 0.5) * 3.2);

    const width = building.isBasement ? 2.5 : 1.45;
    const depth = building.isBasement ? 1.3 : 1.05;
    const floorHeight = building.isBasement ? 0.35 : 0.34;
    const maxFloors = Math.max(1, Math.min(building.floors, 12));

    for (let floor = 1; floor <= maxFloors; floor += 1) {
      const progress = building.floorProgress[floor - 1] ?? building.progress;
      const material = new THREE.MeshStandardMaterial({
        color: colorForProgress(progress),
        emissive: colorForProgress(progress),
        emissiveIntensity: building.name === selectedBuildingName ? 0.24 : 0.11,
        roughness: 0.42,
        metalness: 0.18,
        transparent: true,
        opacity: 0.86
      });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, floorHeight, depth), material);
      mesh.position.y = floor * (floorHeight + 0.045);
      mesh.userData.buildingName = building.name;
      group.add(mesh);
      modelState.meshes.push(mesh);
    }

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.7, 10),
      new THREE.MeshStandardMaterial({ color: 0x8ff5ff, emissive: 0x44d7ff, emissiveIntensity: 0.45 })
    );
    antenna.position.y = (maxFloors + 1) * (floorHeight + 0.045);
    group.add(antenna);

    const label = makeTextSprite(`${building.name}  ${building.progress}%`);
    label.position.set(0, antenna.position.y + 0.38, 0);
    group.add(label);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(Math.max(width, depth) * 0.68, 0.025, 8, 44),
      new THREE.MeshStandardMaterial({
        color: building.name === selectedBuildingName ? 0x7dffcb : 0x44d7ff,
        emissive: building.name === selectedBuildingName ? 0x7dffcb : 0x44d7ff,
        emissiveIntensity: building.name === selectedBuildingName ? 0.72 : 0.26
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    group.add(ring);

    siteGroup.add(group);
  });

  resizeBuildingModel();
}

function animateBuildingModel() {
  if (!modelState) return;
  requestAnimationFrame(animateBuildingModel);
  if (modelState.autoRotate) modelState.siteGroup.rotation.y += 0.003;
  resizeBuildingModel();
  modelState.renderer.render(modelState.scene, modelState.camera);
}

function resizeBuildingModel() {
  if (!modelState) return;
  const canvas = els.buildingModel;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (canvas.width === width * modelState.renderer.getPixelRatio() && canvas.height === height * modelState.renderer.getPixelRatio()) return;
  modelState.renderer.setSize(width, height, false);
  modelState.camera.aspect = width / height;
  modelState.camera.updateProjectionMatrix();
}

function getBuildingStats(scope, tasks) {
  const buildings = scope.buildings.map((building) => ({
    name: building.name,
    label: `${building.name}（${building.floors}层）`,
    floors: building.floors,
    isBasement: false
  }));
  if (scope.basement) {
    buildings.push({ name: "地下室", label: scope.basement, floors: 1, isBasement: true });
  }

  return buildings.map((building) => {
    const related = tasks.filter((task) => taskMatchesBuilding(task, building));
    const floorProgress = Array.from({ length: building.floors }, (_, index) => {
      const floorTasks = related.filter((task) => parseFloorNumber(task.floor) === index + 1 || building.isBasement);
      if (!floorTasks.length) return related.length ? averageProgress(related) : 0;
      return averageProgress(floorTasks);
    });
    const progress = related.length ? averageProgress(related) : 0;
    const completed = related
      .filter((task) => Number(task.progress || 0) >= 100 || task.actual)
      .map(taskDetailText)
      .slice(0, 10);
    const active = related
      .filter((task) => Number(task.progress || 0) < 100 && !task.actual)
      .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))
      .map(taskDetailText)
      .slice(0, 8);

    return { ...building, related, floorProgress, progress, completed, active };
  });
}

function renderModelDetail(selected, buildingStats) {
  if (!els.modelDetail) return;
  const target = selected || buildingStats[0];
  if (!target) {
    els.modelDetail.innerHTML = `
      <span>楼栋详情</span>
      <strong>暂无楼栋数据</strong>
      <p>请先在项目范围中录入楼栋，或通过 Excel 导入进度节点。</p>
    `;
    return;
  }

  renderScopedModelDetail(target);
  return;

  const completedHtml = target.completed.length
    ? target.completed.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>暂无 100% 完成项，导入实际完成或完成率后会自动更新。</li>`;
  const activeHtml = target.active.length
    ? target.active.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>暂无施工中节点。</li>`;

  els.modelDetail.innerHTML = `
    <span>${escapeHtml(target.label)}</span>
    <strong>${target.progress}% 综合完成</strong>
    <p>${target.related.length} 个进度节点已关联到该部位。</p>
    <div class="model-detail-block">
      <b>已完成项目</b>
      <ul>${completedHtml}</ul>
    </div>
    <div class="model-detail-block">
      <b>施工中/待完成</b>
      <ul>${activeHtml}</ul>
    </div>
  `;
}

function selectBuildingFromModel(name) {
  selectedBuildingName = name;
  render();
}

function renderScopedModelDetail(target) {
  const scopedTasks = selectedModelFloor
    ? target.related.filter((task) => taskMatchesFloor(task, selectedModelFloor, target))
    : target.related;
  const progress = scopedTasks.length
    ? averageProgress(scopedTasks)
    : selectedModelFloor
      ? floorProgressValue(target, selectedModelFloor)
      : target.progress;
  const completedItems = scopedTasks
    .filter((task) => Number(task.progress || 0) >= 100 || task.actual)
    .map(taskDetailText)
    .slice(0, 10);
  const activeItems = scopedTasks
    .filter((task) => Number(task.progress || 0) < 100 && !task.actual)
    .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))
    .map(taskDetailText)
    .slice(0, 10);
  const scopeName = selectedModelFloor ? `${target.name}｜${selectedModelFloor}` : target.label;
  const emptyScope = selectedModelFloor ? "该楼层" : "该楼栋";
  const completedHtml = completedItems.length
    ? completedItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>${emptyScope}暂无 100% 完成项，导入实际完成或完成率后会自动更新。</li>`;
  const activeHtml = activeItems.length
    ? activeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>${emptyScope}暂无施工中节点。</li>`;
  const meta = selectedModelFloor
    ? `${scopedTasks.length} 个进度节点关联到本层。`
    : `${target.related.length} 个进度节点已关联到该楼栋。`;
  const acceptance = buildAcceptancePanel(scopedTasks, target, selectedModelFloor);
  const diaryHtml = buildLinkedDiaryPanel(target, selectedModelFloor);
  const tableRows = scopedTasks.length
    ? scopedTasks
        .slice()
        .sort((a, b) => Number(a.progress || 0) - Number(b.progress || 0))
        .map((task) => {
          const status = getTaskStatus(task);
          return `
            <tr>
              <td>${escapeHtml(task.owner || task.discipline || "-")}</td>
              <td>${escapeHtml(task.system || task.name || "-")}</td>
              <td><span class="status ${status.className}">${status.label}</span><br><small>${Number(task.progress || 0)}%</small></td>
              <td>${escapeHtml(task.planned || "-")}</td>
              <td>${escapeHtml(task.actual || "-")}</td>
              <td>
                ${escapeHtml(task.note || "-")}
                ${(task.evidence || task.photo) ? `<br><small>资料：${escapeHtml(task.evidence || task.photo)}</small>` : ""}
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6">${emptyScope}暂无明细节点，可通过 Excel 导入后自动生成。</td></tr>`;

  els.modelDetail.innerHTML = `
    <span>${escapeHtml(scopeName)}</span>
    <strong>${progress}% 综合完成</strong>
    <p>${escapeHtml(meta)}</p>
    ${acceptance}
    ${diaryHtml}
    <div class="model-detail-table">
      <table>
        <thead>
          <tr>
            <th>单位</th>
            <th>施工内容</th>
            <th>进度</th>
            <th>计划</th>
            <th>实际</th>
            <th>监理意见</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="model-detail-block">
      <b>已完成项目</b>
      <ul>${completedHtml}</ul>
    </div>
    <div class="model-detail-block">
      <b>施工中/待完成</b>
      <ul>${activeHtml}</ul>
    </div>
  `;
}

function buildAcceptancePanel(tasks, target, floorLabel) {
  const status = aggregateFloorStatus(tasks, tasks.length ? averageProgress(tasks) : floorProgressValue(target, floorLabel || "1层"));
  const photoCount = tasks.filter((task) => task.photo || task.evidence).length;
  const hiddenAcceptance = tasks.filter((task) => `${task.system || task.name}`.includes("隐蔽") || `${task.note || ""}`.includes("隐蔽")).length;
  const diaryCount = currentProjectItems("diaries").filter((diary) => {
    const text = diary.content || "";
    return text.includes(target.name) || (floorLabel && text.includes(floorLabel));
  }).length;
  return `
    <div class="acceptance-panel ${status}">
      <article>
        <span>影像资料</span>
        <strong>${photoCount}</strong>
        <small>可在 Excel 备注中填照片编号/链接</small>
      </article>
      <article>
        <span>隐蔽验收</span>
        <strong>${hiddenAcceptance}</strong>
        <small>按施工内容和监理意见识别</small>
      </article>
      <article>
        <span>日志关联</span>
        <strong>${diaryCount}</strong>
        <small>监理日志中匹配楼栋楼层</small>
      </article>
      <article>
        <span>查验状态</span>
        <strong>${statusLabel(status)}</strong>
        <small>由进度、计划日期自动判断</small>
      </article>
    </div>
  `;
}

function buildLinkedDiaryPanel(target, floorLabel) {
  const diaries = linkedDiaries(target, floorLabel).slice(0, 3);
  if (!diaries.length) {
    return `
      <div class="linked-diary-panel">
        <strong>关联监理日志</strong>
        <small>暂无匹配日志，新增日志时选择楼栋、楼层和施工内容后会自动关联。</small>
      </div>
    `;
  }
  return `
    <div class="linked-diary-panel">
      <strong>关联监理日志</strong>
      ${diaries.map((diary) => `
        <article>
          <span>${escapeHtml(diary.date || "-")}｜${escapeHtml(diary.weather || "")}</span>
          <small>${escapeHtml(diary.content || "")}</small>
        </article>
      `).join("")}
    </div>
  `;
}

function linkedDiaries(target, floorLabel) {
  return currentProjectItems("diaries").filter((diary) => {
    const text = `${diary.building || ""}${diary.floor || ""}${diary.system || ""}${diary.content || ""}`;
    return text.includes(target.name) || (floorLabel && text.includes(floorLabel));
  });
}

function taskMatchesBuilding(task, building) {
  const location = `${task.building || ""}${task.floor || ""}${task.name || ""}`;
  if (building.isBasement) return location.includes("地下");
  return location.includes(building.name);
}

function taskMatchesFloor(task, floorLabel, building) {
  if (building.isBasement || floorLabel === "地下室") {
    return `${task.building || ""}${task.floor || ""}${task.name || ""}`.includes("地下");
  }
  return parseFloorNumber(task.floor) === parseFloorNumber(floorLabel);
}

function floorProgressValue(building, floorLabel) {
  if (building.isBasement || floorLabel === "地下室") return building.floorProgress[0] || building.progress || 0;
  const index = parseFloorNumber(floorLabel) - 1;
  return building.floorProgress[index] || 0;
}

function aggregateFloorStatus(tasks, progress) {
  if (tasks.some((task) => getTaskStatus(task).className === "delay")) return "delay";
  if (tasks.some((task) => getTaskStatus(task).className === "risk")) return "risk";
  if (tasks.length && tasks.every((task) => getTaskStatus(task).className === "done")) return "done";
  if (progress > 0) return "active";
  return "normal";
}

function groupFloorTasksByUnit(tasks) {
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = task.owner || task.discipline || "未填单位";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  return Array.from(grouped.entries()).map(([unit, unitTasks]) => ({
    unit,
    progress: averageProgress(unitTasks),
    status: aggregateFloorStatus(unitTasks, averageProgress(unitTasks))
  }));
}

function statusColor(status, progress) {
  if (status === "delay") return "#ff5c6c";
  if (status === "risk") return "#ffb84a";
  if (status === "done") return "#7dffcb";
  return cssColorForProgress(progress);
}

function resolveBuildingName(value) {
  const text = String(value || "");
  if (text.includes("地下")) return "地下室";
  const scope = currentProjectScope();
  return scope.buildings.find((building) => text.includes(building.name))?.name || text.replace(/（.*?）|\(.*?\)/g, "");
}

function parseFloorNumber(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function averageProgress(tasks) {
  return Math.round(tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length);
}

function taskDetailText(task) {
  return `${task.building || "未填部位"}｜${task.floor || "未填楼层"}｜${task.system || task.name}｜${task.progress}%`;
}

function colorForProgress(progress) {
  if (progress >= 100) return new THREE.Color(0x7dffcb);
  if (progress >= 60) return new THREE.Color(0x44d7ff);
  if (progress >= 30) return new THREE.Color(0xffb84a);
  return new THREE.Color(0xff5c6c);
}

function cssColorForProgress(progress) {
  if (progress >= 100) return "#7dffcb";
  if (progress >= 60) return "#44d7ff";
  if (progress >= 30) return "#ffb84a";
  return "#ff5c6c";
}

function makeTextSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(4, 12, 22, 0.82)";
  ctx.strokeStyle = "rgba(139, 235, 255, 0.72)";
  ctx.lineWidth = 2;
  ctx.roundRect(8, 10, 240, 48, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#eaf8ff";
  ctx.font = "700 24px Microsoft YaHei, Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 128, 35);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.52, 1);
  return sprite;
}

function renderTasks() {
  const tasks = currentProjectItems("tasks");
  els.taskCount.textContent = `${tasks.length} 项`;
  els.taskTable.innerHTML = tasks
    .map((task) => {
      const status = getTaskStatus(task);
      return `
        <tr>
          <td><strong>${escapeHtml(task.name)}</strong><br><small>${escapeHtml(task.note || "")}</small></td>
          <td>${escapeHtml(task.building || "-")}<br><small>${escapeHtml(task.floor || "未填楼层")}｜${escapeHtml(task.system || "未挂接施工内容")}</small></td>
          <td>${escapeHtml(task.discipline)}</td>
          <td>${escapeHtml(task.owner)}</td>
          <td>${task.planned}</td>
          <td>${task.actual || "-"}</td>
          <td>${task.progress}%<br><small>计划 ${expectedProgress(task)}%｜偏差 ${Number(task.progress || 0) - expectedProgress(task)}%</small></td>
          <td><span class="status ${status.className}">${status.label}</span></td>
          <td><button class="icon-btn" title="删除节点" data-delete-task="${task.id}">×</button></td>
        </tr>
      `;
    })
    .join("");

  document.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tasks = state.tasks.filter((task) => task.id !== button.dataset.deleteTask);
      saveState();
      render();
    });
  });
}

function renderIssues() {
  const issues = currentProjectItems("issues");
  els.issueBoard.innerHTML = issues.length
    ? issues
        .map(
          (issue) => `
            <article class="issue-card ${statusClassForIssue(issue.status)}">
              <span class="severity ${issue.severity === "紧急" ? "urgent" : issue.severity === "重要" ? "important" : "normal"}">${issue.severity}</span>
              <strong>${escapeHtml(issue.title)}</strong>
              <small>${escapeHtml(issue.owner)}｜${issue.deadline}｜${normalizeIssueStatus(issue.status)}｜${escapeHtml(issue.category || classifyDelayReason(issue.action || issue.title))}</small>
              <p>${escapeHtml(issue.action)}</p>
              <div class="issue-flow">${issueFlowHtml(issue.status)}</div>
              <div class="issue-actions">
                <button data-advance-issue="${issue.id}" type="button">${normalizeIssueStatus(issue.status) === "已闭合" ? "重新打开" : "推进状态"}</button>
                <button data-delete-issue="${issue.id}" type="button">删除</button>
              </div>
            </article>
          `
        )
        .join("")
    : `<article class="issue-card"><strong>暂无整改项</strong><small>新增滞后问题后会显示在这里</small></article>`;

  document.querySelectorAll("[data-advance-issue]").forEach((button) => {
    button.addEventListener("click", () => {
      const issue = state.issues.find((item) => item.id === button.dataset.advanceIssue);
      issue.status = nextIssueStatus(issue.status);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-delete-issue]").forEach((button) => {
    button.addEventListener("click", () => {
      state.issues = state.issues.filter((issue) => issue.id !== button.dataset.deleteIssue);
      saveState();
      render();
    });
  });
}

function issueFlowHtml(status) {
  const current = normalizeIssueStatus(status);
  return ["未整改", "整改中", "待复验", "已闭合"].map((item) => `
    <span class="${item === current ? "active" : ""}">${item}</span>
  `).join("");
}

function statusClassForIssue(status) {
  return {
    未整改: "issue-open",
    整改中: "issue-working",
    待复验: "issue-review",
    已闭合: "issue-closed"
  }[normalizeIssueStatus(status)] || "issue-open";
}

function renderDiaries() {
  const diaries = currentProjectItems("diaries");
  els.diaryCount.textContent = `${diaries.length} 条`;
  els.diaryList.innerHTML = diaries.length
    ? diaries
        .map(
          (diary) => `
            <article class="timeline-item">
              <strong>${diary.date}</strong>
              <small>${escapeHtml(diary.weather || "未记录施工条件")}</small>
              <p>${escapeHtml(diary.content)}</p>
            </article>
          `
        )
        .join("")
    : `<article class="timeline-item"><strong>暂无日志</strong><small>保存现场记录后会形成时间线</small></article>`;
}

function renderMeetings() {
  const meetings = currentProjectItems("meetings");
  els.meetingList.innerHTML = meetings.length
    ? meetings
        .map(
          (meeting) => `
            <article class="meeting-card">
              <strong>${meeting.type}｜${meeting.date}</strong>
              <small>进度协调记录</small>
              <p>${escapeHtml(meeting.summary)}</p>
            </article>
          `
        )
        .join("")
    : `<article class="meeting-card"><strong>暂无会议纪要</strong><small>保存纪要后会显示在这里</small></article>`;
}

function drawChart(tasks) {
  const ctx = els.chart.getContext("2d");
  const width = els.chart.width = els.chart.clientWidth * window.devicePixelRatio;
  const height = els.chart.height = 220 * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, width, height);

  const chartWidth = els.chart.clientWidth;
  const points = tasks.length
    ? tasks
        .slice()
        .sort((a, b) => a.planned.localeCompare(b.planned))
        .map((task, index, arr) => ({
          label: task.planned.slice(5),
          plan: Math.round(((index + 1) / arr.length) * 100),
          actual: Number(task.progress || 0)
        }))
    : [
        { label: "05-01", plan: 25, actual: 20 },
        { label: "05-08", plan: 50, actual: 38 },
        { label: "05-15", plan: 75, actual: 62 },
        { label: "05-22", plan: 100, actual: 80 }
      ];

  ctx.strokeStyle = "rgba(139, 235, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.font = "12px Microsoft YaHei";
  ctx.fillStyle = "#83a4b7";
  for (let i = 0; i <= 4; i += 1) {
    const y = 20 + i * 42;
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(chartWidth - 18, y);
    ctx.stroke();
    ctx.fillText(`${100 - i * 25}%`, 6, y + 4);
  }

  plotLine(ctx, points, "plan", "#78a8ff", chartWidth);
  plotLine(ctx, points, "actual", "#7dffcb", chartWidth);

  ctx.fillStyle = "#78a8ff";
  ctx.fillRect(44, 194, 12, 3);
  ctx.fillText("计划", 62, 198);
  ctx.fillStyle = "#7dffcb";
  ctx.fillRect(108, 194, 12, 3);
  ctx.fillText("实际", 126, 198);
}

function plotLine(ctx, points, key, color, chartWidth) {
  const left = 48;
  const right = chartWidth - 24;
  const top = 20;
  const bottom = 188;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = points.length === 1 ? left : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((bottom - top) * point[key]) / 100;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((point, index) => {
    const x = points.length === 1 ? left : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((bottom - top) * point[key]) / 100;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (key === "actual") {
      ctx.fillStyle = "#83a4b7";
      ctx.fillText(point.label, x - 14, 214);
      ctx.fillStyle = color;
    }
  });
}

function setDefaultDates() {
  const defaultDate = localDateText(today);
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = defaultDate;
  });
}

function localDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function render() {
  renderProjectFilter();
  renderDashboard();
  renderTasks();
  renderIssues();
  renderDiaries();
  renderMeetings();
  renderProjectScope();
  renderDiaryScopeFields();
  renderBaselinePanel();
}

window.addEventListener("resize", () => {
  drawChart(currentProjectItems("tasks"));
  if (modelState?.isCanvasModel) drawCanvasBuildingModel();
});
setDefaultDates();
render();
