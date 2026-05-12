function confirmPendingImport() {
  if (!ensureCanEdit("导入进度数据")) return;
  if (!pendingImport) return;
  updatePendingImportFromPreview();
  const { rows, validation, fileName } = pendingImport;
  const options = importOptions();
  const mode = options.mode;
  const importRows = filteredImportRows(validation.validRows);
  const restorePointId = createRestorePoint(`导入 ${fileName}`);
  pendingImport.restorePointId = restorePointId;
  const result = mode === "review"
    ? stageImportedRowsForReview(importRows, fileName, options)
    : applyImportedRows(importRows, mode, options);
  result.restorePointId = restorePointId;
  result.fileName = fileName;
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
    : `已同步全局进度：读取 ${rows.length} 行，成功 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行；新增 ${result.created} 个节点，更新 ${result.updated} 个节点，跳过 ${result.skipped} 个节点。`;
  showToast(mode === "review" ? "导入数据已进入待复核" : "导入完成");
  renderImportValidation(validation);
  renderImportDiff(result);
  renderImportImpact(result);
  renderImportPreview(null);
}

function stageImportedRowsForReview(rows, fileName, options = importOptions()) {
  const result = { created: 0, updated: 0, skipped: 0, scopeAdded: 0, changed: [], details: [], createdIds: [], createdTasks: [], updatedBefore: [], updatedAfter: [], scopeBeforeByProject: {}, scopeAfterByProject: {} };
  state.pendingImports = state.pendingImports || [];
  rows.forEach((row) => {
    const normalized = importRowNormalized(row);
    if (!normalized.name && !normalized.system) return;
    if (normalizedImportHasRemovedContent(normalized)) {
      result.skipped += 1;
      return;
    }
    if (!rowAllowedByImportScope(normalized, options)) {
      result.skipped += 1;
      return;
    }
    const project = projectForImportedRow(normalized, options);
    const scope = ensureProjectScope(project.id);
    captureScopeBefore(result, project.id);
    result.scopeAdded += ensureApprovedScopeItems(scope, normalized);
    const importedTask = normalizedRowToTask(normalized, project.id);
    const pendingItem = {
      id: createId(),
      projectId: project.id,
      fileName,
      createdAt: new Date().toISOString(),
      task: importedTask
    };
    state.pendingImports.push(pendingItem);
    result.createdIds.push(importedTask.id);
    result.createdTasks.push(cloneData(importedTask));
    captureScopeAfter(result, project.id);
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
  const planned = normalized.planned || "";
  return deriveTaskFields({
    id: createId(),
    projectId,
    name: normalized.name || `${normalized.building} ${normalized.system}`,
    discipline: normalized.discipline || inferDiscipline(normalized.owner, normalized.system),
    owner: normalized.owner || normalized.discipline || "未填责任单位",
    building: normalized.building,
    floor: normalized.floor,
    system: normalized.system,
    planned,
    actual: normalized.actual,
    progress: clampProgress(normalized.progress),
    note: normalized.note,
    reviewStatus: "approved",
    plannedProgress: clampProgress(normalized.plannedProgress || (planned ? expectedProgress({ planned }) : 0))
  });
}

function clearPendingImport() {
  pendingImport = null;
  els.importResult.textContent = "已取消导入预览，未修改当前数据。";
  clearImportImpact();
  renderImportPreview(null);
}

function applyImportMappingFromPreview() {
  if (!pendingImport) return;
  const mapping = {};
  els.importPreviewPanel.querySelectorAll("[data-mapping-field]").forEach((select) => {
    if (select.value) mapping[select.dataset.mappingField] = select.value;
  });
  pendingImport.mapping = mapping;
  state.uiPreferences = state.uiPreferences || {};
  state.uiPreferences.importFieldMap = mapping;
  clearImportRowNormalizeCache(pendingImport.rows);
  pendingImport.headerMap = buildImportHeaderMap(pendingImport.rows);
  refreshPendingImportPreview();
  showToast("字段映射已应用");
}

function updatePendingImportFromPreview(options = {}) {
  if (!pendingImport) return;
  pendingImport.excludedRowIds = pendingImport.excludedRowIds || new Set();
  els.importPreviewPanel.querySelectorAll("[data-preview-include]").forEach((input) => {
    if (input.checked) pendingImport.excludedRowIds.delete(input.dataset.previewInclude);
    else pendingImport.excludedRowIds.add(input.dataset.previewInclude);
  });
  pendingImport.approvedScopeKeys = new Set(
    [...els.importPreviewPanel.querySelectorAll("[data-scope-approval]:checked")].map((input) => input.dataset.scopeApproval)
  );
  const edits = new Map();
  els.importPreviewPanel.querySelectorAll("[data-preview-field]").forEach((input) => {
    const id = input.dataset.rowId;
    if (!edits.has(id)) edits.set(id, {});
    edits.get(id)[input.dataset.previewField] = input.value.trim();
  });
  pendingImport.rows.forEach((row) => {
    if (!edits.has(row.__importRowId)) return;
    const baseRow = { ...row, __importOverride: null };
    delete baseRow.__normalizedImportRow;
    delete baseRow.__normalizedImportCacheKey;
    row.__importOverride = { ...normalizeImportRow(baseRow), ...edits.get(row.__importRowId) };
    delete row.__normalizedImportRow;
    delete row.__normalizedImportCacheKey;
  });
  if (options.refresh !== false) refreshPendingImportPreview(false);
}

function refreshPendingImportPreview(shouldRender = true) {
  if (!pendingImport) return;
  pendingImport.validation = validateImportRows(pendingImport.rows);
  pendingImport.preview = previewImportedRows(filteredImportRows(pendingImport.validation.validRows));
  normalizeImportPreviewPages();
  if (shouldRender) {
    renderImportValidation(pendingImport.validation);
    renderImportPreview(pendingImport);
  }
}

function normalizeImportPreviewPages() {
  if (!pendingImport) return;
  const pages = pendingImport.previewPage || {};
  const issueCount = pendingImport.validation.invalidRows.length + pendingImport.preview.duplicateItems.length;
  pendingImport.previewPage = {
    edit: clampImportPage(pages.edit, pendingImport.validation.validRows.length, IMPORT_EDIT_PAGE_SIZE),
    created: clampImportPage(pages.created, pendingImport.preview.createdItems.length, IMPORT_PREVIEW_PAGE_SIZE),
    updated: clampImportPage(pages.updated, pendingImport.preview.updatedItems.length, IMPORT_PREVIEW_PAGE_SIZE),
    issues: clampImportPage(pages.issues, issueCount, IMPORT_PREVIEW_PAGE_SIZE)
  };
}

function filteredImportRows(rows) {
  if (!pendingImport?.excludedRowIds?.size) return rows;
  return rows.filter((row) => !pendingImport.excludedRowIds.has(row.__importRowId));
}

function applyImportedRows(rows, mode = "upsert", options = importOptions()) {
  const result = { created: 0, updated: 0, skipped: 0, scopeAdded: 0, changed: [], details: [], createdIds: [], createdTasks: [], updatedBefore: [], updatedAfter: [], scopeBeforeByProject: {}, scopeAfterByProject: {} };
  const importedKeys = new Set();
  const existingIndex = buildTaskImportIndex();
  resolveDuplicateImportRows(rows, options.duplicatePolicy || "last", options).forEach((row) => {
    const normalized = importRowNormalized(row);
    if (!normalized.name && !normalized.system) return;
    if (normalizedImportHasRemovedContent(normalized)) {
      result.skipped += 1;
      return;
    }
    if (!rowAllowedByImportScope(normalized, options)) {
      result.skipped += 1;
      return;
    }

    const project = projectForImportedRow(normalized, options);
    const scope = ensureProjectScope(project.id);
    captureScopeBefore(result, project.id);
    result.scopeAdded += ensureApprovedScopeItems(scope, normalized);

    const importedTask = normalizedRowToTask(normalized, project.id);

    const importKey = taskKey(importedTask);
    if (importedKeys.has(importKey)) {
      result.skipped += 1;
      return;
    }
    importedKeys.add(importKey);
    const existing = existingIndex.get(importKey);
    if (existing) {
      if (mode === "appendOnly") {
        result.skipped += 1;
        result.details.push(importResultDetail("跳过", importedTask));
      } else {
        result.updatedBefore.push(cloneData(existing));
        Object.assign(existing, mergeImportedTask(existing, importedTask, options.updatePolicy), { id: existing.id });
        deriveTaskFields(existing);
        result.updatedAfter.push(cloneData(existing));
        result.updated += 1;
        result.details.push(importResultDetail("更新", importedTask));
      }
    } else {
      if (mode === "updateOnly") {
        result.skipped += 1;
        result.details.push(importResultDetail("跳过", importedTask));
      } else {
        state.tasks.push(importedTask);
        existingIndex.set(importKey, importedTask);
        result.createdIds.push(importedTask.id);
        result.createdTasks.push(cloneData(importedTask));
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
    captureScopeAfter(result, project.id);
  });
  syncImportedScopeBuildings(result);
  return result;
}

function syncImportedScopeBuildings(result) {
  const projectIds = new Set([
    ...result.changed.map((item) => item.projectId),
    ...Object.keys(result.scopeBeforeByProject || {})
  ]);
  projectIds.forEach((projectId) => {
    captureScopeBefore(result, projectId);
    if (syncProjectScopeBuildingsFromTasks(projectId)) captureScopeAfter(result, projectId);
  });
}

function captureScopeBefore(result, projectId) {
  if (result.scopeBeforeByProject[projectId]) return;
  result.scopeBeforeByProject[projectId] = cloneData(state.projectScopes?.[projectId] || { basement: "", buildings: [], units: [] });
}

function captureScopeAfter(result, projectId) {
  result.scopeAfterByProject[projectId] = cloneData(state.projectScopes?.[projectId] || { basement: "", buildings: [], units: [] });
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
  syncImportedScopeBuildings({
    changed: pending.map((item) => ({ projectId: item.projectId })),
    scopeBeforeByProject: {},
    scopeAfterByProject: {}
  });
  state.pendingImports = (state.pendingImports || []).filter((item) => item.projectId !== state.selectedProjectId);
  recordAudit("确认待复核导入", `新增 ${created}，更新 ${updated}`);
  commitStateChange("data");
  showToast(`待复核已确认：新增 ${created}，更新 ${updated}`);
}
