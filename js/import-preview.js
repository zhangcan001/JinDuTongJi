function validateImportRows(rows) {
  const validRows = [];
  const invalidRows = [];
  const warnings = [];
  const options = importOptions();
  if (rows.length > 2500) warnings.push(`本次文件包含 ${rows.length} 行，数据量较大，建议先备份；如浏览器卡顿可按施工单位分批导入。`);

  rows.forEach((row, index) => {
    const normalized = importRowNormalized(row);
    const scope = importScopeForValidation(normalized, options);
    const knownBuildings = scope.buildings.map((building) => building.name);
    const knownSystems = scope.units.flatMap((unit) => unit.systems.map((system) => `${unit.name}｜${system}`));
    const rowNumber = Number(row.__importRowNumber || 0) || index + 2;
    const problems = [];
    if (!normalized.building) problems.push("缺少施工部位");
    if (!normalized.floor) problems.push("缺少楼层");
    if (!normalized.system && !normalized.name) problems.push("缺少施工内容或节点名称");
    const progressText = String(normalized.progress ?? "");
    if (progressText && Number.isNaN(Number(progressText.replace("%", "")))) problems.push("完成率不是数字");
    const floorNumber = parseFloorNumber(normalized.floor);
    const matchedBuilding = findScopeBuilding(scope, parseBuilding(normalized.building || "").name);
    if (matchedBuilding && floorNumber && floorNumber > Number(matchedBuilding.floors || 1)) {
      warnings.push(`${importRowLabel(row, rowNumber)}：${matchedBuilding.name} 层数将按导入表更新为 ${floorNumber} 层`);
    }
    const status = normalized.completionStatus;
    if (status && completionStatusToProgress(status) == null) {
      problems.push("实际完成情况只能为：未开始、已完成或 0-100 完成百分比");
    }
    if (normalized.planned && !isDateField(normalized.planned)) problems.push("计划完成时间格式不正确");
    if (normalized.actual && !isDateField(normalized.actual)) problems.push("实际完成时间格式不正确");
    const normalizedProgress = Number(String(normalized.progress || 0).replace("%", ""));
    if (!Number.isFinite(normalizedProgress) || normalizedProgress < 0 || normalizedProgress > 100) problems.push("完成率必须在 0-100 之间");
    if (normalized.actual && normalizedProgress < 100) problems.push("已填实际完成时间时完成率应为 100%");

    const buildingMatched = normalized.building.includes("地下")
      || knownBuildings.some((building) => normalized.building.includes(building));
    const rowLabel = importRowLabel(row, rowNumber);
    if (options.scope === "fromFile" && normalized.projectName && !state.projects.some((project) => project.name === normalized.projectName)) {
      warnings.push(`${rowLabel}：项目“${normalized.projectName}”不存在，导入时将自动创建`);
    }
    if (normalized.building && !buildingMatched) warnings.push(`${rowLabel}：楼栋未在对应项目范围内，已自动补充或待复核`);
    const relatedUnit = findScopeUnitForImportedRow(scope, normalized);
    const knownForUnit = scopeUnitHasSystem(scope, normalized, relatedUnit);
    if (normalized.system && relatedUnit && !knownForUnit) {
      warnings.push(`${rowLabel}：${relatedUnit.name} 的施工内容“${normalized.system}”不在既有清单中`);
    } else if (normalized.system && knownSystems.length && !knownForUnit && !knownSystems.includes(`${relatedUnit?.name || normalized.owner || normalized.discipline || "未命名单位"}｜${normalized.system}`)) {
      warnings.push(`${rowLabel}：${normalized.system} 需按对应单位单独维护`);
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
  const preview = { created: 0, updated: 0, scopeAdded: 0, changed: [], samples: [], createdItems: [], updatedItems: [], duplicateItems: [], scopeSuggestions: [] };
  const seenKeys = new Set();
  const scopeSuggestionKeys = new Set();
  const existingTaskIndex = buildTaskImportIndex();
  const options = importOptions();

  rows.forEach((row) => {
    const normalized = importRowNormalized(row);
    if (!normalized.name && !normalized.system) return;

    const projectName = importProjectNameForRow(normalized, options);
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

    const existing = existingTaskIndex.get(key);
    const detail = importPreviewDetail(normalized, projectName, existing);
    if (existing) {
      preview.updated += 1;
      preview.updatedItems.push(detail);
    } else {
      preview.created += 1;
      preview.createdItems.push(detail);
    }

    const scope = importScopeForValidation(normalized, options);
    collectScopeSuggestions(preview, scopeSuggestionKeys, scope, normalized);
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

function buildTaskImportIndex() {
  const index = new Map();
  state.tasks.forEach((task) => index.set(taskKey(task), task));
  return index;
}

function collectScopeSuggestions(preview, seen, scope, normalized) {
  const add = (type, label) => {
    const key = `${type}:${label}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    preview.scopeSuggestions.push({ key, type, label });
    preview.scopeAdded += 1;
  };
  if (normalized.building) {
    if (normalized.building.includes("地下")) {
      if (!scope.basement) add("basement", normalized.building);
    } else {
      const importedBuilding = buildingFromImportedLocation(normalized);
      const existingBuilding = findScopeBuilding(scope, importedBuilding.name);
      if (!existingBuilding) {
        add("building", `${importedBuilding.name}（${importedBuilding.floors}层）`);
      } else if (importedBuilding.floors > Number(existingBuilding.floors || 1)) {
        add("building", `${existingBuilding.name}（更新为${importedBuilding.floors}层）`);
      }
    }
  }
  const discipline = normalized.discipline || inferDiscipline(normalized.owner, normalized.system);
  const unitName = discipline.includes("单位") ? discipline : `${discipline || "其他"}单位`;
  const unit = scope.units.find((item) => item.name === unitName || item.name.includes(discipline));
  if (!unit) add("unit", unitName);
  if (normalized.system && unit && !unit.systems.includes(normalized.system)) add("system", `${unit.name}｜${normalized.system}`);
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
  setSafeHtml(els.importValidationReport, safeTemplateHtml`
    <strong>导入校验报告</strong>
    <p>成功 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行，提示 ${validation.warnings.length} 条。</p>
    <ul>${issueHtml || "<li>未发现字段缺失或范围异常。</li>"}</ul>
  `);
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
  state.importVersions.unshift({
    ...record,
    patch: buildImportVersionPatch(result),
    state: null
  });
  state.importHistory = state.importHistory.slice(0, 12);
  state.importVersions = state.importVersions.slice(0, 10);
}

function buildImportVersionPatch(result) {
  return {
    format: "task-delta-v1",
    createdIds: result.createdIds || [],
    createdTasks: result.createdTasks || [],
    updatedBefore: result.updatedBefore || [],
    updatedAfter: result.updatedAfter || [],
    scopeBeforeByProject: result.scopeBeforeByProject || {},
    scopeAfterByProject: result.scopeAfterByProject || {}
  };
}

function renderImportDiff(result) {
  if (!els.importDiffPanel) return;
  const locations = [...new Set(result.changed.map((item) => `${item.buildingName}｜${item.floorLabel}`))].slice(0, 12);
  setSafeHtml(els.importDiffPanel, safeTemplateHtml`
    <strong>本次导入变化</strong>
    <p>新增 ${result.created} 项｜更新 ${result.updated} 项｜范围补充 ${result.scopeAdded} 项</p>
    <div class="diff-tags">
      ${locations.length ? locations.map((item) => `<button type="button" data-focus-location="${escapeAttr(item)}">${escapeHtml(item)}</button>`).join("") : "<span>暂无变化楼层</span>"}
    </div>
  `);
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
    setSafeHtml(els.importPreviewPanel, "");
    return;
  }

  const { validation, preview, fileName } = importData;
  const mappingHtml = renderImportMappingControls(importData);
  const scopeHtml = renderScopeApprovalControls(importData);
  const detailHtml = renderImportPreviewDetails(preview, validation);
  setSafeHtml(els.importPreviewPanel, safeTemplateHtml`
    <strong>导入预览</strong>
    <p>${escapeHtml(fileName)}｜新增 ${preview.created} 项｜更新 ${preview.updated} 项｜范围补充 ${preview.scopeAdded} 项｜异常 ${validation.invalidRows.length} 行｜重复 ${preview.duplicateItems.length} 行</p>
    <div class="import-preview-callout">
      <strong>预览已生成，尚未写入全局进度</strong>
      <span>确认后会同步总览、计划台账、楼栋模型、数据字典和导入版本。</span>
      <button class="primary-btn" type="button" id="confirmImportTopBtn" ${validation.validRows.length ? "" : "disabled"}>确认导入并同步</button>
    </div>
    ${mappingHtml}
    ${scopeHtml}
    ${detailHtml}
    <div class="import-preview-actions">
      <button class="primary-btn" type="button" id="confirmImportBtn" ${validation.validRows.length ? "" : "disabled"}>确认导入并同步</button>
      <button class="ghost-btn" type="button" id="cancelImportBtn">取消预览</button>
    </div>
  `);

  document.querySelector("#confirmImportBtn")?.addEventListener("click", confirmPendingImport);
  document.querySelector("#confirmImportTopBtn")?.addEventListener("click", confirmPendingImport);
  document.querySelector("#cancelImportBtn")?.addEventListener("click", clearPendingImport);
  document.querySelector("#applyImportMappingBtn")?.addEventListener("click", applyImportMappingFromPreview);
  els.importPreviewPanel.querySelectorAll("[data-preview-field], [data-preview-include], [data-scope-approval]").forEach((control) => {
    control.addEventListener("change", updatePendingImportFromPreview);
  });
  els.importPreviewPanel.querySelectorAll("[data-import-page]").forEach((button) => {
    button.addEventListener("click", () => changeImportPreviewPage(button.dataset.importPage, Number(button.dataset.pageDelta || 0)));
  });
  els.importPreviewPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderImportImpact(result) {
  if (!els.importImpactPanel) return;
  const locations = [...new Set(result.changed.map((item) => `${item.buildingName}｜${item.floorLabel}`))];
  const unitSummary = summarizeImportResult(result.details || [], "责任单位").slice(0, 6);
  const buildingSummary = summarizeImportResult(result.details || [], "楼栋").slice(0, 6);
  setSafeHtml(els.importImpactPanel, safeTemplateHtml`
    <strong>导入影响报告</strong>
    <p>${escapeHtml(result.fileName || "本次导入")}：新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped || 0}，全局字典变更 ${result.scopeAdded || 0}。</p>
    <p>影响位置 ${locations.length} 处${locations.length ? `：${locations.slice(0, 8).map(escapeHtml).join("、")}` : ""}</p>
    <div class="import-impact-grid">
      <article><strong>单位变化</strong>${unitSummary.length ? unitSummary.map((item) => `<small>${escapeHtml(item.label)}：${item.count} 条</small>`).join("") : "<small>暂无单位变化</small>"}</article>
      <article><strong>楼栋变化</strong>${buildingSummary.length ? buildingSummary.map((item) => `<small>${escapeHtml(item.label)}：${item.count} 条</small>`).join("") : "<small>暂无楼栋变化</small>"}</article>
    </div>
    <div class="import-preview-actions">
      <button class="ghost-btn" type="button" data-export-import-impact>导出影响报告</button>
      ${result.restorePointId ? `<button class="ghost-btn" type="button" data-undo-import="${escapeAttr(result.restorePointId)}">撤销本次导入</button>` : ""}
    </div>
  `);
  els.importImpactPanel.querySelector("[data-export-import-impact]")?.addEventListener("click", () => {
    exportProjectCsv("导入影响报告", "csv", result.details || []);
  });
  els.importImpactPanel.querySelector("[data-undo-import]")?.addEventListener("click", (event) => {
    restoreFromPoint(event.currentTarget.dataset.undoImport);
  });
}

function summarizeImportResult(details, field) {
  const grouped = new Map();
  (details || []).forEach((row) => {
    const label = row[field] || "未填";
    grouped.set(label, (grouped.get(label) || 0) + 1);
  });
  return Array.from(grouped.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function clearImportImpact() {
  if (els.importImpactPanel) setSafeHtml(els.importImpactPanel, "");
}

function renderImportMappingControls(importData) {
  const headers = importHeaders(importData.rows);
  const options = (selected) => [
    `<option value="">自动识别</option>`,
    ...headers.map((header) => `<option value="${escapeAttr(header)}" ${header === selected ? "selected" : ""}>${escapeHtml(header)}</option>`)
  ].join("");
  return `
    <div class="import-mapping-grid">
      <strong>字段映射确认</strong>
      ${IMPORT_FIELD_DEFINITIONS.map(([field, label]) => `
        <label>${escapeHtml(label)}
          <select data-mapping-field="${escapeAttr(field)}">${options(importData.mapping?.[field] || "")}</select>
        </label>
      `).join("")}
      <button class="ghost-btn" type="button" id="applyImportMappingBtn">应用映射并重新预览</button>
    </div>
  `;
}

function renderScopeApprovalControls(importData) {
  const suggestions = importData.preview.scopeSuggestions || [];
  if (!suggestions.length) return "";
  return `
    <div class="import-scope-approval">
      <strong>范围变更确认</strong>
      <p>勾选后才会写入全局楼栋、单位或施工内容字典；未勾选的数据仍可作为节点导入。</p>
      ${suggestions.map((item) => `
        <label>
          <input type="checkbox" data-scope-approval="${escapeAttr(item.key)}" ${importData.approvedScopeKeys?.has(item.key) ? "checked" : ""}>
          ${escapeHtml(scopeSuggestionLabel(item))}
        </label>
      `).join("")}
    </div>
  `;
}

function scopeSuggestionLabel(item) {
  return {
    basement: `新增地下室：${item.label}`,
    building: `新增楼栋：${item.label}`,
    unit: `新增单位：${item.label}`,
    system: `新增施工内容：${item.label}`
  }[item.type] || item.label;
}

function renderImportPreviewDetails(preview, validation) {
  const pages = pendingImport?.previewPage || {};
  const editableRowsAll = pendingImport?.validation?.validRows || [];
  const editPage = clampImportPage(pages.edit, editableRowsAll.length, IMPORT_EDIT_PAGE_SIZE);
  const editableRows = paginateImportItems(editableRowsAll, editPage, IMPORT_EDIT_PAGE_SIZE);
  const editableHtml = editableRows.length ? `
    <div class="import-edit-preview">
      <h3>可编辑预览（${editableRowsAll.length} 行）</h3>
      <div class="import-edit-table">
        <table>
          <thead><tr><th>导入</th><th>项目</th><th>楼栋</th><th>楼层</th><th>单位</th><th>施工内容</th><th>计划</th><th>实际</th><th>完成率</th></tr></thead>
          <tbody>
            ${editableRows.map((row) => {
              const item = importRowNormalized(row);
              const id = row.__importRowId;
              return `<tr data-preview-row="${escapeAttr(id)}">
                <td><input type="checkbox" data-preview-include="${escapeAttr(id)}" ${pendingImport.excludedRowIds?.has(id) ? "" : "checked"}></td>
                ${["projectName", "building", "floor", "owner", "system", "planned", "actual", "progress"].map((field) => `
                  <td><input data-preview-field="${escapeAttr(field)}" data-row-id="${escapeAttr(id)}" value="${escapeAttr(item[field] ?? "")}"></td>
                `).join("")}
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
      ${importPaginationHtml("edit", editPage, editableRowsAll.length, IMPORT_EDIT_PAGE_SIZE)}
    </div>
  ` : "";
  const section = (key, title, items, empty) => {
    const page = clampImportPage(pages[key], items.length, IMPORT_PREVIEW_PAGE_SIZE);
    const pageItems = paginateImportItems(items, page, IMPORT_PREVIEW_PAGE_SIZE);
    return `
    <div class="import-preview-section">
      <h3>${title}</h3>
      ${pageItems.length ? pageItems.map((item) => `
        <article>
          <strong>${escapeHtml(item.projectName || "")}｜${escapeHtml(item.location || "")}｜${escapeHtml(item.name || item.label || "")}</strong>
          <small>${escapeHtml(item.owner || "")}｜计划 ${escapeHtml(item.planned || "-")}｜实际 ${escapeHtml(item.actual || "-")}｜完成率 ${item.progress === "-" ? "-" : `${item.progress ?? "-"}%`}</small>
          ${item.changes?.length ? `<p>${item.changes.map(escapeHtml).join("；")}</p>` : ""}
          ${item.warnings?.length ? `<p class="danger">${item.warnings.map(escapeHtml).join("；")}</p>` : ""}
        </article>
      `).join("") : `<article><strong>${empty}</strong></article>`}
      ${importPaginationHtml(key, page, items.length, IMPORT_PREVIEW_PAGE_SIZE)}
    </div>
  `;
  };
  const invalidItems = validation.invalidRows.map((item) => ({
    projectName: importRowLabel({ 来源工作表: item.sheetName }, item.rowNumber),
    location: item.normalized?.building || "-",
    name: item.problems.join("、"),
    progress: "-",
    planned: "-",
    actual: "-"
  }));
  return `
    ${editableHtml}
    <div class="import-preview-details">
      ${section("created", "新增节点", preview.createdItems, "暂无新增节点")}
      ${section("updated", "更新节点", preview.updatedItems, "暂无更新节点")}
      ${section("issues", "异常/重复", [...invalidItems, ...preview.duplicateItems], "暂无异常或重复行")}
    </div>
  `;
}

function paginateImportItems(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function clampImportPage(page, total, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return Math.min(totalPages, Math.max(1, Number(page || 1)));
}

function importPaginationHtml(key, page, total, pageSize) {
  if (total <= pageSize) return "";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return `
    <div class="import-preview-pager">
      <span>第 ${page} / ${totalPages} 页，共 ${total} 条</span>
      <button type="button" class="ghost-btn" data-import-page="${escapeAttr(key)}" data-page-delta="-1" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <button type="button" class="ghost-btn" data-import-page="${escapeAttr(key)}" data-page-delta="1" ${page >= totalPages ? "disabled" : ""}>下一页</button>
    </div>
  `;
}

function changeImportPreviewPage(key, delta) {
  if (!pendingImport) return;
  updatePendingImportFromPreview({ refresh: false });
  pendingImport.previewPage = pendingImport.previewPage || {};
  pendingImport.previewPage[key] = Math.max(1, Number(pendingImport.previewPage[key] || 1) + delta);
  refreshPendingImportPreview();
}

