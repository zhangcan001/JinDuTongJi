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

function parseFloorNumber(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function resolveBuildingName(value) {
  const text = String(value || "");
  if (text.includes("地下")) return "地下室";
  const scope = typeof currentProjectScope === "function" ? currentProjectScope() : { buildings: [] };
  return scope.buildings.find((building) => text.includes(building.name))?.name || text.replace(/（.*?）|\(.*?\)/g, "");
}

function parseBuilding(value) {
  const text = String(value);
  const floorMatch = text.match(/(\d+)\s*层/) || text.match(/[,\s，](\d+)$/);
  const name = text
    .replace(/[（(]?\d+\s*层[）)]?/g, "")
    .replace(/[,\s，]\d+$/, "")
    .trim();
  return { name: name || text, floors: floorMatch ? Number(floorMatch[1]) : 1 };
}

function normalizedBuildingKey(task) {
  const text = String(task.building || "");
  if (text.includes("地下")) return "地下室";
  const scopes = globalThis.state?.projectScopes || demoState.projectScopes;
  const scope = scopes?.[task.projectId] || { buildings: [] };
  return scope.buildings.find((building) => text.includes(building.name))?.name
    || text.replace(/（.*?）|\(.*?\)/g, "").trim();
}

function normalizedFloorKey(value) {
  const text = String(value || "").trim();
  if (text.includes("地下")) return "地下室";
  if (text.includes("整栋")) return "整栋";
  const floor = parseFloorNumber(text);
  return floor ? `${floor}层` : text;
}

function normalizedOwnerKey(value) {
  const text = String(value || "").replace("单位", "").trim();
  if (text.includes("电梯")) return "电梯";
  if (text.includes("机电")) return "机电";
  if (text.includes("消防")) return "消防";
  if (text.includes("智能")) return "智能化";
  return text || "未填责任单位";
}

function splitScopedSystem(value) {
  const text = String(value || "").trim();
  const separator = text.includes("｜") ? "｜" : text.includes("|") ? "|" : "";
  if (!separator) return { owner: "", system: text };
  const [owner, ...rest] = text.split(separator);
  return { owner: owner.trim(), system: rest.join(separator).trim() };
}

function taskMatchesScopeUnit(task, unit) {
  if (!task || !unit) return false;
  const unitName = String(unit.name || "").trim();
  const taskOwnerText = String(task.owner || task.discipline || "").trim();
  if (taskOwnerText) {
    const taskOwnerKey = normalizedOwnerKey(taskOwnerText);
    const unitKey = normalizedOwnerKey(unitName);
    return taskOwnerKey === unitKey || taskOwnerText === unitName || unitName.includes(taskOwnerText);
  }
  return Array.isArray(unit.systems) && unit.systems.includes(task.system);
}

function taskKey(task) {
  if (task.building && task.floor && task.system) {
    return [
      task.projectId,
      normalizedBuildingKey(task),
      normalizedFloorKey(task.floor),
      String(task.system || "").trim(),
      normalizedOwnerKey(task.owner || task.discipline || "")
    ].join("|");
  }
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

function findScopeUnitForImportedRow(scope, imported) {
  const discipline = String(imported.discipline || inferDiscipline(imported.owner, imported.system) || "").trim();
  const owner = String(imported.owner || "").trim();
  return scope.units.find((unit) => {
    const unitName = String(unit.name || "").trim();
    if (!unitName) return false;
    if (owner && unitName === owner) return true;
    if (discipline && unitName === discipline) return true;
    if (discipline && unitName.includes(discipline)) return true;
    if (owner && unitName.includes(owner)) return true;
    return false;
  }) || null;
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

function removeCoveredElevatorFloorTasks(importedTask) {
  if (!String(importedTask.owner || importedTask.discipline || "").includes("电梯")) return;
  if (normalizedFloorKey(importedTask.floor) !== "整栋") return;
  const buildingKey = normalizedBuildingKey(importedTask);
  state.tasks = state.tasks.filter((task) => {
    if (task.projectId !== importedTask.projectId) return true;
    if (normalizedOwnerKey(task.owner || task.discipline || "") !== "电梯") return true;
    if (normalizedBuildingKey(task) !== buildingKey) return true;
    return normalizedFloorKey(task.floor) === "整栋";
  });
}

function findExistingTaskForImport(importedTask) {
  const importedKey = taskKey(importedTask);
  return state.tasks.find((task) => taskKey(task) === importedKey);
}
