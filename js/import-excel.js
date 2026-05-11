const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10000;
let activeImportWorker = null;
let activeImportReject = null;
let importCancelled = false;
let importBusy = false;

async function importProgressExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (isImportFileTooLarge(file)) {
    els.importResult.textContent = "导入文件超过 8MB，建议按施工单位或楼栋拆分后再导入。";
    event.target.value = "";
    return;
  }

  try {
    importCancelled = false;
    setImportBusy(true, "正在读取导入文件");
    const rows = await parseImportFileRows(file);
    if (importCancelled) return;
    updateImportProgress("正在校验字段和范围");
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`本次文件包含 ${rows.length} 行，超过 ${MAX_IMPORT_ROWS} 行上限，请拆分后导入`);
    }
    const validation = validateImportRows(rows);
    updateImportProgress("正在生成导入预览");
    const preview = previewImportedRows(validation.validRows);
    pendingImport = { fileName: file.name, rows, validation, preview };
    els.importResult.textContent = `已解析 ${rows.length} 行：可导入 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行；预计新增 ${preview.created} 个节点，更新 ${preview.updated} 个节点。`;
    renderImportValidation(validation);
    renderImportPreview(pendingImport);
  } catch (error) {
    els.importResult.textContent = error?.name === "AbortError" ? "已取消本次导入。" : `导入失败：${error.message || "请检查表头和文件格式"}`;
  } finally {
    setImportBusy(false);
    event.target.value = "";
  }
}

function setImportBusy(isBusy, message = "") {
  importBusy = isBusy;
  if (els.excelInput) els.excelInput.disabled = isBusy;
  const cancelButton = document.querySelector("#cancelImportParseBtn");
  if (cancelButton) cancelButton.hidden = !isBusy;
  if (message) updateImportProgress(message);
}

function updateImportProgress(message) {
  if (!els.importResult || !message) return;
  els.importResult.textContent = message;
}

function cancelActiveImportWorker() {
  if (!activeImportWorker) return;
  activeImportWorker.terminate();
  activeImportWorker = null;
  if (activeImportReject) {
    const error = new Error("导入已取消");
    error.name = "AbortError";
    activeImportReject(error);
    activeImportReject = null;
  }
}

function cancelImportParse() {
  if (!importBusy) return;
  importCancelled = true;
  cancelActiveImportWorker();
  setImportBusy(false);
  els.importResult.textContent = "已取消本次导入。";
}

function isImportFileTooLarge(file) {
  return Number(file?.size || 0) > MAX_IMPORT_FILE_BYTES;
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
    if (status && !Object.values(COMPLETION_STATUS).includes(status)) {
      problems.push("实际完成情况只能为：未开始、已完成、施工中");
    }
    const elevatorCount = Number(pickCell(row, ["电梯数量"]) || 0);
    const installedCount = Number(pickCell(row, ["已安装数量"]) || 0);
    if (String(normalized.owner || normalized.discipline).includes("电梯")) {
      if (Number.isNaN(elevatorCount) || Number.isNaN(installedCount)) problems.push("电梯数量和已安装数量必须为数字");
      if (elevatorCount && installedCount > elevatorCount) problems.push("已安装数量不能大于电梯数量");
    }
    if (normalized.planned && !isDateField(normalized.planned)) problems.push("计划完成时间格式不正确");
    if (normalized.actual && !isDateField(normalized.actual)) problems.push("实际完成时间格式不正确");
    const normalizedProgress = Number(String(normalized.progress || 0).replace("%", ""));
    if (!Number.isFinite(normalizedProgress) || normalizedProgress < 0 || normalizedProgress > 100) problems.push("完成率必须在 0-100 之间");
    if (normalized.actual && normalizedProgress < 100) problems.push("已填实际完成时间时完成率应为 100%");

    const buildingMatched = normalized.building.includes("地下")
      || knownBuildings.some((building) => normalized.building.includes(building));
    const rowLabel = importRowLabel(row, rowNumber);
    if (normalized.projectName && !state.projects.some((project) => project.name === normalized.projectName)) {
      warnings.push(`${rowLabel}：项目“${normalized.projectName}”不存在，导入时将自动创建`);
    }
    if (normalized.building && !buildingMatched) warnings.push(`${rowLabel}：楼栋未在对应项目范围内，已自动补充或待复核`);
    if (normalized.system && knownSystems.length && !knownSystems.includes(normalized.system)) {
      warnings.push(`${rowLabel}：施工内容“${normalized.system}”不在既有清单中`);
    }

    if (problems.length) invalidRows.push({ rowNumber, sheetName: row.来源工作表 || "", problems, normalized });
    else validRows.push(row);
  });

  return { validRows, invalidRows, warnings };
}

