function normalizeImportRow(row) {
  if (row.__importOverride) return { ...row.__importOverride };
  const completionStatus = pickCell(row, ["实际完成情况", "完成情况", "施工状态", "状态"], "completionStatus");
  const statusProgress = completionStatusToProgress(completionStatus);
  const elevatorProgress = normalizePercent(pickCell(row, ["完成百分比", "完成率"], "progress"));
  const owner = pickCell(row, ["责任单位", "施工单位", "单位", "参建单位", "分包单位"], "owner") || pickCell(row, ["来源工作表"]);
  const discipline = pickCell(row, ["专业", "专业/分部", "分部", "单位类型", "工种"], "discipline");
  const rawSystem = pickCell(row, ["施工内容", "系统", "系统名称", "工作内容", "任务内容"], "system");
  const scopedSystem = splitScopedSystem(rawSystem);
  const systemOwner = scopedSystem.owner || owner;
  const system = scopedSystem.system || rawSystem || (String(systemOwner).includes("电梯") ? "设备安装" : "");
  const building = pickCell(row, ["施工部位", "部位", "楼栋", "楼号", "单体", "栋号"], "building");
  const floor = pickCell(row, ["楼层", "层数", "施工楼层", "部位层"], "floor") || (String(systemOwner).includes("电梯") ? "整栋" : "");
  const plannedRaw = pickCell(row, ["计划完成", "计划完成时间", "计划完成日期", "计划日期", "计划时间"], "planned");
  const planned = normalizeDate(plannedRaw);
  const note = pickCell(row, ["监理意见", "备注", "说明", "偏差原因"], "note");
  const plannedNote = plannedRaw && !planned ? `计划说明：${plannedRaw}` : "";
  return {
    projectName: pickCell(row, ["项目", "项目名称", "工程名称", "标段"], "projectName"),
    building,
    floor,
    discipline,
    owner: systemOwner,
    system,
    name: pickCell(row, ["节点名称", "节点", "任务名称", "进度节点"], "name"),
    planned,
    actual: normalizeDate(pickCell(row, ["实际完成", "实际完成日期", "实际日期", "完成日期"], "actual")),
    progress: statusProgress ?? elevatorProgress ?? pickCell(row, ["完成率", "进度", "实际进度", "完成百分比"], "progress"),
    note: [note, plannedNote].filter(Boolean).join("；"),
    plannedProgress: pickCell(row, ["计划完成率", "计划进度"], "plannedProgress"),
    completionStatus
  };
}

function projectForImportedRow(normalized, options = importOptions()) {
  return findOrCreateProject(importProjectNameForRow(normalized, options));
}

function rowAllowedByImportScope(normalized, options = importOptions()) {
  if (options.scope !== "currentUnit") return true;
  const selected = state.selectedContractorUnit || "all";
  if (selected === "all") return true;
  return `${normalized.owner || ""}${normalized.discipline || ""}`.includes(selected.replace("单位", ""));
}

function ensureApprovedScopeItems(scope, normalized) {
  const activePendingImport = typeof pendingImport === "undefined" ? null : pendingImport;
  if (!activePendingImport?.approvedScopeKeys) return ensureScopeItems(scope, normalized);
  const before = cloneData(scope);
  const added = ensureScopeItems(scope, normalized);
  if (!added) return 0;
  const keep = activePendingImport.approvedScopeKeys;
  scope.basement = !before.basement && scope.basement && !keep.has(`basement:${scope.basement}`) ? before.basement : scope.basement;
  scope.buildings = scope.buildings.filter((building) => before.buildings.some((item) => item.name === building.name) || keep.has(`building:${normalized.building}`));
  scope.units = scope.units.filter((unit) => {
    const existed = before.units.some((item) => item.name === unit.name);
    const approvedUnit = keep.has(`unit:${unit.name}`);
    if (!existed && !approvedUnit) return false;
    const previous = before.units.find((item) => item.name === unit.name);
    if (previous) {
      unit.systems = unit.systems.filter((system) => previous.systems.includes(system) || keep.has(`system:${unit.name}｜${system}`));
    }
    return true;
  });
  return countScopeDiff(before, scope);
}

