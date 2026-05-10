function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const parsed = saved ? JSON.parse(saved) : cloneData(demoState);
    return migrateState(parsed);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return migrateState(cloneData(demoState));
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    invalidateStateCache();
    mirrorStateToIndexedDB();
  } catch {
    window.alert("本地存储空间不足，当前修改可能无法保存。建议先导出节点台账或清理浏览器存储。");
  }
}

function showToast(message, tone = "ok") {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.dataset.tone = tone;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 2400);
}

function invalidateStateCache() {
  if (!stateCache) return;
  stateCache.version += 1;
  stateCache.projectItems = new Map();
}

function mirrorStateToIndexedDB() {
  if (!window.indexedDB) return;
  const request = indexedDB.open("JinDuTongJiDB", 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore("snapshots", { keyPath: "id" });
  };
  request.onsuccess = () => {
    const db = request.result;
    const tx = db.transaction("snapshots", "readwrite");
    tx.objectStore("snapshots").put({
      id: "latest",
      savedAt: new Date().toISOString(),
      state: cloneData(state)
    });
    tx.oncomplete = () => db.close();
    tx.onerror = () => db.close();
  };
}

function currentRole() {
  return state.currentRole || "admin";
}

function canEditData() {
  return currentRole() !== "viewer";
}

function roleLabel(role = currentRole()) {
  return {
    admin: "管理员",
    pm: "项目经理",
    contractor: "施工单位",
    supervisor: "监理",
    viewer: "只读查看"
  }[role] || "管理员";
}

function ensureCanEdit(action = "执行此操作") {
  if (canEditData()) return true;
  window.alert(`当前为只读查看角色，不能${action}。`);
  return false;
}

function recordAudit(action, detail = "") {
  state.auditLogs = state.auditLogs || [];
  state.auditLogs.unshift({
    id: createId(),
    projectId: state.selectedProjectId,
    role: currentRole(),
    action,
    detail,
    time: new Date().toISOString()
  });
  state.auditLogs = state.auditLogs.slice(0, 80);
}

function createRestorePoint(reason) {
  state.restorePoints = state.restorePoints || [];
  const snapshot = cloneData(state);
  snapshot.restorePoints = [];
  state.restorePoints.unshift({
    id: createId(),
    reason,
    createdAt: new Date().toISOString(),
    projectId: state.selectedProjectId,
    taskCount: state.tasks?.length || 0,
    issueCount: state.issues?.length || 0,
    state: snapshot
  });
  state.restorePoints = state.restorePoints.slice(0, 5);
}

function restoreFromPoint(pointId) {
  if (!ensureCanEdit("恢复自动恢复点")) return;
  const point = (state.restorePoints || []).find((item) => item.id === pointId);
  if (!point) return;
  if (!window.confirm(`确定恢复到“${point.reason}”之前的状态吗？`)) return;
  const keepPoints = state.restorePoints || [];
  state = migrateState(cloneData(point.state));
  state.restorePoints = keepPoints;
  recordAudit("恢复自动恢复点", point.reason);
  selectedBuildingName = "";
  selectedModelFloor = "";
  lastImportFocus = null;
  pendingImport = null;
  saveState();
  render();
}

function importScopeForRow(normalized) {
  const projectName = normalized.projectName || currentProjectName();
  const project = state.projects.find((item) => item.name === projectName);
  return project ? state.projectScopes?.[project.id] || { basement: "", buildings: [], units: [] } : { basement: "", buildings: [], units: [] };
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
  return "综合";
}

function currentProjectItems(key) {
  const cacheKey = `${key}:${state.selectedProjectId}`;
  if (!stateCache.projectItems.has(cacheKey)) {
    stateCache.projectItems.set(cacheKey, state[key].filter((item) => item.projectId === state.selectedProjectId));
  }
  const items = stateCache.projectItems.get(cacheKey);
  if (currentRole() === "contractor" && state.selectedContractorUnit && state.selectedContractorUnit !== "all") {
    return items.filter((item) => `${item.owner || ""}${item.discipline || ""}`.includes(state.selectedContractorUnit.replace("单位", "")));
  }
  return items;
}

function currentProjectScope() {
  return state.projectScopes?.[state.selectedProjectId] || { basement: "", buildings: [], units: [] };
}

function migrateState(nextState) {
  nextState.projectScopes = {
    ...cloneData(demoState.projectScopes),
    ...(nextState.projectScopes || {})
  };
  nextState.importHistory = nextState.importHistory || [];
  nextState.planBaselines = nextState.planBaselines || [];
  nextState.restorePoints = nextState.restorePoints || [];
  nextState.auditLogs = nextState.auditLogs || [];
  nextState.currentRole = nextState.currentRole || "admin";
  nextState.selectedContractorUnit = nextState.selectedContractorUnit || "all";
  nextState.progressWeights = nextState.progressWeights || {};
  nextState.importVersions = nextState.importVersions || [];
  nextState.pendingImports = nextState.pendingImports || [];
  nextState.archivedProjectIds = nextState.archivedProjectIds || [];
  nextState.uiPreferences = {
    activeView: "dashboard",
    officeMode: false,
    taskFilters: {},
    modelFilters: {},
    lastBackupAt: "",
    dashboardCards: ["today", "ops", "weekly", "chart", "analytics"],
    ...(nextState.uiPreferences || {})
  };
  if ((nextState.uiPreferences.dashboardCards || []).some((item) => ["deviation", "dependency", "ranking"].includes(item))) {
    nextState.uiPreferences.dashboardCards = ["today", "ops", "weekly", "chart", "analytics"];
  }
  nextState.tasks = mergeFloorDemoTasks(nextState);
  nextState.tasks = (nextState.tasks || []).map((task) => ({
    plannedProgress: expectedProgress({ planned: task.planned, actual: task.actual }),
    reviewStatus: "approved",
    ...task
  }));
  nextState.issues = (nextState.issues || []).map((issue) => ({
    category: classifyDelayReason(issue.action || issue.title || ""),
    taskId: "",
    reviewNote: "",
    closedAt: "",
    rectifyCount: 0,
    reviewResult: "",
    delayReason: "",
    responsiblePerson: "",
    ...issue,
    status: normalizeIssueStatus(issue.status)
  }));
  nextState.diaries = nextState.diaries || [];
  nextState.meetings = nextState.meetings || [];
  invalidateStateCache();
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
    const rows = readWorkbookRows(workbook);
    const validation = validateImportRows(rows);
    const preview = previewImportedRows(validation.validRows);
    pendingImport = { fileName: file.name, rows, validation, preview };
    els.importResult.textContent = `已解析 ${rows.length} 行：可导入 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行；预计新增 ${preview.created} 个节点，更新 ${preview.updated} 个节点。`;
    renderImportValidation(validation);
    renderImportPreview(pendingImport);
  } catch (error) {
    els.importResult.textContent = `导入失败：${error.message || "请检查表头和文件格式"}`;
  } finally {
    event.target.value = "";
  }
}

