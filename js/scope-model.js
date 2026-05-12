function renderBuildingModel(scope, tasks) {
  if (!els.buildingModel) return;
  renderModelFilters(scope);
  const filteredTasks = filterModelTasks(tasks);
  const activeFilterCount = [
    els.modelBuildingFilter?.value !== "all",
    els.modelUnitFilter?.value !== "all",
    els.modelSystemFilter?.value !== "all",
    els.modelStatusFilter?.value !== "all"
  ].filter(Boolean).length;
  const buildingStats = getBuildingStats(scope, tasks);
  const detailStats = activeFilterCount ? getBuildingStats(scope, filteredTasks) : buildingStats;
  const selected = detailStats.find((item) => item.name === selectedBuildingName);

  els.modelSummary.textContent = `${buildingStats.length} 个部位｜${filteredTasks.length} / ${tasks.length} 个节点｜${activeFilterCount ? `${activeFilterCount} 项筛选` : "全量视图"}`;
  renderDisciplineLegend(filteredTasks);
  renderModelDetail(selected, detailStats);
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
  const systems = scope.units.flatMap((unit) => unit.systems.map((system) => `${unit.name}｜${system}`));
  syncSelectOptions(els.modelSystemFilter, [["all", "全部施工内容"], ...systems.map((system) => [system, system])]);
  applySavedModelFilters();
}

function syncSelectOptions(select, options) {
  const previous = select.value || "all";
  select.innerHTML = options
    .map(([value, label]) => `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`)
    .join("");
  select.value = options.some(([value]) => value === previous) ? previous : "all";
}

function applySavedModelFilters() {
  if (state.uiPreferences?.modelFiltersAppliedFor === state.selectedProjectId) return;
  const filters = state.uiPreferences?.modelFilters;
  if (!filters) return;
  [
    [els.modelBuildingFilter, filters.building],
    [els.modelUnitFilter, filters.unit],
    [els.modelSystemFilter, filters.system],
    [els.modelStatusFilter, filters.status]
  ].forEach(([select, value]) => {
    if (select && [...select.options].some((option) => option.value === value)) select.value = value || "all";
  });
  if (els.modelDataOnlyToggle) els.modelDataOnlyToggle.checked = Boolean(filters.dataOnly);
  state.uiPreferences.modelFiltersAppliedFor = state.selectedProjectId;
}

