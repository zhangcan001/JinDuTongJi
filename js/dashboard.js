function switchView(view) {
  const titles = {
    dashboard: "数据分析",
    scope: "3D模型",
    schedule: "明细数据",
    issues: "滞后与整改",
    system: "系统设置"
  };
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.pageTitle.textContent = titles[view];
  if (state?.uiPreferences) {
    state.uiPreferences.activeView = view;
    saveState({ scope: "prefs" });
  }
  if (typeof renderViewContent === "function") renderViewContent(view);

  if (view === "scope") {
    requestAnimationFrame(() => {
      if (modelState?.isCanvasModel) scheduleCanvasModelDraw();
    });
  }

  if (view === "system") {
    requestAnimationFrame(() => refreshSystemState());
  }
}

function renderProjectFilter() {
  const archived = new Set(state.archivedProjectIds || []);
  els.projectFilter.innerHTML = state.projects
    .filter((project) => !archived.has(project.id) || project.id === state.selectedProjectId)
    .map((project) => `<option value="${project.id}">${project.name}</option>`)
    .join("");
  els.projectFilter.value = state.selectedProjectId;
  renderTaskScopeFields();
}

function renderTaskScopeFields() {
  const scope = currentProjectScope();
  const discipline = document.querySelector('select[name="discipline"]').value;
  const matchedUnit = scope.units.find((unit) => unit.name.includes(discipline));
  const systems = matchedUnit
    ? matchedUnit.systems
    : scope.units.flatMap((unit) => unit.systems.map((system) => `${unit.name}｜${system}`));

  els.taskBuildingSelect.innerHTML = [
    ...scope.buildings.map((building) => `${building.name}（${building.floors}层）`),
    scope.basement
  ]
    .filter(Boolean)
    .map((label) => `<option>${escapeHtml(label)}</option>`)
    .join("");

  els.taskSystemSelect.innerHTML = systems.length
    ? systems.map((system) => `<option>${escapeHtml(system)}</option>`).join("")
    : `<option>未设置施工内容</option>`;
}

function renderDashboard() {
  const tasks = currentProjectItems("tasks");
  const issues = currentProjectItems("issues");
  const statuses = tasks.map(getTaskStatus);
  const overall = tasks.length ? averageProgress(tasks) : 0;
  const delayed = statuses.filter((status) => status.className === "delay").length;
  const dueSoon = statuses.filter((status) => status.className === "risk").length;
  const openIssues = issues.filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合").length;

  els.overallProgress.textContent = `${overall}%`;
  els.progressTrend.textContent = overall >= 85 ? "整体接近计划" : "需关注关键线路";
  els.delayedCount.textContent = delayed;
  els.dueSoonCount.textContent = dueSoon;
  els.openIssueCount.textContent = openIssues;
  renderCommandScreen(tasks, issues, { overall, delayed, dueSoon, openIssues });
  renderProgressQuery(tasks);
  renderVisualDashboard(tasks);
  renderDashboardInsights(tasks);
  renderDashboardConfig();
  applyDashboardConfig();
  renderTodayTodo(tasks, issues);

  const warnings = [
    ...tasks
      .filter((task) => ["delay", "risk"].includes(getTaskStatus(task).className))
      .map((task) => ({
        title: task.name,
        meta: `${task.owner}，计划 ${task.planned}，完成率 ${task.progress}%`,
        danger: getTaskStatus(task).className === "delay"
      })),
    ...issues
      .filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合")
      .map((issue) => ({
        title: issue.title,
        meta: `${issue.owner}，要求 ${issue.deadline} 前闭合`,
        danger: issue.severity === "紧急"
      }))
  ];

  els.warningList.innerHTML = warnings.length
    ? warnings
        .map(
          (warning) => `
            <div class="warning-item ${warning.danger ? "danger" : ""}">
              <strong>${escapeHtml(warning.title)}</strong>
              <small>${escapeHtml(warning.meta)}</small>
            </div>
          `
        )
        .join("")
    : `<div class="warning-item"><strong>暂无预警</strong><small>当前项目没有滞后或临期事项</small></div>`;

  drawChart(tasks);
  renderOperationsDashboard(tasks);
  renderAnalyticsPanel(tasks, issues);
}

