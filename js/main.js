let state = loadState();

let globalSearchRenderTimer = null;

Object.assign(els, {
  screenProjectName: document.querySelector("#screenProjectName"),
  missionStatus: document.querySelector("#missionStatus"),
  screenProgress: document.querySelector("#screenProgress"),
  screenCriticalTask: document.querySelector("#screenCriticalTask"),
  screenCriticalMeta: document.querySelector("#screenCriticalMeta"),
  screenCommand: document.querySelector("#screenCommand"),
  screenCommandMeta: document.querySelector("#screenCommandMeta"),
  screenScope: document.querySelector("#screenScope"),
  screenScopeMeta: document.querySelector("#screenScopeMeta")
});

async function copyWeeklyReport() {
  if (!els.weeklyReportOutput.value) els.weeklyReportOutput.value = generateWeeklyReport();

  try {
    if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
    await navigator.clipboard.writeText(els.weeklyReportOutput.value);
    els.weeklySummary.textContent = "周报已复制";
  } catch {
    els.weeklyReportOutput.focus();
    els.weeklyReportOutput.select();
    const copied = document.execCommand?.("copy");
    els.weeklySummary.textContent = copied ? "周报已复制" : "复制失败，请手动复制";
  }
}

function bindEvents() {
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  document.querySelector('select[name="discipline"]').addEventListener("change", renderTaskScopeFields);
  els.roleSelect?.addEventListener("change", (event) => {
    state.currentRole = event.target.value;
    recordAudit("切换当前角色", roleLabel(event.target.value));
    saveState();
    render();
  });
  els.contractorUnitSelect?.addEventListener("change", (event) => {
    state.selectedContractorUnit = event.target.value;
    recordAudit("切换单位权限", event.target.value === "all" ? "全部单位" : event.target.value);
    saveState();
    render();
  });
  els.globalSearchInput?.addEventListener("input", (event) => {
    globalSearchQuery = event.target.value.trim();
    taskFilters.query = globalSearchQuery;
    taskFilters.page = 1;
    clearTimeout(globalSearchRenderTimer);
    globalSearchRenderTimer = setTimeout(() => {
      renderSearchResultsForActiveView();
      persistUiPreferences();
    }, 180);
  });
  els.buildingScopeForm?.addEventListener("submit", saveScopeBuilding);
  els.buildingBatchForm?.addEventListener("submit", saveBuildingBatch);
  els.cancelBuildingEditBtn?.addEventListener("click", resetBuildingScopeForm);
  els.unitScopeForm?.addEventListener("submit", saveScopeUnit);
  els.cancelUnitEditBtn?.addEventListener("click", resetUnitScopeForm);
  els.excelInput.addEventListener("change", importProgressExcel);
  els.downloadTemplateBtn.addEventListener("click", downloadExcelTemplate);
  els.saveBaselineBtn?.addEventListener("click", savePlanBaseline);
  els.exportDelayBtn?.addEventListener("click", () => exportProjectCsv("滞后清单", "csv", buildDelayExportRows()));
  els.exportTasksBtn?.addEventListener("click", () => exportProjectCsv("节点台账", "csv", buildTaskExportRows(currentProjectItems("tasks"))));
  els.exportIssuesBtn?.addEventListener("click", () => exportProjectCsv("整改台账", "csv", buildIssueExportRows()));
  els.exportReportBtn?.addEventListener("click", exportWeeklyReportFile);
  els.printReportBtn?.addEventListener("click", printCurrentReport);
  els.exportImportDiffBtn?.addEventListener("click", exportLatestImportDiff);
  els.exportImportErrorsBtn?.addEventListener("click", exportImportErrors);
  els.autoIssueBtn?.addEventListener("click", createIssuesFromDelayedTasks);
  els.applyDataFixBtn?.addEventListener("click", applyDataFixSuggestions);
  els.approveImportsBtn?.addEventListener("click", approvePendingImports);
  els.exportBackupBtn?.addEventListener("click", exportDataBackup);
  els.backupInput?.addEventListener("change", importDataBackup);
  els.officeModeBtn?.addEventListener("click", toggleOfficeMode);
  els.projectAdminForm?.addEventListener("submit", saveProjectFromForm);
  els.cancelProjectEditBtn?.addEventListener("click", resetProjectForm);

  [
    els.taskSearchInput,
    els.taskStatusFilter,
    els.taskBuildingFilter,
    els.taskOwnerFilter,
    els.taskSortSelect
  ].forEach((control) => {
    control?.addEventListener("input", updateTaskFiltersFromControls);
    control?.addEventListener("change", updateTaskFiltersFromControls);
  });

  els.taskFilterResetBtn?.addEventListener("click", () => {
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc", page: 1 });
    renderTasks();
    persistUiPreferences();
  });
  els.selectAllTasks?.addEventListener("change", toggleSelectPageTasks);
  els.taskTable?.addEventListener("change", handleTaskTableChange);
  els.taskTable?.addEventListener("click", handleTaskTableClick);
  els.taskPagination?.addEventListener("click", handleTaskPaginationClick);
  els.issueBoard?.addEventListener("click", handleIssueBoardClick);
  els.bulkTaskToolbar?.querySelectorAll("[data-bulk-progress]").forEach((button) => {
    button.addEventListener("click", () => bulkSetTaskProgress(Number(button.dataset.bulkProgress)));
  });
  els.bulkIssueBtn?.addEventListener("click", bulkCreateIssues);
  els.bulkExportBtn?.addEventListener("click", bulkExportTasks);
  els.bulkDeleteBtn?.addEventListener("click", bulkDeleteTasks);

  [
    els.modelBuildingFilter,
    els.modelUnitFilter,
    els.modelSystemFilter,
    els.modelStatusFilter
  ].forEach((select) => {
    select?.addEventListener("change", () => {
      if (select === els.modelBuildingFilter) {
        selectedBuildingName = select.value;
        selectedModelFloor = "";
      }
      renderProjectScope();
    });
  });

  els.modelResetFilterBtn?.addEventListener("click", () => {
    [els.modelBuildingFilter, els.modelUnitFilter, els.modelSystemFilter, els.modelStatusFilter].forEach((select) => {
      if (select) select.value = "all";
    });
    selectedBuildingName = "";
    selectedModelFloor = "";
    lastImportFocus = null;
    renderProjectScope();
  });

  els.modelAutoRotateBtn?.addEventListener("click", () => {
    if (!modelState?.isCanvasModel) initCanvasBuildingModel();
    modelState.autoRotate = !modelState.autoRotate;
    updateAutoRotateButton();
    if (modelState.autoRotate) runCanvasModelLoop();
  });

  document.querySelectorAll("[data-model-view]").forEach((button) => {
    button.addEventListener("click", () => setModelView(button.dataset.modelView));
  });

  els.generateWeeklyBtn?.addEventListener("click", () => {
    els.weeklyReportOutput.value = generateWeeklyReport();
  });

  els.copyWeeklyBtn?.addEventListener("click", copyWeeklyReport);

  els.carouselBtn?.addEventListener("click", () => {
    if (document.body.classList.contains("carousel-mode")) {
      stopDashboardCarousel();
      return;
    }
    document.body.classList.add("carousel-mode");
    els.carouselBtn.textContent = "退出轮播";
    startDashboardCarousel();
  });

  els.carouselExitBtn?.addEventListener("click", stopDashboardCarousel);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.body.classList.contains("carousel-mode")) {
      stopDashboardCarousel();
    }
  });

  els.projectFilter.addEventListener("change", (event) => {
    state.selectedProjectId = event.target.value;
    selectedBuildingName = "";
    selectedModelFloor = "";
    lastImportFocus = null;
    pendingImport = null;
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc", page: 1 });
    saveState();
    render();
    renderImportPreview(null);
    showToast("已切换项目");
  });

  document.querySelector("#resetDemoBtn").addEventListener("click", () => {
    if (!ensureCanEdit("恢复示例数据")) return;
    createRestorePoint("恢复示例");
    const keepRestorePoints = state.restorePoints || [];
    state = migrateState(cloneData(demoState));
    state.restorePoints = keepRestorePoints;
    recordAudit("恢复示例数据", "重置为内置示例");
    pendingImport = null;
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc", page: 1 });
    saveState();
    render();
    renderImportPreview(null);
    showToast("示例数据已恢复");
  });

  els.taskForm?.addEventListener("submit", saveTaskFromForm);
  els.cancelTaskEditBtn?.addEventListener("click", resetTaskForm);
  els.issueForm?.addEventListener("submit", saveIssueFromForm);
  els.exportNoticeBtn?.addEventListener("click", exportRectificationNotice);
  els.cancelIssueEditBtn?.addEventListener("click", resetIssueForm);

}

