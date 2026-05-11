function renderProjectScope() {
  const scope = currentProjectScope();
  const systemCount = scope.units.reduce((sum, unit) => sum + unit.systems.length, 0);
  const tasks = currentProjectItems("tasks");
  const scopeCacheKey = `scope:${state.selectedProjectId}:${currentRole()}:${state.selectedContractorUnit || "all"}:${tasks.length}:${scope.buildings.map((building) => `${building.name}:${building.floors}`).join("|")}:${scope.units.map((unit) => `${unit.name}:${unit.code}:${unit.systems.join(",")}`).join("|")}:${scope.basement || ""}`;
  const cachedScope = stateCache.projectItems.get(scopeCacheKey);
  const unitRows = currentScopeUnitRows(scope, tasks);
  if (cachedScope?.scope === scope && cachedScope?.tasks === tasks) {
    renderScopeMaintenance(scope);
    renderBuildingModel(scope, tasks);
    renderElevatorDashboard(tasks);
    renderDictionaryPanel(scope);
    renderBasementCutaway(scope, tasks);
    return;
  }
  els.scopeSummary.textContent = `${scope.buildings.length} 栋楼｜${scope.units.length} 个单位｜${systemCount} 项内容`;
  els.buildingGrid.innerHTML = [
    ...scope.buildings.map(
      (building) => `
        <article class="building-chip">
          <strong>${escapeHtml(building.name)}</strong>
          <small>${building.floors} 层</small>
        </article>
      `
    ),
    scope.basement
      ? `<article class="building-chip basement"><strong>地下室</strong><small>${escapeHtml(scope.basement)}</small></article>`
      : ""
  ].join("");

  els.scopeUnitGrid.innerHTML = scope.units
    .map((unit, index) => {
        const row = unitRows[index] || { unit, unitTasks: [], progress: 0, detailRows: [] };
        return `
        <article class="unit-card">
          <div class="unit-card-header">
            <span>${escapeHtml(unit.code)}</span>
            <div>
              <strong>${escapeHtml(unit.name)}</strong>
              <small>${row.unitTasks.length} 个进度节点｜完成率 ${row.progress}%</small>
            </div>
          </div>
          <div class="unit-progress">
            <span style="width: ${row.progress}%"></span>
          </div>
          <div class="system-list">
            ${unit.systems.map((system) => `<span>${escapeHtml(system)}</span>`).join("")}
          </div>
          <div class="floor-progress-list">
            ${
              row.detailRows.length
                ? row.detailRows
                    .map(
                      (row) => `
                        <div class="floor-progress-row">
                          <strong>${escapeHtml(row.location)}</strong>
                          <span>${escapeHtml(row.system)}</span>
                          <small>${row.progress}%｜${escapeHtml(row.status)}</small>
                        </div>
                      `
                    )
                    .join("")
                : `<div class="floor-progress-row empty"><strong>暂无楼层进度</strong><span>导入或新增节点后显示具体楼栋、楼层、施工内容</span></div>`
            }
          </div>
        </article>
      `;
    })
    .join("");

  renderScopeMaintenance(scope);
  renderBuildingModel(scope, tasks);
  renderElevatorDashboard(tasks);
  renderDictionaryPanel(scope);
  renderBasementCutaway(scope, tasks);
  stateCache.projectItems.set(scopeCacheKey, { scope, tasks });
}

function renderElevatorDashboard(tasks) {
  if (!els.elevatorGrid) return;
  const cacheKey = `elevator:${state.selectedProjectId}:${currentRole()}:${state.selectedContractorUnit || "all"}:${tasks.length}`;
  const cached = stateCache.projectItems.get(cacheKey);
  if (cached) {
    if (els.elevatorSummary) els.elevatorSummary.textContent = cached.summary;
    els.elevatorGrid.innerHTML = cached.html;
    return;
  }
  const elevatorTasks = tasks.filter((task) => `${task.owner || ""}${task.discipline || ""}${task.system || ""}`.includes("电梯"));
  const grouped = new Map();
  elevatorTasks.forEach((task) => {
    const building = resolveBuildingName(task.building || task.name) || "未填楼栋";
    if (!grouped.has(building)) grouped.set(building, []);
    grouped.get(building).push(task);
  });
  const rows = Array.from(grouped.entries()).map(([building, items]) => ({
    building,
    progress: averageProgress(items),
    count: items.length,
    done: items.filter((task) => Number(task.progress || 0) >= 100 || task.actual).length
  }));
  if (els.elevatorSummary) {
    els.elevatorSummary.textContent = `${rows.length} 栋楼｜${elevatorTasks.length} 个电梯节点`;
  }
  const html = rows.length
    ? rows.map((row) => `
      <article class="elevator-card">
        <strong>${escapeHtml(row.building)}</strong>
        <span><i style="width:${row.progress}%"></i></span>
        <small>${row.progress}%｜完成 ${row.done}/${row.count}</small>
      </article>
    `).join("")
    : `<article class="elevator-card"><strong>暂无电梯数据</strong><small>导入电梯单位模板后显示。</small></article>`;
  els.elevatorGrid.innerHTML = html;
  stateCache.projectItems.set(cacheKey, { summary: els.elevatorSummary?.textContent || "", html });
}

function renderDictionaryPanel(scope) {
  if (!els.dictionaryGrid) return;
  const cacheKey = `dictionary:${state.selectedProjectId}:${currentRole()}:${state.selectedContractorUnit || "all"}:${scope.buildings.map((building) => `${building.name}:${building.floors}`).join("|")}:${scope.units.map((unit) => `${unit.name}:${unit.code}:${unit.systems.join(",")}`).join("|")}:${scope.basement || ""}`;
  const cached = stateCache.projectItems.get(cacheKey);
  if (cached) {
    if (els.dictionarySummary) els.dictionarySummary.textContent = cached.summary;
    els.dictionaryGrid.innerHTML = cached.html;
    return;
  }
  const systems = uniqueSorted(scope.units.flatMap((unit) => unit.systems));
  if (els.dictionarySummary) {
    els.dictionarySummary.textContent = `${scope.buildings.length} 栋楼｜${scope.units.length} 个单位｜${systems.length} 项内容`;
  }
  const section = (title, items) => `
    <article class="dictionary-card">
      <h3>${title}<span>${items.length}</span></h3>
      <div>${items.length ? items.map((item) => `<span>${escapeHtml(item)}</span>`).join("") : "<small>暂无数据</small>"}</div>
    </article>
  `;
  const html = [
    section("楼栋", scope.buildings.map((building) => `${building.name}（${building.floors}层）`)),
    section("单位", scope.units.map((unit) => unit.name)),
    section("施工内容", systems)
  ].join("");
  els.dictionaryGrid.innerHTML = html;
  stateCache.projectItems.set(cacheKey, { summary: els.dictionarySummary?.textContent || "", html });
}