function renderProgressQuery(tasks = currentProjectItems("tasks")) {
  if (!els.progressQueryTable) return;
  syncProgressQueryControls(tasks);
  const filters = progressQueryFilters();
  const filtered = currentProjectFilteredTasks(tasks, filters);
  const done = filtered.filter((task) => getTaskStatus(task).className === "done").length;
  const delayed = filtered.filter((task) => getTaskStatus(task).className === "delay").length;
  const dueSoon = filtered.filter((task) => getTaskStatus(task).className === "risk").length;
  const active = filtered.filter((task) => {
    const progress = Number(task.progress || 0);
    return progress > 0 && progress < 100 && getTaskStatus(task).className !== "done";
  }).length;
  const progress = filtered.length ? averageProgress(filtered) : 0;
  const scopeLabel = progressQueryScopeLabel(filters);

  els.progressQuerySummary.textContent = `${scopeLabel}｜${filtered.length} / ${tasks.length} 个节点`;
  els.progressQueryStats.innerHTML = [
    ["综合完成率", `${progress}%`],
    ["施工中", active],
    ["已完成", done],
    ["滞后", delayed],
    ["临期", dueSoon]
  ].map(([label, value]) => `<article><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");

  const rows = filtered.slice(0, 80).map((task) => {
    const status = getTaskStatus(task);
    return `
      <tr>
        <td>
          <button class="text-action" type="button" data-query-locate-task="${escapeAttr(task.id)}">${escapeHtml(resolveBuildingName(task.building || task.name) || "-")}</button>
          <br><small>${escapeHtml(normalizedFloorKey(task.floor || "") || "未填楼层")}</small>
        </td>
        <td>${escapeHtml(task.owner || task.discipline || "未填单位")}</td>
        <td><strong>${escapeHtml(task.system || task.name || "-")}</strong><br><small>${escapeHtml(task.name || "")}</small></td>
        <td><strong>${Number(task.progress || 0)}%</strong></td>
        <td><span class="status ${status.className}">${escapeHtml(status.label)}</span></td>
        <td>${escapeHtml(task.planned || "-")}</td>
        <td>${escapeHtml(task.note || "-")}</td>
      </tr>
    `;
  }).join("");

  els.progressQueryTable.innerHTML = rows || tableEmptyRowHtml(7, "当前筛选条件下暂无进度节点", "可以调整单位、楼栋或楼层后再查。");
}

function syncProgressQueryControls(tasks) {
  syncFilterSelect(
    els.progressQueryUnitFilter,
    [["all", "全部单位"], ...uniqueSorted(tasks.map((task) => task.owner || task.discipline || "未填单位")).map((item) => [item, item])],
    els.progressQueryUnitFilter?.value || "all"
  );
  syncFilterSelect(
    els.progressQueryBuildingFilter,
    [["all", "全部楼栋"], ...uniqueSorted(tasks.map((task) => resolveBuildingName(task.building || task.name)).filter(Boolean)).map((item) => [item, item])],
    els.progressQueryBuildingFilter?.value || "all"
  );
  syncFilterSelect(
    els.progressQueryFloorFilter,
    [["all", "全部楼层"], ...uniqueSorted(tasks.map((task) => normalizedFloorKey(task.floor || "")).filter(Boolean)).map((item) => [item, item])],
    els.progressQueryFloorFilter?.value || "all"
  );
}

function progressQueryFilters() {
  return {
    query: els.progressQueryInput?.value.trim() || "",
    status: els.progressQueryStatusFilter?.value || "all",
    building: els.progressQueryBuildingFilter?.value || "all",
    floor: els.progressQueryFloorFilter?.value || "all",
    owner: els.progressQueryUnitFilter?.value || "all",
    smart: "all",
    sort: "plannedAsc"
  };
}

function progressQueryScopeLabel(filters) {
  const parts = [
    filters.owner !== "all" ? filters.owner : "",
    filters.building !== "all" ? filters.building : "",
    filters.floor !== "all" ? filters.floor : "",
    filters.status !== "all" ? statusLabel(filters.status) : "",
    filters.query ? `关键词 ${filters.query}` : ""
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "全部范围";
}

function updateProgressQuery() {
  renderProgressQuery(currentProjectItems("tasks"));
}

function resetProgressQuery() {
  if (els.progressQueryInput) els.progressQueryInput.value = "";
  [
    els.progressQueryUnitFilter,
    els.progressQueryBuildingFilter,
    els.progressQueryFloorFilter,
    els.progressQueryStatusFilter
  ].forEach((control) => {
    if (control) control.value = "all";
  });
  renderProgressQuery(currentProjectItems("tasks"));
}

function handleProgressQueryTableClick(event) {
  const locateButton = event.target.closest("[data-query-locate-task]");
  if (!locateButton) return;
  locateTaskInModel(locateButton.dataset.queryLocateTask);
}

function renderVisualDashboard(tasks = currentProjectItems("tasks")) {
  renderFloorHeatmap(tasks);
  renderUnitProgressChart(tasks);
}

function renderFloorHeatmap(tasks) {
  if (!els.floorHeatmap) return;
  const scope = currentProjectScope();
  const stats = getBuildingStats(scope, tasks).filter((building) => building.related.length || !els.progressQueryInput?.value);
  const floors = stats.flatMap((building) => building.floorDetails);
  const delayed = floors.reduce((sum, floor) => sum + floor.delayCount, 0);
  const active = floors.filter((floor) => floor.tasks.length).length;
  if (els.visualDashboardSummary) {
    els.visualDashboardSummary.textContent = `${stats.length} 个部位｜${active} 个有数据楼层｜${delayed} 个楼层含滞后`;
  }
  els.floorHeatmap.innerHTML = stats.length
    ? stats.map((building) => `
      <article class="heatmap-building">
        <button class="heatmap-building-head" type="button" data-dashboard-building="${escapeAttr(building.name)}">
          <span>${escapeHtml(building.name)}</span>
          <strong>${building.progress}%</strong>
        </button>
        <div class="heatmap-floor-grid" style="--floor-count:${Math.max(1, building.floorDetails.length)}">
          ${building.floorDetails.map((floor) => `
            <button
              class="heatmap-floor ${heatmapTone(floor)}"
              type="button"
              title="${escapeAttr(building.name)} ${floor.label} ${floor.progress}%"
              data-dashboard-building="${escapeAttr(building.name)}"
              data-dashboard-floor="${escapeAttr(floor.label)}"
            >
              <span>${escapeHtml(shortFloorLabel(floor.label))}</span>
              <strong>${floor.progress}%</strong>
            </button>
          `).join("")}
        </div>
      </article>
    `).join("")
    : emptyStateHtml("暂无楼栋进度数据", "上传进度表格后会自动生成楼栋楼层热力图。");
}

function renderUnitProgressChart(tasks) {
  if (!els.unitProgressChart) return;
  const hiddenUnits = new Set(["精装单位", "机电分包", "总包一标段"]);
  const grouped = new Map();
  tasks.forEach((task) => {
    const unit = task.owner || task.discipline || "未填单位";
    if (hiddenUnits.has(unit)) return;
    if (!grouped.has(unit)) grouped.set(unit, []);
    grouped.get(unit).push(task);
  });
  const rows = Array.from(grouped.entries())
    .map(([unit, unitTasks]) => ({
      unit,
      progress: averageProgress(unitTasks),
      total: unitTasks.length,
      delayed: unitTasks.filter((task) => getTaskStatus(task).className === "delay").length,
      done: unitTasks.filter((task) => getTaskStatus(task).className === "done").length
    }))
    .sort((a, b) => a.progress - b.progress || b.delayed - a.delayed)
    .slice(0, 10);
  els.unitProgressChart.innerHTML = rows.length
    ? rows.map((item) => `
      <button class="unit-progress-row-chart ${item.delayed ? "has-delay" : ""}" type="button" data-dashboard-unit="${escapeAttr(item.unit)}">
        <span>${escapeHtml(item.unit)}</span>
        <div class="unit-progress-track"><i style="width:${item.progress}%"></i></div>
        <strong>${item.progress}%</strong>
        <small>${item.done}/${item.total} 完成｜滞后 ${item.delayed}</small>
      </button>
    `).join("")
    : emptyStateHtml("暂无单位进度数据", "导入后会按责任单位自动统计完成率。");
}

function heatmapTone(floor) {
  if (!floor.tasks.length) return "empty";
  if (floor.delayCount > 0) return "delay";
  if (floor.status === "risk") return "risk";
  if (floor.progress >= 100) return "done";
  if (floor.progress > 0) return "active";
  return "normal";
}

function shortFloorLabel(label) {
  return String(label || "").replace("地下室", "地下").replace("层", "F");
}

function openDashboardFloor(building, floor) {
  Object.assign(taskFilters, {
    query: "",
    status: "all",
    building: building || "all",
    floor: floor || "all",
    owner: "all",
    smart: "all",
    sort: "plannedAsc",
    page: 1
  });
  persistUiPreferences();
  switchView("schedule");
}

function openDashboardUnit(unit) {
  Object.assign(taskFilters, {
    query: "",
    status: "all",
    building: "all",
    floor: "all",
    owner: unit || "all",
    smart: "all",
    sort: "progressAsc",
    page: 1
  });
  persistUiPreferences();
  switchView("schedule");
}

function handleVisualDashboardClick(event) {
  const floorButton = event.target.closest("[data-dashboard-floor]");
  if (floorButton) return openDashboardFloor(floorButton.dataset.dashboardBuilding, floorButton.dataset.dashboardFloor);
  const buildingButton = event.target.closest("[data-dashboard-building]");
  if (buildingButton) return openDashboardFloor(buildingButton.dataset.dashboardBuilding, "all");
  const unitButton = event.target.closest("[data-dashboard-unit]");
  if (unitButton) return openDashboardUnit(unitButton.dataset.dashboardUnit);
}

function renderDashboardInsights(tasks = currentProjectItems("tasks")) {
  renderDashboardHealth(tasks);
  renderDashboardImportHistory();
}

function renderDashboardHealth(tasks) {
  if (!els.dashboardHealthList) return;
  const report = buildDataHealthReport();
  const sections = report.sections
    .filter((section) => section.items.length)
    .sort((a, b) => b.items.length - a.items.length)
    .slice(0, 5);
  const issueCount = report.sections.reduce((sum, section) => sum + section.items.length, 0);
  const pending = (state.pendingImports || []).filter((item) => item.projectId === state.selectedProjectId).length;
  if (els.dashboardInsightSummary) {
    els.dashboardInsightSummary.textContent = issueCount ? `${issueCount} 条数据风险｜待复核 ${pending} 条` : `${tasks.length} 个节点数据正常`;
  }
  els.dashboardHealthList.innerHTML = sections.length
    ? sections.map((section) => `
      <button class="dashboard-health-item warn" type="button" data-open-health="${escapeAttr(section.title)}">
        <span>${escapeHtml(section.title)}</span>
        <strong>${section.items.length}</strong>
        <small>${escapeHtml(section.items[0] || "")}</small>
      </button>
    `).join("")
    : `<article class="dashboard-health-item ok"><span>数据质量</span><strong>正常</strong><small>当前项目未发现明显异常。</small></article>`;
}

function renderDashboardImportHistory() {
  if (!els.dashboardImportHistory) return;
  const records = (state.importHistory || [])
    .filter((item) => item.projectId === state.selectedProjectId)
    .slice(0, 5);
  els.dashboardImportHistory.innerHTML = records.length
    ? records.map((item) => `
      <article class="dashboard-history-item">
        <div>
          <strong>${escapeHtml(item.fileName || "未命名导入")}</strong>
          <small>${new Date(item.time).toLocaleString()}｜新增 ${Number(item.created || 0)}｜更新 ${Number(item.updated || 0)}｜跳过 ${Number(item.skipped || 0)}</small>
        </div>
        <span>${Number(item.locations?.length || 0)} 个楼层</span>
      </article>
    `).join("")
    : emptyStateHtml("暂无上传记录", "上传进度表格并确认同步后会显示在这里。");
}

function handleDashboardInsightClick(event) {
  const healthButton = event.target.closest("[data-open-health]");
  if (!healthButton) return;
  switchView("system");
}

function renderDashboardConfig() {
  if (!els.dashboardConfig) return;
  const cards = state.uiPreferences.dashboardCards || [];
  const options = [
    ["today", "今日待办"],
    ["ops", "偏差/穿插/排名"],
    ["weekly", "监理周报"],
    ["chart", "曲线与预警"],
    ["analytics", "多维分析"]
  ];
  els.dashboardConfig.innerHTML = options.map(([value, label]) => `
    <label><input type="checkbox" value="${value}" ${cards.includes(value) ? "checked" : ""}> ${label}</label>
  `).join("");
  els.dashboardConfig.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      state.uiPreferences.dashboardCards = [...els.dashboardConfig.querySelectorAll("input:checked")].map((item) => item.value);
      saveState();
      applyDashboardConfig();
      showToast("驾驶舱配置已保存");
    });
  });
}

function applyDashboardConfig() {
  const cards = new Set(state.uiPreferences.dashboardCards || []);
  document.querySelector(".today-panel")?.classList.toggle("hidden-panel", !cards.has("today"));
  document.querySelector(".ops-grid")?.classList.toggle("hidden-panel", !cards.has("ops"));
  document.querySelector(".weekly-panel")?.classList.toggle("hidden-panel", !cards.has("weekly"));
  document.querySelector(".content-grid")?.classList.toggle("hidden-panel", !cards.has("chart"));
  document.querySelector(".analytics-panel")?.classList.toggle("hidden-panel", !cards.has("analytics"));
}

function renderOperationsDashboard(tasks) {
  renderDeviationPanel(tasks);
  renderDependencyPanel(tasks);
  renderUnitRanking(tasks);
  if (els.weeklyReportOutput && !els.weeklyReportOutput.value) {
    els.weeklyReportOutput.value = generateWeeklyReport();
  }
}

function renderTodayTodo(tasks, issues) {
  if (!els.todayTodoList) return;
  const taskItems = tasks
    .map((task) => ({ task, status: getTaskStatus(task), days: daysBetween(task.planned) }))
    .filter((item) => item.status.className === "delay" || item.status.className === "risk")
    .map((item) => ({
      id: item.task.id,
      kind: "节点",
      title: item.task.system || item.task.name,
      meta: `${item.task.building || "-"}｜${item.task.floor || "-"}｜${item.task.owner || "-"}｜计划 ${item.task.planned}`,
      level: item.status.className,
      sort: item.status.className === "delay" ? item.days : 10 + item.days,
      action: "查看台账"
    }));
  const issueItems = issues
    .filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合")
    .map((issue) => ({
      id: issue.id,
      kind: normalizeIssueStatus(issue.status),
      title: issue.title,
      meta: `${issue.owner || "-"}｜要求 ${issue.deadline || "-"}｜${issue.reviewResult || issue.delayReason || "待跟踪"}`,
      level: issue.severity === "紧急" ? "delay" : normalizeIssueStatus(issue.status) === "待复验" ? "risk" : "normal",
      sort: issue.severity === "紧急" ? -10 : daysBetween(issue.deadline || localDateText(today)),
      action: "处理整改"
    }));
  const items = [...taskItems, ...issueItems].sort((a, b) => a.sort - b.sort).slice(0, 10);
  els.todaySummary.textContent = items.length ? `${items.length} 项待处理` : "暂无待办";
  els.todayTodoList.innerHTML = items.length
    ? items.map((item) => `
      <article class="today-item ${item.level}">
        <span>${escapeHtml(item.kind)}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.meta)}</small>
        </div>
        <button type="button" data-open-todo="${escapeAttr(item.id)}" data-todo-kind="${escapeAttr(item.kind === "节点" ? "task" : "issue")}">${escapeHtml(item.action)}</button>
      </article>
    `).join("")
    : `<article class="today-item"><span>平稳</span><div><strong>暂无今日待办</strong><small>当前没有滞后、临期或未闭合整改项。</small></div></article>`;
  els.todayTodoList.querySelectorAll("[data-open-todo]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.todoKind === "task") {
        switchView("schedule");
        editTask(button.dataset.openTodo);
      } else {
        switchView("issues");
        editIssue(button.dataset.openTodo);
      }
    });
  });
}

function renderDeviationPanel(tasks) {
  if (!els.deviationList) return;
  const deviations = tasks
    .map((task) => ({ task, status: getTaskStatus(task), days: daysBetween(task.planned) }))
    .filter((item) => item.status.className === "delay" || item.status.className === "risk" || Number(item.task.progress || 0) < expectedProgress(item.task))
    .sort((a, b) => a.days - b.days)
    .slice(0, 6);
  els.deviationSummary.textContent = `${deviations.length} 项需关注`;
  els.deviationList.innerHTML = deviations.length
    ? deviations.map(({ task, status }) => `
        <article class="ops-item ${status.className}">
          <strong>${escapeHtml(task.building || "-")}｜${escapeHtml(task.floor || "-")}｜${escapeHtml(task.system || task.name)}</strong>
          <small>开始 ${escapeHtml(task.plannedStart || "-")}｜完成 ${escapeHtml(task.planned || "-")}｜当前 ${Number(task.progress || 0)}%｜建议 ${expectedProgress(task)}%</small>
        </article>
      `).join("")
    : `<article class="ops-item"><strong>暂无明显偏差</strong><small>当前计划与实际推进基本匹配</small></article>`;
}

function expectedProgress(task) {
  if (task.plannedProgress !== undefined && task.plannedProgress !== "") return Number(task.plannedProgress || 0);
  const finishDelta = daysBetween(task.planned);
  const startDelta = daysBetween(task.plannedStart);
  if (task.planned && finishDelta < 0) return 100;
  if (task.planned && finishDelta <= 7) return 80;
  if (task.plannedStart && startDelta < 0) return 20;
  return 40;
}

function renderDependencyPanel(tasks) {
  if (!els.dependencyList) return;
  const risks = buildDependencyRisks(tasks).slice(0, 6);
  els.dependencyList.innerHTML = risks.length
    ? risks.map((risk) => `
        <article class="ops-item ${risk.level}">
          <strong>${escapeHtml(risk.location)}｜${escapeHtml(risk.blocker)}</strong>
          <small>${escapeHtml(risk.message)}</small>
        </article>
      `).join("")
    : `<article class="ops-item"><strong>暂无穿插阻塞</strong><small>当前前置施工内容未发现明显影响项</small></article>`;
}

function buildDependencyRisks(tasks) {
  const rules = [
    { before: "桥架", after: "电缆", message: "桥架未完成会影响电缆敷设" },
    { before: "风管", after: "末端", message: "风管未完成会影响末端设备安装" },
    { before: "导管内穿线", after: "末端", message: "穿线未完成会影响末端设备安装" },
    { before: "喷淋", after: "防排烟", message: "消防水系统滞后需关注防排烟穿插" }
  ];
  const risks = [];
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = `${task.building || ""}|${task.floor || ""}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  grouped.forEach((floorTasks) => {
    rules.forEach((rule) => {
      const before = floorTasks.find((task) => `${task.system || task.name}`.includes(rule.before));
      const after = floorTasks.find((task) => `${task.system || task.name}`.includes(rule.after));
      if (before && Number(before.progress || 0) < 80 && (!after || Number(after.progress || 0) > 0)) {
        risks.push({
          location: `${before.building || "未填部位"}｜${before.floor || "未填楼层"}`,
          blocker: before.system || before.name,
          message: rule.message,
          level: getTaskStatus(before).className === "delay" ? "delay" : "risk"
        });
      }
    });
  });
  return risks;
}

