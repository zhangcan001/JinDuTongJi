function renderTasks() {
  const tasks = currentProjectItems("tasks");
  renderTaskColumnToggles();
  syncTaskFilterControls(tasks);
  renderSavedTaskViewOptions();
  const filteredTasks = currentProjectFilteredTasks(tasks);
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / taskFilters.pageSize));
  taskFilters.page = Math.min(Math.max(1, taskFilters.page), totalPages);
  const pageStart = (taskFilters.page - 1) * taskFilters.pageSize;
  const pageTasks = filteredTasks.slice(pageStart, pageStart + taskFilters.pageSize);
  window.currentTaskPageIds = pageTasks.map((task) => task.id);
  [...selectedTaskIds].forEach((taskId) => {
    if (!state.tasks.some((task) => task.id === taskId)) selectedTaskIds.delete(taskId);
  });
  els.taskCount.textContent = filteredTasks.length === tasks.length ? `${tasks.length} 项` : `${filteredTasks.length} / ${tasks.length} 项`;
  els.taskTable.innerHTML = pageTasks.length
    ? pageTasks
        .map((task) => {
          const status = getTaskStatus(task);
          return `
            <tr>
              <td data-col="select"><input type="checkbox" data-select-task="${escapeAttr(task.id)}" ${selectedTaskIds.has(task.id) ? "checked" : ""}></td>
              <td data-col="name"><strong>${escapeHtml(task.name)}</strong><br><input class="inline-task-field" data-inline-task="${escapeAttr(task.id)}" data-inline-field="note" value="${escapeAttr(task.note || "")}" placeholder="监理意见">${taskAttachmentSummary(task.attachments, task.id)}</td>
              <td data-col="location"><button class="text-action" type="button" data-locate-task="${escapeAttr(task.id)}">${escapeHtml(task.building || "-")}</button><br><small>${escapeHtml(task.floor || "未填楼层")}｜${escapeHtml(task.system || "未挂接施工内容")}</small></td>
              <td data-col="discipline">${escapeHtml(task.discipline)}</td>
              <td data-col="owner">${escapeHtml(task.owner)}</td>
              <td data-col="planned"><input class="inline-task-field compact" type="date" data-inline-task="${escapeAttr(task.id)}" data-inline-field="planned" value="${escapeAttr(task.planned || "")}"></td>
              <td data-col="actual"><input class="inline-task-field compact" type="date" data-inline-task="${escapeAttr(task.id)}" data-inline-field="actual" value="${escapeAttr(task.actual || "")}"></td>
              <td data-col="progress"><input class="inline-task-field mini" type="number" min="0" max="100" step="5" data-inline-task="${escapeAttr(task.id)}" data-inline-field="progress" value="${Number(task.progress || 0)}"><small>计划 ${expectedProgress(task)}%｜偏差 ${Number(task.progress || 0) - expectedProgress(task)}%</small><div class="quick-progress"><button data-quick-progress="0" data-task-id="${escapeAttr(task.id)}">0%</button><button data-quick-progress="50" data-task-id="${escapeAttr(task.id)}">50%</button><button data-quick-progress="100" data-task-id="${escapeAttr(task.id)}">100%</button></div></td>
              <td data-col="status"><span class="status ${status.className}">${status.label}</span>${task.reviewStatus === "pending" ? `<br><small>待复核</small>` : ""}</td>
              <td data-col="actions">
                <div class="row-actions">
                  <button class="icon-btn" title="编辑节点" aria-label="编辑节点 ${escapeAttr(task.name || task.system || task.id)}" data-edit-task="${escapeAttr(task.id)}">✎</button>
                  <button class="icon-btn" title="变更历史" aria-label="查看变更历史 ${escapeAttr(task.name || task.system || task.id)}" data-history-task="${escapeAttr(task.id)}">⟲</button>
                  <button class="icon-btn" title="删除节点" aria-label="删除节点 ${escapeAttr(task.name || task.system || task.id)}" data-delete-task="${escapeAttr(task.id)}">×</button>
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : tableEmptyRowHtml(10, "当前筛选条件下暂无节点", taskFilters.query || globalSearchQuery ? "可以调整关键词或筛选条件后再试。" : "可以新增节点或通过 Excel 批量导入。");

  renderTaskPagination(filteredTasks.length, totalPages);
  updateBulkTaskToolbar();
  applyTaskColumnVisibility();
}

function taskAttachmentSummary(attachments, taskId) {
  const list = Array.isArray(attachments) ? attachments : [];
  if (!list.length) return `<small>无附件</small>`;
  return `<small><button class="text-action" type="button" data-preview-task-attachments="${escapeAttr(taskId)}">${list.length} 个附件</button></small>`;
}

const TASK_COLUMNS = [
  ["discipline", "专业"],
  ["owner", "责任单位"],
  ["planned", "计划"],
  ["actual", "实际"],
  ["progress", "完成率"],
  ["status", "状态"]
];

function renderTaskColumnToggles() {
  if (!els.taskColumnToggles) return;
  const hidden = new Set(state.uiPreferences?.hiddenTaskColumns || []);
  els.taskColumnToggles.innerHTML = TASK_COLUMNS.map(([key, label]) => `
    <label><input type="checkbox" value="${escapeAttr(key)}" ${hidden.has(key) ? "" : "checked"}> ${escapeHtml(label)}</label>
  `).join("");
}

function handleTaskColumnToggle() {
  state.uiPreferences = state.uiPreferences || {};
  const visible = new Set([...els.taskColumnToggles.querySelectorAll("input:checked")].map((input) => input.value));
  state.uiPreferences.hiddenTaskColumns = TASK_COLUMNS.map(([key]) => key).filter((key) => !visible.has(key));
  persistUiPreferences();
  applyTaskColumnVisibility();
}

function applyTaskColumnVisibility() {
  const hidden = new Set(state.uiPreferences?.hiddenTaskColumns || []);
  document.querySelectorAll("[data-col]").forEach((cell) => {
    cell.hidden = hidden.has(cell.dataset.col);
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
}

function handleTaskTableChange(event) {
  const input = event.target.closest("[data-select-task]");
  if (!input) return;
  if (input.checked) selectedTaskIds.add(input.dataset.selectTask);
  else selectedTaskIds.delete(input.dataset.selectTask);
  updateBulkTaskToolbar();
}

function handleTaskTableFocusOut(event) {
  const input = event.target.closest("[data-inline-task]");
  if (!input) return;
  updateInlineTaskField(input.dataset.inlineTask, input.dataset.inlineField, input.value);
}

function updateInlineTaskField(taskId, field, value) {
  if (!ensureCanEdit("快速编辑节点")) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!canEditTask(task)) return;
  const nextValue = field === "progress" ? clampProgress(value) : value;
  if (String(task[field] || "") === String(nextValue || "")) return;
  createRestorePoint("快速编辑台账");
  const before = task[field];
  task[field] = nextValue;
  if (field === "progress" && Number(nextValue) >= 100 && !task.actual) task.actual = localDateText(today);
  recordAudit("快速编辑台账", `${task.name}: ${field}`);
  recordEntityHistory("task", task.id, task.name, [`${field}: ${before || "空"} -> ${nextValue || "空"}`], "台账快速编辑");
  commitStateChange("tasks");
}

async function handleTaskTableClick(event) {
  const editButton = event.target.closest("[data-edit-task]");
  if (editButton) return editTask(editButton.dataset.editTask);

  const locateButton = event.target.closest("[data-locate-task]");
  if (locateButton) return locateTaskInModel(locateButton.dataset.locateTask);

  const progressButton = event.target.closest("[data-quick-progress]");
  if (progressButton) return quickUpdateTaskProgress(progressButton.dataset.taskId, Number(progressButton.dataset.quickProgress));

  const historyButton = event.target.closest("[data-history-task]");
  if (historyButton) return showTaskHistory(historyButton.dataset.historyTask);

  const previewButton = event.target.closest("[data-preview-task-attachments]");
  if (previewButton) return previewTaskAttachments(previewButton.dataset.previewTaskAttachments);

  const deleteButton = event.target.closest("[data-delete-task]");
  if (!deleteButton) return;
  if (!(await confirmAction("确定删除这个进度节点吗？", { title: "删除进度节点", okText: "删除" }))) return;
  if (!ensureCanEdit("删除进度节点")) return;
  createRestorePoint("删除进度节点");
  const removed = state.tasks.find((task) => task.id === deleteButton.dataset.deleteTask);
  if (!canEditTask(removed)) return;
  state.tasks = state.tasks.filter((task) => task.id !== deleteButton.dataset.deleteTask);
  recordAudit("删除进度节点", removed?.name || "");
  if (removed) recordEntityHistory("task", removed.id, removed.name, ["已删除"], "删除节点");
  commitStateChange("tasks");
}

function handleTaskPaginationClick(event) {
  const button = event.target.closest("[data-task-page]");
  if (!button) return;
  taskFilters.page += button.dataset.taskPage === "next" ? 1 : -1;
  renderTasks();
}

function canEditTask(task) {
  if (!task) return false;
  if (currentRole() !== "contractor") return true;
  const unit = state.selectedContractorUnit || "all";
  if (unit === "all") return true;
  const canEdit = `${task.owner || ""}${task.discipline || ""}`.includes(unit.replace("单位", ""));
  if (!canEdit) notifyUser("施工单位角色只能修改本单位节点。");
  return canEdit;
}

function quickUpdateTaskProgress(taskId, progress) {
  if (!ensureCanEdit("快速更新节点")) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!canEditTask(task)) return;
  createRestorePoint("快速更新进度");
  const before = Number(task.progress || 0);
  task.progress = progress;
  task.actual = progress >= 100 ? (task.actual || localDateText(today)) : "";
  recordAudit("快速更新节点", `${task.name}: ${progress}%`);
  recordEntityHistory("task", task.id, task.name, [`完成率: ${before}% -> ${progress}%`, progress >= 100 ? `实际完成: ${task.actual}` : ""].filter(Boolean), "快速更新进度");
  commitStateChange("tasks");
  showToast("节点进度已更新");
}

function locateTaskInModel(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  selectedBuildingName = resolveBuildingName(task.building || task.name);
  selectedModelFloor = normalizedFloorKey(task.floor || "");
  if (!selectedModelFloor || selectedModelFloor === "整栋") selectedModelFloor = "1层";
  switchView("scope");
  renderProjectScope();
}

function updateBulkTaskToolbar() {
  if (els.bulkTaskSummary) els.bulkTaskSummary.textContent = `已选 ${selectedTaskIds.size} 项`;
  if (els.selectAllTasks) {
    const pageIds = window.currentTaskPageIds || [];
    els.selectAllTasks.checked = pageIds.length > 0 && pageIds.every((id) => selectedTaskIds.has(id));
  }
}

function toggleSelectPageTasks(event) {
  const pageIds = window.currentTaskPageIds || [];
  pageIds.forEach((id) => {
    if (event.target.checked) selectedTaskIds.add(id);
    else selectedTaskIds.delete(id);
  });
  renderTasks();
}

function selectedTasks() {
  return [...selectedTaskIds].map((id) => state.tasks.find((task) => task.id === id)).filter(Boolean);
}

async function bulkSetTaskProgress(progress) {
  if (!ensureCanEdit("批量更新节点")) return;
  const tasks = selectedTasks().filter(canEditTask);
  if (!tasks.length) return showToast("请先选择节点", "warn");
  if (!(await confirmAction(bulkTaskSummary(tasks, `确定将这些节点进度设为 ${progress}% 吗？`), { title: "批量更新进度", okText: "更新" }))) return;
  createRestorePoint("批量更新进度");
  tasks.forEach((task) => {
    const before = Number(task.progress || 0);
    task.progress = progress;
    task.actual = progress >= 100 ? (task.actual || localDateText(today)) : "";
    recordEntityHistory("task", task.id, task.name, [`完成率: ${before}% -> ${progress}%`], "批量更新进度");
  });
  recordAudit("批量更新节点", `${tasks.length} 项设为 ${progress}%`);
  commitStateChange("tasks");
  showToast(`已批量更新 ${tasks.length} 项`);
}

async function bulkCreateIssues() {
  if (!ensureCanEdit("批量生成整改")) return;
  const tasks = selectedTasks().filter((task) => getTaskStatus(task).className !== "done");
  if (!tasks.length) return showToast("请选择未完成节点", "warn");
  if (!(await confirmAction(bulkTaskSummary(tasks, "确定为这些未完成节点生成整改事项吗？"), { title: "批量生成整改", okText: "生成" }))) return;
  createRestorePoint("批量生成整改");
  tasks.forEach((task) => {
    state.issues.push({
      id: createId(),
      projectId: task.projectId,
      title: `${task.building || ""}${task.floor || ""}${task.system || task.name}需整改跟踪`,
      owner: task.owner || task.discipline || "未填责任单位",
      deadline: localDateText(today),
      severity: getTaskStatus(task).className === "delay" ? "重要" : "一般",
      status: "未整改",
      taskId: task.id,
      closedAt: "",
      action: `请${task.owner || "责任单位"}更新 ${task.system || task.name} 进展并反馈纠偏措施。`,
      reviewNote: "",
      rectifyCount: 0,
      reviewResult: "",
      delayReason: classifyDelayReason(task.note || task.name || ""),
      category: classifyDelayReason(task.note || task.name || "")
    });
  });
  recordAudit("批量生成整改", `${tasks.length} 项`);
  commitStateChange("issues");
  showToast(`已生成 ${tasks.length} 条整改`);
}

function bulkExportTasks() {
  const tasks = selectedTasks();
  if (!tasks.length) return showToast("请先选择节点", "warn");
  exportProjectCsv("选中节点台账", "csv", buildTaskExportRows(tasks));
}

function bulkEditSelectedTasks(field) {
  const tasks = selectedTasks().filter(canEditTask);
  if (!tasks.length) return showToast("请先选择节点", "warn");
  const label = field === "owner" ? "责任单位" : "监理意见";
  const value = window.prompt(`请输入新的${label}`) || "";
  if (!String(value).trim()) return;
  if (!ensureCanEdit(`批量修改${label}`)) return;
  createRestorePoint(`批量修改${label}`);
  tasks.forEach((task) => {
    const before = task[field] || "";
    task[field] = value.trim();
    recordEntityHistory("task", task.id, task.name, [`${label}: ${before || "空"} -> ${task[field]}`], `批量修改${label}`);
  });
  recordAudit(`批量修改${label}`, `${tasks.length} 项`);
  commitStateChange("tasks");
  showToast(`已批量修改 ${tasks.length} 项`);
}

async function bulkDeleteTasks() {
  if (!ensureCanEdit("批量删除节点")) return;
  const tasks = selectedTasks();
  if (!tasks.length) return showToast("请先选择节点", "warn");
  if (!(await confirmAction(bulkTaskSummary(tasks, "确定删除选中的节点吗？"), { title: "批量删除节点", okText: "删除" }))) return;
  createRestorePoint("批量删除节点");
  const ids = new Set(tasks.map((task) => task.id));
  state.tasks = state.tasks.filter((task) => !ids.has(task.id));
  selectedTaskIds.clear();
  recordAudit("批量删除节点", `${tasks.length} 项`);
  commitStateChange("tasks");
  showToast(`已删除 ${tasks.length} 项`);
}

function bulkTaskSummary(tasks, lead) {
  const buildings = uniqueSorted(tasks.map((task) => resolveBuildingName(task.building || task.name))).slice(0, 5);
  const owners = uniqueSorted(tasks.map((task) => task.owner || task.discipline || "未填单位")).slice(0, 5);
  return `${lead}\n共 ${tasks.length} 项；楼栋：${buildings.join("、") || "未填"}；单位：${owners.join("、") || "未填"}`;
}

function previewTaskAttachments(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  renderAttachmentPreview(task.attachments || [], `${task.name}附件`);
}

function showTaskHistory(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;
  renderEntityHistoryPanel("task", task.id, task.name);
}

function editTask(taskId) {
  if (!ensureCanEdit("编辑进度节点")) return;
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task || !els.taskForm) return;
  if (!canEditTask(task)) return;
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
  const keepContinuous = Boolean(els.taskForm.elements.continueAdd?.checked);
  els.taskForm.reset();
  els.taskForm.elements.id.value = "";
  if (els.taskForm.elements.continueAdd) els.taskForm.elements.continueAdd.checked = keepContinuous;
  if (els.taskSubmitBtn) els.taskSubmitBtn.textContent = "添加节点";
  if (els.cancelTaskEditBtn) els.cancelTaskEditBtn.classList.remove("show");
  renderTaskScopeFields();
  applyRecentTaskDefaults();
}

async function saveTaskFromForm(event) {
  event.preventDefault();
  if (!ensureCanEdit("保存进度节点")) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const validation = validateTaskAgainstScope(data);
  if (validation.length) {
    notifyUser(validation.join("\n"));
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
  if (existing && !canEditTask(existing)) return;
  const taskId = existing?.id || createId();
  const before = existing ? cloneData(existing) : null;
  const attachmentFiles = await readAttachmentFiles(els.taskAttachmentInput);
  const attachmentSource = existing?.attachments || [];
  payload.attachments = attachmentFiles.length ? [...attachmentSource, ...attachmentFiles] : attachmentSource;
  createRestorePoint(existing ? "编辑进度节点" : "新增进度节点");
  rememberRecentTaskFields(payload);
  if (existing) {
    Object.assign(existing, payload);
    recordAudit("编辑进度节点", payload.name);
  } else {
    state.tasks.push({ id: taskId, ...payload });
    recordAudit("新增进度节点", payload.name);
  }
  recordEntityHistory("task", taskId, payload.name, existing ? [
    `节点: ${before.name || "空"} -> ${payload.name || "空"}`,
    `责任单位: ${before.owner || "空"} -> ${payload.owner || "空"}`,
    `计划: ${before.planned || "空"} -> ${payload.planned || "空"}`,
    `完成率: ${Number(before.progress || 0)}% -> ${Number(payload.progress || 0)}%`,
    `监理意见: ${before.note || "空"} -> ${payload.note || "空"}`,
    `附件: ${(before.attachments || []).length} -> ${payload.attachments.length}`
  ] : [
    `节点: ${payload.name || "空"}`,
    `责任单位: ${payload.owner || "空"}`,
    `计划: ${payload.planned || "空"}`,
    `完成率: ${Number(payload.progress || 0)}%`,
    `附件: ${payload.attachments.length}`
  ], existing ? "编辑节点" : "新增节点");
  const continueAdd = Boolean(form.elements.continueAdd?.checked) && !existing;
  resetTaskForm();
  if (continueAdd) {
    Object.entries(state.uiPreferences?.recentTaskDefaults || {}).forEach(([name, value]) => {
      if (form.elements[name]) form.elements[name].value = value;
    });
    if (form.elements.name) form.elements.name.focus();
  }
  commitStateChange("tasks");
  showToast(existing ? "节点已保存" : "节点已添加");
}

async function readAttachmentFiles(input) {
  const files = Array.from(input?.files || []);
  if (!files.length) return [];
  const maxSize = 2 * 1024 * 1024;
  const attachments = [];
  for (const file of files.slice(0, 5)) {
    if (file.size > maxSize) {
      notifyUser(`附件“${file.name}”超过 2MB，已跳过。`);
      continue;
    }
    const dataUrl = await fileToDataUrl(file);
    attachments.push({
      id: createId(),
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl,
      createdAt: new Date().toISOString()
    });
  }
  if (input) input.value = "";
  return attachments;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("附件读取失败"));
    reader.readAsDataURL(file);
  });
}

function rememberRecentTaskFields(payload) {
  state.uiPreferences = state.uiPreferences || {};
  state.uiPreferences.recentTaskDefaults = {
    discipline: payload.discipline,
    building: payload.building,
    floor: payload.floor,
    system: payload.system,
    owner: payload.owner,
    planned: payload.planned,
    progress: 0
  };
}

function applyRecentTaskDefaults() {
  const defaults = state.uiPreferences?.recentTaskDefaults;
  if (!defaults || !els.taskForm) return;
  Object.entries(defaults).forEach(([name, value]) => {
    if (els.taskForm.elements[name] && !els.taskForm.elements[name].value) els.taskForm.elements[name].value = value;
  });
}

function updateTaskFiltersFromControls() {
  taskFilters.query = els.taskSearchInput?.value.trim() || "";
  taskFilters.status = els.taskStatusFilter?.value || "all";
  taskFilters.smart = els.taskSmartFilter?.value || "all";
  taskFilters.building = els.taskBuildingFilter?.value || "all";
  taskFilters.owner = els.taskOwnerFilter?.value || "all";
  taskFilters.sort = els.taskSortSelect?.value || "plannedAsc";
  taskFilters.page = 1;
  persistUiPreferences();
  renderTasks();
}

function syncTaskFilterControls(tasks) {
  if (els.taskSearchInput && els.taskSearchInput.value !== taskFilters.query) {
    els.taskSearchInput.value = taskFilters.query;
  }
  if (els.taskStatusFilter) els.taskStatusFilter.value = taskFilters.status;
  if (els.taskSmartFilter) els.taskSmartFilter.value = taskFilters.smart || "all";
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
  const signature = options.map(([value, label]) => `${value}\u0000${label}`).join("\u0001");
  if (select.dataset.optionSignature !== signature) {
    select.innerHTML = options.map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`).join("");
    select.dataset.optionSignature = signature;
  }
  select.value = options.some(([value]) => value === selectedValue) ? selectedValue : "all";
  if (select.value !== selectedValue) {
    if (select === els.taskBuildingFilter) taskFilters.building = select.value;
    if (select === els.taskOwnerFilter) taskFilters.owner = select.value;
  }
}