function validateImportRows(rows) {
  const validRows = [];
  const invalidRows = [];
  const warnings = [];
  if (rows.length > 2500) warnings.push(`本次文件包含 ${rows.length} 行，数据量较大，建议先备份；如浏览器卡顿可按施工单位分批导入。`);

  rows.forEach((row, index) => {
    const normalized = normalizeImportRow(row);
    const scope = importScopeForRow(normalized);
    const knownBuildings = scope.buildings.map((building) => building.name);
    const knownSystems = scope.units.flatMap((unit) => unit.systems);
    const rowNumber = index + 2;
    const problems = [];
    if (!normalized.building) problems.push("缺少施工部位");
    if (!normalized.floor) problems.push("缺少楼层");
    if (!normalized.system && !normalized.name) problems.push("缺少施工内容或节点名称");
    const progressText = String(normalized.progress ?? "");
    if (progressText && Number.isNaN(Number(progressText.replace("%", "")))) problems.push("完成率不是数字");
    const floorNumber = parseFloorNumber(normalized.floor);
    const matchedBuilding = scope.buildings.find((building) => normalized.building.includes(building.name));
    if (matchedBuilding && floorNumber && floorNumber > Number(matchedBuilding.floors || 1)) {
      problems.push(`楼层超出楼栋范围，${matchedBuilding.name} 只有 ${matchedBuilding.floors} 层`);
    }
    const status = normalized.completionStatus;
    if (status && !["未开始", "已完成", "施工中"].includes(status)) {
      problems.push("实际完成情况只能为：未开始、已完成、施工中");
    }
    const elevatorCount = Number(pickCell(row, ["电梯数量"]) || 0);
    const installedCount = Number(pickCell(row, ["已安装数量"]) || 0);
    if (String(normalized.owner || normalized.discipline).includes("电梯")) {
      if (Number.isNaN(elevatorCount) || Number.isNaN(installedCount)) problems.push("电梯数量和已安装数量必须为数字");
      if (elevatorCount && installedCount > elevatorCount) problems.push("已安装数量不能大于电梯数量");
    }

    const buildingMatched = normalized.building.includes("地下")
      || knownBuildings.some((building) => normalized.building.includes(building));
    if (normalized.projectName && !state.projects.some((project) => project.name === normalized.projectName)) {
      warnings.push(`第 ${rowNumber} 行：项目“${normalized.projectName}”不存在，导入时将自动创建`);
    }
    if (normalized.building && !buildingMatched) warnings.push(`第 ${rowNumber} 行：楼栋未在对应项目范围内，已自动补充或待复核`);
    if (normalized.system && knownSystems.length && !knownSystems.includes(normalized.system)) {
      warnings.push(`第 ${rowNumber} 行：施工内容“${normalized.system}”不在既有清单中`);
    }

    if (problems.length) invalidRows.push({ rowNumber, problems, normalized });
    else validRows.push(row);
  });

  return { validRows, invalidRows, warnings };
}

function readWorkbookRows(workbook) {
  return workbook.SheetNames
    .filter((sheetName) => !/说明|填报说明|readme/i.test(sheetName))
    .flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false })
        .filter((row) => Object.values(row).some((value) => String(value || "").trim()))
        .map((row) => ({ ...row, 来源工作表: sheetName }));
    });
}

function previewImportedRows(rows) {
  const preview = { created: 0, updated: 0, scopeAdded: 0, changed: [], samples: [], createdItems: [], updatedItems: [], duplicateItems: [] };
  const seenKeys = new Set();

  rows.forEach((row) => {
    const normalized = normalizeImportRow(row);
    if (!normalized.name && !normalized.system) return;

    const projectName = normalized.projectName || currentProjectName();
    const project = state.projects.find((item) => item.name === projectName);
    const projectId = project?.id || `preview-${projectName}`;
    const importedTask = {
      projectId,
      name: normalized.name || `${normalized.building} ${normalized.system}`,
      building: normalized.building,
      floor: normalized.floor,
      system: normalized.system,
      owner: normalized.owner || normalized.discipline || "未填责任单位"
    };
    const key = taskKey(importedTask);
    if (seenKeys.has(key)) {
      preview.duplicateItems.push({ key, label: `${projectName}｜${normalized.building}｜${normalized.floor}｜${normalized.system || normalized.name}` });
      return;
    }
    seenKeys.add(key);

    const existing = state.tasks.find((task) => taskKey(task) === key);
    const detail = importPreviewDetail(normalized, projectName, existing);
    if (existing) {
      preview.updated += 1;
      preview.updatedItems.push(detail);
    } else {
      preview.created += 1;
      preview.createdItems.push(detail);
    }

    const scope = importScopeForRow(normalized);
    if (normalized.building && !normalized.building.includes("地下") && !scope.buildings.some((building) => normalized.building.includes(building.name))) {
      preview.scopeAdded += 1;
    }
    const buildingName = previewResolveBuildingName(normalized.building, scope);
    const floorLabel = normalized.building.includes("地下") || normalized.floor.includes("地下")
      ? "地下室"
      : `${parseFloorNumber(normalized.floor) || 1}层`;
    preview.changed.push({ projectId, buildingName, floorLabel });
    if (preview.samples.length < 6) {
      preview.samples.push(`${projectName}｜${buildingName}｜${floorLabel}｜${normalized.system || normalized.name}`);
    }
  });

  return preview;
}

