function normalizeImportRow(row) {
  if (row.__importOverride) return { ...row.__importOverride };
  const activePendingImport = typeof pendingImport === "undefined" ? null : pendingImport;
  const canCache = Boolean(activePendingImport);
  const cacheKey = importRowNormalizeCacheKey();
  if (canCache && row.__normalizedImportRow && row.__normalizedImportCacheKey === cacheKey) return row.__normalizedImportRow;
  const completionStatus = pickCell(row, ["实际完成情况", "完成情况", "施工状态", "状态"], "completionStatus");
  const statusProgress = completionStatusToProgress(completionStatus);
  const sheetUnit = normalizeImportSheetUnit(pickCell(row, ["来源工作表"]));
  const owner = sheetUnit || pickCell(row, ["责任单位", "施工单位", "单位", "参建单位", "分包单位"], "owner");
  const discipline = pickCell(row, ["专业", "专业/分部", "分部", "单位类型", "工种"], "discipline");
  const rawSystem = pickCell(row, ["施工内容", "系统", "系统名称", "工作内容", "任务内容"], "system");
  const scopedSystem = splitScopedSystem(rawSystem);
  const systemOwner = scopedSystem.owner || owner;
  const system = cleanImportText(scopedSystem.system || rawSystem);
  const building = pickCell(row, ["施工部位", "部位", "楼栋", "楼号", "单体", "栋号"], "building");
  const floor = pickCell(row, ["楼层", "层数", "施工楼层", "部位层"], "floor");
  const plannedStartRaw = pickCell(row, ["计划开始", "计划开始时间", "计划开始日期", "计划开工", "计划开工日期", "计划启动"], "plannedStart");
  const plannedStart = normalizeDate(plannedStartRaw);
  const plannedRaw = pickCell(row, ["计划完成", "计划完成时间", "计划完成日期", "计划日期", "计划时间"], "planned");
  const planned = normalizeDate(plannedRaw);
  const note = pickCell(row, ["监理意见", "备注", "说明", "偏差原因"], "note");
  const plannedStartNote = plannedStartRaw && !plannedStart ? `计划开始说明：${plannedStartRaw}` : "";
  const plannedNote = plannedRaw && !planned ? `计划说明：${plannedRaw}` : "";
  const normalized = {
    projectName: pickCell(row, ["项目", "项目名称", "工程名称", "标段"], "projectName"),
    building,
    floor,
    discipline,
    owner: systemOwner,
    system,
    name: pickCell(row, ["节点名称", "节点", "任务名称", "进度节点"], "name"),
    plannedStart,
    planned,
    actual: "",
    progress: statusProgress ?? pickCell(row, ["完成率", "进度", "实际进度", "完成百分比"], "progress"),
    note: [note, plannedStartNote, plannedNote].filter(Boolean).join("；"),
    plannedProgress: pickCell(row, ["计划完成率", "计划进度"], "plannedProgress"),
    completionStatus
  };
  if (canCache) {
    row.__normalizedImportRow = normalized;
    row.__normalizedImportCacheKey = cacheKey;
  }
  return normalized;
}

function normalizeImportSheetUnit(value) {
  const text = String(value || "").trim();
  if (!text || /说明|填报说明|readme/i.test(text)) return "";
  if (!/(单位|分包|班组|机电|消防|智能化|总包|土建|精装|装饰)/.test(text)) return "";
  return text.includes("单位") ? text : `${text}单位`;
}

function importRowNormalizeCacheKey() {
  const activePendingImport = typeof pendingImport === "undefined" ? null : pendingImport;
  return JSON.stringify(activePendingImport?.mapping || state.uiPreferences?.importFieldMap || {});
}

function importRowNormalized(row) {
  return row.__normalizedImportRow || row.normalized || normalizeImportRow(row);
}

function clearImportRowNormalizeCache(rows) {
  rows.forEach((row) => {
    delete row.__normalizedImportRow;
    delete row.__normalizedImportCacheKey;
  });
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
    return { progress: imported.progress, note: imported.note || existing.note, reviewStatus: imported.reviewStatus };
  }
  if (policy === "planOnly") {
    return { plannedStart: imported.plannedStart, planned: imported.planned, plannedProgress: imported.plannedProgress };
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
    const normalized = importRowNormalized(row);
    const projectName = importProjectNameForRow(normalized, options);
    const project = state.projects.find((item) => item.name === projectName);
    const importedTask = normalizedRowToTask(normalized, project?.id || `preview-${projectName}`, row, "");
    const key = excelSourceTaskKey(importedTask) || taskKey(importedTask);
    if (!byKey.has(key)) {
      byKey.set(key, row);
      return;
    }
    if (policy === "conflict") {
      conflicts.push(key);
      return;
    }
    if (policy === "maxProgress") {
      const previous = importRowNormalized(byKey.get(key));
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
  if (mapped && row[mapped] != null && !isBlankImportText(row[mapped])) return cleanImportText(row[mapped]);
  const headerMap = row.__importHeaderMap || activePendingImport?.headerMap;
  const mappedHeader = field && headerMap?.[field];
  if (mappedHeader && row[mappedHeader] != null && !isBlankImportText(row[mappedHeader])) return cleanImportText(row[mappedHeader]);
  const headerLookup = row.__importHeaderLookup || activePendingImport?.headerLookup;
  for (const name of names) {
    const key = headerLookup?.[name] || Object.keys(row).find((candidate) => candidate.trim() === name);
    if (key && !isBlankImportText(row[key])) return cleanImportText(row[key]);
  }
  const inferredHeader = field && inferImportHeaderForField(Object.keys(row), field);
  if (inferredHeader && !isBlankImportText(row[inferredHeader])) return cleanImportText(row[inferredHeader]);
  return "";
}

function cleanImportText(value) {
  return String(value ?? "").trim();
}

function isBlankImportText(value) {
  const text = cleanImportText(value).toLowerCase();
  return !text || text === "undefined" || text === "null";
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
    const matched = headers.find((header) => aliases.some((alias) => header.trim() === alias)) || inferImportHeaderForField(headers, field);
    if (matched) map[field] = matched;
  });
  return map;
}