function uniqueSorted(values) {
  return [...new Set(values.map((item) => String(item || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function compareTasksByFilter(a, b) {
  if (taskFilters.sort === "plannedDesc") return String(b.planned || "").localeCompare(String(a.planned || ""));
  if (taskFilters.sort === "progressAsc") return Number(a.progress || 0) - Number(b.progress || 0);
  if (taskFilters.sort === "progressDesc") return Number(b.progress || 0) - Number(a.progress || 0);
  return String(a.planned || "").localeCompare(String(b.planned || ""));
}
function renderIssues() {
  const issues = filterIssues(currentProjectItems("issues"));
  const taskIndex = currentProjectIndex("tasks");
  renderIssueTaskOptions();
  const columns = ["未整改", "整改中", "待复验", "已闭合"];
  els.issueBoard.innerHTML = columns.map((statusName) => {
    const statusIssues = issues.filter((issue) => normalizeIssueStatus(issue.status) === statusName);
    return `
      <section class="issue-column ${statusClassForIssue(statusName)}">
        <h3>${statusName}<span>${statusIssues.length}</span></h3>
        ${statusIssues.length ? statusIssues.map((issue) => {
            const linkedTask = issue.taskId ? taskIndex.get(issue.taskId) : null;
            return `
            <article class="issue-card ${statusClassForIssue(issue.status)}">
              <span class="severity ${issue.severity === "紧急" ? "urgent" : issue.severity === "重要" ? "important" : "normal"}">${issue.severity}</span>
              <strong>${escapeHtml(issue.title)}</strong>
              <small>${escapeHtml(issue.owner)}｜${issue.deadline}｜${normalizeIssueStatus(issue.status)}｜${escapeHtml(issue.category || classifyDelayReason(issue.action || issue.title))}</small>
              <p>${escapeHtml(issue.action)}</p>
              <div class="issue-meta">
                ${linkedTask ? `<span>关联：${escapeHtml(linkedTask.building || "-")}｜${escapeHtml(linkedTask.floor || "-")}｜${escapeHtml(linkedTask.system || linkedTask.name)}</span>` : "<span>未关联节点</span>"}
                ${issue.delayReason ? `<span>延期原因：${escapeHtml(issue.delayReason)}</span>` : ""}
                ${issue.rectifyCount ? `<span>整改次数：${Number(issue.rectifyCount || 0)}</span>` : ""}
                ${issue.reviewResult ? `<span>复验结果：${escapeHtml(issue.reviewResult)}</span>` : ""}
                ${issue.reviewNote ? `<span>复验：${escapeHtml(issue.reviewNote)}</span>` : ""}
                ${issue.closedAt ? `<span>闭合日期：${escapeHtml(issue.closedAt)}</span>` : ""}
                ${issue.attachments?.length ? `<span>附件：${issue.attachments.length}</span>` : ""}
              </div>
              <div class="issue-flow">${issueFlowHtml(issue.status)}</div>
              <div class="issue-actions">
                <button data-advance-issue="${escapeAttr(issue.id)}" type="button" aria-label="${normalizeIssueStatus(issue.status) === "已闭合" ? "重新打开" : "推进状态"} ${escapeAttr(issue.title)}">${normalizeIssueStatus(issue.status) === "已闭合" ? "重新打开" : "推进状态"}</button>
                <button data-edit-issue="${escapeAttr(issue.id)}" type="button" aria-label="编辑整改项 ${escapeAttr(issue.title)}">编辑</button>
                <button data-history-issue="${escapeAttr(issue.id)}" type="button" aria-label="查看变更历史 ${escapeAttr(issue.title)}">历史</button>
                ${issue.attachments?.length ? `<button data-preview-issue-attachments="${escapeAttr(issue.id)}" type="button" aria-label="查看附件 ${escapeAttr(issue.title)}">附件</button>` : ""}
                <button data-delete-issue="${escapeAttr(issue.id)}" type="button" aria-label="删除整改项 ${escapeAttr(issue.title)}">删除</button>
              </div>
            </article>
          `;
          }).join("") : `<article class="issue-card empty">${emptyStateHtml("暂无事项", globalSearchQuery ? "当前搜索条件下无匹配整改项" : "该阶段暂无整改项")}</article>`}
      </section>
    `;
  }).join("");

}

async function handleIssueBoardClick(event) {
  const advanceButton = event.target.closest("[data-advance-issue]");
  if (advanceButton) {
    if (!ensureCanEdit("推进整改状态")) return;
    const issue = state.issues.find((item) => item.id === advanceButton.dataset.advanceIssue);
    if (!issue) return;
    const before = cloneData(issue);
    createRestorePoint("推进整改状态");
    issue.status = nextIssueStatus(issue.status);
    if (normalizeIssueStatus(issue.status) === "已闭合" && !issue.closedAt) issue.closedAt = localDateText(today);
    if (normalizeIssueStatus(issue.status) === "整改中") issue.rectifyCount = Number(issue.rectifyCount || 0) + 1;
    recordAudit("推进整改状态", `${issue.title} -> ${issue.status}`);
    recordEntityHistory("issue", issue.id, issue.title, [
      `状态: ${before.status || "未整改"} -> ${issue.status}`,
      `整改次数: ${Number(before.rectifyCount || 0)} -> ${Number(issue.rectifyCount || 0)}`,
      `闭合日期: ${before.closedAt || "空"} -> ${issue.closedAt || "空"}`
    ], "推进整改状态");
    commitStateChange("issues");
    showToast("整改状态已更新");
    return;
  }

  const editButton = event.target.closest("[data-edit-issue]");
  if (editButton) return editIssue(editButton.dataset.editIssue);

  const historyButton = event.target.closest("[data-history-issue]");
  if (historyButton) {
    const issue = state.issues.find((item) => item.id === historyButton.dataset.historyIssue);
    if (issue) renderEntityHistoryPanel("issue", issue.id, issue.title);
    return;
  }

  const previewButton = event.target.closest("[data-preview-issue-attachments]");
  if (previewButton) {
    const issue = state.issues.find((item) => item.id === previewButton.dataset.previewIssueAttachments);
    if (issue) renderAttachmentPreview(issue.attachments || [], `${issue.title}附件`);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-issue]");
  if (!deleteButton) return;
  if (!(await confirmAction("确定删除这个整改项吗？", { title: "删除整改项", okText: "删除" }))) return;
  if (!ensureCanEdit("删除整改项")) return;
  createRestorePoint("删除整改项");
  const removed = state.issues.find((issue) => issue.id === deleteButton.dataset.deleteIssue);
  state.issues = state.issues.filter((issue) => issue.id !== deleteButton.dataset.deleteIssue);
  recordAudit("删除整改项", removed?.title || "");
  if (removed) recordEntityHistory("issue", removed.id, removed.title, ["已删除"], "删除整改项");
  commitStateChange("issues");
  showToast("整改项已删除");
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

async function saveIssueFromForm(event) {
  event.preventDefault();
  if (!ensureCanEdit("保存整改项")) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const validation = validateIssuePayload(data);
  if (validation.length) {
    notifyUser(validation.join("\n"));
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
    rectifyCount: Number(data.rectifyCount || 0),
    reviewResult: data.reviewResult,
    delayReason: data.delayReason,
    action: data.action,
    reviewNote: data.reviewNote,
    category: classifyDelayReason(`${data.title || ""}${data.action || ""}`)
  };
  const existing = data.id ? state.issues.find((issue) => issue.id === data.id) : null;
  const issueId = existing?.id || createId();
  const before = existing ? cloneData(existing) : null;
  const attachmentFiles = await readAttachmentFiles(els.issueAttachmentInput);
  const attachmentSource = existing?.attachments || [];
  payload.attachments = attachmentFiles.length ? [...attachmentSource, ...attachmentFiles] : attachmentSource;
  createRestorePoint(existing ? "编辑整改项" : "新增整改项");
  if (existing) {
    Object.assign(existing, payload);
    if (payload.closedAt) existing.status = "已闭合";
    recordAudit("编辑整改项", payload.title);
  } else {
    state.issues.push({ id: issueId, status: payload.closedAt ? "已闭合" : "未整改", ...payload });
    recordAudit("新增整改项", payload.title);
  }
  recordEntityHistory("issue", issueId, payload.title, existing ? [
    `标题: ${before.title || "空"} -> ${payload.title || "空"}`,
    `责任单位: ${before.owner || "空"} -> ${payload.owner || "空"}`,
    `要求完成: ${before.deadline || "空"} -> ${payload.deadline || "空"}`,
    `严重程度: ${before.severity || "空"} -> ${payload.severity || "空"}`,
    `状态: ${before.status || "未整改"} -> ${payload.closedAt ? "已闭合" : before.status || "未整改"}`,
    `监理要求: ${before.action || "空"} -> ${payload.action || "空"}`,
    `附件: ${(before.attachments || []).length} -> ${payload.attachments.length}`
  ] : [
    `标题: ${payload.title || "空"}`,
    `责任单位: ${payload.owner || "空"}`,
    `要求完成: ${payload.deadline || "空"}`,
    `严重程度: ${payload.severity || "空"}`,
    `附件: ${payload.attachments.length}`
  ], existing ? "编辑整改项" : "新增整改项");
  resetIssueForm();
  commitStateChange("issues");
  showToast(existing ? "整改项已保存" : "整改项已添加");
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
    rectifyCount: Number(issue.rectifyCount || 0),
    reviewResult: issue.reviewResult || "",
    delayReason: issue.delayReason || "",
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

function setDefaultDates() {
  const defaultDate = localDateText(today);
  document.querySelectorAll('input[type="date"]').forEach((input) => {
    if (["actual", "closedAt"].includes(input.name)) return;
    if (!input.value) input.value = defaultDate;
  });
}