function importRowLabel(row, rowNumber) {
  return `${row.来源工作表 ? `工作表“${row.来源工作表}”` : "工作表"}第 ${rowNumber} 行`;
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
    ...validation.invalidRows.map((item) => `<li class="danger">${escapeHtml(importRowLabel({ 来源工作表: item.sheetName }, item.rowNumber))}：${escapeHtml(item.problems.join("、"))}</li>`),
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
    projectName: importRowLabel({ 来源工作表: item.sheetName }, item.rowNumber),
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
  pendingImport = null;
  commitStateChange("data");
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
  const completionStatus = pickCell(row, ["实际完成情况", "完成情况", "施工状态", "状态"]);
  const statusProgress = completionStatusToProgress(completionStatus);
  const elevatorProgress = normalizePercent(pickCell(row, ["完成百分比", "完成率"]));
  const owner = pickCell(row, ["责任单位", "施工单位", "单位", "参建单位", "分包单位"]) || pickCell(row, ["来源工作表"]);
  const discipline = pickCell(row, ["专业", "专业/分部", "分部", "单位类型", "工种"]);
  const system = pickCell(row, ["施工内容", "系统", "系统名称", "工作内容", "任务内容"]) || (String(owner).includes("电梯") ? "设备安装" : "");
  const building = pickCell(row, ["施工部位", "部位", "楼栋", "楼号", "单体", "栋号"]);
  const floor = pickCell(row, ["楼层", "层数", "施工楼层", "部位层"]) || (String(owner).includes("电梯") ? "整栋" : "");
  return {
    projectName: pickCell(row, ["项目", "项目名称", "工程名称", "标段"]),
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
  if (text === COMPLETION_STATUS.DONE) return 100;
  if (text === COMPLETION_STATUS.ACTIVE) return 50;
  if (text === COMPLETION_STATUS.NOT_STARTED) return 0;
  return null;
}

function pickCell(row, names) {
  for (const name of names) {
    const key = Object.keys(row).find((candidate) => candidate.trim() === name);
    if (key && String(row[key]).trim()) return String(row[key]).trim();
  }
  return "";
}

function downloadExcelTemplate() {
  const templateUrl = "./assets/progress-template.xlsx";
  const fileName = `进度导入模板-${currentProjectName()}-${localDateText(today)}.xlsx`;
  fetch(templateUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`模板文件加载失败：${response.status}`);
      return response.blob();
    })
    .then((blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      URL.revokeObjectURL(url);
    })
    .catch(() => {
      els.importResult.textContent = "模板下载失败，请确认 assets/progress-template.xlsx 是否存在。";
    });
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


function exportImportErrors() {
  if (!pendingImport?.validation?.invalidRows?.length) {
    showToast("当前没有可导出的导入错误行", "warn");
    return;
  }
  const rows = pendingImport.validation.invalidRows.map((item) => ({
    工作表: item.sheetName || "",
    行号: item.rowNumber,
    问题: item.problems.join("、"),
    楼栋: item.normalized?.building || "",
    楼层: item.normalized?.floor || "",
    专业: item.normalized?.discipline || "",
    责任单位: item.normalized?.owner || "",
    施工内容: item.normalized?.system || item.normalized?.name || "",
    计划完成: item.normalized?.planned || "",
    实际完成: item.normalized?.actual || "",
    完成率: item.normalized?.progress ?? ""
  }));
  exportProjectCsv("导入错误行", "csv", rows);
  exportProjectCsv("导入错误修正模板", "csv", buildImportCorrectionRows(rows));
  showToast("错误行已导出");
}

function buildImportCorrectionRows(rows) {
  return rows.map((row) => ({
    项目: currentProjectName(),
    楼栋: row.楼栋,
    楼层: row.楼层,
    专业: row.专业,
    责任单位: row.责任单位,
    施工内容: row.施工内容,
    计划完成时间: row.计划完成,
    实际完成情况: row.完成率 ? (Number(row.完成率) >= 100 ? "已完成" : Number(row.完成率) > 0 ? "施工中" : "未开始") : "未开始",
    备注: row.问题
  }));
}

function importPastedTable() {
  if (!els.pasteImportText) return;
  const text = els.pasteImportText.value.trim();
  if (!text) {
    showToast("请先粘贴表格内容", "warn");
    return;
  }
  const rows = parsePastedTableRows(text);
  pendingImport = {
    fileName: "粘贴数据",
    rows,
    validation: validateImportRows(rows),
    preview: previewImportedRows(validateImportRows(rows).validRows)
  };
  els.importResult.textContent = `已解析粘贴数据 ${rows.length} 行`;
  renderImportValidation(pendingImport.validation);
  renderImportPreview(pendingImport);
}

function parsePastedTableRows(text) {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const cells = lines.map((line) => line.split(/\t|,/).map((cell) => cell.trim()));
  const headers = cells.shift() || [];
  return cells.map((values) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });
    return row;
  });
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
  commitStateChange("data");
  showToast(`待复核已确认：新增 ${created}，更新 ${updated}`);
}