function renderUnitRanking(tasks) {
  if (!els.unitRanking) return;
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = task.owner || task.discipline || "未填单位";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  const ranking = Array.from(grouped.entries())
    .map(([unit, unitTasks]) => ({
      unit,
      progress: averageProgress(unitTasks),
      delayed: unitTasks.filter((task) => getTaskStatus(task).className === "delay").length,
      open: unitTasks.filter((task) => getTaskStatus(task).className !== "done").length
    }))
    .sort((a, b) => b.delayed - a.delayed || a.progress - b.progress)
    .slice(0, 6);
  els.unitRanking.innerHTML = ranking.length
    ? ranking.map((item, index) => `
        <article class="ops-item ${item.delayed ? "delay" : "normal"}">
          <strong>${index + 1}. ${escapeHtml(item.unit)}｜${item.progress}%</strong>
          <small>滞后 ${item.delayed} 项｜未完成 ${item.open} 项</small>
        </article>
      `).join("")
    : `<article class="ops-item"><strong>暂无单位数据</strong><small>录入节点后自动生成排名</small></article>`;
}

function renderCommandScreen(tasks, issues, stats) {
  const project = state.projects.find((item) => item.id === state.selectedProjectId);
  const sortedRiskTasks = tasks
    .filter((task) => getTaskStatus(task).className !== "done")
    .sort((a, b) => {
      const statusWeight = { delay: 0, risk: 1, normal: 2 };
      return statusWeight[getTaskStatus(a).className] - statusWeight[getTaskStatus(b).className]
        || a.planned.localeCompare(b.planned);
    });
  const criticalTask = sortedRiskTasks[0];
  const urgentIssue = issues.find((issue) => normalizeIssueStatus(issue.status) !== "已闭合" && issue.severity === "紧急");

  els.screenProjectName.textContent = project ? `${project.name}｜中控大屏` : "项目中控大屏";
  els.screenProgress.textContent = `${stats.overall}%`;
  els.screenCriticalTask.textContent = criticalTask ? criticalTask.name : "暂无风险节点";
  els.screenCriticalMeta.textContent = criticalTask
    ? `${criticalTask.owner}｜计划 ${criticalTask.planned}｜完成率 ${criticalTask.progress}%`
    : "当前任务推进平稳";

  if (stats.delayed > 0) {
    els.missionStatus.textContent = "偏差警戒";
    els.screenCommand.textContent = "启动纠偏";
    els.screenCommandMeta.textContent = urgentIssue
      ? urgentIssue.action
      : "要求责任单位提交赶工计划，监理复核资源投入。";
  } else if (stats.dueSoon > 0 || stats.openIssues > 0) {
    els.missionStatus.textContent = "重点盯防";
    els.screenCommand.textContent = "锁定临期";
    els.screenCommandMeta.textContent = "跟踪 7 天内到期节点，形成整改闭环事项。";
  } else {
    els.missionStatus.textContent = "航线稳定";
    els.screenCommand.textContent = "保持巡检";
    els.screenCommandMeta.textContent = "继续记录现场进展，跟踪关键节点完成情况。";
  }
  renderCommandScope();
}

