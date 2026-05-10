const assert = require("node:assert/strict");
const rules = require("../js/business-rules");

const base = new Date("2026-05-10T12:00:00");

assert.equal(rules.localDateText(base), "2026-05-10");
assert.equal(rules.daysBetween("2026-05-09", base), -1);
assert.equal(rules.daysBetween("2026-05-17", base), 7);

assert.deepEqual(rules.getTaskStatus({ planned: "2026-05-09", progress: 20 }, base), {
  label: "已滞后",
  className: "delay"
});
assert.deepEqual(rules.getTaskStatus({ planned: "2026-05-17", progress: 20 }, base), {
  label: "临期",
  className: "risk"
});
assert.deepEqual(rules.getTaskStatus({ planned: "2026-05-20", progress: 20 }, base), {
  label: "正常",
  className: "normal"
});
assert.deepEqual(rules.getTaskStatus({ planned: "2026-05-20", progress: 100 }, base), {
  label: "已完成",
  className: "done"
});

assert.equal(rules.normalizeIssueStatus("跟踪中"), "整改中");
assert.equal(rules.normalizeIssueStatus("未知"), "未整改");
assert.equal(rules.nextIssueStatus("未整改"), "整改中");
assert.equal(rules.nextIssueStatus("整改中"), "待复验");
assert.equal(rules.nextIssueStatus("待复验"), "已闭合");
assert.equal(rules.nextIssueStatus("已闭合"), "未整改");

assert.equal(rules.classifyDelayReason("材料未进场，报验资料缺失"), "材料");
assert.equal(rules.classifyDelayReason("劳动力和班组不足"), "劳动力");
assert.equal(rules.classifyDelayReason("图纸深化碰撞未关闭"), "图纸");
assert.equal(rules.classifyDelayReason("作业面穿插协调困难"), "穿插");
assert.equal(rules.classifyDelayReason("其他原因"), "综合");

assert.equal(rules.csvCell('A"B'), '"A""B"');

console.log("business rules tests passed");
