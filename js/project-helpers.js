function normalizeDate(value) {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return localDateText(value);
  const text = String(value)
    .trim()
    .replace(/^[']+/, "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, " ")
    .replace(/[，,].*$/, "")
    .replace(/星期[一二三四五六日天]|周[一二三四五六日天]/g, "")
    .replace(/[（(]\s*[周星期]?[一二三四五六日天]\s*[）)]/g, "")
    .replace(/(前|之前|以前|以前完成|完成|截止|止|前完成)$/g, "")
    .trim();
  if (!text) return "";

  const serial = Number(text);
  if (/^\d+(\.\d+)?$/.test(text) && serial > 25569 && serial < 60000) {
    const excelDate = new Date(Math.round((serial - 25569) * 86400 * 1000));
    return localDateText(excelDate);
  }

  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (compact) return validDateText(compact[1], compact[2], compact[3]);

  const full = text.match(/(\d{4})\s*[年./\-\\\s]\s*(\d{1,2})\s*(?:月|[./\-\\\s])\s*(\d{1,2})/);
  if (full) return validDateText(full[1], full[2], full[3]);

  const yearLast = text.match(/^(\d{1,2})[./\-\\](\d{1,2})[./\-\\](\d{2,4})(?:\s|$)/);
  if (yearLast) {
    const year = normalizeDateYear(yearLast[3]);
    const first = Number(yearLast[1]);
    const second = Number(yearLast[2]);
    if (first > 12 && second <= 12) return validDateText(year, second, first);
    return validDateText(year, first, second);
  }

  const yearFirstShort = text.match(/^(\d{2})[./\-\\](\d{1,2})[./\-\\](\d{1,2})(?:\s|$)/);
  if (yearFirstShort) return validDateText(normalizeDateYear(yearFirstShort[1]), yearFirstShort[2], yearFirstShort[3]);

  const chinese = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/);
  if (chinese) return validDateText(String(today.getFullYear()), chinese[1], chinese[2]);

  const chineseText = normalizeChineseDateText(text);
  if (chineseText) return chineseText;

  const short = text.match(/^(\d{1,2})[./\-](\d{1,2})(?:\s|$)/);
  if (short) return validDateText(String(today.getFullYear()), short[1], short[2]);

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return localDateText(date);
  return "";
}

function normalizeDateYear(value) {
  const year = Number(value);
  if (String(value).length === 2) return String(year >= 50 ? 1900 + year : 2000 + year);
  return String(year);
}

function validDateText(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return "";
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeChineseDateText(value) {
  const text = String(value || "").replace(/\s+/g, "");
  const yearFull = text.match(/([零〇一二三四五六七八九]{4})年([正一二三四五六七八九十冬腊]{1,3})月([初一二三四五六七八九十廿卅]{1,3})(?:日|号)?/);
  if (yearFull) return validDateText(chineseYearToNumber(yearFull[1]), chineseMonthToNumber(yearFull[2]), chineseDayToNumber(yearFull[3]));
  const short = text.match(/([正一二三四五六七八九十冬腊]{1,3})月([初一二三四五六七八九十廿卅]{1,3})(?:日|号)?/);
  if (short) return validDateText(String(today.getFullYear()), chineseMonthToNumber(short[1]), chineseDayToNumber(short[2]));
  return "";
}

function chineseYearToNumber(value) {
  const digits = { 零: 0, "〇": 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  return String(value || "").split("").map((char) => digits[char]).join("");
}

function chineseMonthToNumber(value) {
  if (value === "正") return 1;
  if (value === "冬") return 11;
  if (value === "腊") return 12;
  return chineseDayToNumber(value);
}

function chineseDayToNumber(value) {
  const text = String(value || "").replace(/^初/, "");
  const digits = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (digits[text]) return digits[text];
  if (text === "十") return 10;
  if (text.startsWith("十")) return 10 + Number(digits[text.slice(1)] || 0);
  if (text.startsWith("廿")) return 20 + Number(digits[text.slice(1)] || 0);
  if (text.startsWith("卅")) return 30 + Number(digits[text.slice(1)] || 0);
  if (text.endsWith("十")) return Number(digits[text[0]] || 0) * 10;
  const match = text.match(/^([一二三四五六七八九])十([一二三四五六七八九])$/);
  if (match) return Number(digits[match[1]] || 0) * 10 + Number(digits[match[2]] || 0);
  return Number(text);
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

function buildingFromImportedLocation(imported) {
  const building = parseBuilding(imported.building || "");
  const importedFloor = parseFloorNumber(imported.floor);
  return {
    ...building,
    floors: Math.max(1, building.floors || 1, importedFloor || 0)
  };
}

function findScopeBuilding(scope, importedBuildingName) {
  const name = String(importedBuildingName || "").trim();
  if (!name) return null;
  return scope.buildings.find((building) => name === building.name || name.includes(building.name) || building.name.includes(name)) || null;
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

function deriveTaskFields(task) {
  if (!task) return task;
  task._statusClass = typeof getTaskStatus === "function" ? getTaskStatus(task).className : "";
  const buildingText = String(task.building || task.name || "");
  task._buildingKey = globalThis.state ? resolveBuildingName(buildingText) : buildingText.replace(/（.*?）|\(.*?\)/g, "");
  task._floorKey = normalizedFloorKey(task.floor || "");
  task._ownerKey = task.owner || task.discipline || "未填单位";
  task._searchText = [
    task.name,
    task.note,
    task.building,
    task.floor,
    task.system,
    task.discipline,
    task.owner,
    task.plannedStart,
    task.planned
  ].join(" ").toLowerCase();
  return task;
}

function deriveTaskFieldsForList(tasks) {
  (tasks || []).forEach(deriveTaskFields);
  return tasks || [];
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

function taskIsImportedScopeSource(task) {
  return task && task.source !== "floor-demo-v3" && String(task.building || "").trim() && String(task.floor || "").trim();
}

function syncProjectScopeBuildingsFromTasks(projectId) {
  const scope = ensureProjectScope(projectId);
  const buildingMap = new Map();
  let basement = scope.basement || "";
  state.tasks
    .filter((task) => task.projectId === projectId && taskIsImportedScopeSource(task))
    .forEach((task) => {
      if (String(task.building || "").includes("地下") || String(task.floor || "").includes("地下")) {
        basement = task.building || basement || "地下室";
        return;
      }
      const importedBuilding = buildingFromImportedLocation(task);
      const current = buildingMap.get(importedBuilding.name);
      buildingMap.set(importedBuilding.name, {
        name: importedBuilding.name,
        floors: Math.max(Number(current?.floors || 1), importedBuilding.floors)
      });
    });
  if (!buildingMap.size && !basement) return false;
  scope.buildings = Array.from(buildingMap.values()).sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN", { numeric: true }));
  scope.basement = basement;
  return true;
}

function ensureScopeItems(scope, imported) {
  let added = 0;
  if (imported.building) {
    if (imported.building.includes("地下")) {
      if (!scope.basement) {
        scope.basement = imported.building;
        added += 1;
      }
    } else {
      const importedBuilding = buildingFromImportedLocation(imported);
      const existingBuilding = findScopeBuilding(scope, importedBuilding.name);
      if (existingBuilding) {
        const nextFloors = Math.max(Number(existingBuilding.floors || 1), importedBuilding.floors);
        if (nextFloors !== Number(existingBuilding.floors || 1)) {
          existingBuilding.floors = nextFloors;
          added += 1;
        }
      } else {
        scope.buildings.push(importedBuilding);
        added += 1;
      }
    }
  }

  const discipline = imported.discipline || inferDiscipline(imported.owner, imported.system);
  const unitName = discipline.includes("单位") ? discipline : `${discipline || "其他"}单位`;
  let unit = scope.units.find((item) => item.name === unitName || item.name.includes(discipline));
  if (!unit) {
    unit = { name: unitName, code: unitCode(unitName), statType: "task", systems: [] };
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
    const unitKey = normalizedOwnerKey(unitName);
    const ownerKey = normalizedOwnerKey(owner);
    const disciplineKey = normalizedOwnerKey(discipline);
    if (!unitName) return false;
    if (owner && unitName === owner) return true;
    if (discipline && unitName === discipline) return true;
    if (owner && unitKey === ownerKey) return true;
    if (discipline && unitKey === disciplineKey) return true;
    if (discipline && unitName.includes(discipline)) return true;
    if (owner && unitName.includes(owner)) return true;
    return false;
  }) || null;
}

function scopeUnitHasSystem(scope, imported, relatedUnit = null) {
  const system = String(imported?.system || "").trim();
  if (!system) return true;
  const ownerKey = normalizedOwnerKey(imported?.owner || imported?.discipline || inferDiscipline(imported?.owner, system));
  const candidates = [
    ...(relatedUnit ? [relatedUnit] : []),
    ...((scope?.units || []).filter((unit) => normalizedOwnerKey(unit.name) === ownerKey)),
    ...Object.values(demoState.projectScopes || {}).flatMap((projectScope) =>
      (projectScope.units || []).filter((unit) => normalizedOwnerKey(unit.name) === ownerKey)
    )
  ];
  return candidates.some((unit) => (unit.systems || []).includes(system));
}

function inferDiscipline(owner, system) {
  const text = `${owner || ""}${system || ""}`;
  if (text.includes("消防") || text.includes("喷淋") || text.includes("消火栓") || text.includes("防排烟")) return "消防";
  if (text.includes("智能") || text.includes("线缆")) return "智能化";
  if (text.includes("机电") || text.includes("空调") || text.includes("给水") || text.includes("排水") || text.includes("热水")) return "机电";
  return "其他";
}

function unitCode(name) {
  if (name.includes("机电")) return "MEP";
  if (name.includes("消防")) return "FIRE";
  if (name.includes("智能")) return "IBMS";
  return "UNIT";
}

function findExistingTaskForImport(importedTask) {
  if (importedTask?.excelRecordKey) {
    const matchedByRecord = state.tasks.find((task) => task.excelRecordKey === importedTask.excelRecordKey);
    if (matchedByRecord) return matchedByRecord;
  }
  const importedExcelKey = excelSourceTaskKey(importedTask);
  if (importedExcelKey) {
    const matchedByExcel = state.tasks.find((task) => excelSourceTaskKey(task) === importedExcelKey);
    if (matchedByExcel) return matchedByExcel;
  }
  const importedKey = taskKey(importedTask);
  return state.tasks.find((task) => taskKey(task) === importedKey);
}

function excelSourceTaskKey(task) {
  if (task?.excelRecordKey) return task.excelRecordKey;
  const source = task?.excelSource;
  const rowNumber = Number(source?.rowNumber || 0);
  const sheetName = String(source?.sheetName || "").trim();
  if (!task?.projectId || !sheetName || !rowNumber) return "";
  return [task.projectId, sheetName, rowNumber].join("|");
}