function render() {
  renderAppVersion();
  if (els.roleSelect) els.roleSelect.value = currentRole();
  if (els.globalSearchInput && els.globalSearchInput.value !== globalSearchQuery) els.globalSearchInput.value = globalSearchQuery;
  document.body.classList.toggle("office-mode", Boolean(state.uiPreferences?.officeMode));
  if (els.officeModeBtn) els.officeModeBtn.textContent = state.uiPreferences?.officeMode ? "大屏模式" : "办公模式";
  applyRoleAccess();
  renderProjectFilter();
  renderProjectAdmin();
  renderContractorUnitSelect();
  renderDashboard();
  renderTasks();
  renderIssues();
  renderProjectScope();
  renderBaselinePanel();
  renderWeightPanel();
  renderImportVersionPanel();
  renderRestorePointPanel();
  renderDataHealthPanel();
  renderAuditLogPanel();
}

function renderDataPanels() {
  renderDashboard();
  renderTasks();
  renderIssues();
  renderProjectScope();
  renderBaselinePanel();
  renderWeightPanel();
  renderRestorePointPanel();
  renderDataHealthPanel();
  renderAuditLogPanel();
}

function renderSearchResultsForActiveView() {
  const activeView = document.querySelector(".nav-item.active")?.dataset.view || "dashboard";
  if (activeView === "schedule") {
    renderTasks();
    renderIssues();
    renderProjectScope();
    renderDashboard();
    return;
  }
  if (activeView === "issues") {
    renderIssues();
    renderTasks();
    renderDashboard();
    return;
  }
  if (activeView === "scope") {
    renderProjectScope();
    renderTasks();
    renderDashboard();
    return;
  }
  renderDashboard();
  renderTasks();
  renderIssues();
}