function renderCommandScope() {
  const scope = currentProjectScope();
  const buildingCount = scope.buildings.length;
  const unitCount = scope.units.length;
  const systemCount = scope.units.reduce((sum, unit) => sum + unit.systems.length, 0);
  els.screenScope.textContent = `${buildingCount} 栋楼｜${scope.basement || "无地下室"}`;
  els.screenScopeMeta.textContent = `${unitCount} 个单位｜${systemCount} 项施工内容已纳入监控范围`;
}

function generateWeeklyReport() {
  const projectName = currentProjectName();
  const tasks = currentProjectItems("tasks");
  const issues = currentProjectItems("issues");
  const done = tasks.filter((task) => getTaskStatus(task).className === "done");
  const delayed = tasks.filter((task) => getTaskStatus(task).className === "delay");
  const dueSoon = tasks.filter((task) => getTaskStatus(task).className === "risk");
  const openIssues = issues.filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合");
  const overall = tasks.length ? averageProgress(tasks) : 0;
  const dependencyRisks = buildDependencyRisks(tasks);
  const issueCloseRate = issues.length ? Math.round(((issues.length - openIssues.length) / issues.length) * 100) : 100;
  const nextWeek = tasks
    .filter((task) => getTaskStatus(task).className !== "done")
    .sort((a, b) => String(a.planned || "").localeCompare(String(b.planned || "")))
    .slice(0, 8);

  if (els.weeklySummary) {
    els.weeklySummary.textContent = `${done.length} 完成｜${delayed.length} 滞后｜${openIssues.length} 整改`;
  }

  return [
    `监理周报｜${projectName}`,
    `统计日期：${localDateText(today)}`,
    "",
    `一、本周总体进度：综合完成率 ${overall}%，已完成节点 ${done.length} 项，临期节点 ${dueSoon.length} 项，滞后节点 ${delayed.length} 项。`,
    `整改闭合率：${issueCloseRate}%，未闭合整改 ${openIssues.length} 项。`,
    "",
    "二、本周完成情况：",
    ...(done.slice(0, 8).map((task) => `- ${task.building || "-"} ${task.floor || "-"} ${task.system || task.name}，责任单位：${task.owner || "-"}`) || ["- 暂无完成项"]),
    "",
    "三、滞后与风险：",
    ...(delayed.slice(0, 8).map((task) => `- ${task.building || "-"} ${task.floor || "-"} ${task.system || task.name}，计划 ${task.planned}，完成率 ${task.progress}%`) || ["- 暂无滞后项"]),
    "",
    "四、穿插影响：",
    ...(dependencyRisks.slice(0, 6).map((risk) => `- ${risk.location}：${risk.message}`) || ["- 暂未发现关键穿插阻塞"]),
    "",
    "五、整改闭环：",
    ...(openIssues.slice(0, 6).map((issue) => `- ${issue.owner}：${issue.title}，状态 ${normalizeIssueStatus(issue.status)}，要求 ${issue.deadline || "-"} 前闭合。${issue.delayReason ? `延期原因：${issue.delayReason}。` : ""}`) || ["- 当前无未闭合整改项"]),
    "",
    "六、监理要求：",
    ...(openIssues.slice(0, 6).map((issue) => `- ${issue.owner}：${issue.action}`) || ["- 继续保持巡检和节点同步"]),
    "",
    "七、下周计划：",
    ...(nextWeek.map((task) => `- ${task.building || "-"} ${task.floor || "-"} ${task.system || task.name}，计划 ${task.planned}，责任单位：${task.owner || "-"}`) || ["- 结合现场进展滚动更新下周计划。"]),
    "",
    "八、监理建议：优先复核滞后节点赶工资源、临期节点完成情况和整改闭合状态。"
  ].join("\n");
}