function renderScopeMaintenance(scope) {
  if (!els.scopeMaintenanceList) return;
  const systemCount = scope.units.reduce((sum, unit) => sum + unit.systems.length, 0);
  if (els.scopeManageSummary) {
    els.scopeManageSummary.textContent = `${scope.buildings.length} 栋楼｜${scope.units.length} 个专业｜${systemCount} 项内容`;
  }
  if (els.buildingScopeForm && !els.buildingScopeForm.elements.originalName.value) {
    els.buildingScopeForm.elements.basement.value = scope.basement || "";
  }

  const buildingsHtml = scope.buildings.length
    ? scope.buildings.map((building, index) => `
        <article class="scope-maintenance-item">
          <div>
            <strong>${escapeHtml(building.name)}</strong>
            <small>${Number(building.floors || 1)} 层</small>
          </div>
          <div class="scope-item-actions">
            <button type="button" data-edit-building-index="${index}">编辑</button>
            <button type="button" data-delete-building-index="${index}">删除</button>
          </div>
        </article>
      `).join("")
    : `<article class="scope-maintenance-item empty"><strong>暂无楼栋</strong><small>保存楼栋后会同步到节点表单和 3D 模型。</small></article>`;

  const unitsHtml = scope.units.length
    ? scope.units.map((unit) => `
        <article class="scope-maintenance-item unit">
          <div>
            <strong>${escapeHtml(unit.name)}｜${escapeHtml(unit.code || "UNIT")}</strong>
            <small>${unit.systems.map(escapeHtml).join("、") || "暂无施工内容"}</small>
          </div>
          <div class="scope-item-actions">
            <button type="button" data-edit-unit="${escapeAttr(unit.name)}">编辑</button>
            <button type="button" data-delete-unit="${escapeAttr(unit.name)}">删除</button>
          </div>
        </article>
      `).join("")
    : `<article class="scope-maintenance-item empty"><strong>暂无专业单位</strong><small>保存专业后会同步到筛选器和导入校验。</small></article>`;

  els.scopeMaintenanceList.innerHTML = `
    <div>
      <div class="scope-list-heading">
        <h3>楼栋清单</h3>
        <button type="button" data-add-building>增加楼栋</button>
      </div>
      ${buildingsHtml}
      ${scope.basement ? `<article class="scope-maintenance-item basement"><div><strong>地下室</strong><small>${escapeHtml(scope.basement)}</small></div></article>` : ""}
    </div>
    <div>
      <h3>专业与施工内容</h3>
      ${unitsHtml}
    </div>
  `;

  els.scopeMaintenanceList.querySelectorAll("[data-edit-building-index]").forEach((button) => {
    button.addEventListener("click", () => editScopeBuildingByIndex(Number(button.dataset.editBuildingIndex)));
  });
  els.scopeMaintenanceList.querySelector("[data-add-building]")?.addEventListener("click", addScopeBuilding);
  els.scopeMaintenanceList.querySelectorAll("[data-delete-building-index]").forEach((button) => {
    button.addEventListener("click", () => deleteScopeBuildingByIndex(Number(button.dataset.deleteBuildingIndex)));
  });
  els.scopeMaintenanceList.querySelectorAll("[data-edit-unit]").forEach((button) => {
    button.addEventListener("click", () => editScopeUnit(button.dataset.editUnit));
  });
  els.scopeMaintenanceList.querySelectorAll("[data-delete-unit]").forEach((button) => {
    button.addEventListener("click", () => deleteScopeUnit(button.dataset.deleteUnit));
  });
}

function currentScopeUnitRows(scope, tasks) {
  const cacheKey = `scope-units:${state.selectedProjectId}:${currentRole()}:${state.selectedContractorUnit || "all"}:${tasks.length}:${scope.units.map((unit) => `${unit.name}:${unit.code}:${unit.systems.join(",")}`).join("|")}`;
  if (!stateCache.projectItems.has(cacheKey)) {
    const rows = scope.units.map((unit) => {
      const unitTasks = tasks.filter((task) => taskMatchesUnit(task, unit));
      const progress = unitTasks.length
        ? Math.round(unitTasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / unitTasks.length)
        : 0;
      return { unit, unitTasks, progress, detailRows: buildUnitProgressRows(unitTasks) };
    });
    stateCache.projectItems.set(cacheKey, rows);
  }
  return stateCache.projectItems.get(cacheKey);
}

function saveScopeBuilding(event) {
  event.preventDefault();
  if (!ensureCanEdit("保存楼栋")) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const scope = currentProjectScope();
  const name = String(data.name || "").trim();
  const originalName = String(data.originalName || "").trim();
  if (!name) return;

  const floors = Math.max(1, Math.min(60, Number(data.floors || 1)));
  const existing = originalName
    ? scope.buildings.find((building) => building.name === originalName)
    : scope.buildings.find((building) => building.name === name);
  if (existing) {
    const previousLabel = `${existing.name}（${existing.floors}层）`;
    existing.name = name;
    existing.floors = floors;
    renameTaskBuilding(previousLabel, `${name}（${floors}层）`, originalName || name, name);
    recordAudit("编辑楼栋", `${originalName || name} -> ${name}（${floors}层）`);
  } else {
    scope.buildings.push({ name, floors });
    recordAudit("新增楼栋", `${name}（${floors}层）`);
  }
  scope.basement = String(data.basement || "").trim();
  selectedBuildingName = name;
  selectedModelFloor = "";
  resetBuildingScopeForm();
  saveState();
  render();
}

function saveBuildingBatch(event) {
  event.preventDefault();
  if (!ensureCanEdit("批量增加楼栋")) return;
  const form = event.currentTarget;
  const rows = String(new FormData(form).get("buildings") || "")
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean);
  if (!rows.length) return;
  const scope = currentProjectScope();
  let added = 0;
  rows.forEach((row) => {
    if (row.includes("地下")) {
      scope.basement = row;
      return;
    }
    const building = parseBuilding(row.replace(",", " "));
    if (!scope.buildings.some((item) => item.name === building.name)) {
      scope.buildings.push(building);
      added += 1;
    }
  });
  recordAudit("批量增加楼栋", `新增 ${added} 栋，地下室：${scope.basement || "未设置"}`);
  form.reset();
  saveState();
  render();
}

function editScopeBuilding(name) {
  const scope = currentProjectScope();
  const building = scope.buildings.find((item) => item.name === name);
  fillBuildingScopeForm(building, scope);
}

function editScopeBuildingByIndex(index) {
  if (!ensureCanEdit("编辑楼栋")) return;
  const scope = currentProjectScope();
  const building = scope.buildings[index];
  fillBuildingScopeForm(building, scope);
}

function fillBuildingScopeForm(building, scope) {
  if (!building || !els.buildingScopeForm) return;
  els.buildingScopeForm.elements.originalName.value = building.name;
  els.buildingScopeForm.elements.name.value = building.name;
  els.buildingScopeForm.elements.floors.value = building.floors;
  els.buildingScopeForm.elements.basement.value = scope.basement || "";
  if (els.saveBuildingScopeBtn) els.saveBuildingScopeBtn.textContent = "保存修改";
  els.buildingScopeForm.scrollIntoView({ behavior: "smooth", block: "center" });
  els.buildingScopeForm.elements.name.focus({ preventScroll: true });
}

