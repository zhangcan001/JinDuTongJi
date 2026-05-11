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
  const cacheKey = `elevator:${state.selectedProjectId}:${currentRole()}:${state.selectedContractorUnit || "all"}:${tasks.length}:${tasks.map((task) => `${task.id}:${task.building}:${task.floor}:${task.progress}:${task.actual}`).join("|")}`;
  const cached = stateCache.projectItems.get(cacheKey);
  if (cached) {
    if (els.elevatorSummary) els.elevatorSummary.textContent = cached.summary;
    els.elevatorGrid.innerHTML = cached.html;
    return;
  }
  const elevatorTasks = tasks.filter((task) => {
    if (!`${task.owner || ""}${task.discipline || ""}${task.system || ""}`.includes("电梯")) return false;
    if (isBasementElevatorTask(task)) return false;
    return true;
  });
  const grouped = new Map();
  elevatorTasks.forEach((task) => {
    const building = resolveBuildingName(task.building || task.name) || "未填楼栋";
    if (!grouped.has(building)) grouped.set(building, []);
    grouped.get(building).push(task);
  });
  const rows = Array.from(grouped.entries()).map(([building, items]) => {
    const floors = uniqueSorted(items.map((task) => normalizedFloorKey(task.floor || "")).filter(Boolean));
    const floorRows = floors.map((floor) => {
      const floorTasks = items.filter((task) => normalizedFloorKey(task.floor || "") === floor);
      return {
        floor,
        progress: averageProgress(floorTasks),
        count: floorTasks.length,
        done: floorTasks.filter((task) => Number(task.progress || 0) >= 100 || task.actual).length
      };
    });
    return {
      building,
      progress: averageProgress(items),
      count: items.length,
      done: items.filter((task) => Number(task.progress || 0) >= 100 || task.actual).length,
      floors,
      floorRows
    };
  });
  if (els.elevatorSummary) {
    els.elevatorSummary.textContent = `${rows.length} 栋楼｜${elevatorTasks.length} 个电梯节点`;
  }
  const html = rows.length
    ? rows.map((row) => `
      <article class="elevator-card">
        <strong>${escapeHtml(row.building)}</strong>
        <span><i style="width:${row.progress}%"></i></span>
        <small>${row.progress}%｜完成 ${row.done}/${row.count}｜${escapeHtml(row.floors.join("、") || "未填楼层")}</small>
        <div class="elevator-floor-list">
          ${row.floorRows.map((floor) => `
            <em>${escapeHtml(floor.floor || "未填楼层")}：${floor.progress}%｜${floor.done}/${floor.count}</em>
          `).join("")}
        </div>
      </article>
    `).join("")
    : `<article class="elevator-card"><strong>暂无电梯数据</strong><small>导入电梯单位模板后显示。</small></article>`;
  els.elevatorGrid.innerHTML = html;
  stateCache.projectItems.set(cacheKey, { summary: els.elevatorSummary?.textContent || "", html });
}

function isBasementElevatorTask(task) {
  const buildingText = String(task.building || task.name || "");
  const floorText = String(task.floor || "");
  const resolvedBuilding = resolveBuildingName(buildingText);
  const normalizedBuilding = normalizedBuildingKey(task);
  if (buildingText.includes("地下")) return true;
  if (resolvedBuilding === "地下室" || normalizedBuilding === "地下室") return true;
  if (floorText.includes("地下") || normalizedFloorKey(floorText) === "地下室") return true;
  if (String(task.owner || task.discipline || "").includes("地下室")) return true;
  return false;
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
  const systems = uniqueSorted(scope.units.flatMap((unit) => unit.systems.map((system) => `${unit.name}｜${system}`)));
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
            <small>${unit.systems.map((system) => escapeHtml(system)).join("、") || "暂无施工内容"}</small>
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
  commitStateChange("scope");
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
  commitStateChange("scope");
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
  commitStateChange("scope");
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
  commitStateChange("scope");
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
  commitStateChange("scope");
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
  return taskMatchesScopeUnit(task, unit);
}

function buildUnitProgressRows(tasks) {
  const grouped = new Map();
  tasks.forEach((task) => {
    const key = `${task.owner || task.discipline || "未填单位"}|${task.building || "未填部位"}|${task.floor || "未填楼层"}|${task.system || task.name}`;
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
