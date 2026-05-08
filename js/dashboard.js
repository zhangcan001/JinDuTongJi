function switchView(view) {
  const titles = {
    dashboard: "总览",
    scope: "项目部位",
    schedule: "计划节点",
    issues: "滞后与整改"
  };
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("active", item.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.querySelector(`#${view}View`).classList.add("active");
  els.pageTitle.textContent = titles[view];

  if (view === "scope") {
    requestAnimationFrame(() => {
      renderProjectScope();
      if (modelState?.isCanvasModel) scheduleCanvasModelDraw();
    });
  }

  if (view === "dashboard") {
    requestAnimationFrame(() => drawChart(currentProjectItems("tasks")));
  }
}

function renderProjectFilter() {
  els.projectFilter.innerHTML = state.projects
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
    : scope.units.flatMap((unit) => unit.systems);

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

function renderOperationsDashboard(tasks) {
  renderDeviationPanel(tasks);
  renderDependencyPanel(tasks);
  renderUnitRanking(tasks);
  if (els.weeklyReportOutput && !els.weeklyReportOutput.value) {
    els.weeklyReportOutput.value = generateWeeklyReport();
  }
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
          <small>计划 ${escapeHtml(task.planned)}｜实际 ${escapeHtml(task.actual || "未完成")}｜当前 ${Number(task.progress || 0)}%｜建议 ${expectedProgress(task)}%</small>
        </article>
      `).join("")
    : `<article class="ops-item"><strong>暂无明显偏差</strong><small>当前计划与实际推进基本匹配</small></article>`;
}

function expectedProgress(task) {
  if (task.plannedProgress !== undefined && task.plannedProgress !== "") return Number(task.plannedProgress || 0);
  if (task.actual) return 100;
  const delta = daysBetween(task.planned);
  if (delta < 0) return 100;
  if (delta <= 7) return 80;
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

  if (els.weeklySummary) {
    els.weeklySummary.textContent = `${done.length} 完成｜${delayed.length} 滞后｜${openIssues.length} 整改`;
  }

  return [
    `监理周报｜${projectName}`,
    `统计日期：${localDateText(today)}`,
    "",
    `一、本周总体进度：综合完成率 ${overall}%，已完成节点 ${done.length} 项，临期节点 ${dueSoon.length} 项，滞后节点 ${delayed.length} 项。`,
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
    "五、监理要求：",
    ...(openIssues.slice(0, 6).map((issue) => `- ${issue.owner}：${issue.action}`) || ["- 继续保持巡检和节点同步"]),
    "",
    "六、下周重点：优先复核滞后节点赶工资源、临期节点完成情况和整改闭合状态。"
  ].join("\n");
}

function renderAnalyticsPanel(tasks, issues) {
  if (!els.analyticsGrid) return;
  const dimensions = [
    { title: "楼栋进度", rows: summarizeTasks(tasks, (task) => resolveBuildingName(task.building || task.name) || "未填楼栋") },
    { title: "责任单位", rows: summarizeTasks(tasks, (task) => task.owner || "未填单位") },
    { title: "专业分部", rows: summarizeTasks(tasks, (task) => task.discipline || "未填专业") },
    { title: "月份趋势", rows: summarizeTasks(tasks, (task) => String(task.planned || "未排期").slice(0, 7)) }
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


