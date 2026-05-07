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
  } catch {
    window.alert("本地存储空间不足，当前修改可能无法保存。建议先导出节点台账或清理浏览器存储。");
  }
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
  const point = (state.restorePoints || []).find((item) => item.id === pointId);
  if (!point) return;
  if (!window.confirm(`确定恢复到“${point.reason}”之前的状态吗？`)) return;
  const keepPoints = state.restorePoints || [];
  state = migrateState(cloneData(point.state));
  state.restorePoints = keepPoints;
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
  return state[key].filter((item) => item.projectId === state.selectedProjectId);
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
  nextState.tasks = mergeFloorDemoTasks(nextState);
  nextState.tasks = (nextState.tasks || []).map((task) => ({
    plannedProgress: expectedProgress({ planned: task.planned, actual: task.actual }),
    ...task
  }));
  nextState.issues = (nextState.issues || []).map((issue) => ({
    category: classifyDelayReason(issue.action || issue.title || ""),
    taskId: "",
    reviewNote: "",
    closedAt: "",
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
    if (normalized.progress && Number.isNaN(Number(String(normalized.progress).replace("%", "")))) problems.push("完成率不是数字");

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
      system: normalized.system
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
  const locations = [...new Set(result.changed.map((item) => `${item.buildingName}|${item.floorLabel}`))];
  state.importHistory.unshift({
    id: createId(),
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
  if (!pendingImport) return;
  const { rows, validation, fileName } = pendingImport;
  createRestorePoint(`导入 ${fileName}`);
  const result = applyImportedRows(validation.validRows);
  lastImportFocus = result.changed[0] || null;
  if (lastImportFocus) {
    state.selectedProjectId = lastImportFocus.projectId;
    selectedBuildingName = lastImportFocus.buildingName;
    selectedModelFloor = lastImportFocus.floorLabel;
  }
  recordImportHistory(result, fileName);
  saveState();
  pendingImport = null;
  render();
  els.importResult.textContent = `已导入 ${rows.length} 行：成功 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行；新增 ${result.created} 个节点，更新 ${result.updated} 个节点。`;
  renderImportValidation(validation);
  renderImportDiff(result);
  renderImportPreview(null);
}

function clearPendingImport() {
  pendingImport = null;
  els.importResult.textContent = "已取消导入预览，未修改当前数据。";
  renderImportPreview(null);
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
      id: createId(),
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
    note: pickCell(row, ["监理意见", "备注", "说明", "偏差原因"]),
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
  const headers = ["项目", "施工部位", "楼层", "专业", "责任单位", "施工内容", "节点名称", "计划完成", "实际完成", "计划完成率", "完成率", "监理意见"];
  const examples = [
    ["城东综合体一期", "A1（6层）", "3层", "机电", "机电单位", "室内给水系统", "A1 3层室内给水系统安装", "2026-05-20", "", "60", "35", "按楼层推进，关注材料进场"],
    ["城东综合体一期", "地下室一层", "地下1层", "消防", "消防单位", "喷淋系统", "地下室喷淋主管安装", "2026-05-18", "", "80", "60", "需与机电桥架综合排布"]
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
}

async function importDataBackup(event) {
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




