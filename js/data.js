const STORAGE_KEY = "supervision-progress-app-v1";
const today = new Date();

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneData(value) {
  if (window.structuredClone) return window.structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

function emptyStateHtml(title, detail = "", className = "empty-state") {
  return `<div class="${escapeAttr(className)}"><strong>${escapeHtml(title)}</strong>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
}

function tableEmptyRowHtml(colspan, title, detail = "") {
  return `<tr><td colspan="${Number(colspan) || 1}">${emptyStateHtml(title, detail)}</td></tr>`;
}

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
      id: createId(),
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
      id: createId(),
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
      id: createId(),
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
      id: createId(),
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
      id: createId(),
      projectId: "p1",
      title: "钢筋班组人数不足影响地下室封顶",
      owner: "总包一标段",
      deadline: "2026-05-09",
      severity: "紧急",
      status: "未闭合",
      action: "5 月 8 日前补足作业人员，提交夜间施工计划和材料保障清单。"
    },
    {
      id: createId(),
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
      id: createId(),
      projectId: "p1",
      date: "2026-05-07",
      weather: "晴，现场劳动力 126 人，塔吊 2 台正常",
      content: "地下室 B 区墙柱钢筋绑扎完成约 70%。监理要求施工单位增加夜间作业照明并同步完成节点复核。"
    }
  ],
  meetings: [
    {
      id: createId(),
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
          id: createId(),
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
      id: createId(),
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
      note: buildFloorDemoNote(progress, discipline, system),
      source: FLOOR_DEMO_SOURCE
    });
  });

  return tasks;
}

function buildFloorDemoNote(progress, discipline, system) {
  if (progress >= 100) return `${discipline}${system}\u5df2\u5b8c\u6210\uff0c\u5f85\u76d1\u7406\u590d\u6838\u5f52\u6863\u3002`;
  if (progress >= 70) return `${discipline}${system}\u57fa\u672c\u6210\u578b\uff0c\u8bf7\u8ddf\u8fdb\u5269\u4f59\u5de5\u5e8f\u548c\u8282\u70b9\u590d\u6838\u3002`;
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


