function renderTasks() {
  const tasks = currentProjectItems("tasks");
  syncTaskFilterControls(tasks);
  const filteredTasks = filterTasks(tasks);
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / taskFilters.pageSize));
  taskFilters.page = Math.min(Math.max(1, taskFilters.page), totalPages);
  const pageStart = (taskFilters.page - 1) * taskFilters.pageSize;
  const pageTasks = filteredTasks.slice(pageStart, pageStart + taskFilters.pageSize);
  els.taskCount.textContent = filteredTasks.length === tasks.length ? `${tasks.length} 项` : `${filteredTasks.length} / ${tasks.length} 项`;
  els.taskTable.innerHTML = pageTasks.length
    ? pageTasks
        .map((task) => {
          const status = getTaskStatus(task);
          return `
            <tr>
              <td><strong>${escapeHtml(task.name)}</strong><br><small>${escapeHtml(task.note || "")}</small></td>
              <td>${escapeHtml(task.building || "-")}<br><small>${escapeHtml(task.floor || "未填楼层")}｜${escapeHtml(task.system || "未挂接施工内容")}</small></td>
              <td>${escapeHtml(task.discipline)}</td>
              <td>${escapeHtml(task.owner)}</td>
              <td>${task.planned}</td>
              <td>${task.actual || "-"}</td>
              <td>${task.progress}%<br><small>计划 ${expectedProgress(task)}%｜偏差 ${Number(task.progress || 0) - expectedProgress(task)}%</small></td>
              <td><span class="status ${status.className}">${status.label}</span></td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" title="编辑节点" data-edit-task="${task.id}">✎</button>
                  <button class="icon-btn" title="删除节点" data-delete-task="${task.id}">×</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="9">当前筛选条件下暂无节点。</td></tr>`;

  renderTaskPagination(filteredTasks.length, totalPages);

  els.taskTable.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => editTask(button.dataset.editTask));
  });

  els.taskTable.querySelectorAll("[data-delete-task]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("确定删除这个进度节点吗？")) return;
      if (!ensureCanEdit("删除进度节点")) return;
      createRestorePoint("删除进度节点");
      const removed = state.tasks.find((task) => task.id === button.dataset.deleteTask);
      state.tasks = state.tasks.filter((task) => task.id !== button.dataset.deleteTask);
      recordAudit("删除进度节点", removed?.name || "");
      saveState();
      render();
    });
  });
}

function renderTaskPagination(total, totalPages) {
  if (!els.taskPagination) return;
  const start = total ? (taskFilters.page - 1) * taskFilters.pageSize + 1 : 0;
  const end = Math.min(total, taskFilters.page * taskFilters.pageSize);
  els.taskPagination.innerHTML = `
    <span>${start}-${end} / ${total} 项</span>
    <div>
      <button type="button" data-task-page="prev" ${taskFilters.page <= 1 ? "disabled" : ""}>上一页</button>
      <strong>${taskFilters.page} / ${totalPages}</strong>
      <button type="button" data-task-page="next" ${taskFilters.page >= totalPages ? "disabled" : ""}>下一页</button>
    </div>
  `;
  els.taskPagination.querySelectorAll("[data-task-page]").forEach((button) => {
    button.addEventListener("click", () => {
      taskFilters.page += button.dataset.taskPage === "next" ? 1 : -1;
      renderTasks();
    });
  });
}