function countScopeDiff(before, after) {
  const beforeBuildings = new Set(before.buildings.map((item) => item.name));
  const beforeUnits = new Set(before.units.map((item) => item.name));
  const beforeSystems = new Set(before.units.flatMap((unit) => unit.systems.map((system) => `${unit.name}｜${system}`)));
  return Number(!before.basement && after.basement)
    + after.buildings.filter((item) => !beforeBuildings.has(item.name)).length
    + after.units.filter((item) => !beforeUnits.has(item.name)).length
    + after.units.flatMap((unit) => unit.systems.map((system) => `${unit.name}｜${system}`)).filter((key) => !beforeSystems.has(key)).length;
}

function mergeImportedTask(existing, imported, policy) {
  if (policy === "progressOnly") {
    return { progress: imported.progress, actual: imported.actual, note: imported.note || existing.note, reviewStatus: imported.reviewStatus };
  }
  if (policy === "planOnly") {
    return { planned: imported.planned, plannedProgress: imported.plannedProgress };
  }
  if (policy === "skipBlank") {
    return Object.fromEntries(Object.entries(imported).filter(([, value]) => value !== "" && value != null));
  }
  return imported;
}

function resolveDuplicateImportRows(rows, policy, options = importOptions()) {
  const byKey = new Map();
  const conflicts = [];
  rows.forEach((row) => {
    const normalized = normalizeImportRow(row);
    const projectName = importProjectNameForRow(normalized, options);
    const project = state.projects.find((item) => item.name === projectName);
    const importedTask = normalizedRowToTask(normalized, project?.id || `preview-${projectName}`);
    const key = taskKey(importedTask);
    if (!byKey.has(key)) {
      byKey.set(key, row);
      return;
    }
    if (policy === "conflict") {
      conflicts.push(key);
      return;
    }
    if (policy === "maxProgress") {
      const previous = normalizeImportRow(byKey.get(key));
      if (Number(normalized.progress || 0) >= Number(previous.progress || 0)) byKey.set(key, row);
      return;
    }
    byKey.set(key, row);
  });
  conflicts.forEach((key) => byKey.delete(key));
  return [...byKey.values()];
}

function normalizePercent(value) {
  if (value === "") return null;
  const text = String(value || "").trim();
  if (!text) return null;
  const parsed = Number(text.replace("%", ""));
  if (Number.isNaN(parsed)) return null;
  return text.includes("%") || parsed > 1 ? parsed : Math.round(parsed * 100);
}

function completionStatusToProgress(status) {
  const text = String(status || "").trim();
  if (!text) return null;
  const percent = normalizePercent(text);
  if (percent != null) return percent;
  if (text === COMPLETION_STATUS.DONE) return 100;
  if (text === COMPLETION_STATUS.ACTIVE) return 50;
  if (text === COMPLETION_STATUS.NOT_STARTED) return 0;
  return null;
}

function pickCell(row, names, field = "") {
  const activePendingImport = typeof pendingImport === "undefined" ? null : pendingImport;
  const mapped = field && (activePendingImport?.mapping?.[field] || state.uiPreferences?.importFieldMap?.[field]);
  if (mapped && row[mapped] != null && String(row[mapped]).trim()) return String(row[mapped]).trim();
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => candidate.trim() === name);
    if (key && String(row[key]).trim()) return String(row[key]).trim();
  }
  return "";
}

function importProjectNameForRow(normalized, options = importOptions()) {
  return options.scope === "fromFile" ? (normalized.projectName || currentProjectName()) : currentProjectName();
}

function importScopeForValidation(normalized, options = importOptions()) {
  if (options.scope !== "fromFile") return currentProjectScope();
  return importScopeForRow(normalized);
}

function inferImportFieldMap(rows) {
  const headers = importHeaders(rows);
  const map = {};
  IMPORT_FIELD_DEFINITIONS.forEach(([field, , aliases]) => {
    const matched = headers.find((header) => aliases.some((alias) => header.trim() === alias));
    if (matched) map[field] = matched;
  });
  return map;
}

function importHeaders(rows) {
  const headers = new Set();
  rows.slice(0, 20).forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!key.startsWith("__")) headers.add(key);
    });
  });
  return [...headers];
}