function commitStateChange(refresh = "all") {
  saveState();
  if (refresh === "data") {
    renderDataPanels();
    return;
  }
  if (refresh === "tasks") {
    renderTasks();
    renderDashboard();
    renderProjectScope();
    renderDataHealthPanel();
    renderAuditLogPanel();
    return;
  }
  render();
}

function renderAppVersion() {
  const target = document.querySelector("#appVersion");
  if (target) target.textContent = `v${APP_VERSION}`;
}

function persistUiPreferences() {
  state.uiPreferences = state.uiPreferences || {};
  state.uiPreferences.taskFilters = { ...taskFilters };
  state.uiPreferences.activeView = document.querySelector(".nav-item.active")?.dataset.view || "dashboard";
  saveState();
}

function restoreUiPreferences() {
  if (state.uiPreferences?.taskFilters) Object.assign(taskFilters, state.uiPreferences.taskFilters);
  if (state.uiPreferences?.officeMode) document.body.classList.add("office-mode");
}

function toggleOfficeMode() {
  state.uiPreferences.officeMode = !state.uiPreferences.officeMode;
  recordAudit("切换显示模式", state.uiPreferences.officeMode ? "办公模式" : "大屏模式");
  saveState();
  render();
  showToast(state.uiPreferences.officeMode ? "已切换到办公模式" : "已切换到大屏模式");
}

function renderProjectAdmin() {
  if (!els.projectAdminList) return;
  const archived = new Set(state.archivedProjectIds || []);
  if (els.projectCopyFromSelect) {
    els.projectCopyFromSelect.innerHTML = [
      `<option value="">不复制范围</option>`,
      ...state.projects.map((project) => `<option value="${escapeAttr(project.id)}">${escapeHtml(project.name)}</option>`)
    ].join("");
  }
  if (els.projectAdminSummary) {
    els.projectAdminSummary.textContent = `${state.projects.length - archived.size} 个启用｜${archived.size} 个归档`;
  }
  els.projectAdminList.innerHTML = state.projects.map((project) => `
    <article class="${archived.has(project.id) ? "archived" : ""}">
      <div>
        <strong>${escapeHtml(project.name)}</strong>
        <small>${project.id === state.selectedProjectId ? "当前项目" : archived.has(project.id) ? "已归档" : "可切换"}</small>
      </div>
      <div class="project-actions">
        <button type="button" data-select-project="${escapeAttr(project.id)}">切换</button>
        <button type="button" data-edit-project="${escapeAttr(project.id)}">编辑</button>
        <button type="button" data-toggle-archive-project="${escapeAttr(project.id)}">${archived.has(project.id) ? "启用" : "归档"}</button>
      </div>
    </article>
  `).join("");
  els.projectAdminList.querySelectorAll("[data-select-project]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedProjectId = button.dataset.selectProject;
      saveState();
      render();
      showToast("项目已切换");
    });
  });
  els.projectAdminList.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => editProject(button.dataset.editProject));
  });
  els.projectAdminList.querySelectorAll("[data-toggle-archive-project]").forEach((button) => {
    button.addEventListener("click", () => toggleProjectArchive(button.dataset.toggleArchiveProject));
  });
}