function editTask(taskId) {
  if (!ensureCanEdit("编辑进度节点")) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !els.taskForm) return;
  switchView("schedule");
  const form = els.taskForm;
  Object.entries({
    id: task.id,
    name: task.name || "",
    discipline: task.discipline || "土建",
    building: task.building || "",
    floor: task.floor || "",
    system: task.system || "",
    owner: task.owner || "",
    planned: task.planned || "",
    actual: task.actual || "",
    progress: Number(task.progress || 0),
    note: task.note || ""
  }).forEach(([name, value]) => {
    if (form.elements[name]) form.elements[name].value = value;
  });
  renderTaskScopeFields();
  if (form.elements.building && task.building) form.elements.building.value = task.building;
  if (form.elements.system && task.system) form.elements.system.value = task.system;
  if (els.taskSubmitBtn) els.taskSubmitBtn.textContent = "保存节点";
  if (els.cancelTaskEditBtn) els.cancelTaskEditBtn.classList.add("show");
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetTaskForm() {
  if (!els.taskForm) return;
  els.taskForm.reset();
  els.taskForm.elements.id.value = "";
  if (els.taskSubmitBtn) els.taskSubmitBtn.textContent = "添加节点";
  if (els.cancelTaskEditBtn) els.cancelTaskEditBtn.classList.remove("show");
  renderTaskScopeFields();
}

function saveTaskFromForm(event) {
  event.preventDefault();
  if (!ensureCanEdit("保存进度节点")) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const validation = validateTaskPayload(data);
  if (validation.length) {
    window.alert(validation.join("\n"));
    return;
  }
  const payload = {
    projectId: state.selectedProjectId,
    name: data.name,
    discipline: data.discipline,
    building: data.building,
    floor: data.floor,
    system: data.system,
    owner: data.owner,
    planned: data.planned,
    actual: data.actual,
    progress: Number(data.progress || 0),
    note: data.note
  };
  const existing = data.id ? state.tasks.find((task) => task.id === data.id) : null;
  if (existing) {
    Object.assign(existing, payload);
    recordAudit("编辑进度节点", payload.name);
  } else {
    state.tasks.push({ id: createId(), ...payload });
    recordAudit("新增进度节点", payload.name);
  }
  resetTaskForm();
  saveState();
  render();
}

function validateTaskPayload(data) {
  const problems = [];
  if (!String(data.name || "").trim()) problems.push("节点名称不能为空。");
  if (!String(data.owner || "").trim()) problems.push("责任单位不能为空。");
  if (!data.planned) problems.push("计划完成日期不能为空。");
  const progress = Number(data.progress || 0);
  if (Number.isNaN(progress) || progress < 0 || progress > 100) problems.push("完成率必须在 0 到 100 之间。");
  if (progress >= 100 && !data.actual) problems.push("完成率为 100% 时建议填写实际完成日期。");
  const duplicate = state.tasks.find((task) => task.projectId === state.selectedProjectId
    && task.id !== data.id
    && taskKey(task) === taskKey({ projectId: state.selectedProjectId, building: data.building, floor: data.floor, system: data.system, owner: data.owner, name: data.name }));
  if (duplicate) problems.push("相同楼栋、楼层、施工内容和节点名称已存在。");
  return problems;
}

function updateTaskFiltersFromControls() {
  taskFilters.query = els.taskSearchInput?.value.trim() || "";
  taskFilters.status = els.taskStatusFilter?.value || "all";
  taskFilters.building = els.taskBuildingFilter?.value || "all";
  taskFilters.owner = els.taskOwnerFilter?.value || "all";
  taskFilters.sort = els.taskSortSelect?.value || "plannedAsc";
  taskFilters.page = 1;
  renderTasks();
}

function syncTaskFilterControls(tasks) {
  if (els.taskSearchInput && els.taskSearchInput.value !== taskFilters.query) {
    els.taskSearchInput.value = taskFilters.query;
  }
  if (els.taskStatusFilter) els.taskStatusFilter.value = taskFilters.status;
  syncFilterSelect(
    els.taskBuildingFilter,
    [["all", "全部楼栋"], ...uniqueSorted(tasks.map((task) => resolveBuildingName(task.building || task.name)).filter(Boolean)).map((item) => [item, item])],
    taskFilters.building
  );
  syncFilterSelect(
    els.taskOwnerFilter,
    [["all", "全部单位"], ...uniqueSorted(tasks.map((task) => task.owner || task.discipline || "未填单位")).map((item) => [item, item])],
    taskFilters.owner
  );
  if (els.taskSortSelect) els.taskSortSelect.value = taskFilters.sort;
}