async function deleteScopeBuilding(name) {
  if (!(await confirmAction(`确定删除楼栋“${name}”吗？已有节点不会删除，但将不再显示到项目范围。`, { title: "删除楼栋", okText: "删除" }))) return;
  if (!ensureCanEdit("删除楼栋")) return;
  createRestorePoint("删除楼栋范围");
  const scope = currentProjectScope();
  scope.buildings = scope.buildings.filter((building) => building.name !== name);
  if (selectedBuildingName === name) {
    selectedBuildingName = "";
    selectedModelFloor = "";
  }
  resetBuildingScopeForm();
  recordAudit("删除楼栋", name);
  saveState();
  render();
}

function deleteScopeBuildingByIndex(index) {
  const building = currentProjectScope().buildings[index];
  if (!building) return;
  deleteScopeBuilding(building.name);
}

function resetBuildingScopeForm() {
  if (!els.buildingScopeForm) return;
  els.buildingScopeForm.reset();
  els.buildingScopeForm.elements.originalName.value = "";
  els.buildingScopeForm.elements.floors.value = "1";
  els.buildingScopeForm.elements.basement.value = currentProjectScope().basement || "";
  if (els.saveBuildingScopeBtn) els.saveBuildingScopeBtn.textContent = "保存楼栋";
}

function addScopeBuilding() {
  resetBuildingScopeForm();
  els.buildingScopeForm.scrollIntoView({ behavior: "smooth", block: "center" });
  els.buildingScopeForm.elements.name.focus({ preventScroll: true });
}

function saveScopeUnit(event) {
  event.preventDefault();
  if (!ensureCanEdit("保存专业")) return;
  const form = event.currentTarget;
  const data = Object.fromEntries(new FormData(form));
  const scope = currentProjectScope();
  const name = String(data.name || "").trim();
  const originalName = String(data.originalName || "").trim();
  if (!name) return;

  const systems = String(data.systems || "")
    .split(/\r?\n|、|,/)
    .map((item) => item.trim())
    .filter(Boolean);
  const code = String(data.code || unitCode(name)).trim();
  const existing = originalName
    ? scope.units.find((unit) => unit.name === originalName)
    : scope.units.find((unit) => unit.name === name);
  if (existing) {
    renameTaskUnit(existing.name, name, existing.systems, systems);
    existing.name = name;
    existing.code = code;
    existing.systems = uniqueSorted(systems);
    recordAudit("编辑专业", name);
  } else {
    scope.units.push({ name, code, systems: uniqueSorted(systems) });
    recordAudit("新增专业", name);
  }
  resetUnitScopeForm();
  saveState();
  render();
}

function editScopeUnit(name) {
  if (!ensureCanEdit("编辑专业")) return;
  const unit = currentProjectScope().units.find((item) => item.name === name);
  if (!unit || !els.unitScopeForm) return;
  els.unitScopeForm.elements.originalName.value = unit.name;
  els.unitScopeForm.elements.name.value = unit.name;
  els.unitScopeForm.elements.code.value = unit.code || unitCode(unit.name);
  els.unitScopeForm.elements.systems.value = unit.systems.join("\n");
  if (els.saveUnitScopeBtn) els.saveUnitScopeBtn.textContent = "保存修改";
}

async function deleteScopeUnit(name) {
  if (!(await confirmAction(`确定删除专业“${name}”吗？已有进度节点不会删除。`, { title: "删除专业", okText: "删除" }))) return;
  if (!ensureCanEdit("删除专业")) return;
  createRestorePoint("删除专业范围");
  const scope = currentProjectScope();
  scope.units = scope.units.filter((unit) => unit.name !== name);
  resetUnitScopeForm();
  recordAudit("删除专业", name);
  saveState();
  render();
}

function resetUnitScopeForm() {
  if (!els.unitScopeForm) return;
  els.unitScopeForm.reset();
  els.unitScopeForm.elements.originalName.value = "";
  if (els.saveUnitScopeBtn) els.saveUnitScopeBtn.textContent = "保存专业";
}

function renameTaskBuilding(previousLabel, nextLabel, previousName, nextName) {
  state.tasks
    .filter((task) => task.projectId === state.selectedProjectId)
    .forEach((task) => {
      if (task.building === previousLabel || task.building === previousName || String(task.building || "").includes(previousName)) {
        task.building = nextLabel;
      }
      if (String(task.name || "").includes(previousName)) {
        task.name = task.name.replaceAll(previousName, nextName);
      }
    });
}

function renameTaskUnit(previousName, nextName, previousSystems, nextSystems) {
  state.tasks
    .filter((task) => task.projectId === state.selectedProjectId)
    .forEach((task) => {
      if (task.owner === previousName) task.owner = nextName;
      if (task.discipline && previousName.includes(task.discipline)) {
        task.discipline = nextName.replace("单位", "") || task.discipline;
      }
      const index = previousSystems.indexOf(task.system);
      if (index >= 0 && nextSystems[index]) task.system = nextSystems[index];
    });
}

function taskMatchesUnit(task, unit) {
  return unit.systems.includes(task.system) || unit.name.includes(task.discipline) || task.owner === unit.name;
}

function buildUnitProgressRows(tasks) {
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = `${task.building || "未填部位"}|${task.floor || "未填楼层"}|${task.system || task.name}`;
    const current = grouped.get(key) || {
      location: `${task.building || "未填部位"}｜${task.floor || "未填楼层"}`,
      system: task.system || task.name,
      progressValues: [],
      done: false,
      delayed: false
    };
    current.progressValues.push(Number(task.progress || 0));
    current.done = current.done || Boolean(task.actual) || Number(task.progress) >= 100;
    current.delayed = current.delayed || getTaskStatus(task).className === "delay";
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((row) => {
      const progress = Math.round(row.progressValues.reduce((sum, value) => sum + value, 0) / row.progressValues.length);
      return {
        location: row.location,
        system: row.system,
        progress,
        status: row.done ? "已完成" : row.delayed ? "已滞后" : progress > 0 ? "施工中" : "未开始"
      };
    })
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 8);
}

function statusLabel(status) {
  const labels = { delay: "滞后", risk: "临期", done: "完成", active: "施工中", normal: "未开始" };
  return labels[status] || "正常";
}

function renderBuildingModel(scope, tasks) {
  if (!els.buildingModel) return;
  renderModelFilters(scope);
  const filteredTasks = filterModelTasks(tasks);
  const buildingStats = getBuildingStats(scope, filteredTasks);
  const selected = buildingStats.find((item) => item.name === selectedBuildingName);
  const activeFilterCount = [
    els.modelBuildingFilter?.value !== "all",
    els.modelUnitFilter?.value !== "all",
    els.modelSystemFilter?.value !== "all",
    els.modelStatusFilter?.value !== "all"
  ].filter(Boolean).length;

  els.modelSummary.textContent = `${buildingStats.length} 个部位｜${filteredTasks.length} 个节点｜${activeFilterCount ? `${activeFilterCount} 项筛选` : "全量视图"}`;
  renderDisciplineLegend(filteredTasks);
  renderModelDetail(selected, buildingStats);
  renderModelFloorPanel(selected);
  renderCanvasBuildingModel(buildingStats);
}

