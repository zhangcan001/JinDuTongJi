function validateState(state) {
  if (!state || typeof state !== "object") return { ok: false, error: "状态数据不能为空" };
  if (!Array.isArray(state.projects)) return { ok: false, error: "状态数据缺少 projects 数组" };
  if (!Array.isArray(state.tasks)) return { ok: false, error: "状态数据缺少 tasks 数组" };
  if (state.issues && !Array.isArray(state.issues)) return { ok: false, error: "issues 必须是数组" };
  if (state.projectScopes && (typeof state.projectScopes !== "object" || Array.isArray(state.projectScopes))) {
    return { ok: false, error: "projectScopes 格式不正确" };
  }
  const projectIds = new Set();
  for (const project of state.projects) {
    if (!project?.id || !project?.name) return { ok: false, error: "项目必须包含 id 和 name" };
    projectIds.add(String(project.id));
  }
  for (const task of state.tasks) {
    if (!task?.id || !task?.projectId) return { ok: false, error: "节点必须包含 id 和 projectId" };
    if (projectIds.size && !projectIds.has(String(task.projectId))) return { ok: false, error: `节点 ${task.id} 关联的项目不存在` };
    const taskValidation = validateTaskRecord(task);
    if (!taskValidation.ok) return taskValidation;
  }
  for (const issue of state.issues || []) {
    const issueValidation = validateIssueRecord(issue, projectIds);
    if (!issueValidation.ok) return issueValidation;
  }
  return { ok: true };
}

function validateTaskRecord(task) {
  const progress = Number(task.progress ?? 0);
  if (!Number.isFinite(progress) || progress < 0 || progress > 100) return { ok: false, error: `节点 ${task.id} 完成率必须在 0-100 之间` };
  for (const field of ["planned", "actual"]) {
    if (task[field] && !isDateText(task[field])) return { ok: false, error: `节点 ${task.id} 的${field}日期格式不正确` };
  }
  if (task.actual && task.planned && progress < 100) return { ok: false, error: `节点 ${task.id} 已填实际日期但完成率未达 100%` };
  return { ok: true };
}

function validateIssueRecord(issue, projectIds) {
  if (!issue?.id || !issue?.projectId) return { ok: false, error: "整改项必须包含 id 和 projectId" };
  if (projectIds.size && !projectIds.has(String(issue.projectId))) return { ok: false, error: `整改项 ${issue.id} 关联的项目不存在` };
  if (issue.deadline && !isDateText(issue.deadline)) return { ok: false, error: `整改项 ${issue.id} 的要求日期格式不正确` };
  if (issue.closedAt && !isDateText(issue.closedAt)) return { ok: false, error: `整改项 ${issue.id} 的闭合日期格式不正确` };
  if (issue.rectifyCount != null && (!Number.isFinite(Number(issue.rectifyCount)) || Number(issue.rectifyCount) < 0)) {
    return { ok: false, error: `整改项 ${issue.id} 的整改次数不正确` };
  }
  return { ok: true };
}

function isDateText(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime());
}

module.exports = { validateState, validateTaskRecord, validateIssueRecord, isDateText };