function syncFilterSelect(select, options, selectedValue) {
  if (!select) return;
  select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
  select.value = options.some(([value]) => value === selectedValue) ? selectedValue : "all";
  if (select.value !== selectedValue) {
    if (select === els.taskBuildingFilter) taskFilters.building = select.value;
    if (select === els.taskOwnerFilter) taskFilters.owner = select.value;
  }
}

function uniqueSorted(values) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function filterTasks(tasks) {
  const query = taskFilters.query.toLowerCase();
  return tasks
    .filter((task) => {
      const status = getTaskStatus(task).className;
      const building = resolveBuildingName(task.building || task.name);
      const haystack = [
        task.name,
        task.note,
        task.building,
        task.floor,
        task.system,
        task.discipline,
        task.owner,
        task.planned,
        task.actual
      ].join(" ").toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (taskFilters.status !== "all" && status !== taskFilters.status) return false;
      if (taskFilters.building !== "all" && building !== taskFilters.building) return false;
      if (taskFilters.owner !== "all" && (task.owner || task.discipline || "未填单位") !== taskFilters.owner) return false;
      return true;
    })
    .sort(compareTasksByFilter);
}

function compareTasksByFilter(a, b) {
  if (taskFilters.sort === "plannedDesc") return String(b.planned || "").localeCompare(String(a.planned || ""));
  if (taskFilters.sort === "progressAsc") return Number(a.progress || 0) - Number(b.progress || 0);
  if (taskFilters.sort === "progressDesc") return Number(b.progress || 0) - Number(a.progress || 0);
  return String(a.planned || "").localeCompare(String(b.planned || ""));
}
function renderIssues() {
  const issues = filterIssues(currentProjectItems("issues"));
  renderIssueTaskOptions();
  const columns = ["未整改", "整改中", "待复验", "已闭合"];
  els.issueBoard.innerHTML = columns.map((statusName) => {
    const statusIssues = issues.filter((issue) => normalizeIssueStatus(issue.status) === statusName);
    return `
      <section class="issue-column ${statusClassForIssue(statusName)}">
        <h3>${statusName}<span>${statusIssues.length}</span></h3>
        ${statusIssues.length ? statusIssues.map((issue) => {
            const linkedTask = issue.taskId ? state.tasks.find((task) => task.id === issue.taskId) : null;
            return `
            <article class="issue-card ${statusClassForIssue(issue.status)}">
              <span class="severity ${issue.severity === "紧急" ? "urgent" : issue.severity === "重要" ? "important" : "normal"}">${issue.severity}</span>
              <strong>${escapeHtml(issue.title)}</strong>
              <small>${escapeHtml(issue.owner)}｜${issue.deadline}｜${normalizeIssueStatus(issue.status)}｜${escapeHtml(issue.category || classifyDelayReason(issue.action || issue.title))}</small>
              <p>${escapeHtml(issue.action)}</p>
              <div class="issue-meta">
                ${linkedTask ? `<span>关联：${escapeHtml(linkedTask.building || "-")}｜${escapeHtml(linkedTask.floor || "-")}｜${escapeHtml(linkedTask.system || linkedTask.name)}</span>` : "<span>未关联节点</span>"}
                ${issue.reviewNote ? `<span>复验：${escapeHtml(issue.reviewNote)}</span>` : ""}
                ${issue.closedAt ? `<span>闭合日期：${escapeHtml(issue.closedAt)}</span>` : ""}
              </div>
              <div class="issue-flow">${issueFlowHtml(issue.status)}</div>
              <div class="issue-actions">
                <button data-advance-issue="${issue.id}" type="button">${normalizeIssueStatus(issue.status) === "已闭合" ? "重新打开" : "推进状态"}</button>
                <button data-edit-issue="${issue.id}" type="button">编辑</button>
                <button data-delete-issue="${issue.id}" type="button">删除</button>
              </div>
            </article>
          `;
          }).join("") : `<article class="issue-card empty"><strong>暂无事项</strong><small>${globalSearchQuery ? "当前搜索条件下无匹配整改项" : "该阶段暂无整改项"}</small></article>`}
      </section>
    `;
  }).join("");

  document.querySelectorAll("[data-advance-issue]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!ensureCanEdit("推进整改状态")) return;
      const issue = state.issues.find((item) => item.id === button.dataset.advanceIssue);
      issue.status = nextIssueStatus(issue.status);
      if (normalizeIssueStatus(issue.status) === "已闭合" && !issue.closedAt) issue.closedAt = localDateText(today);
      recordAudit("推进整改状态", `${issue.title} -> ${issue.status}`);
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-edit-issue]").forEach((button) => {
    button.addEventListener("click", () => editIssue(button.dataset.editIssue));
  });

  document.querySelectorAll("[data-delete-issue]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!window.confirm("确定删除这个整改项吗？")) return;
      if (!ensureCanEdit("删除整改项")) return;
      createRestorePoint("删除整改项");
      const removed = state.issues.find((issue) => issue.id === button.dataset.deleteIssue);
      state.issues = state.issues.filter((issue) => issue.id !== button.dataset.deleteIssue);
      recordAudit("删除整改项", removed?.title || "");
      saveState();
      render();
    });
  });
}