function importPreviewDetail(normalized, projectName, existing) {
  const progress = clampProgress(normalized.progress);
  const planned = normalized.planned || localDateText(today);
  const actual = normalized.actual || "";
  const changes = [];
  if (existing) {
    [
      ["计划", existing.planned || "", planned],
      ["实际", existing.actual || "", actual],
      ["完成率", `${Number(existing.progress || 0)}%`, `${progress}%`],
      ["意见", existing.note || "", normalized.note || ""]
    ].forEach(([label, before, after]) => {
      if (String(before) !== String(after)) changes.push(`${label}: ${before || "-"} -> ${after || "-"}`);
    });
  }
  const warnings = [];
  if (progress >= 100 && !actual) warnings.push("完成率 100% 但未填实际完成日期");
  if (actual && planned && new Date(actual) < new Date(planned)) warnings.push("实际完成早于计划，按提前完成处理");
  return {
    projectName,
    location: `${normalized.building || "-"}｜${normalized.floor || "-"}`,
    name: normalized.system || normalized.name || "-",
    owner: normalized.owner || normalized.discipline || "未填责任单位",
    progress,
    planned,
    actual,
    changes,
    warnings
  };
}

function previewResolveBuildingName(value, scope) {
  const text = String(value || "");
  if (text.includes("地下")) return "地下室";
  return scope.buildings.find((building) => text.includes(building.name))?.name || text.replace(/（.*?）|\(.*?\)/g, "");
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
  state.importVersions = state.importVersions || [];
  const locations = [...new Set(result.changed.map((item) => `${item.buildingName}|${item.floorLabel}`))];
  const record = {
    id: createId(),
    projectId: state.selectedProjectId,
    fileName,
    time: new Date().toISOString(),
    created: result.created,
    updated: result.updated,
    skipped: result.skipped || 0,
    scopeAdded: result.scopeAdded,
    locations: locations.slice(0, 30),
    details: result.details || []
  };
  state.importHistory.unshift(record);
  const snapshot = cloneData(state);
  snapshot.importVersions = [];
  state.importVersions.unshift({
    ...record,
    state: snapshot
  });
  state.importHistory = state.importHistory.slice(0, 12);
  state.importVersions = state.importVersions.slice(0, 10);
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

function renderImportPreview(importData) {
  if (!els.importPreviewPanel) return;
  if (!importData) {
    els.importPreviewPanel.innerHTML = "";
    return;
  }

  const { validation, preview, fileName } = importData;
  const detailHtml = renderImportPreviewDetails(preview, validation);
  els.importPreviewPanel.innerHTML = `
    <strong>导入预览</strong>
    <p>${escapeHtml(fileName)}｜新增 ${preview.created} 项｜更新 ${preview.updated} 项｜范围补充 ${preview.scopeAdded} 项｜异常 ${validation.invalidRows.length} 行｜重复 ${preview.duplicateItems.length} 行</p>
    ${detailHtml}
    <div class="import-preview-actions">
      <button class="primary-btn" type="button" id="confirmImportBtn" ${validation.validRows.length ? "" : "disabled"}>确认导入</button>
      <button class="ghost-btn" type="button" id="cancelImportBtn">取消预览</button>
    </div>
  `;

  document.querySelector("#confirmImportBtn")?.addEventListener("click", confirmPendingImport);
  document.querySelector("#cancelImportBtn")?.addEventListener("click", clearPendingImport);
}

function renderImportPreviewDetails(preview, validation) {
  const section = (title, items, empty) => `
    <div class="import-preview-section">
      <h3>${title}</h3>
      ${items.length ? items.slice(0, 12).map((item) => `
        <article>
          <strong>${escapeHtml(item.projectName || "")}｜${escapeHtml(item.location || "")}｜${escapeHtml(item.name || item.label || "")}</strong>
          <small>${escapeHtml(item.owner || "")}｜计划 ${escapeHtml(item.planned || "-")}｜实际 ${escapeHtml(item.actual || "-")}｜完成率 ${item.progress === "-" ? "-" : `${item.progress ?? "-"}%`}</small>
          ${item.changes?.length ? `<p>${item.changes.map(escapeHtml).join("；")}</p>` : ""}
          ${item.warnings?.length ? `<p class="danger">${item.warnings.map(escapeHtml).join("；")}</p>` : ""}
        </article>
      `).join("") : `<article><strong>${empty}</strong></article>`}
    </div>
  `;
  const invalidItems = validation.invalidRows.map((item) => ({
    projectName: `第 ${item.rowNumber} 行`,
    location: item.normalized?.building || "-",
    name: item.problems.join("、"),
    progress: "-",
    planned: "-",
    actual: "-"
  }));
  return `
    <div class="import-preview-details">
      ${section("新增节点", preview.createdItems, "暂无新增节点")}
      ${section("更新节点", preview.updatedItems, "暂无更新节点")}
      ${section("异常/重复", [...invalidItems, ...preview.duplicateItems], "暂无异常或重复行")}
    </div>
  `;
}

function confirmPendingImport() {
  if (!ensureCanEdit("导入进度数据")) return;
  if (!pendingImport) return;
  const { rows, validation, fileName } = pendingImport;
  const mode = els.importModeSelect?.value || "upsert";
  createRestorePoint(`导入 ${fileName}`);
  const result = mode === "review"
    ? stageImportedRowsForReview(validation.validRows, fileName)
    : applyImportedRows(validation.validRows, mode);
  lastImportFocus = result.changed[0] || null;
  if (lastImportFocus) {
    state.selectedProjectId = lastImportFocus.projectId;
    selectedBuildingName = lastImportFocus.buildingName;
    selectedModelFloor = lastImportFocus.floorLabel;
  }
  recordImportHistory(result, fileName);
  recordAudit(mode === "review" ? "导入待复核数据" : "导入进度数据", `${fileName}：新增 ${result.created} 项，更新 ${result.updated} 项，跳过 ${result.skipped} 项`);
  saveState();
  pendingImport = null;
  render();
  els.importResult.textContent = mode === "review"
    ? `已进入待复核 ${result.created} 行：请点击“确认待复核”后计入正式进度。`
    : `已导入 ${rows.length} 行：成功 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行；新增 ${result.created} 个节点，更新 ${result.updated} 个节点，跳过 ${result.skipped} 个节点。`;
  showToast(mode === "review" ? "导入数据已进入待复核" : "导入完成");
  renderImportValidation(validation);
  renderImportDiff(result);
  renderImportPreview(null);
}

function stageImportedRowsForReview(rows, fileName) {
  const result = { created: 0, updated: 0, skipped: 0, scopeAdded: 0, changed: [], details: [] };
  state.pendingImports = state.pendingImports || [];
  rows.forEach((row) => {
    const normalized = normalizeImportRow(row);
    if (!normalized.name && !normalized.system) return;
    const project = findOrCreateProject(normalized.projectName || currentProjectName());
    const scope = ensureProjectScope(project.id);
    result.scopeAdded += ensureScopeItems(scope, normalized);
    const importedTask = normalizedRowToTask(normalized, project.id);
    state.pendingImports.push({
      id: createId(),
      projectId: project.id,
      fileName,
      createdAt: new Date().toISOString(),
      task: importedTask
    });
    result.created += 1;
    result.details.push(importResultDetail("待复核", importedTask));
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

function normalizedRowToTask(normalized, projectId) {
  return {
    id: createId(),
    projectId,
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
    reviewStatus: "approved",
    plannedProgress: clampProgress(normalized.plannedProgress || expectedProgress({ planned: normalized.planned || localDateText(today) }))
  };
}

function clearPendingImport() {
  pendingImport = null;
  els.importResult.textContent = "已取消导入预览，未修改当前数据。";
  renderImportPreview(null);
}

function applyImportedRows(rows, mode = "upsert") {
  const result = { created: 0, updated: 0, skipped: 0, scopeAdded: 0, changed: [], details: [] };
  const importedKeys = new Set();
  rows.forEach((row) => {
    const normalized = normalizeImportRow(row);
    if (!normalized.name && !normalized.system) return;

    const project = findOrCreateProject(normalized.projectName || currentProjectName());
    const scope = ensureProjectScope(project.id);
    result.scopeAdded += ensureScopeItems(scope, normalized);

    const importedTask = normalizedRowToTask(normalized, project.id);

    const importKey = taskKey(importedTask);
    if (importedKeys.has(importKey)) {
      result.skipped += 1;
      return;
    }
    importedKeys.add(importKey);
    if (mode !== "appendOnly") removeCoveredElevatorFloorTasks(importedTask);
    const existing = findExistingTaskForImport(importedTask);
    if (existing) {
      if (mode === "appendOnly") {
        result.skipped += 1;
        result.details.push(importResultDetail("跳过", importedTask));
      } else {
        Object.assign(existing, importedTask, { id: existing.id });
        result.updated += 1;
        result.details.push(importResultDetail("更新", importedTask));
      }
    } else {
      if (mode === "updateOnly") {
        result.skipped += 1;
        result.details.push(importResultDetail("跳过", importedTask));
      } else {
        state.tasks.push(importedTask);
        result.created += 1;
        result.details.push(importResultDetail("新增", importedTask));
      }
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

function importResultDetail(type, task) {
  return {
    处理结果: type,
    项目: currentProjectName(),
    楼栋: task.building || "",
    楼层: task.floor || "",
    专业: task.discipline || "",
    责任单位: task.owner || "",
    施工内容: task.system || task.name || "",
    计划完成: task.planned || "",
    完成率: task.progress || 0
  };
}

function normalizeImportRow(row) {
  const completionStatus = pickCell(row, ["实际完成情况", "完成情况", "施工状态"]);
  const statusProgress = completionStatusToProgress(completionStatus);
  const elevatorProgress = normalizePercent(pickCell(row, ["完成百分比", "完成率"]));
  const owner = pickCell(row, ["责任单位", "施工单位", "单位", "参建单位"]) || pickCell(row, ["来源工作表"]);
  const discipline = pickCell(row, ["专业", "专业/分部", "分部", "单位类型"]);
  const system = pickCell(row, ["施工内容", "系统", "系统名称", "工作内容"]) || (String(owner).includes("电梯") ? "设备安装" : "");
  const building = pickCell(row, ["施工部位", "部位", "楼栋", "楼号", "单体"]);
  const floor = pickCell(row, ["楼层", "层数", "施工楼层"]) || (String(owner).includes("电梯") ? "整栋" : "");
  return {
    projectName: pickCell(row, ["项目", "项目名称", "工程名称"]),
    building,
    floor,
    discipline,
    owner,
    system,
    name: pickCell(row, ["节点名称", "节点", "任务名称", "进度节点"]),
    planned: normalizeDate(pickCell(row, ["计划完成", "计划完成时间", "计划完成日期", "计划日期", "计划时间"])),
    actual: normalizeDate(pickCell(row, ["实际完成", "实际完成日期", "实际日期", "完成日期"])),
    progress: statusProgress ?? elevatorProgress ?? pickCell(row, ["完成率", "进度", "实际进度", "完成百分比"]),
    note: pickCell(row, ["监理意见", "备注", "说明", "偏差原因"]),
    plannedProgress: pickCell(row, ["计划完成率", "计划进度"]),
    completionStatus
  };
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
  if (text === "已完成") return 100;
  if (text === "施工中") return 50;
  if (text === "未开始") return 0;
  return null;
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

function findExistingTaskForImport(importedTask) {
  const key = taskKey(importedTask);
  return state.tasks.find((task) => task.projectId === importedTask.projectId && taskKey(task) === key);
}

function normalizedBuildingKey(task) {
  const text = String(task.building || "");
  if (text.includes("地下")) return "地下室";
  const scope = demoState.projectScopes?.[task.projectId] || { buildings: [] };
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
  const floorMatch = text.match(/(\d+)\s*层/) || text.match(/[,\s，](\d+)$/);
  const name = text
    .replace(/[（(]?\d+\s*层[）)]?/g, "")
    .replace(/[,\s，]\d+$/, "")
    .trim();
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
  const headers = ["楼栋", "楼层", "专业", "施工内容", "计划完成时间", "实际完成情况"];
  const scope = currentProjectScope();
  const units = scope.units.length ? scope.units : [{ name: "施工单位", code: "UNIT", systems: ["施工内容"] }];

  if (!window.XLSX) {
    const csv = [headers, ...buildUnitTemplateRows(units[0], scope).slice(0, 8)]
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "进度导入模板.csv";
    link.click();
    URL.revokeObjectURL(url);
    return;
  }

  const guideRows = [
    ["填报说明"],
    ["1. 每个施工单位只填写自己对应的工作表。"],
    ["2. 表头不要删除或改名，导入时会按表头识别字段。"],
    ["3. 施工部位建议使用项目范围中的楼栋名称，如 A1（6层）或地下室一层。"],
    ["4. 楼层填写如 3层、地下1层；完成率填写 0-100。"],
    ["5. 完成率为 100% 时建议同步填写实际完成日期。"],
    [],
    ["当前项目", currentProjectName()],
    ["导出日期", localDateText(today)]
  ];
  const sheets = [{ name: "填报说明", rows: guideRows, widths: [28, 60] }];
  const usedNames = new Set(["填报说明"]);
  units.forEach((unit) => {
    const unitHeaders = isElevatorUnit(unit) ? ["楼栋", "专业", "电梯数量", "已安装数量", "完成百分比"] : headers;
    const rows = [unitHeaders, ...(isElevatorUnit(unit) ? buildElevatorTemplateRows(unit, scope) : buildUnitTemplateRows(unit, scope))];
    sheets.push({
      name: uniqueSheetName(unit.name, usedNames),
      rows,
      widths: unitHeaders.map((header) => Math.max(12, header.length * 2 + 4)),
      validationRange: isElevatorUnit(unit) ? "" : `F2:F${Math.max(2, rows.length)}`
    });
  });

  exportTemplateWorkbook(sheets, `进度导入模板-${currentProjectName()}-${localDateText(today)}.xlsx`);
}

function isElevatorUnit(unit) {
  return String(unit.name || "").includes("电梯") || String(unit.code || "").toUpperCase().includes("LIFT");
}

function buildElevatorTemplateRows(unit, scope) {
  const buildings = scope.buildings.length
    ? scope.buildings.map((building) => building.name)
    : ["楼栋名称"];
  return buildings.map((building, index) => {
    const rowNumber = index + 2;
    return [
      building,
      unit.name.replace("单位", "") || "电梯",
      "",
      "",
      { formula: `IFERROR(D${rowNumber}/C${rowNumber}*100,0)` }
    ];
  });
}

function buildUnitTemplateRows(unit, scope) {
  const systems = unit.systems?.length ? unit.systems : ["施工内容"];
  const buildings = scope.buildings.length
    ? scope.buildings.map((building) => ({ label: building.name, floors: Number(building.floors || 1) }))
    : [{ label: "楼栋名称", floors: 1 }];
  const rows = [];
  buildings.forEach((building) => {
    for (let floorIndex = 1; floorIndex <= Math.max(1, building.floors); floorIndex += 1) {
      systems.forEach((system) => {
        rows.push([
          building.label,
          `${floorIndex}层`,
          unit.name.replace("单位", "") || unit.code || "专业",
          system,
          "",
          "未开始"
        ]);
      });
    }
  });
  if (scope.basement) {
    systems
      .filter((system) => shouldIncludeBasementSystem(unit, system))
      .forEach((system) => {
      rows.push([
        scope.basement,
        "地下1层",
        unit.name.replace("单位", "") || unit.code || "专业",
        system,
        "",
        "未开始"
      ]);
    });
  }
  return rows;
}

function shouldIncludeBasementSystem(unit, system) {
  if (String(unit.name || "").includes("机电") && system === "热水系统") return false;
  return true;
}

function exportTemplateWorkbook(sheets, fileName) {
  const entries = buildTemplateWorkbookEntries(sheets);
  const blob = new Blob([zipEntries(entries)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function buildTemplateWorkbookEntries(sheets) {
  const sheetOverrides = sheets
    .map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const workbookSheets = sheets
    .map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  const workbookRels = sheets
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("");

  return [
    {
      name: "[Content_Types].xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheetOverrides}
</Types>`
    },
    {
      name: "_rels/.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
    },
    {
      name: "xl/workbook.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${workbookSheets}</sheets>
  <calcPr calcId="0" fullCalcOnLoad="1"/>
</workbook>`
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${workbookRels}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
    },
    {
      name: "xl/styles.xml",
      text: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Microsoft YaHei"/></font><font><b/><sz val="11"/><name val="Microsoft YaHei"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
    },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      text: buildWorksheetXml(sheet)
    }))
  ];
}

function buildWorksheetXml(sheet) {
  const maxColumn = Math.max(...sheet.rows.map((row) => row.length), 1);
  const maxRow = Math.max(sheet.rows.length, 1);
  const dimension = `A1:${columnName(maxColumn)}${maxRow}`;
  const cols = sheet.widths?.length
    ? `<cols>${sheet.widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const rows = sheet.rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ` s="1"` : "";
      if (value && typeof value === "object" && value.formula) {
        return `<c r="${ref}"><f>${xmlEscape(value.formula)}</f><v>0</v></c>`;
      }
      if (typeof value === "number") {
        return `<c r="${ref}"${style}><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"${style}><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const validation = sheet.validationRange
    ? `<dataValidations count="1"><dataValidation type="list" allowBlank="0" showErrorMessage="1" errorTitle="请选择实际完成情况" error="只能选择：未开始、已完成、施工中" sqref="${sheet.validationRange}"><formula1>"未开始,已完成,施工中"</formula1></dataValidation></dataValidations>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="${dimension}"/>
  ${cols}
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${rows}</sheetData>
  ${validation}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function columnName(index) {
  let name = "";
  let value = index;
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function zipEntries(entries) {
  const encoder = new TextEncoder();
  const files = entries.map((entry) => {
    const data = encoder.encode(entry.text);
    return { name: entry.name, data, crc: crc32(data) };
  });
  const chunks = [];
  const central = [];
  let offset = 0;
  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const local = zipLocalHeader(file, nameBytes);
    chunks.push(local, nameBytes, file.data);
    central.push({ file, nameBytes, offset });
    offset += local.length + nameBytes.length + file.data.length;
  });
  const centralStart = offset;
  central.forEach((item) => {
    const header = zipCentralHeader(item.file, item.nameBytes, item.offset);
    chunks.push(header, item.nameBytes);
    offset += header.length + item.nameBytes.length;
  });
  chunks.push(zipEndRecord(central.length, offset - centralStart, centralStart));
  return new Blob(chunks);
}

function zipLocalHeader(file, nameBytes) {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  writeZipDateTime(view, 10);
  view.setUint32(14, file.crc, true);
  view.setUint32(18, file.data.length, true);
  view.setUint32(22, file.data.length, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function zipCentralHeader(file, nameBytes, offset) {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  writeZipDateTime(view, 12);
  view.setUint32(16, file.crc, true);
  view.setUint32(20, file.data.length, true);
  view.setUint32(24, file.data.length, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return header;
}

function zipEndRecord(count, centralSize, centralOffset) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, count, true);
  view.setUint16(10, count, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  return header;
}

function writeZipDateTime(view, offset) {
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  view.setUint16(offset, time, true);
  view.setUint16(offset + 2, date, true);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc = CRC32_TABLE[(crc ^ data[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function uniqueSheetName(name, usedNames) {
  const base = sanitizeSheetName(name || "施工单位").slice(0, 28) || "施工单位";
  let sheetName = base;
  let index = 2;
  while (usedNames.has(sheetName)) {
    sheetName = `${base.slice(0, 28 - String(index).length)}${index}`;
    index += 1;
  }
  usedNames.add(sheetName);
  return sheetName;
}

function sanitizeSheetName(name) {
  return String(name).replace(/[\\/?*\[\]:]/g, "").trim();
}

function savePlanBaseline() {
  if (!ensureCanEdit("保存计划基线")) return;
  const tasks = currentProjectItems("tasks");
  const baseline = {
    id: createId(),
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
  recordAudit("保存计划基线", `${baseline.taskCount} 项节点，综合完成率 ${baseline.overall}%`);
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
    监理意见: task.note || ""
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

function exportDataBackup() {
  const payload = {
    app: "JinDuTongJi",
    version: 1,
    exportedAt: new Date().toISOString(),
    state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `监理进度数据备份-${localDateText(today)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  state.uiPreferences.lastBackupAt = new Date().toISOString();
  saveState();
  showToast("数据备份已导出");
}

function buildIssueExportRows() {
  return currentProjectItems("issues").map((issue) => {
    const linkedTask = issue.taskId ? state.tasks.find((task) => task.id === issue.taskId) : null;
    return {
      项目: currentProjectName(),
      问题标题: issue.title || "",
      责任单位: issue.owner || "",
      要求完成: issue.deadline || "",
      严重程度: issue.severity || "",
      闭环状态: normalizeIssueStatus(issue.status),
      关联节点: linkedTask ? `${linkedTask.building || ""}${linkedTask.floor || ""}${linkedTask.system || linkedTask.name || ""}` : "",
      问题类别: issue.category || classifyDelayReason(issue.action || issue.title || ""),
      延期原因: issue.delayReason || "",
      整改次数: Number(issue.rectifyCount || 0),
      复验结果: issue.reviewResult || "",
      监理要求: issue.action || "",
      复验意见: issue.reviewNote || "",
      闭合日期: issue.closedAt || ""
    };
  });
}

function exportWeeklyReportFile() {
  const report = els.weeklyReportOutput?.value || generateWeeklyReport();
  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>监理周报</title><style>body{font-family:"Microsoft YaHei",Arial,sans-serif;line-height:1.8;color:#111827;padding:40px;}h1{text-align:center;font-size:24px;}pre{white-space:pre-wrap;font:inherit;} .meta{text-align:right;color:#6b7280;}</style></head><body><h1>${escapeHtml(currentProjectName())}监理周报</h1><div class="meta">${localDateText(today)}</div><pre>${escapeHtml(report)}</pre></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `监理周报-${currentProjectName()}-${localDateText(today)}.html`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("正式周报已导出");
}

function exportRectificationNotice() {
  const issues = currentProjectItems("issues").filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合");
  const lines = [
    `${currentProjectName()}整改通知单`,
    `签发日期：${localDateText(today)}`,
    "",
    "请相关责任单位对以下问题限期整改，并在整改完成后提交复验申请：",
    "",
    ...(issues.length ? issues.map((issue, index) => [
      `${index + 1}. ${issue.title}`,
      `责任单位：${issue.owner || "-"}`,
      `要求完成：${issue.deadline || "-"}`,
      `严重程度：${issue.severity || "-"}`,
      `监理要求：${issue.action || "-"}`,
      issue.delayReason ? `延期原因：${issue.delayReason}` : "",
      ""
    ].filter(Boolean).join("\n")) : ["当前无未闭合整改项。"]),
    "监理单位意见：请施工单位明确责任人、资源投入和完成时间，逾期未完成的纳入例会重点督办。"
  ].join("\n");
  const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `整改通知单-${currentProjectName()}-${localDateText(today)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("整改通知单已导出");
}

function printCurrentReport() {
  if (els.weeklyReportOutput && !els.weeklyReportOutput.value) {
    els.weeklyReportOutput.value = generateWeeklyReport();
  }
  window.print();
}

function exportLatestImportDiff() {
  const latest = (state.importHistory || []).find((item) => item.projectId === state.selectedProjectId);
  exportCsv("最近导入差异.csv", latest?.details?.length ? latest.details : [{ 提示: "暂无可导出的导入差异" }]);
}

function createIssuesFromDelayedTasks() {
  if (!ensureCanEdit("生成整改提醒")) return;
  const existingTaskIds = new Set(currentProjectItems("issues").map((issue) => issue.taskId).filter(Boolean));
  const delayedTasks = currentProjectItems("tasks").filter((task) => getTaskStatus(task).className === "delay" && !existingTaskIds.has(task.id));
  if (!delayedTasks.length) {
    window.alert("当前没有需要自动生成整改提醒的新增滞后节点。");
    return;
  }
  createRestorePoint("自动生成整改提醒");
  delayedTasks.slice(0, 50).forEach((task) => {
    state.issues.push({
      id: createId(),
      projectId: state.selectedProjectId,
      title: `${task.building || ""}${task.floor || ""}${task.system || task.name}进度滞后`,
      owner: task.owner || task.discipline || "未填责任单位",
      deadline: localDateText(today),
      severity: "重要",
      status: "未整改",
      taskId: task.id,
      closedAt: "",
      action: `请${task.owner || "责任单位"}针对 ${task.system || task.name} 提交赶工措施并更新实际完成情况。`,
      reviewNote: "",
      category: classifyDelayReason(task.note || task.name || "")
    });
  });
  recordAudit("自动生成整改提醒", `生成 ${Math.min(50, delayedTasks.length)} 项`);
  saveState();
  render();
  showToast(`已生成 ${Math.min(50, delayedTasks.length)} 条整改提醒`);
}

function renderImportVersionPanel() {
  if (!els.importVersionPanel) return;
  const versions = (state.importVersions || []).filter((item) => item.projectId === state.selectedProjectId).slice(0, 6);
  els.importVersionPanel.innerHTML = `
    <strong>导入版本</strong>
    <div>
      ${versions.length ? versions.map((item) => `
        <article>
          <div>
            <strong>${escapeHtml(item.fileName)}</strong>
            <small>${new Date(item.time).toLocaleString()}｜新增 ${item.created}｜更新 ${item.updated}｜跳过 ${item.skipped || 0}</small>
          </div>
          <button type="button" data-restore-import-version="${item.id}">恢复</button>
        </article>
      `).join("") : `<article><div><strong>暂无导入版本</strong><small>每次确认导入后会保存最近 10 次版本。</small></div></article>`}
    </div>
  `;
  els.importVersionPanel.querySelectorAll("[data-restore-import-version]").forEach((button) => {
    button.addEventListener("click", () => restoreImportVersion(button.dataset.restoreImportVersion));
  });
}

function restoreImportVersion(versionId) {
  if (!ensureCanEdit("恢复导入版本")) return;
  const version = (state.importVersions || []).find((item) => item.id === versionId);
  if (!version) return;
  if (!window.confirm(`确定恢复到导入版本“${version.fileName}”吗？`)) return;
  const keepVersions = state.importVersions || [];
  const keepRestorePoints = state.restorePoints || [];
  state = migrateState(cloneData(version.state));
  state.importVersions = keepVersions;
  state.restorePoints = keepRestorePoints;
  recordAudit("恢复导入版本", version.fileName);
  saveState();
  render();
}

function renderWeightPanel() {
  if (!els.weightPanel) return;
  const weights = state.progressWeights || {};
  const units = currentProjectScope().units;
  els.weightPanel.innerHTML = `
    <strong>进度权重</strong>
    <p>为空时按 1 计算；可按专业单位调整总进度占比。</p>
    <div class="weight-grid">
      ${units.length ? units.map((unit) => `
        <label>
          ${escapeHtml(unit.name)}
          <input type="number" min="0" max="100" step="0.5" value="${Number(weights[unit.name] ?? 1)}" data-weight-unit="${escapeHtml(unit.name)}" />
        </label>
      `).join("") : "<span>暂无专业单位</span>"}
    </div>
  `;
  els.weightPanel.querySelectorAll("[data-weight-unit]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!ensureCanEdit("调整进度权重")) return;
      state.progressWeights[input.dataset.weightUnit] = Math.max(0, Number(input.value || 1));
      recordAudit("调整进度权重", `${input.dataset.weightUnit}: ${input.value}`);
      saveState();
      render();
    });
  });
}

function renderAuditLogPanel() {
  if (!els.auditLogPanel) return;
  const logs = (state.auditLogs || []).filter((item) => item.projectId === state.selectedProjectId).slice(0, 12);
  els.auditLogPanel.innerHTML = `
    <strong>操作记录</strong>
    <div>
      ${logs.length ? logs.map((log) => `
        <article>
          <div>
            <strong>${escapeHtml(log.action)}</strong>
            <small>${new Date(log.time).toLocaleString()}｜${escapeHtml(roleLabel(log.role))}｜${escapeHtml(log.detail || "")}</small>
          </div>
        </article>
      `).join("") : `<article><div><strong>暂无操作记录</strong><small>新增、编辑、删除、导入和恢复会自动记录。</small></div></article>`}
    </div>
  `;
}

function renderDataHealthPanel() {
  if (!els.dataHealthPanel) return;
  const report = buildDataHealthReport();
  const pending = (state.pendingImports || []).filter((item) => item.projectId === state.selectedProjectId);
  const backupText = state.uiPreferences?.lastBackupAt
    ? `上次备份 ${new Date(state.uiPreferences.lastBackupAt).toLocaleString()}`
    : "尚未导出过完整备份";
  els.dataHealthPanel.innerHTML = `
    <strong>数据体检</strong>
    <p>${report.summary}｜待复核 ${pending.length} 条｜${backupText}</p>
    <div class="health-grid">
      ${report.sections.map((section) => `
        <article class="${section.items.length ? "warn" : "ok"}">
          <strong>${escapeHtml(section.title)}<span>${section.items.length}</span></strong>
          <ul>
            ${section.items.length
              ? section.items.slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join("")
              : `<li>未发现异常</li>`}
          </ul>
        </article>
      `).join("")}
    </div>
  `;
}

function exportImportErrors() {
  if (!pendingImport?.validation?.invalidRows?.length) {
    showToast("当前没有可导出的导入错误行", "warn");
    return;
  }
  const rows = pendingImport.validation.invalidRows.map((item) => ({
    行号: item.rowNumber,
    问题: item.problems.join("、"),
    楼栋: item.normalized?.building || "",
    楼层: item.normalized?.floor || "",
    施工内容: item.normalized?.system || item.normalized?.name || ""
  }));
  exportCsv("导入错误行.csv", rows);
  showToast("错误行已导出");
}

function approvePendingImports() {
  if (!ensureCanEdit("确认待复核导入")) return;
  const pending = (state.pendingImports || []).filter((item) => item.projectId === state.selectedProjectId);
  if (!pending.length) {
    showToast("当前项目没有待复核导入", "warn");
    return;
  }
  createRestorePoint("确认待复核导入");
  let created = 0;
  let updated = 0;
  pending.forEach((item) => {
    const importedTask = { ...item.task, reviewStatus: "approved" };
    const existing = findExistingTaskForImport(importedTask);
    if (existing) {
      Object.assign(existing, importedTask, { id: existing.id });
      updated += 1;
    } else {
      state.tasks.push(importedTask);
      created += 1;
    }
  });
  state.pendingImports = (state.pendingImports || []).filter((item) => item.projectId !== state.selectedProjectId);
  recordAudit("确认待复核导入", `新增 ${created}，更新 ${updated}`);
  saveState();
  render();
  showToast(`待复核已确认：新增 ${created}，更新 ${updated}`);
}

function applyDataFixSuggestions() {
  if (!ensureCanEdit("自动修复数据")) return;
  const tasks = currentProjectItems("tasks");
  if (!tasks.length) {
    showToast("当前没有可修复的节点", "warn");
    return;
  }
  createRestorePoint("自动修复数据建议");
  let fixed = 0;
  tasks.forEach((task) => {
    if (Number(task.progress || 0) >= 100 && !task.actual) {
      task.actual = task.planned || localDateText(today);
      fixed += 1;
    }
    if (task.actual && Number(task.progress || 0) < 100) {
      task.progress = 100;
      fixed += 1;
    }
    if (!task.floor && task.building && !String(task.building).includes("地下")) {
      task.floor = "1层";
      fixed += 1;
    }
    if (!task.owner && task.discipline) {
      task.owner = task.discipline;
      fixed += 1;
    }
  });
  recordAudit("自动修复数据建议", `修复 ${fixed} 处`);
  saveState();
  render();
  showToast(fixed ? `已自动修复 ${fixed} 处数据` : "未发现可自动修复项", fixed ? "ok" : "warn");
}

function buildDataHealthReport() {
  const tasks = currentProjectItems("tasks");
  const scope = currentProjectScope();
  const seen = new Map();
  const duplicates = [];
  const missingPlan = [];
  const missingLocation = [];
  const floorOverflow = [];
  const progressConflicts = [];

  tasks.forEach((task) => {
    const key = taskKey(task);
    if (seen.has(key)) duplicates.push(`${task.building || "-"}｜${task.floor || "-"}｜${task.system || task.name}`);
    else seen.set(key, task);
    if (!task.planned) missingPlan.push(task.name || task.system || "-");
    if (!task.building || !task.floor) missingLocation.push(task.name || task.system || "-");
    const building = scope.buildings.find((item) => String(task.building || "").includes(item.name));
    const floor = parseFloorNumber(task.floor);
    if (building && floor && floor > Number(building.floors || 1)) {
      floorOverflow.push(`${building.name}｜${task.floor}｜${task.system || task.name}`);
    }
    if ((task.actual || Number(task.progress || 0) >= 100) && Number(task.progress || 0) < 100) {
      progressConflicts.push(`${task.building || "-"}｜${task.floor || "-"}｜${task.system || task.name}`);
    }
  });

  const sections = [
    { title: "重复节点", items: duplicates },
    { title: "缺少计划时间", items: missingPlan },
    { title: "缺少楼栋/楼层", items: missingLocation },
    { title: "楼层超范围", items: floorOverflow },
    { title: "进度状态冲突", items: progressConflicts }
  ];
  const issueCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  return {
    summary: issueCount ? `发现 ${issueCount} 条数据风险，建议导入前先修正。` : `当前项目 ${tasks.length} 个节点未发现明显数据异常。`,
    sections
  };
}

async function importDataBackup(event) {
  if (!ensureCanEdit("恢复备份")) {
    event.target.value = "";
    return;
  }
  const file = event.target.files[0];
  if (!file) return;

  try {
    const payload = JSON.parse(await file.text());
    const nextState = payload.state || payload;
    if (!Array.isArray(nextState.projects) || !Array.isArray(nextState.tasks)) {
      throw new Error("备份文件格式不正确");
    }
    if (!window.confirm("恢复备份会替换当前浏览器中的全部数据，确定继续吗？")) return;
    createRestorePoint(`恢复备份 ${file.name}`);
    const keepRestorePoints = state.restorePoints || [];
    state = migrateState(nextState);
    state.restorePoints = [...keepRestorePoints, ...(state.restorePoints || [])].slice(0, 5);
    recordAudit("恢复数据备份", file.name);
    selectedBuildingName = "";
    selectedModelFloor = "";
    lastImportFocus = null;
    pendingImport = null;
    saveState();
    render();
    els.importResult.textContent = `已恢复备份：${file.name}`;
    renderImportPreview(null);
  } catch (error) {
    els.importResult.textContent = `恢复失败：${error.message || "请检查 JSON 备份文件"}`;
  } finally {
    event.target.value = "";
  }
}

function renderRestorePointPanel() {
  if (!els.restorePointPanel) return;
  const points = state.restorePoints || [];
  els.restorePointPanel.innerHTML = `
    <strong>自动恢复点</strong>
    <div>
      ${points.length ? points.map((point) => `
        <article>
          <div>
            <strong>${escapeHtml(point.reason)}</strong>
            <small>${new Date(point.createdAt).toLocaleString()}｜节点 ${point.taskCount}｜整改 ${point.issueCount}</small>
          </div>
          <button type="button" data-restore-point="${point.id}">恢复</button>
        </article>
      `).join("") : `<article><div><strong>暂无恢复点</strong><small>导入、删除和恢复前会自动保存最近 5 次状态。</small></div></article>`}
    </div>
  `;
  els.restorePointPanel.querySelectorAll("[data-restore-point]").forEach((button) => {
    button.addEventListener("click", () => restoreFromPoint(button.dataset.restorePoint));
  });
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