function renderModelFloorPanel(selected) {
  if (!els.modelFloorPanel) return;
  if (!selected || !selectedModelFloor) {
    els.modelFloorPanel.classList.remove("show");
    els.modelFloorPanel.innerHTML = "";
    return;
  }

  const floorData = getModelFloorData(selected, selectedModelFloor);
  const floorTasks = floorData.tasks;
  const progress = floorTasks.length ? floorData.progress : floorProgressValue(selected, selectedModelFloor);
  const status = floorTasks.length ? floorData.status : aggregateFloorStatus(floorTasks, progress);
  const rows = floorTasks
    .slice()
    .sort((a, b) => Number(a.progress || 0) - Number(b.progress || 0))
    .slice(0, 6)
    .map((task) => {
      const taskStatus = getTaskStatus(task);
      return `
        <article class="${taskStatus.className}">
          <strong>${escapeHtml(task.owner || task.discipline || "未填单位")}｜${escapeHtml(task.system || task.name || "-")}</strong>
          <span>${Number(task.progress || 0)}%｜${taskStatus.label}｜计划 ${escapeHtml(task.planned || "-")}</span>
          <small>${escapeHtml(task.note || "暂无监理意见")}</small>
        </article>
      `;
    })
    .join("");

  els.modelFloorPanel.innerHTML = `
    <div class="model-floor-panel-head ${status}">
      <span>${escapeHtml(selected.name)}｜${escapeHtml(selectedModelFloor)}</span>
      <strong>${progress}%</strong>
    </div>
    <p>${floorTasks.length} 个施工节点｜${statusLabel(status)}</p>
    <div class="model-floor-actions">
      <button type="button" data-floor-nav="-1">上一层</button>
      <button type="button" data-floor-nav="1">下一层</button>
      <button type="button" data-add-floor-task="${escapeAttr(selected.name)}">新增本层节点</button>
    </div>
    <div class="model-floor-panel-list">
      ${rows || "<article><strong>暂无明细节点</strong><span>可通过 Excel 导入楼层施工内容</span><small>导入后会在这里显示具体施工情况。</small></article>"}
    </div>
  `;
  els.modelFloorPanel.classList.add("show");
  els.modelFloorPanel.querySelectorAll("[data-floor-nav]").forEach((button) => {
    button.addEventListener("click", () => selectAdjacentFloor(selected, Number(button.dataset.floorNav)));
  });
  els.modelFloorPanel.querySelector("[data-add-floor-task]")?.addEventListener("click", () => {
    addTaskFromModelFloor(selected);
  });
}

function selectAdjacentFloor(building, delta) {
  const labels = floorLabelsForBuilding(building);
  const currentIndex = labels.indexOf(selectedModelFloor);
  const nextIndex = Math.max(0, Math.min(labels.length - 1, currentIndex - delta));
  selectedModelFloor = labels[nextIndex] || selectedModelFloor;
  renderProjectScope();
}

function floorLabelsForBuilding(building) {
  if (building.isBasement) return ["地下室"];
  return Array.from({ length: Math.max(1, building.floors || 1) }, (_, index) => `${index + 1}层`);
}