function filterIssues(issues) {
  const query = String(globalSearchQuery || "").toLowerCase();
  if (!query) return issues;
  return issues.filter((issue) => [
    issue.title,
    issue.owner,
    issue.deadline,
    issue.severity,
    issue.status,
    issue.action,
    issue.reviewNote,
    issue.category
  ].join(" ").toLowerCase().includes(query));
}

function renderIssueTaskOptions() {
  if (!els.issueTaskSelect) return;
  const tasks = currentProjectItems("tasks");
  const previous = els.issueTaskSelect.value || "";
  els.issueTaskSelect.innerHTML = [
    `<option value="">不关联节点</option>`,
    ...tasks.map((task) => `<option value="${task.id}">${escapeHtml(task.building || "-")}｜${escapeHtml(task.floor || "-")}｜${escapeHtml(task.system || task.name)}</option>`)
  ].join("");
  els.issueTaskSelect.value = tasks.some((task) => task.id === previous) ? previous : "";
}

function saveIssueFromForm(event) {
  event.preventDefault();
  if (!ensureCanEdit("保存整改项")) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const validation = validateIssuePayload(data);
  if (validation.length) {
    window.alert(validation.join("\n"));
    return;
  }
  const payload = {
    projectId: state.selectedProjectId,
    title: data.title,
    owner: data.owner,
    deadline: data.deadline,
    severity: data.severity,
    taskId: data.taskId,
    closedAt: data.closedAt,
    action: data.action,
    reviewNote: data.reviewNote,
    category: classifyDelayReason(`${data.title || ""}${data.action || ""}`)
  };
  const existing = data.id ? state.issues.find((issue) => issue.id === data.id) : null;
  if (existing) {
    Object.assign(existing, payload);
    if (payload.closedAt) existing.status = "已闭合";
    recordAudit("编辑整改项", payload.title);
  } else {
    state.issues.push({ id: createId(), status: payload.closedAt ? "已闭合" : "未整改", ...payload });
    recordAudit("新增整改项", payload.title);
  }
  resetIssueForm();
  saveState();
  render();
}

function validateIssuePayload(data) {
  const problems = [];
  if (!String(data.title || "").trim()) problems.push("问题标题不能为空。");
  if (!String(data.owner || "").trim()) problems.push("责任单位不能为空。");
  if (!data.deadline) problems.push("要求完成日期不能为空。");
  if (!String(data.action || "").trim()) problems.push("监理要求不能为空。");
  return problems;
}

