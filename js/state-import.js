function currentRole() {
  return state.currentRole || "admin";
}

function canEditData() {
  return currentRole() !== "viewer";
}

function roleLabel(role = currentRole()) {
  return {
    admin: "管理员",
    pm: "项目经理",
    contractor: "施工单位",
    supervisor: "监理",
    viewer: "只读查看"
  }[role] || "管理员";
}

function ensureCanEdit(action = "执行此操作") {
  if (canEditData()) return true;
  notifyUser(`当前为只读查看角色，不能${action}。`);
  return false;
}

function importScopeForRow(normalized) {
  const projectName = normalized.projectName || currentProjectName();
  const project = state.projects.find((item) => item.name === projectName);
  return project ? state.projectScopes?.[project.id] || { basement: "", buildings: [], units: [] } : { basement: "", buildings: [], units: [] };
}

function currentProjectItems(key) {
  const cacheKey = `${key}:${state.selectedProjectId}`;
  if (!stateCache.projectItems.has(cacheKey)) {
    stateCache.projectItems.set(cacheKey, state[key].filter((item) => item.projectId === state.selectedProjectId));
  }
  const items = stateCache.projectItems.get(cacheKey);
  if (currentRole() === "contractor" && state.selectedContractorUnit && state.selectedContractorUnit !== "all") {
    return items.filter((item) => `${item.owner || ""}${item.discipline || ""}`.includes(state.selectedContractorUnit.replace("单位", "")));
  }
  return items;
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
  nextState.auditLogs = nextState.auditLogs || [];
  nextState.currentRole = nextState.currentRole || "admin";
  nextState.selectedContractorUnit = nextState.selectedContractorUnit || "all";
  nextState.progressWeights = nextState.progressWeights || {};
  nextState.importVersions = nextState.importVersions || [];
  nextState.pendingImports = nextState.pendingImports || [];
  nextState.archivedProjectIds = nextState.archivedProjectIds || [];
  nextState.uiPreferences = {
    activeView: "dashboard",
    officeMode: false,
    taskFilters: {},
    modelFilters: {},
    lastBackupAt: "",
    dashboardCards: ["today", "ops", "weekly", "chart", "analytics"],
    ...(nextState.uiPreferences || {})
  };
  if ((nextState.uiPreferences.dashboardCards || []).some((item) => ["deviation", "dependency", "ranking"].includes(item))) {
    nextState.uiPreferences.dashboardCards = ["today", "ops", "weekly", "chart", "analytics"];
  }
  nextState.tasks = mergeFloorDemoTasks(nextState);
  nextState.tasks = (nextState.tasks || []).map((task) => ({
    plannedProgress: expectedProgress({ planned: task.planned, actual: task.actual }),
    reviewStatus: "approved",
    ...task
  }));
  nextState.issues = (nextState.issues || []).map((issue) => ({
    category: classifyDelayReason(issue.action || issue.title || ""),
    taskId: "",
    reviewNote: "",
    closedAt: "",
    rectifyCount: 0,
    reviewResult: "",
    delayReason: "",
    responsiblePerson: "",
    ...issue,
    status: normalizeIssueStatus(issue.status)
  }));
  nextState.diaries = nextState.diaries || [];
  nextState.meetings = nextState.meetings || [];
  invalidateStateCache();
  return nextState;
}

