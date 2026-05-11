function isDateField(value) {
  return !value || (/^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime()));
}

function validateTaskPayload(data) {
  const problems = [];
  if (!String(data.name || "").trim()) problems.push("节点名称不能为空。");
  if (!String(data.owner || "").trim()) problems.push("责任单位不能为空。");
  if (!String(data.building || "").trim()) problems.push("楼栋不能为空。");
  if (!String(data.floor || "").trim()) problems.push("楼层不能为空。");
  if (!isDateField(data.planned)) problems.push("计划日期格式不正确。");
  if (!isDateField(data.actual)) problems.push("实际日期格式不正确。");
  const progress = Number(data.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) problems.push("完成率必须在 0-100 之间。");
  if (data.actual && progress < 100) problems.push("已填写实际完成日期时，完成率应为 100%。");
  if (progress >= 100 && !data.actual) problems.push("完成率为 100% 时建议填写实际完成日期。");
  if (typeof state !== "undefined" && typeof taskKey === "function") {
    const duplicate = state.tasks?.find((task) => task.projectId === state.selectedProjectId
      && task.id !== data.id
      && taskKey(task) === taskKey({ projectId: state.selectedProjectId, building: data.building, floor: data.floor, system: data.system, owner: data.owner, name: data.name }));
    if (duplicate) problems.push("相同楼栋、楼层、施工内容和节点名称已存在。");
  }
  return problems;
}

function validateIssuePayload(data) {
  const problems = [];
  if (!String(data.title || "").trim()) problems.push("问题标题不能为空。");
  if (!String(data.owner || "").trim()) problems.push("责任单位不能为空。");
  if (!data.deadline) problems.push("要求完成日期不能为空。");
  if (!isDateField(data.deadline)) problems.push("要求完成日期格式不正确。");
  if (!isDateField(data.closedAt)) problems.push("闭合日期格式不正确。");
  if (!String(data.action || "").trim()) problems.push("监理要求不能为空。");
  const rectifyCount = Number(data.rectifyCount || 0);
  if (!Number.isFinite(rectifyCount) || rectifyCount < 0) problems.push("整改次数必须为非负数字。");
  return problems;
}

function validateTaskAgainstScope(task, scope = currentProjectScope()) {
  const problems = validateTaskPayload(task);
  const buildingName = resolveBuildingName(task.building || "");
  const building = (scope.buildings || []).find((item) => item.name === buildingName);
  const floorNumber = parseFloorNumber(task.floor);
  if (building && floorNumber && floorNumber > Number(building.floors || 1)) {
    problems.push(`${building.name} 只有 ${building.floors} 层，当前楼层超出范围。`);
  }
  return problems;
}