function editIssue(issueId) {
  if (!ensureCanEdit("编辑整改项")) return;
  const issue = state.issues.find((item) => item.id === issueId);
  if (!issue || !els.issueForm) return;
  switchView("issues");
  renderIssueTaskOptions();
  Object.entries({
    id: issue.id,
    title: issue.title || "",
    owner: issue.owner || "",
    deadline: issue.deadline || "",
    severity: issue.severity || "一般",
    taskId: issue.taskId || "",
    closedAt: issue.closedAt || "",
    action: issue.action || "",
    reviewNote: issue.reviewNote || ""
  }).forEach(([name, value]) => {
    if (els.issueForm.elements[name]) els.issueForm.elements[name].value = value;
  });
  if (els.issueSubmitBtn) els.issueSubmitBtn.textContent = "保存整改项";
  if (els.cancelIssueEditBtn) els.cancelIssueEditBtn.classList.add("show");
  els.issueForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetIssueForm() {
  if (!els.issueForm) return;
  els.issueForm.reset();
  els.issueForm.elements.id.value = "";
  renderIssueTaskOptions();
  if (els.issueSubmitBtn) els.issueSubmitBtn.textContent = "添加整改项";
  if (els.cancelIssueEditBtn) els.cancelIssueEditBtn.classList.remove("show");
}

function issueFlowHtml(status) {
  const current = normalizeIssueStatus(status);
  return ["未整改", "整改中", "待复验", "已闭合"].map((item) => `
    <span class="${item === current ? "active" : ""}">${item}</span>
  `).join("");
}

function statusClassForIssue(status) {
  return {
    未整改: "issue-open",
    整改中: "issue-working",
    待复验: "issue-review",
    已闭合: "issue-closed"
  }[normalizeIssueStatus(status)] || "issue-open";
}

function drawChart(tasks) {
  const ctx = els.chart.getContext("2d");
  const width = els.chart.width = els.chart.clientWidth * window.devicePixelRatio;
  const height = els.chart.height = 220 * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, width, height);

  const chartWidth = els.chart.clientWidth;
  const points = tasks.length
    ? tasks
        .slice()
        .sort((a, b) => a.planned.localeCompare(b.planned))
        .map((task, index, arr) => ({
          label: task.planned.slice(5),
          plan: Math.round(((index + 1) / arr.length) * 100),
          actual: Number(task.progress || 0)
        }))
    : [
        { label: "05-01", plan: 25, actual: 20 },
        { label: "05-08", plan: 50, actual: 38 },
        { label: "05-15", plan: 75, actual: 62 },
        { label: "05-22", plan: 100, actual: 80 }
      ];

  ctx.strokeStyle = "rgba(139, 235, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.font = "12px Microsoft YaHei";
  ctx.fillStyle = "#83a4b7";
  for (let i = 0; i <= 4; i += 1) {
    const y = 20 + i * 42;
    ctx.beginPath();
    ctx.moveTo(42, y);
    ctx.lineTo(chartWidth - 18, y);
    ctx.stroke();
    ctx.fillText(`${100 - i * 25}%`, 6, y + 4);
  }

  plotLine(ctx, points, "plan", "#78a8ff", chartWidth);
  plotLine(ctx, points, "actual", "#7dffcb", chartWidth);

  ctx.fillStyle = "#78a8ff";
  ctx.fillRect(44, 194, 12, 3);
  ctx.fillText("计划", 62, 198);
  ctx.fillStyle = "#7dffcb";
  ctx.fillRect(108, 194, 12, 3);
  ctx.fillText("实际", 126, 198);
}

function plotLine(ctx, points, key, color, chartWidth) {
  const left = 48;
  const right = chartWidth - 24;
  const top = 20;
  const bottom = 188;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  points.forEach((point, index) => {
    const x = points.length === 1 ? left : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((bottom - top) * point[key]) / 100;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  points.forEach((point, index) => {
    const x = points.length === 1 ? left : left + ((right - left) * index) / (points.length - 1);
    const y = bottom - ((bottom - top) * point[key]) / 100;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (key === "actual") {
      ctx.fillStyle = "#83a4b7";
      ctx.fillText(point.label, x - 14, 214);
      ctx.fillStyle = color;
    }
  });
}

function setDefaultDates() {
  const defaultDate = localDateText(today);
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (!input.value) input.value = defaultDate;
  });
}

function localDateText(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}