function savePlanBaseline() {
  if (!ensureCanEdit("保存计划基线")) return;
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
  recordAudit("保存计划基线", `${baseline.taskCount} 项节点，综合完成率 ${baseline.overall}%`);
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

function buildIssueExportRows() {
  return currentProjectItems("issues").map((issue) => {
    const linkedTask = issue.taskId ? state.tasks.find((task) => task.id === issue.taskId) : null;
    return {
      项目: currentProjectName(),
      问题标题: issue.title || "",
      责任单位: issue.owner || "",
      要求完成: issue.deadline || "",
      严重程度: issue.severity || "",
      闭环状态: normalizeIssueStatus(issue.status),
      关联节点: linkedTask ? `${linkedTask.building || ""}${linkedTask.floor || ""}${linkedTask.system || linkedTask.name || ""}` : "",
      问题类别: issue.category || classifyDelayReason(issue.action || issue.title || ""),
      延期原因: issue.delayReason || "",
      整改次数: Number(issue.rectifyCount || 0),
      复验结果: issue.reviewResult || "",
      监理要求: issue.action || "",
      复验意见: issue.reviewNote || "",
      闭合日期: issue.closedAt || ""
    };
  });
}

function exportWeeklyReportFile() {
  const report = els.weeklyReportOutput?.value || generateWeeklyReport();
  const html = `<!doctype html><html><head><meta charset="UTF-8"><title>监理周报</title><style>body{font-family:"Microsoft YaHei",Arial,sans-serif;line-height:1.8;color:#111827;padding:40px;}h1{text-align:center;font-size:24px;}pre{white-space:pre-wrap;font:inherit;} .meta{text-align:right;color:#6b7280;}</style></head><body><h1>${escapeHtml(currentProjectName())}监理周报</h1><div class="meta">${localDateText(today)}</div><pre>${escapeHtml(report)}</pre></body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `监理周报-${currentProjectName()}-${localDateText(today)}.html`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("正式周报已导出");
}

function exportRectificationNotice() {
  const issues = currentProjectItems("issues").filter((issue) => normalizeIssueStatus(issue.status) !== "已闭合");
  const lines = [
    `${currentProjectName()}整改通知单`,
    `签发日期：${localDateText(today)}`,
    "",
    "请相关责任单位对以下问题限期整改，并在整改完成后提交复验申请：",
    "",
    ...(issues.length ? issues.map((issue, index) => [
      `${index + 1}. ${issue.title}`,
      `责任单位：${issue.owner || "-"}`,
      `要求完成：${issue.deadline || "-"}`,
      `严重程度：${issue.severity || "-"}`,
      `监理要求：${issue.action || "-"}`,
      issue.delayReason ? `延期原因：${issue.delayReason}` : "",
      ""
    ].filter(Boolean).join("\n")) : ["当前无未闭合整改项。"]),
    "监理单位意见：请施工单位明确责任人、资源投入和完成时间，逾期未完成的纳入例会重点督办。"
  ].join("\n");
  const blob = new Blob([lines], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `整改通知单-${currentProjectName()}-${localDateText(today)}.txt`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("整改通知单已导出");
}

function printCurrentReport() {
  if (els.weeklyReportOutput && !els.weeklyReportOutput.value) {
    els.weeklyReportOutput.value = generateWeeklyReport();
  }
  window.print();
}

function exportLatestImportDiff() {
  const latest = (state.importHistory || []).find((item) => item.projectId === state.selectedProjectId);
  exportCsv("最近导入差异.csv", latest?.details?.length ? latest.details : [{ 提示: "暂无可导出的导入差异" }]);
}

function createIssuesFromDelayedTasks() {
  if (!ensureCanEdit("生成整改提醒")) return;
  const existingTaskIds = new Set(currentProjectItems("issues").map((issue) => issue.taskId).filter(Boolean));
  const delayedTasks = currentProjectItems("tasks").filter((task) => getTaskStatus(task).className === "delay" && !existingTaskIds.has(task.id));
  if (!delayedTasks.length) {
    notifyUser("当前没有需要自动生成整改提醒的新增滞后节点。");
    return;
  }
  createRestorePoint("自动生成整改提醒");
  delayedTasks.slice(0, 50).forEach((task) => {
    state.issues.push({
      id: createId(),
      projectId: state.selectedProjectId,
      title: `${task.building || ""}${task.floor || ""}${task.system || task.name}进度滞后`,
      owner: task.owner || task.discipline || "未填责任单位",
      deadline: localDateText(today),
      severity: "重要",
      status: "未整改",
      taskId: task.id,
      closedAt: "",
      action: `请${task.owner || "责任单位"}针对 ${task.system || task.name} 提交赶工措施并更新实际完成情况。`,
      reviewNote: "",
      category: classifyDelayReason(task.note || task.name || "")
    });
  });
  recordAudit("自动生成整改提醒", `生成 ${Math.min(50, delayedTasks.length)} 项`);
  saveState();
  render();
  showToast(`已生成 ${Math.min(50, delayedTasks.length)} 条整改提醒`);
}

function renderImportVersionPanel() {
  if (!els.importVersionPanel) return;
  const versions = (state.importVersions || []).filter((item) => item.projectId === state.selectedProjectId).slice(0, 6);
  els.importVersionPanel.innerHTML = `
    <strong>导入版本</strong>
    <div>
      ${versions.length ? versions.map((item) => `
        <article>
          <div>
            <strong>${escapeHtml(item.fileName)}</strong>
            <small>${new Date(item.time).toLocaleString()}｜新增 ${item.created}｜更新 ${item.updated}｜跳过 ${item.skipped || 0}</small>
          </div>
          <button type="button" data-restore-import-version="${item.id}">恢复</button>
        </article>
      `).join("") : `<article><div><strong>暂无导入版本</strong><small>每次确认导入后会保存最近 10 次版本。</small></div></article>`}
    </div>
  `;
  els.importVersionPanel.querySelectorAll("[data-restore-import-version]").forEach((button) => {
    button.addEventListener("click", () => restoreImportVersion(button.dataset.restoreImportVersion));
  });
}

async function restoreImportVersion(versionId) {
  if (!ensureCanEdit("恢复导入版本")) return;
  const version = (state.importVersions || []).find((item) => item.id === versionId);
  if (!version) return;
  if (!(await confirmAction(`确定恢复到导入版本“${version.fileName}”吗？`, { title: "恢复导入版本", okText: "恢复" }))) return;
  const keepVersions = state.importVersions || [];
  const keepRestorePoints = state.restorePoints || [];
  state = migrateState(cloneData(version.state));
  state.importVersions = keepVersions;
  state.restorePoints = keepRestorePoints;
  recordAudit("恢复导入版本", version.fileName);
  saveState();
  render();
}

function renderWeightPanel() {
  if (!els.weightPanel) return;
  const weights = state.progressWeights || {};
  const units = currentProjectScope().units;
  els.weightPanel.innerHTML = `
    <strong>进度权重</strong>
    <p>为空时按 1 计算；可按专业单位调整总进度占比。</p>
    <div class="weight-grid">
      ${units.length ? units.map((unit) => `
        <label>
          ${escapeHtml(unit.name)}
          <input type="number" min="0" max="100" step="0.5" value="${Number(weights[unit.name] ?? 1)}" data-weight-unit="${escapeHtml(unit.name)}" />
        </label>
      `).join("") : "<span>暂无专业单位</span>"}
    </div>
  `;
  els.weightPanel.querySelectorAll("[data-weight-unit]").forEach((input) => {
    input.addEventListener("change", () => {
      if (!ensureCanEdit("调整进度权重")) return;
      state.progressWeights[input.dataset.weightUnit] = Math.max(0, Number(input.value || 1));
      recordAudit("调整进度权重", `${input.dataset.weightUnit}: ${input.value}`);
      saveState();
      render();
    });
  });
}

function renderDataHealthPanel() {
  if (!els.dataHealthPanel) return;
  const report = buildDataHealthReport();
  const pending = (state.pendingImports || []).filter((item) => item.projectId === state.selectedProjectId);
  const backupText = state.uiPreferences?.lastBackupAt
    ? `上次备份 ${new Date(state.uiPreferences.lastBackupAt).toLocaleString()}`
    : "尚未导出过完整备份";
  els.dataHealthPanel.innerHTML = `
    <strong>数据体检</strong>
    <p>${report.summary}｜待复核 ${pending.length} 条｜${backupText}</p>
    <div class="health-grid">
      ${report.sections.map((section) => `
        <article class="${section.items.length ? "warn" : "ok"}">
          <strong>${escapeHtml(section.title)}<span>${section.items.length}</span></strong>
          <ul>
            ${section.items.length
              ? section.items.slice(0, 8).map((item) => `<li>${escapeHtml(item)}</li>`).join("")
              : `<li>未发现异常</li>`}
          </ul>
        </article>
      `).join("")}
    </div>
  `;
}

function applyDataFixSuggestions() {
  if (!ensureCanEdit("自动修复数据")) return;
  const tasks = currentProjectItems("tasks");
  if (!tasks.length) {
    showToast("当前没有可修复的节点", "warn");
    return;
  }
  createRestorePoint("自动修复数据建议");
  let fixed = 0;
  tasks.forEach((task) => {
    if (Number(task.progress || 0) >= 100 && !task.actual) {
      task.actual = task.planned || localDateText(today);
      fixed += 1;
    }
    if (task.actual && Number(task.progress || 0) < 100) {
      task.progress = 100;
      fixed += 1;
    }
    if (!task.floor && task.building && !String(task.building).includes("地下")) {
      task.floor = "1层";
      fixed += 1;
    }
    if (!task.owner && task.discipline) {
      task.owner = task.discipline;
      fixed += 1;
    }
  });
  recordAudit("自动修复数据建议", `修复 ${fixed} 处`);
  saveState();
  render();
  showToast(fixed ? `已自动修复 ${fixed} 处数据` : "未发现可自动修复项", fixed ? "ok" : "warn");
}

function buildDataHealthReport() {
  const tasks = currentProjectItems("tasks");
  const scope = currentProjectScope();
  const seen = new Map();
  const duplicates = [];
  const missingPlan = [];
  const missingLocation = [];
  const floorOverflow = [];
  const progressConflicts = [];

  tasks.forEach((task) => {
    const key = taskKey(task);
    if (seen.has(key)) duplicates.push(`${task.building || "-"}｜${task.floor || "-"}｜${task.system || task.name}`);
    else seen.set(key, task);
    if (!task.planned) missingPlan.push(task.name || task.system || "-");
    if (!task.building || !task.floor) missingLocation.push(task.name || task.system || "-");
    const building = scope.buildings.find((item) => String(task.building || "").includes(item.name));
    const floor = parseFloorNumber(task.floor);
    if (building && floor && floor > Number(building.floors || 1)) {
      floorOverflow.push(`${building.name}｜${task.floor}｜${task.system || task.name}`);
    }
    if ((task.actual || Number(task.progress || 0) >= 100) && Number(task.progress || 0) < 100) {
      progressConflicts.push(`${task.building || "-"}｜${task.floor || "-"}｜${task.system || task.name}`);
    }
  });

  const sections = [
    { title: "重复节点", items: duplicates },
    { title: "缺少计划时间", items: missingPlan },
    { title: "缺少楼栋/楼层", items: missingLocation },
    { title: "楼层超范围", items: floorOverflow },
    { title: "进度状态冲突", items: progressConflicts }
  ];
  const issueCount = sections.reduce((sum, section) => sum + section.items.length, 0);
  return {
    summary: issueCount ? `发现 ${issueCount} 条数据风险，建议导入前先修正。` : `当前项目 ${tasks.length} 个节点未发现明显数据异常。`,
    sections
  };
}