function filterModelTasks(tasks) {
  const cacheKey = `model:${state.selectedProjectId}:${els.modelBuildingFilter?.value || "all"}:${els.modelUnitFilter?.value || "all"}:${els.modelSystemFilter?.value || "all"}:${els.modelStatusFilter?.value || "all"}:${els.modelDataOnlyToggle?.checked ? "data" : "all"}:${tasks.length}`;
  if (stateCache.projectItems.has(cacheKey)) return stateCache.projectItems.get(cacheKey);
  const buildingFilter = els.modelBuildingFilter?.value || "all";
  const unitFilter = els.modelUnitFilter?.value || "all";
  const systemFilter = els.modelSystemFilter?.value || "all";
  const statusFilter = els.modelStatusFilter?.value || "all";
  const scopedSystemFilter = splitScopedSystem(systemFilter);
  const filtered = tasks.filter((task) => {
    const status = getTaskStatus(task).className;
    if (buildingFilter !== "all" && !taskMatchesModelBuildingName(task, buildingFilter)) return false;
    if (unitFilter !== "all" && normalizedOwnerKey(task.owner || task.discipline || "") !== normalizedOwnerKey(unitFilter)) return false;
    if (systemFilter !== "all") {
      if (task.system !== scopedSystemFilter.system) return false;
      if (scopedSystemFilter.owner && normalizedOwnerKey(task.owner || task.discipline || "") !== normalizedOwnerKey(scopedSystemFilter.owner)) return false;
    }
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
    modelState.renderQuality = "dragging";
    scheduleCanvasModelDraw();
  });

  canvas.addEventListener("pointerleave", () => {
    modelState.hoverItem = null;
    if (els.modelTooltip) els.modelTooltip.classList.remove("show");
    scheduleCanvasModelDraw();
  });

  canvas.addEventListener("pointerup", (event) => {
    modelState.dragging = false;
    modelState.renderQuality = "full";
    canvas.releasePointerCapture(event.pointerId);
    scheduleCanvasModelDraw();
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
  const reduced = modelState?.renderQuality === "rotating" || modelState?.renderQuality === "dragging";
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
  modelState.canvasRect = { width, height };

  const layout = getModelLayout(modelState.stats);
  const scale = Math.min(width / 15.2, height / 9.2);
  const floorHeight = Math.max(11, scale * 0.3);
  const blockWidth = Math.max(38, scale * 0.98);
  const blockDepth = Math.max(24, scale * 0.58);

  drawSitePlane(ctx, width, height);
  modelState.hitItems = [];
  modelState.labelRects = [];
  let selectedBadge = null;
  const labelQueue = [];

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
        if (els.modelDataOnlyToggle?.checked && !floorInfo.tasks.length) continue;
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
      labelQueue.push({ item, x: item.center.x, y: item.center.y - floorCount * floorHeight - 26 });
    });

  labelQueue.forEach(({ item, x, y }) => drawModelLabel(ctx, item, x, y, reduced));
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
  const reduced = modelState?.renderQuality === "rotating" || modelState?.renderQuality === "dragging";
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
  if (!reduced) {
    ctx.shadowColor = "rgba(68, 215, 255, 0.45)";
    ctx.shadowBlur = 18;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.strokeStyle = "rgba(68, 215, 255, 0.13)";
  const step = reduced ? 2 : 1;
  for (let i = -7; i <= 7; i += step) drawProjectedLine(ctx, i, -3.8, i, 3.8, width, height);
  for (let i = -3; i <= 3; i += step) drawProjectedLine(ctx, -7.4, i, 7.4, i, width, height);
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
  const rect = reduced ? keepRectInCanvas(ctx, { x: x - 40, y: y - 18, width: 80, height: 36 }) : avoidLabelOverlap(ctx, x - 50, y - 21, 100, 42);
  ctx.fillStyle = "rgba(3, 10, 18, 0.78)";
  roundedRect(ctx, rect.x, rect.y, rect.width, rect.height, 7);
  ctx.fill();
  ctx.strokeStyle = item.name === selectedBuildingName ? "rgba(125,255,203,0.8)" : "rgba(139,235,255,0.28)";
  ctx.stroke();
  ctx.fillStyle = "#f4fcff";
  ctx.font = reduced ? "800 12px Microsoft YaHei, Arial" : "800 14px Microsoft YaHei, Arial";
  ctx.fillText(item.name, rect.x + rect.width / 2, rect.y + 14);
  ctx.fillStyle = item.progress >= 100 ? "#7dffcb" : "#8ff5ff";
  ctx.font = reduced ? "800 11px Microsoft YaHei, Arial" : "800 12px Microsoft YaHei, Arial";
  ctx.fillText(`综合 ${item.progress}%`, rect.x + rect.width / 2, rect.y + 31);
  ctx.restore();
}

function avoidLabelOverlap(ctx, x, y, width, height) {
  const rect = keepRectInCanvas(ctx, { x, y, width, height });
  let attempts = 0;
  while (attempts < 8 && modelState.labelRects?.some((used) => rectsOverlap(rect, used))) {
    const direction = rect.y <= 12 ? 1 : -1;
    rect.y += direction * (height + 6);
    keepRectInCanvas(ctx, rect);
    attempts += 1;
  }
  modelState.labelRects.push(rect);
  return rect;
}

function keepRectInCanvas(ctx, rect) {
  const canvasRect = modelState.canvasRect || ctx.canvas.getBoundingClientRect();
  rect.x = Math.max(10, Math.min(rect.x, canvasRect.width - rect.width - 10));
  rect.y = Math.max(10, Math.min(rect.y, canvasRect.height - rect.height - 10));
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