function saveProjectFromForm(event) {
  event.preventDefault();
  if (!ensureCanEdit("保存项目")) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const name = String(data.name || "").trim();
  if (!name) return;
  const existing = data.id ? state.projects.find((project) => project.id === data.id) : null;
  if (existing) {
    existing.name = name;
    recordAudit("编辑项目", name);
  } else {
    const project = { id: `p-${Date.now()}`, name };
    state.projects.push(project);
    state.projectScopes[project.id] = data.copyFrom && state.projectScopes[data.copyFrom]
      ? cloneData(state.projectScopes[data.copyFrom])
      : { basement: "", buildings: [], units: [] };
    state.selectedProjectId = project.id;
    recordAudit("新增项目", name);
  }
  resetProjectForm();
  saveState();
  render();
  showToast("项目已保存");
}

function editProject(projectId) {
  const project = state.projects.find((item) => item.id === projectId);
  if (!project || !els.projectAdminForm) return;
  els.projectAdminForm.elements.id.value = project.id;
  els.projectAdminForm.elements.name.value = project.name;
  if (els.projectSubmitBtn) els.projectSubmitBtn.textContent = "保存项目";
  els.cancelProjectEditBtn?.classList.add("show");
}

function resetProjectForm() {
  els.projectAdminForm?.reset();
  if (els.projectAdminForm?.elements.id) els.projectAdminForm.elements.id.value = "";
  if (els.projectSubmitBtn) els.projectSubmitBtn.textContent = "新增项目";
  els.cancelProjectEditBtn?.classList.remove("show");
}

function toggleProjectArchive(projectId) {
  state.archivedProjectIds = state.archivedProjectIds || [];
  const archived = new Set(state.archivedProjectIds);
  if (archived.has(projectId)) archived.delete(projectId);
  else archived.add(projectId);
  state.archivedProjectIds = [...archived];
  recordAudit("切换项目归档", projectId);
  saveState();
  render();
}

function renderContractorUnitSelect() {
  if (!els.contractorUnitSelect) return;
  const units = currentProjectScope().units.map((unit) => unit.name);
  els.contractorUnitSelect.innerHTML = [
    `<option value="all">全部单位</option>`,
    ...units.map((unit) => `<option value="${escapeHtml(unit)}">${escapeHtml(unit)}</option>`)
  ].join("");
  els.contractorUnitSelect.value = units.includes(state.selectedContractorUnit) ? state.selectedContractorUnit : "all";
}

function applyRoleAccess() {
  document.body.dataset.role = currentRole();
}

window.addEventListener("resize", () => {
  drawChart(currentProjectItems("tasks"));
  if (modelState?.isCanvasModel) scheduleCanvasModelDraw();
});

document.addEventListener("visibilitychange", () => {
  if (!modelState?.isCanvasModel) return;
  if (document.hidden && modelState.autoRotate) {
    modelState.autoRotate = false;
    updateAutoRotateButton();
    showToast("页面失焦时已暂停自动旋转");
    return;
  }
  if (!document.hidden && modelState.renderQuality === "rotating") {
    modelState.renderQuality = "full";
    scheduleCanvasModelDraw();
  }
});

restoreUiPreferences();
bindEvents();
setDefaultDates();
render();
if (state.uiPreferences?.activeView) switchView(state.uiPreferences.activeView);
hydrateStateFromIndexedDB().then((restored) => {
  if (!restored) return;
  restoreUiPreferences();
  render();
  if (state.uiPreferences?.activeView) switchView(state.uiPreferences.activeView);
  showToast("已从 IndexedDB 恢复本地数据");
});

