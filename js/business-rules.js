(function (root, factory) {
  const rules = factory();
  if (typeof module === "object" && module.exports) module.exports = rules;
  root.businessRules = rules;
  Object.entries(rules).forEach(([name, value]) => {
    if (!root[name]) root[name] = value;
  });
})(typeof globalThis !== "undefined" ? globalThis : window, function () {
  function localDateText(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function daysBetween(dateText, baseDate = new Date()) {
    if (!dateText) return 0;
    const target = new Date(`${dateText}T00:00:00`);
    const startOfBase = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    return Math.ceil((target - startOfBase) / 86400000);
  }

  function getTaskStatus(task, baseDate = new Date()) {
    if (task.actual || Number(task.progress) >= 100) return { label: "已完成", className: "done" };
    const delta = daysBetween(task.planned, baseDate);
    if (delta < 0) return { label: "已滞后", className: "delay" };
    if (delta <= 7) return { label: "临期", className: "risk" };
    return { label: "正常", className: "normal" };
  }

  function normalizeIssueStatus(status) {
    if (status === "已闭合") return "已闭合";
    if (status === "跟踪中") return "整改中";
    if (status === "待复验") return "待复验";
    if (status === "整改中") return "整改中";
    return "未整改";
  }

  function nextIssueStatus(status) {
    const flow = ["未整改", "整改中", "待复验", "已闭合"];
    const index = flow.indexOf(normalizeIssueStatus(status));
    return flow[(index + 1) % flow.length];
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

  return {
    localDateText,
    daysBetween,
    getTaskStatus,
    normalizeIssueStatus,
    nextIssueStatus,
    classifyDelayReason,
    csvCell
  };
});