function addTaskFromModelFloor(building) {
  if (!ensureCanEdit("新增本层节点")) return;
  if (!els.taskForm) return;
  switchView("schedule");
  resetTaskForm();
  const form = els.taskForm;
  const system = currentProjectScope().units[0]?.systems[0] || "未设置施工内容";
  const buildingLabel = building.isBasement ? currentProjectScope().basement || "地下室" : `${building.name}（${building.floors}层）`;
  form.elements.name.value = `${building.name}${selectedModelFloor}${system}`;
  form.elements.building.value = buildingLabel;
  form.elements.floor.value = selectedModelFloor;
  form.elements.system.value = system;
  form.elements.owner.value = currentProjectScope().units[0]?.name || "";
  form.elements.progress.value = "0";
  form.elements.note.value = "3D 模型楼层新建节点，待现场补充实际进展。";
  form.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderCssBuildingModel(buildingStats) {
  els.buildingModel.innerHTML = `
    <div class="model-stage">
      <div class="site-deck">
        ${buildingStats
          .map(
            (building, index) => `
              <button
                class="tower ${building.isBasement ? "basement" : ""} ${building.name === selectedBuildingName ? "selected" : ""}"
                type="button"
                style="--tower-x:${index % 4}; --tower-y:${Math.floor(index / 4)};"
                data-building-model="${escapeAttr(building.name)}"
              >
                <span class="tower-hit"></span>
                <span class="tower-stack" style="--floors:${Math.max(1, building.floors)};">
                  ${building.floorProgress
                    .map(
                      (progress, floorIndex) => `
                        <i
                          style="--floor:${floorIndex}; --progress:${progress}; --floor-color:${cssColorForProgress(progress)};"
                          title="${escapeHtml(building.name)} ${floorIndex + 1}层 ${progress}%"
                        ></i>
                      `
                    )
                    .join("")}
                </span>
                <span class="tower-label">
                  <b>${escapeHtml(building.name)}</b>
                  <small>${building.progress}%</small>
                </span>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;

}

function renderCanvasBuildingModel(buildingStats) {
  if (!modelState || !modelState.isCanvasModel) initCanvasBuildingModel();
  modelState.stats = buildingStats;
  scheduleCanvasModelDraw();
}

function scheduleCanvasModelDraw() {
  if (drawModelFrame) return;
  drawModelFrame = requestAnimationFrame(() => {
    drawModelFrame = null;
    drawCanvasBuildingModel();
  });
}

function renderDisciplineLegend(tasks) {
  if (!els.disciplineLegend) return;
  const disciplines = [...new Set(tasks.map((task) => task.discipline || task.owner || "其他"))].slice(0, 6);
  els.disciplineLegend.innerHTML = disciplines.map((discipline) => `
    <span><i style="background:${disciplineColor(discipline)}"></i>${escapeHtml(discipline)}</span>
  `).join("");
}

function disciplineColor(discipline) {
  const text = String(discipline || "");
  if (text.includes("机电")) return "#44d7ff";
  if (text.includes("消防")) return "#ff5c6c";
  if (text.includes("智能")) return "#a78bfa";
  if (text.includes("电梯")) return "#ffb84a";
  if (text.includes("土建")) return "#7dffcb";
  return "#8ff5ff";
}

function renderModelFilters(scope) {
  if (!els.modelBuildingFilter) return;
  const buildings = [
    ...scope.buildings.map((building) => building.name),
    scope.basement ? "地下室" : ""
  ].filter(Boolean);
  syncSelectOptions(els.modelBuildingFilter, [["all", "全部楼栋"], ...buildings.map((name) => [name, name])]);
  syncSelectOptions(els.modelUnitFilter, [["all", "全部单位"], ...scope.units.map((unit) => [unit.name, unit.name])]);
  const systems = [...new Set(scope.units.flatMap((unit) => unit.systems))];
  syncSelectOptions(els.modelSystemFilter, [["all", "全部施工内容"], ...systems.map((system) => [system, system])]);
}

function syncSelectOptions(select, options) {
  const previous = select.value || "all";
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  select.value = options.some(([value]) => value === previous) ? previous : "all";
}

function filterModelTasks(tasks) {
  const cacheKey = `model:${state.selectedProjectId}:${els.modelBuildingFilter?.value || "all"}:${els.modelUnitFilter?.value || "all"}:${els.modelSystemFilter?.value || "all"}:${els.modelStatusFilter?.value || "all"}:${tasks.length}`;
  if (stateCache.projectItems.has(cacheKey)) return stateCache.projectItems.get(cacheKey);
  const buildingFilter = els.modelBuildingFilter?.value || "all";
  const unitFilter = els.modelUnitFilter?.value || "all";
  const systemFilter = els.modelSystemFilter?.value || "all";
  const statusFilter = els.modelStatusFilter?.value || "all";
  const filtered = tasks.filter((task) => {
    const status = getTaskStatus(task).className;
    if (buildingFilter !== "all" && !taskMatchesModelBuildingName(task, buildingFilter)) return false;
    if (unitFilter !== "all" && !`${task.owner || ""}${task.discipline || ""}`.includes(unitFilter.replace("单位", ""))) return false;
    if (systemFilter !== "all" && task.system !== systemFilter) return false;
    if (statusFilter === "active" && (status === "done" || Number(task.progress || 0) <= 0)) return false;
    if (statusFilter !== "all" && statusFilter !== "active" && status !== statusFilter) return false;
    return true;
  });
  stateCache.projectItems.set(cacheKey, filtered);
  return filtered;
}

function taskMatchesModelBuildingName(task, buildingName) {
  const location = `${task.building || ""}${task.floor || ""}${task.name || ""}`;
  if (buildingName === "地下室") return location.includes("地下");
  return location.includes(buildingName);
}

function initCanvasBuildingModel() {
  const canvas = els.buildingModel;
  modelState = {
    isCanvasModel: true,
    angle: -0.7,
    pitch: 0.62,
    autoRotate: false,
    animating: false,
    dragging: false,
    moved: false,
    lastX: 0,
    hoverItem: null,
    hitItems: [],
    stats: []
  };

  canvas.addEventListener("pointerdown", (event) => {
    modelState.dragging = true;
    modelState.autoRotate = false;
    updateAutoRotateButton();
    modelState.moved = false;
    modelState.lastX = event.clientX;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!modelState.dragging) {
      updateModelHover(event);
      return;
    }
    const delta = event.clientX - modelState.lastX;
    if (Math.abs(delta) > 2) modelState.moved = true;
    modelState.angle += delta * 0.01;
    modelState.lastX = event.clientX;
    scheduleCanvasModelDraw();
  });

  canvas.addEventListener("pointerleave", () => {
    modelState.hoverItem = null;
    if (els.modelTooltip) els.modelTooltip.classList.remove("show");
    scheduleCanvasModelDraw();
  });

  canvas.addEventListener("pointerup", (event) => {
    modelState.dragging = false;
    canvas.releasePointerCapture(event.pointerId);
  });

  canvas.addEventListener("click", (event) => {
    if (modelState.moved) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const hit = modelState.hitItems.find((item) => pointInPolygon(x, y, item.polygon));
    if (!hit) return;
    selectedBuildingName = hit.name;
    selectedModelFloor = hit.floorLabel;
    lastImportFocus = null;
    if (els.modelBuildingFilter) els.modelBuildingFilter.value = hit.name;
    render();
  });
}

function updateModelHover(event) {
  if (!modelState?.isCanvasModel) return;
  const rect = els.buildingModel.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const hit = modelState.hitItems.find((item) => pointInPolygon(x, y, item.polygon));
  modelState.hoverItem = hit || null;
  if (els.modelTooltip) {
    if (hit) {
      els.modelTooltip.innerHTML = `
        <strong>${escapeHtml(hit.name)}｜${escapeHtml(hit.floorLabel)}</strong>
        <span>完成率 ${hit.progress}%｜${statusLabel(hit.status)}</span>
        <small>未完成 ${hit.openCount || 0} 项｜滞后 ${hit.delayCount || 0} 项</small>
      `;
      els.modelTooltip.style.left = `${Math.min(rect.width - 190, Math.max(12, x + 14))}px`;
      els.modelTooltip.style.top = `${Math.min(rect.height - 92, Math.max(12, y + 14))}px`;
      els.modelTooltip.classList.add("show");
    } else {
      els.modelTooltip.classList.remove("show");
    }
  }
  scheduleCanvasModelDraw();
}

function runCanvasModelLoop() {
  if (!modelState?.isCanvasModel || modelState.animating) return;
  modelState.animating = true;
  modelState.renderQuality = "rotating";
  modelState.lastAutoRotateDrawAt = 0;
  const tick = () => {
    if (!modelState?.isCanvasModel) return;
    if (modelState.autoRotate && !modelState.dragging) {
      const now = performance.now();
      modelState.angle += 0.004;
      if (!modelState.lastAutoRotateDrawAt || now - modelState.lastAutoRotateDrawAt >= 33) {
        modelState.lastAutoRotateDrawAt = now;
        scheduleCanvasModelDraw();
      }
      requestAnimationFrame(tick);
      return;
    }
    modelState.animating = false;
    modelState.renderQuality = "full";
    scheduleCanvasModelDraw();
  };
  requestAnimationFrame(tick);
}

function updateAutoRotateButton() {
  if (!els.modelAutoRotateBtn) return;
  const enabled = Boolean(modelState?.autoRotate);
  els.modelAutoRotateBtn.textContent = enabled ? "暂停旋转" : "自动旋转";
  els.modelAutoRotateBtn.classList.toggle("is-active", enabled);
}

function setModelView(view) {
  if (!modelState?.isCanvasModel) initCanvasBuildingModel();
  const views = {
    front: { angle: 0, pitch: 0.5 },
    top: { angle: -0.7, pitch: 0.18 },
    left: { angle: -Math.PI / 2, pitch: 0.56 },
    right: { angle: Math.PI / 2, pitch: 0.56 },
    reset: { angle: -0.7, pitch: 0.62 }
  };
  Object.assign(modelState, views[view] || views.reset, { autoRotate: false });
  updateAutoRotateButton();
  scheduleCanvasModelDraw();
}