function buildImportHeaderLookup(rows) {
  const lookup = {};
  importHeaders(rows).forEach((header) => {
    lookup[header.trim()] = header;
    const normalized = normalizeImportHeaderText(header);
    if (normalized) lookup[normalized] = header;
  });
  return lookup;
}

function buildImportHeaderMap(rows) {
  const lookup = buildImportHeaderLookup(rows);
  const map = {};
  IMPORT_FIELD_DEFINITIONS.forEach(([field, , aliases]) => {
    const mapped = state.uiPreferences?.importFieldMap?.[field];
    if (mapped && lookup[String(mapped).trim()]) {
      map[field] = lookup[String(mapped).trim()];
      return;
    }
    const matched = aliases.find((alias) => lookup[alias]);
    if (matched) {
      map[field] = lookup[matched];
      return;
    }
    const inferred = inferImportHeaderForField(Object.values(lookup), field);
    if (inferred) map[field] = inferred;
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

function inferImportHeaderForField(headers, field) {
  let best = { header: "", score: 0 };
  (headers || []).forEach((header) => {
    if (!header || String(header).startsWith("__")) return;
    const score = importHeaderMatchScore(header, field);
    if (score > best.score) best = { header, score };
  });
  return best.score >= 6 ? best.header : "";
}

function inferImportFieldForHeader(header) {
  let best = { field: "", score: 0 };
  IMPORT_FIELD_DEFINITIONS.forEach(([field]) => {
    const score = importHeaderMatchScore(header, field);
    if (score > best.score) best = { field, score };
  });
  return best.score >= 6 ? best.field : "";
}

function importHeaderMatchScore(header, field) {
  const definition = IMPORT_FIELD_DEFINITIONS.find((item) => item[0] === field);
  if (!definition) return 0;
  const normalizedHeader = normalizeImportHeaderText(header);
  if (!normalizedHeader) return 0;
  if (field === "planned" && /实际/.test(normalizedHeader) && !/计划/.test(normalizedHeader)) return 0;
  if (field === "planned" && /(计划开始|计划开工|计划启动)/.test(normalizedHeader)) return 0;
  if (field === "progress" && /(情况|状态)/.test(normalizedHeader) && !/(率|比例|百分比|进度)/.test(normalizedHeader)) return 0;
  const aliases = definition[2] || [];
  let score = 0;
  aliases.forEach((alias) => {
    const normalizedAlias = normalizeImportHeaderText(alias);
    if (!normalizedAlias) return;
    if (normalizedHeader === normalizedAlias) score = Math.max(score, 16);
    else if (normalizedHeader.includes(normalizedAlias)) score = Math.max(score, Math.min(14, normalizedAlias.length + 5));
    else if (normalizedAlias.includes(normalizedHeader) && normalizedHeader.length >= 2) score = Math.max(score, Math.min(10, normalizedHeader.length + 3));
  });
  return Math.max(score, importHeaderKeywordScore(normalizedHeader, field));
}

function importHeaderKeywordScore(header, field) {
  const any = (...words) => words.some((word) => header.includes(word));
  const all = (...words) => words.every((word) => header.includes(word));
  if (field === "projectName" && any("项目", "工程", "标段")) return 7;
  if (field === "building" && any("楼栋", "楼号", "楼座", "栋号", "单体", "区域", "部位")) return 9;
  if (field === "floor" && any("楼层", "层数", "施工层", "部位层")) return 9;
  if (field === "discipline" && any("专业", "分部", "分项", "工种")) return 8;
  if (field === "owner" && any("责任单位", "施工单位", "分包", "班组", "承包单位")) return 10;
  if (field === "system" && any("施工内容", "工作内容", "任务内容", "作业内容", "工序", "系统")) return 10;
  if (field === "name" && all("节点", "名称")) return 9;
  if (field === "plannedStart" && any("计划开始", "计划开工", "计划启动") || field === "plannedStart" && all("计划", "开始")) return 10;
  if (field === "planned" && any("计划完成", "计划完工", "计划结束") || field === "planned" && all("计划", "日期")) return 10;
  if (field === "progress" && any("完成率", "完成比例", "百分比", "进度")) return 10;
  if (field === "completionStatus" && any("完成情况", "施工状态", "进展状态", "当前状态")) return 10;
  if (field === "note" && any("备注", "说明", "意见", "原因", "问题")) return 8;
  if (field === "plannedProgress" && all("计划", "进度")) return 9;
  return 0;
}

function normalizeImportHeaderText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[_\-—/\\|·.]/g, "");
}

