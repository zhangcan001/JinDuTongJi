let state = loadState();

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
  els.globalSearchInput?.addEventListener("input", (event) => {
    globalSearchQuery = event.target.value.trim();
    taskFilters.query = globalSearchQuery;
    taskFilters.page = 1;
    render();
  });
  els.buildingScopeForm?.addEventListener("submit", saveScopeBuilding);
  els.buildingBatchForm?.addEventListener("submit", saveBuildingBatch);
  els.cancelBuildingEditBtn?.addEventListener("click", resetBuildingScopeForm);
  els.unitScopeForm?.addEventListener("submit", saveScopeUnit);
  els.cancelUnitEditBtn?.addEventListener("click", resetUnitScopeForm);
  els.excelInput.addEventListener("change", importProgressExcel);
  els.downloadTemplateBtn.addEventListener("click", downloadExcelTemplate);
  els.saveBaselineBtn?.addEventListener("click", savePlanBaseline);
  els.exportDelayBtn?.addEventListener("click", () => exportCsv("滞后清单.csv", buildDelayExportRows()));
  els.exportTasksBtn?.addEventListener("click", () => exportCsv("节点台账.csv", buildTaskExportRows(currentProjectItems("tasks"))));
  els.exportIssuesBtn?.addEventListener("click", () => exportCsv("整改台账.csv", buildIssueExportRows()));
  els.exportReportBtn?.addEventListener("click", exportWeeklyReportFile);
  els.exportBackupBtn?.addEventListener("click", exportDataBackup);
  els.backupInput?.addEventListener("change", importDataBackup);

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
  });

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
  });

  els.taskForm?.addEventListener("submit", saveTaskFromForm);
  els.cancelTaskEditBtn?.addEventListener("click", resetTaskForm);
  els.issueForm?.addEventListener("submit", saveIssueFromForm);
  els.cancelIssueEditBtn?.addEventListener("click", resetIssueForm);

}

function render() {
  if (els.roleSelect) els.roleSelect.value = currentRole();
  if (els.globalSearchInput && els.globalSearchInput.value !== globalSearchQuery) els.globalSearchInput.value = globalSearchQuery;
  applyRoleAccess();
  renderProjectFilter();
  renderDashboard();
  renderTasks();
  renderIssues();
  renderProjectScope();
  renderBaselinePanel();
  renderRestorePointPanel();
  renderDataHealthPanel();
  renderAuditLogPanel();
}

function applyRoleAccess() {
  document.body.dataset.role = currentRole();
}

window.addEventListener("resize", () => {
  drawChart(currentProjectItems("tasks"));
  if (modelState?.isCanvasModel) scheduleCanvasModelDraw();
});

bindEvents();
setDefaultDates();
render();