function drawCanvasBuildingModel() {
  const canvas = els.buildingModel;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const reduced = modelState?.renderQuality === "rotating";
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  if (rect.width < 2 || rect.height < 2) return;
  if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
    canvas.width = width * ratio;
    canvas.height = height * ratio;
  }
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const layout = getModelLayout(modelState.stats);
  const scale = Math.min(width / 15.2, height / 9.2);
  const floorHeight = Math.max(11, scale * 0.3);
  const blockWidth = Math.max(38, scale * 0.98);
  const blockDepth = Math.max(24, scale * 0.58);

  drawSitePlane(ctx, width, height);
  modelState.hitItems = [];
  modelState.labelRects = [];
  let selectedBadge = null;

  layout
    .map((item) => ({ ...item, center: projectPoint(item.x, 0, item.z, width, height), depth: rotatePoint(item.x, item.z).z }))
    .sort((a, b) => a.depth - b.depth)
    .forEach((item) => {
      const floorDetails = item.floorDetails || [];
      const floorCount = Math.max(1, Math.min(floorDetails.length || item.floors, 12));
      for (let floorIndex = 0; floorIndex < floorCount; floorIndex += 1) {
        const floorInfo = floorDetails[floorIndex] || {
          label: item.isBasement ? "地下室" : `${floorIndex + 1}层`,
          progress: item.floorProgress[floorIndex] ?? item.progress,
          tasks: [],
          status: "normal",
          openCount: 0,
          delayCount: 0
        };
        const y = item.center.y - floorIndex * floorHeight;
        const box = makeIsoBox(item.center.x, y, blockWidth * (item.isBasement ? 1.7 : 1), blockDepth, floorHeight);
        const isSelected = item.name === selectedBuildingName && (!selectedModelFloor || selectedModelFloor === floorInfo.label);
        const isHovered = modelState.hoverItem?.name === item.name && modelState.hoverItem?.floorLabel === floorInfo.label;
        const isImportFocus = lastImportFocus?.buildingName === item.name && lastImportFocus.floorLabel === floorInfo.label;
        drawIsoBox(ctx, box, cssColorForProgress(floorInfo.progress), isSelected || isImportFocus || isHovered, floorInfo.status, reduced);
        if (!reduced) drawFloorHeatmap(ctx, box, floorInfo.tasks, floorInfo.progress);
        const hitItem = {
          name: item.name,
          floorLabel: floorInfo.label,
          progress: floorInfo.progress,
          polygon: hitPolygonForBox(box),
          status: floorInfo.status,
          openCount: floorInfo.openCount,
          delayCount: floorInfo.delayCount
        };
        modelState.hitItems.unshift(hitItem);
        if (!reduced && isSelected) selectedBadge = { ...hitItem, x: item.center.x, y: y - floorHeight - blockDepth - 18 };
      }
      drawModelLabel(ctx, item, item.center.x, item.center.y - floorCount * floorHeight - 26, reduced);
    });

  if (!reduced && selectedBadge) drawSelectedFloorBadge(ctx, selectedBadge);
  if (!reduced) drawModelHint(ctx, width);
}

function getModelLayout(stats) {
  return stats.map((building, index) => ({
    ...building,
    x: ((index % 4) - 1.5) * 3.1,
    z: (Math.floor(index / 4) - 0.5) * 3
  }));
}

function rotatePoint(x, z) {
  const cos = Math.cos(modelState.angle);
  const sin = Math.sin(modelState.angle);
  return { x: x * cos - z * sin, z: x * sin + z * cos };
}

function projectPoint(x, y, z, width, height) {
  const rotated = rotatePoint(x, z);
  const scale = Math.min(width / 18, height / 11);
  return {
    x: width / 2 + rotated.x * scale,
    y: height * 0.76 + rotated.z * scale * modelState.pitch - y * scale
  };
}

function drawSitePlane(ctx, width, height) {
  const glow = ctx.createRadialGradient(width / 2, height * 0.44, 20, width / 2, height * 0.44, Math.max(width, height) * 0.62);
  glow.addColorStop(0, "rgba(68, 215, 255, 0.18)");
  glow.addColorStop(0.55, "rgba(68, 215, 255, 0.05)");
  glow.addColorStop(1, "rgba(68, 215, 255, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  const corners = [
    projectPoint(-7.4, 0, -3.8, width, height),
    projectPoint(7.4, 0, -3.8, width, height),
    projectPoint(7.4, 0, 3.8, width, height),
    projectPoint(-7.4, 0, 3.8, width, height)
  ];
  ctx.save();
  ctx.beginPath();
  corners.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(4, 15, 25, 0.9)";
  ctx.strokeStyle = "rgba(68, 215, 255, 0.58)";
  ctx.lineWidth = 1.25;
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = "rgba(68, 215, 255, 0.45)";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(68, 215, 255, 0.13)";
  for (let i = -7; i <= 7; i += 1) drawProjectedLine(ctx, i, -3.8, i, 3.8, width, height);
  for (let i = -3; i <= 3; i += 1) drawProjectedLine(ctx, -7.4, i, 7.4, i, width, height);
  ctx.restore();
}

