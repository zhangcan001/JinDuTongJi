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
  els.loginBtn?.addEventListener("click", () => showAuthPrompt());
  els.logoutBtn?.addEventListener("click", async () => {
    await logoutBackendSession();
    showToast("已退出登录");
  });
  els.loginOverlayClose?.addEventListener("click", hideAuthPrompt);
  els.loginOverlay?.addEventListener("click", (event) => {
    if (event.target === els.loginOverlay) hideAuthPrompt();
  });
  els.logoutFromDialogBtn?.addEventListener("click", async () => {
    await logoutBackendSession();
    hideAuthPrompt();
    showToast("已退出登录");
  });
  els.refreshSystemBtn?.addEventListener("click", refreshSystemState);
  els.runMaintenanceBtn?.addEventListener("click", runBackendMaintenance);
  els.loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = String(els.loginForm.elements.password?.value || "").trim();
    if (!password) return showToast("请输入管理员密码", "warn");
    try {
      await loginWithPassword(password);
      hideAuthPrompt();
      showToast("登录成功");
      render();
    } catch (error) {
      showToast(error.message || "登录失败", "warn");
    }
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
  document.querySelector("#cancelImportParseBtn")?.addEventListener("click", cancelImportParse);
  els.pasteImportBtn?.addEventListener("click", importPastedTable);
  els.downloadTemplateBtn.addEventListener("click", downloadExcelTemplate);
  els.saveBaselineBtn?.addEventListener("click", savePlanBaseline);
  els.backendBackupBtn?.addEventListener("click", createBackendBackup);
  els.backendExportJsonBtn?.addEventListener("click", () => { window.location.href = "./api/export/json"; });
  els.backendExportSqliteBtn?.addEventListener("click", () => { window.location.href = "./api/export/sqlite"; });
  els.backendImportJsonInput?.addEventListener("change", importBackendJsonBackup);
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
  els.undoBtn?.addEventListener("click", undoLastStateChange);
  els.redoBtn?.addEventListener("click", redoLastStateChange);
  els.cleanupDataBtn?.addEventListener("click", clearOldLocalData);
  els.taskViewSelect?.addEventListener("change", applySavedTaskView);
  els.saveTaskViewBtn?.addEventListener("click", saveCurrentTaskView);
  els.clearSavedViewsBtn?.addEventListener("click", clearSavedTaskViews);
  els.bulkEditOwnerBtn?.addEventListener("click", () => bulkEditSelectedTasks("owner"));
  els.bulkEditNoteBtn?.addEventListener("click", () => bulkEditSelectedTasks("note"));
  els.detailOverlayClose?.addEventListener("click", closeDetailOverlay);
  els.detailOverlay?.addEventListener("click", (event) => {
    if (event.target === els.detailOverlay) closeDetailOverlay();
  });
  els.officeModeBtn?.addEventListener("click", toggleOfficeMode);
  els.projectAdminForm?.addEventListener("submit", saveProjectFromForm);
  els.cancelProjectEditBtn?.addEventListener("click", resetProjectForm);
  els.saveProjectTemplateBtn?.addEventListener("click", saveCurrentProjectTemplate);

  [
    els.taskSearchInput,
    els.taskStatusFilter,
    els.taskSmartFilter,
    els.taskBuildingFilter,
    els.taskOwnerFilter,
    els.taskSortSelect
  ].forEach((control) => {
    control?.addEventListener("input", updateTaskFiltersFromControls);
    control?.addEventListener("change", updateTaskFiltersFromControls);
  });

  els.taskFilterResetBtn?.addEventListener("click", () => {
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", smart: "all", sort: "plannedAsc", page: 1 });
    renderTasks();
    persistUiPreferences();
  });
  els.selectAllTasks?.addEventListener("change", toggleSelectPageTasks);
  els.taskTable?.addEventListener("change", handleTaskTableChange);
  els.taskTable?.addEventListener("focusout", handleTaskTableFocusOut);
  els.taskTable?.addEventListener("click", handleTaskTableClick);
  els.taskColumnToggles?.addEventListener("change", handleTaskColumnToggle);
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
    const isTypingTarget = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName) || event.target?.isContentEditable;
    if (event.key === "Escape" && document.body.classList.contains("carousel-mode")) {
      stopDashboardCarousel();
      return;
    }
    if (event.key === "Escape" && els.detailOverlay && !els.detailOverlay.hidden) {
      closeDetailOverlay();
      return;
    }
    if (event.key === "Escape") {
      if (els.taskForm && els.taskSubmitBtn?.textContent === "保存节点") resetTaskForm();
      if (els.issueForm && els.issueSubmitBtn?.textContent === "保存整改项") resetIssueForm();
    }
    if (!isTypingTarget && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) redoLastStateChange();
      else undoLastStateChange();
      return;
    }
    if (!isTypingTarget && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoLastStateChange();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      const activeView = document.querySelector(".nav-item.active")?.dataset.view;
      if (activeView === "schedule" && els.taskForm) els.taskForm.requestSubmit();
      if (activeView === "issues" && els.issueForm) els.issueForm.requestSubmit();
    }
  });

  els.projectFilter.addEventListener("change", (event) => {
    state.selectedProjectId = event.target.value;
    selectedBuildingName = "";
    selectedModelFloor = "";
    lastImportFocus = null;
    pendingImport = null;
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", smart: "all", sort: "plannedAsc", page: 1 });
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
    Object.assign(taskFilters, { query: "", status: "all", building: "all", owner: "all", smart: "all", sort: "plannedAsc", page: 1 });
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
  renderBackendBackupPanel();
  renderDataHealthPanel();
  renderAuditLogPanel();
  renderSystemSettingsPanel();
}

function renderDataPanels(scope = "data") {
  if (scope === "tasks") {
    renderTasks();
    renderDashboard();
    renderProjectScope();
    renderDataHealthPanel();
    renderAuditLogPanel();
    return;
  }
  if (scope === "issues") {
    renderIssues();
    renderDashboard();
    renderDataHealthPanel();
    renderAuditLogPanel();
    return;
  }
  if (scope === "scope") {
    renderProjectScope();
    renderTasks();
    renderDashboard();
    renderDataHealthPanel();
    renderAuditLogPanel();
    return;
  }
  renderDashboard();
  renderTasks();
  renderIssues();
  renderProjectScope();
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
  saveState({ immediate: refresh !== "prefs" });
  if (refresh === "data") {
    renderDataPanels("data");
    return;
  }
  if (refresh === "tasks") {
    renderDataPanels("tasks");
    return;
  }
  if (refresh === "issues") {
    renderDataPanels("issues");
    return;
  }
  if (refresh === "scope") {
    renderDataPanels("scope");
    return;
  }
  if (refresh === "prefs") return;
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

function taskViewSignature(filters) {
  return JSON.stringify({
    query: String(filters?.query || ""),
    status: String(filters?.status || "all"),
    building: String(filters?.building || "all"),
    owner: String(filters?.owner || "all"),
    smart: String(filters?.smart || "all"),
    sort: String(filters?.sort || "plannedAsc"),
    pageSize: Number(filters?.pageSize || 120)
  });
}

function renderSavedTaskViewOptions() {
  if (!els.taskViewSelect) return;
  state.uiPreferences = state.uiPreferences || {};
  const views = state.uiPreferences.savedTaskViews || [];
  const currentSignature = taskViewSignature(taskFilters);
  const matchedView = views.find((view) => taskViewSignature(view.filters) === currentSignature);
  els.taskViewSelect.innerHTML = [
    `<option value="">${views.length ? "选择已保存视图" : "暂无已保存视图"}</option>`,
    ...views.map((view) => `<option value="${escapeAttr(view.id)}">${escapeHtml(view.name)}</option>`)
  ].join("");
  els.taskViewSelect.value = matchedView?.id || "";
}

function saveCurrentTaskView() {
  state.uiPreferences = state.uiPreferences || {};
  const name = String(window.prompt("请输入视图名称", "当前筛选视图") || "").trim();
  if (!name) return;
  const nextView = {
    id: createId(),
    name,
    filters: {
      query: taskFilters.query,
      status: taskFilters.status,
      building: taskFilters.building,
      owner: taskFilters.owner,
      smart: taskFilters.smart,
      sort: taskFilters.sort,
      pageSize: taskFilters.pageSize
    },
    createdAt: new Date().toISOString()
  };
  const views = (state.uiPreferences.savedTaskViews || []).filter((view) => view.name !== name);
  state.uiPreferences.savedTaskViews = [nextView, ...views].slice(0, 10);
  recordAudit("保存筛选视图", name);
  saveState();
  render();
  showToast("筛选视图已保存");
}

function applySavedTaskView(event) {
  const viewId = event?.target?.value || els.taskViewSelect?.value || "";
  if (!viewId) return;
  const view = (state.uiPreferences?.savedTaskViews || []).find((item) => item.id === viewId);
  if (!view) return;
  Object.assign(taskFilters, {
    query: view.filters?.query || "",
    status: view.filters?.status || "all",
    building: view.filters?.building || "all",
    owner: view.filters?.owner || "all",
    smart: view.filters?.smart || "all",
    sort: view.filters?.sort || "plannedAsc",
    page: 1,
    pageSize: view.filters?.pageSize || 120
  });
  persistUiPreferences();
  recordAudit("应用筛选视图", view.name);
  render();
}

async function clearSavedTaskViews() {
  if (!state.uiPreferences?.savedTaskViews?.length) return showToast("没有可清理的视图", "warn");
  if (!(await confirmAction("确定清理所有已保存的筛选视图吗？", { title: "清理保存视图", okText: "清理" }))) return;
  state.uiPreferences.savedTaskViews = [];
  recordAudit("清理筛选视图", "全部删除");
  saveState();
  render();
  showToast("已清理保存视图");
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
  if (els.projectTemplateSelect) {
    els.projectTemplateSelect.innerHTML = [
      `<option value="">不使用模板</option>`,
      ...(state.projectTemplates || []).map((template) => `<option value="${escapeAttr(template.id)}">${escapeHtml(template.name)}</option>`)
    ].join("");
  }
  if (els.projectAdminSummary) {
    els.projectAdminSummary.textContent = `${state.projects.length - archived.size} 个启用｜${archived.size} 个归档｜${(state.projectTemplates || []).length} 个模板`;
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
    const template = (state.projectTemplates || []).find((item) => item.id === data.templateId);
    state.projectScopes[project.id] = template?.scope
      ? cloneData(template.scope)
      : data.copyFrom && state.projectScopes[data.copyFrom]
      ? cloneData(state.projectScopes[data.copyFrom])
      : { basement: "", buildings: [], units: [] };
    if (template?.progressWeights) state.progressWeights = cloneData(template.progressWeights);
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

function saveCurrentProjectTemplate() {
  if (!ensureCanEdit("保存项目模板")) return;
  const projectName = currentProjectName();
  const scope = cloneData(currentProjectScope());
  const template = {
    id: createId(),
    name: `${projectName}模板`,
    projectId: state.selectedProjectId,
    scope,
    progressWeights: cloneData(state.progressWeights || {}),
    createdAt: new Date().toISOString()
  };
  state.projectTemplates = [template, ...(state.projectTemplates || []).filter((item) => item.name !== template.name)].slice(0, 10);
  recordAudit("保存项目模板", template.name);
  saveState();
  render();
  showToast("项目模板已保存");
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
initializeLocalOnlyFeatures();
render();
if (state.uiPreferences?.activeView) switchView(state.uiPreferences.activeView);
refreshAuthState().then(() => {
  updateAuthUi?.();
  resumePendingBackendWork();
});
hydrateStateFromBackend().then((restoredFromBackend) => {
  if (restoredFromBackend) {
    restoreUiPreferences();
    render();
    if (state.uiPreferences?.activeView) switchView(state.uiPreferences.activeView);
    showToast("已从本地数据库恢复数据");
    return true;
  }
  return hydrateStateFromIndexedDB();
}).then((restored) => {
  if (!restored) return;
  restoreUiPreferences();
  render();
  if (state.uiPreferences?.activeView) switchView(state.uiPreferences.activeView);
  showToast("已从 IndexedDB 恢复本地数据");
});

function initializeLocalOnlyFeatures() {
  createDailyRestorePointIfNeeded();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator) || location.protocol === "file:") return;
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

