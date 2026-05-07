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
  els.buildingScopeForm?.addEventListener("submit", saveScopeBuilding);
  els.cancelBuildingEditBtn?.addEventListener("click", resetBuildingScopeForm);
  els.unitScopeForm?.addEventListener("submit", saveScopeUnit);
  els.cancelUnitEditBtn?.addEventListener("click", resetUnitScopeForm);
  els.excelInput.addEventListener("change", importProgressExcel);
  els.downloadTemplateBtn.addEventListener("click", downloadExcelTemplate);
  els.saveBaselineBtn?.addEventListener("click", savePlanBaseline);
  els.exportDelayBtn?.addEventListener("click", () => exportCsv("滞后清单.csv", buildDelayExportRows()));
  els.exportTasksBtn?.addEventListener("click", () => exportCsv("节点台账.csv", buildTaskExportRows(currentProjectItems("tasks"))));
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
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc" });
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
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc" });
    saveState();
    render();
    renderImportPreview(null);
  });

  document.querySelector("#resetDemoBtn").addEventListener("click", () => {
    createRestorePoint("恢复示例");
    const keepRestorePoints = state.restorePoints || [];
    state = migrateState(cloneData(demoState));
    state.restorePoints = keepRestorePoints;
    pendingImport = null;
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", sort: "plannedAsc" });
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
  renderProjectFilter();
  renderDashboard();
  renderTasks();
  renderIssues();
  renderProjectScope();
  renderBaselinePanel();
  renderRestorePointPanel();
}

window.addEventListener("resize", () => {
  drawChart(currentProjectItems("tasks"));
  if (modelState?.isCanvasModel) drawCanvasBuildingModel();
});

bindEvents();
setDefaultDates();
render();