function drawProjectedLine(ctx, x1, z1, x2, z2, width, height) {
  const a = projectPoint(x1, 0, z1, width, height);
  const b = projectPoint(x2, 0, z2, width, height);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function makeIsoBox(cx, cy, w, d, h) {
  const left = { x: cx - w / 2, y: cy };
  const right = { x: cx + w / 2, y: cy };
  const back = { x: cx, y: cy - d };
  const front = { x: cx, y: cy + d };
  const topLeft = { x: left.x, y: left.y - h };
  const topRight = { x: right.x, y: right.y - h };
  const topBack = { x: back.x, y: back.y - h };
  const topFront = { x: front.x, y: front.y - h };
  return {
    top: [topLeft, topBack, topRight, topFront],
    left: [left, back, topBack, topLeft],
    right: [right, front, topFront, topRight],
    front: [front, left, topLeft, topFront]
  };
}

function drawIsoBox(ctx, box, color, selected, status = "normal", reduced = false) {
  drawPolygon(ctx, box.left, shadeHex(color, -28), selected, status, reduced);
  drawPolygon(ctx, box.right, shadeHex(color, -12), selected, status, reduced);
  drawPolygon(ctx, box.front, shadeHex(color, -20), selected, status, reduced);
  drawPolygon(ctx, box.top, color, selected, status, reduced);
}

function drawPolygon(ctx, points, color, selected, status = "normal", reduced = false) {
  const statusStroke = {
    delay: "rgba(255,92,108,0.95)",
    risk: "rgba(255,184,74,0.92)",
    done: "rgba(125,255,203,0.82)",
    active: "rgba(68,215,255,0.72)",
    normal: "rgba(234,248,255,0.2)"
  };
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = selected ? "rgba(255,255,255,0.95)" : statusStroke[status] || statusStroke.normal;
  ctx.lineWidth = selected ? 2.6 : status === "delay" && !reduced ? 1.7 : reduced ? 0.8 : 1;
  ctx.shadowColor = selected ? "rgba(125,255,203,0.82)" : statusStroke[status] || color;
  ctx.shadowBlur = reduced ? 0 : selected ? 24 : status === "delay" ? 12 + (0.5 + Math.sin(Date.now() / 180) * 0.5) * 14 : 9;
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawFloorHeatmap(ctx, box, floorTasks, fallbackProgress) {
  const top = box.top;
  const left = top[0];
  const right = top[2];
  const bottom = top[3];
  const width = right.x - left.x;
  const baseY = bottom.y - 3;
  const groups = groupFloorTasksByUnit(floorTasks);
  const segments = groups.length
    ? groups
    : [{ unit: "综合", progress: fallbackProgress, status: "normal" }];
  const segmentWidth = width / Math.max(segments.length, 1);
  ctx.save();
  segments.slice(0, 5).forEach((segment, index) => {
    const x = left.x + index * segmentWidth + 2;
    ctx.fillStyle = segment.status === "delay" || segment.status === "risk"
      ? statusColor(segment.status, segment.progress)
      : disciplineColor(segment.unit);
    ctx.fillRect(x, baseY, Math.max(5, segmentWidth - 4), 4);
  });
  ctx.restore();
}

function drawSelectedFloorBadge(ctx, item) {
  const text = `${item.name}｜${item.floorLabel}｜完成率 ${item.progress}%`;
  ctx.save();
  ctx.font = "800 13px Microsoft YaHei, Arial";
  const width = Math.min(190, Math.max(138, ctx.measureText(text).width + 22));
  const x = Math.max(12, Math.min(item.x - width / 2, ctx.canvas.width - width - 12));
  const y = Math.max(14, item.y - 42);
  ctx.fillStyle = "rgba(3, 10, 18, 0.9)";
  roundedRect(ctx, x, y, width, 34, 8);
  ctx.fill();
  ctx.strokeStyle = "rgba(125,255,203,0.95)";
  ctx.lineWidth = 1.4;
  ctx.shadowColor = "rgba(125,255,203,0.58)";
  ctx.shadowBlur = 18;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#eaffff";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 11, y + 17);
  ctx.restore();
}

function drawModelLabel(ctx, item, x, y, reduced = false) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const rect = reduced ? { x: x - 36, y: y - 15, width: 72, height: 30 } : avoidLabelOverlap(x - 40, y - 18, 80, 36);
  ctx.fillStyle = "rgba(3, 10, 18, 0.78)";
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 7);
  ctx.fill();
  ctx.strokeStyle = item.name === selectedBuildingName ? "rgba(125,255,203,0.8)" : "rgba(139,235,255,0.28)";
  ctx.stroke();
  ctx.fillStyle = "#f4fcff";
  ctx.font = reduced ? "800 12px Microsoft YaHei, Arial" : "800 14px Microsoft YaHei, Arial";
  ctx.fillText(item.name, rect.x + rect.width / 2, rect.y + 13);
  ctx.fillStyle = item.progress >= 100 ? "#7dffcb" : "#8ff5ff";
  ctx.font = reduced ? "800 11px Microsoft YaHei, Arial" : "800 12px Microsoft YaHei, Arial";
  ctx.fillText(`${item.progress}%`, rect.x + rect.width / 2, rect.y + 29);
  ctx.restore();
}

function avoidLabelOverlap(x, y, width, height) {
  const rect = { x, y, width, height };
  while (modelState.labelRects?.some((used) => rectsOverlap(rect, used))) {
    rect.y -= height + 6;
  }
  modelState.labelRects.push(rect);
  return rect;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function drawModelHint(ctx, width) {
  ctx.save();
  ctx.fillStyle = "rgba(3, 10, 18, 0.72)";
  roundedRect(ctx, width - 214, 16, 194, 34, 17);
  ctx.fill();
  ctx.fillStyle = "#83a4b7";
  ctx.font = "800 13px Microsoft YaHei, Arial";
  ctx.fillText("拖拽旋转 360°｜点击楼层", width - 198, 37);
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
}

function pointInPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function hitPolygonForBox(box) {
  const points = [...box.top, ...box.left, ...box.right, ...box.front];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs) - 4;
  const maxX = Math.max(...xs) + 4;
  const minY = Math.min(...ys) - 4;
  const maxY = Math.max(...ys) + 4;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY }
  ];
}

function shadeHex(hex, amount) {
  const raw = hex.replace("#", "");
  const number = parseInt(raw, 16);
  const r = Math.max(0, Math.min(255, (number >> 16) + amount));
  const g = Math.max(0, Math.min(255, ((number >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (number & 255) + amount));
  return `rgb(${r}, ${g}, ${b})`;
}

function getBuildingStats(scope, tasks) {
  const buildings = scope.buildings.map((building) => ({
    name: building.name,
    label: `${building.name}（${building.floors}层）`,
    floors: building.floors,
    isBasement: false
  }));
  if (scope.basement) {
    buildings.push({ name: "地下室", label: scope.basement, floors: 1, isBasement: true });
  }

  return buildings.map((building) => {
    const related = [];
    const floorBuckets = Array.from({ length: Math.max(1, building.floors) }, () => []);
    tasks.forEach((task) => {
      if (!taskMatchesBuilding(task, building)) return;
      related.push(task);
      const floorIndex = building.isBasement ? 0 : Math.max(0, parseFloorNumber(task.floor) - 1);
      if (floorBuckets[floorIndex]) floorBuckets[floorIndex].push(task);
    });
    const relatedProgress = related.length ? averageProgress(related) : 0;
    const floorDetails = floorBuckets.map((floorTasks, floorIndex) => {
      const progress = floorTasks.length ? averageProgress(floorTasks) : relatedProgress;
      return {
        label: building.isBasement ? "地下室" : `${floorIndex + 1}层`,
        progress,
        tasks: floorTasks,
        status: aggregateFloorStatus(floorTasks, progress),
        openCount: floorTasks.filter((task) => Number(task.progress || 0) < 100 && !task.actual).length,
        delayCount: floorTasks.filter((task) => getTaskStatus(task).className === "delay").length
      };
    });
    const floorProgress = floorDetails.map((floor) => floor.progress);
    const progress = related.length ? averageProgress(related) : 0;
    const completed = related
      .filter((task) => Number(task.progress || 0) >= 100 || task.actual)
      .map(taskDetailText)
      .slice(0, 10);
    const active = related
      .filter((task) => Number(task.progress || 0) < 100 && !task.actual)
      .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))
      .map(taskDetailText)
      .slice(0, 8);

    return { ...building, related, floorProgress, floorDetails, progress, completed, active };
  });
}

function renderModelDetail(selected, buildingStats) {
  if (!els.modelDetail) return;
  const target = selected || buildingStats[0];
  if (!target) {
    els.modelDetail.innerHTML = `
      <span>楼栋详情</span>
      <strong>暂无楼栋数据</strong>
      <p>请先在项目范围中录入楼栋，或通过 Excel 导入进度节点。</p>
    `;
    return;
  }
  renderScopedModelDetail(target);
}

