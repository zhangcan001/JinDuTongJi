(function (root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.businessRules = rules;
  Object.entries(rules).forEach(([name, value]) => {
    if (!root[name]) root[name] = value;
  });
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  const APP_VERSION = "2026.05.10";
  const STATE_SCHEMA_VERSION = 2;
  const TASK_STATUS = {
    DONE: "已完成",
    DELAY: "已滞后",
    RISK: "临期",
    NORMAL: "正常"
  };
  const ISSUE_STATUS_FLOW = ["未整改", "整改中", "待复验", "已闭合"];
  const COMPLETION_STATUS = {
    NOT_STARTED: "未开始",
    DONE: "已完成",
    ACTIVE: "施工中"
  };

  function localDateText(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daysBetween(dateText, baseDate = new Date()) {
    if (!dateText) return 0;
    const target = new Date(`${dateText}T00:00:00`);
    const base = baseDate instanceof Date ? baseDate : new Date(baseDate);
    const safeBase = Number.isNaN(base.getTime()) ? new Date() : base;
    const startOfBase = new Date(safeBase.getFullYear(), safeBase.getMonth(), safeBase.getDate());
    return Math.ceil((target - startOfBase) / 86400000);
  }

  function getTaskStatus(task, baseDate = new Date()) {
    if (task.actual || Number(task.progress) >= 100) return { label: TASK_STATUS.DONE, className: "done" };
    const delta = daysBetween(task.planned, baseDate);
    if (delta < 0) return { label: TASK_STATUS.DELAY, className: "delay" };
    if (delta <= 7) return { label: TASK_STATUS.RISK, className: "risk" };
    return { label: TASK_STATUS.NORMAL, className: "normal" };
  }

  function normalizeIssueStatus(status) {
    if (status === ISSUE_STATUS_FLOW[3]) return ISSUE_STATUS_FLOW[3];
    if (status === "跟踪中") return ISSUE_STATUS_FLOW[1];
    if (status === ISSUE_STATUS_FLOW[2]) return ISSUE_STATUS_FLOW[2];
    if (status === ISSUE_STATUS_FLOW[1]) return ISSUE_STATUS_FLOW[1];
    return ISSUE_STATUS_FLOW[0];
  }

  function nextIssueStatus(status) {
    const index = ISSUE_STATUS_FLOW.indexOf(normalizeIssueStatus(status));
    return ISSUE_STATUS_FLOW[(index + 1) % ISSUE_STATUS_FLOW.length];
  }

  function classifyDelayReason(text) {
    const value = String(text || "");
    if (/材料|进场|报验/.test(value)) return "材料";
    if (/人|劳动力|班组|资源/.test(value)) return "劳动力";
    if (/图纸|深化|设计|碰撞/.test(value)) return "图纸";
    if (/穿插|交叉|作业面|协调/.test(value)) return "穿插";
    return "综合";
  }

  function csvCell(value) {
    const text = String(value ?? "").replace(/"/g, '""');
    return `"${text}"`;
  }

  function safeFilePart(value) {
    return String(value || "")
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/\s+/g, "")
      .slice(0, 40) || "未命名";
  }

  function datedFileName(prefix, projectName, extension, date = new Date()) {
    return `${prefix}-${safeFilePart(projectName)}-${localDateText(date)}.${extension}`;
  }

  return {
    APP_VERSION,
    STATE_SCHEMA_VERSION,
    TASK_STATUS,
    ISSUE_STATUS_FLOW,
    COMPLETION_STATUS,
    localDateText,
    daysBetween,
    getTaskStatus,
    normalizeIssueStatus,
    nextIssueStatus,
    classifyDelayReason,
    csvCell,
    safeFilePart,
    datedFileName
  };
});
