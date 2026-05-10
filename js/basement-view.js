function renderBasementCutaway(scope, tasks) {
  if (!els.basementCutaway) return;
  const cacheKey = `basement:${state.selectedProjectId}:${currentRole()}:${state.selectedContractorUnit || "all"}:${tasks.length}:${scope.basement || ""}`;
  const cached = stateCache.projectItems.get(cacheKey);
  if (cached) {
    if (els.basementSummary) els.basementSummary.textContent = cached.summary;
    els.basementCutaway.innerHTML = cached.html;
    return;
  }
  const basementTasks = tasks.filter((task) => `${task.building || ""}${task.floor || ""}${task.name || ""}`.includes("地下"));
  const grouped = new Map();
  basementTasks.forEach((task) => {
    const key = task.system || task.discipline || "未分类";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(task);
  });
  const rows = Array.from(grouped.entries()).map(([system, systemTasks]) => ({
    system,
    progress: averageProgress(systemTasks),
    status: aggregateFloorStatus(systemTasks, averageProgress(systemTasks)),
    count: systemTasks.length
  }));
  if (els.basementSummary) els.basementSummary.textContent = `${rows.length} 个系统｜${basementTasks.length} 个节点`;
  const html = rows.length
    ? rows.map((row) => `
        <article class="basement-segment ${row.status}">
          <strong>${escapeHtml(row.system)}</strong>
          <span><i style="width:${row.progress}%"></i></span>
          <small>${row.progress}%｜${row.count} 项｜${statusLabel(row.status)}</small>
        </article>
      `).join("")
    : `<article class="basement-segment"><strong>暂无地下室节点</strong><small>导入地下室楼层后显示剖面进度</small></article>`;
  els.basementCutaway.innerHTML = html;
  stateCache.projectItems.set(cacheKey, { summary: els.basementSummary?.textContent || "", html });
}