function selectBuildingFromModel(name) {
  selectedBuildingName = name;
  render();
}

function renderScopedModelDetail(target) {
  const scopedFloor = selectedModelFloor ? getModelFloorData(target, selectedModelFloor) : null;
  const scopedTasks = selectedModelFloor ? scopedFloor.tasks : target.related;
  const progress = scopedTasks.length
    ? averageProgress(scopedTasks)
    : selectedModelFloor
      ? floorProgressValue(target, selectedModelFloor)
      : target.progress;
  const completedItems = scopedTasks
    .filter((task) => Number(task.progress || 0) >= 100 || task.actual)
    .map(taskDetailText)
    .slice(0, 10);
  const activeItems = scopedTasks
    .filter((task) => Number(task.progress || 0) < 100 && !task.actual)
    .sort((a, b) => Number(b.progress || 0) - Number(a.progress || 0))
    .map(taskDetailText)
    .slice(0, 10);
  const scopeName = selectedModelFloor ? `${target.name}｜${selectedModelFloor}` : target.label;
  const emptyScope = selectedModelFloor ? "该楼层" : "该楼栋";
  const completedHtml = completedItems.length
    ? completedItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>${emptyScope}暂无 100% 完成项，导入实际完成或完成率后会自动更新。</li>`;
  const activeHtml = activeItems.length
    ? activeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : `<li>${emptyScope}暂无施工中节点。</li>`;
  const meta = selectedModelFloor
    ? `${scopedTasks.length} 个进度节点关联到本层。`
    : `${target.related.length} 个进度节点已关联到该楼栋。`;
  const tableRows = scopedTasks.length
    ? scopedTasks
        .slice()
        .sort((a, b) => Number(a.progress || 0) - Number(b.progress || 0))
        .map((task) => {
          const status = getTaskStatus(task);
          return `
            <tr>
              <td>${escapeHtml(task.owner || task.discipline || "-")}</td>
              <td>${escapeHtml(task.system || task.name || "-")}</td>
              <td><span class="status ${status.className}">${status.label}</span><br><small>${Number(task.progress || 0)}%</small></td>
              <td>${escapeHtml(task.planned || "-")}</td>
              <td>${escapeHtml(task.actual || "-")}</td>
              <td>
                ${escapeHtml(task.note || "-")}
                <br><button class="text-action" type="button" data-edit-task="${escapeAttr(task.id)}">编辑节点</button>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="6">${emptyScope}暂无明细节点，可通过 Excel 导入后自动生成。</td></tr>`;

  els.modelDetail.innerHTML = `
    <span>${escapeHtml(scopeName)}</span>
    <strong>${progress}% 综合完成</strong>
    <p>${escapeHtml(meta)}</p>
    <div class="model-detail-table">
      <table>
        <thead>
          <tr>
            <th>单位</th>
            <th>施工内容</th>
            <th>进度</th>
            <th>计划</th>
            <th>实际</th>
            <th>监理意见</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
    <div class="model-detail-block">
      <b>已完成项目</b>
      <ul>${completedHtml}</ul>
    </div>
    <div class="model-detail-block">
      <b>施工中/待完成</b>
      <ul>${activeHtml}</ul>
    </div>
  `;

  els.modelDetail.querySelectorAll("[data-edit-task]").forEach((button) => {
    button.addEventListener("click", () => editTask(button.dataset.editTask));
  });
}

function taskMatchesBuilding(task, building) {
  const location = `${task.building || ""}${task.floor || ""}${task.name || ""}`;
  if (building.isBasement) return location.includes("地下");
  return location.includes(building.name);
}

function taskMatchesFloor(task, floorLabel, building) {
  if (building.isBasement || floorLabel === "地下室") {
    return `${task.building || ""}${task.floor || ""}${task.name || ""}`.includes("地下");
  }
  return parseFloorNumber(task.floor) === parseFloorNumber(floorLabel);
}

function floorProgressValue(building, floorLabel) {
  if (building.isBasement || floorLabel === "地下室") return building.floorProgress[0] || building.progress || 0;
  const index = parseFloorNumber(floorLabel) - 1;
  return building.floorProgress[index] || 0;
}

function getModelFloorData(building, floorLabel) {
  const floorDetails = building.floorDetails || [];
  if (building.isBasement || floorLabel === "地下室") {
    return floorDetails[0] || {
      label: "地下室",
      progress: building.floorProgress[0] || building.progress || 0,
      tasks: building.related.filter((task) => taskMatchesFloor(task, floorLabel, building)),
      status: aggregateFloorStatus([], building.floorProgress[0] || building.progress || 0),
      openCount: 0,
      delayCount: 0
    };
  }
  const index = parseFloorNumber(floorLabel) - 1;
  return floorDetails[index] || {
    label: floorLabel,
    progress: building.floorProgress[index] || 0,
    tasks: building.related.filter((task) => taskMatchesFloor(task, floorLabel, building)),
    status: aggregateFloorStatus([], building.floorProgress[index] || 0),
    openCount: 0,
    delayCount: 0
  };
}

function aggregateFloorStatus(tasks, progress) {
  if (tasks.some((task) => getTaskStatus(task).className === "delay")) return "delay";
  if (tasks.some((task) => getTaskStatus(task).className === "risk")) return "risk";
  if (tasks.length && tasks.every((task) => getTaskStatus(task).className === "done")) return "done";
  if (progress > 0) return "active";
  return "normal";
}

function groupFloorTasksByUnit(tasks) {
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = task.owner || task.discipline || "未填单位";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  return Array.from(grouped.entries()).map(([unit, unitTasks]) => ({
    unit,
    progress: averageProgress(unitTasks),
    status: aggregateFloorStatus(unitTasks, averageProgress(unitTasks))
  }));
}

function statusColor(status, progress) {
  if (status === "delay") return "#ff5c6c";
  if (status === "risk") return "#ffb84a";
  if (status === "done") return "#7dffcb";
  return cssColorForProgress(progress);
}

function averageProgress(tasks) {
  const weighted = tasks.reduce((acc, task) => {
    const weight = taskProgressWeight(task);
    acc.total += Number(task.progress || 0) * weight;
    acc.weight += weight;
    return acc;
  }, { total: 0, weight: 0 });
  return weighted.weight ? Math.round(weighted.total / weighted.weight) : 0;
}

function taskProgressWeight(task) {
  const weights = state.progressWeights || {};
  const unit = currentProjectScope().units.find((item) => taskMatchesUnit(task, item));
  return Math.max(0, Number(weights[unit?.name] ?? weights[task.owner] ?? 1));
}

function taskDetailText(task) {
  return `${task.building || "未填部位"}｜${task.floor || "未填楼层"}｜${task.system || task.name}｜${task.progress}%`;
}

function cssColorForProgress(progress) {
  if (progress >= 100) return "#7dffcb";
  if (progress >= 60) return "#44d7ff";
  if (progress >= 30) return "#ffb84a";
  return "#ff5c6c";
}