function renderAnalyticsPanel(tasks, issues) {
  if (!els.analyticsGrid) return;
  const dimensions = [
    { title: "楼栋进度", rows: summarizeTasks(tasks, (task) => resolveBuildingName(task.building || task.name) || "未填楼栋") },
    { title: "责任单位", rows: summarizeTasks(tasks, (task) => task.owner || "未填单位") },
    { title: "专业分部", rows: summarizeTasks(tasks, (task) => task.discipline || "未填专业") },
    { title: "计划开始月份", rows: summarizeTasks(tasks, (task) => String(task.plannedStart || "未排期").slice(0, 7)) },
    { title: "计划完成月份", rows: summarizeTasks(tasks, (task) => String(task.planned || "未排期").slice(0, 7)) }
  ];
  const openIssueCount = issues.filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合").length;
  if (els.analyticsSummary) {
    els.analyticsSummary.textContent = `${tasks.length} 个节点｜${openIssueCount} 个未闭合整改`;
  }
  els.analyticsGrid.innerHTML = dimensions.map((dimension) => `
    <article class="analytics-card">
      <h3>${escapeHtml(dimension.title)}</h3>
      ${dimension.rows.length ? dimension.rows.slice(0, 6).map((row) => `
        <div class="analytics-row">
          <span>${escapeHtml(row.label)}</span>
          <strong>${row.progress}%</strong>
          <i><b style="width:${row.progress}%"></b></i>
          <small>${row.count} 项｜滞后 ${row.delayed}｜临期 ${row.risk}</small>
        </div>
      `).join("") : `<div class="analytics-row empty"><span>暂无数据</span><small>录入节点后生成统计。</small></div>`}
    </article>
  `).join("");
}

function summarizeTasks(tasks, keyFn) {
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = keyFn(task);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  return Array.from(grouped.entries())
    .map(([label, items]) => ({
      label,
      count: items.length,
      progress: averageProgress(items),
      delayed: items.filter((task) => getTaskStatus(task).className === "delay").length,
      risk: items.filter((task) => getTaskStatus(task).className === "risk").length
    }))
    .sort((a, b) => b.delayed - a.delayed || a.progress - b.progress || b.count - a.count);
}

let carouselTimer = null;

function stopDashboardCarousel() {
  clearInterval(carouselTimer);
  carouselTimer = null;
  document.body.classList.remove("carousel-mode");
  if (els.carouselBtn) els.carouselBtn.textContent = "中控轮播";
}

function startDashboardCarousel() {
  clearInterval(carouselTimer);
  const views = ["dashboard", "scope", "schedule", "issues"];
  let index = 0;
  carouselTimer = setInterval(() => {
    if (!document.body.classList.contains("carousel-mode")) {
      stopDashboardCarousel();
      return;
    }
    index = (index + 1) % views.length;
    switchView(views[index]);
  }, 6000);
}


