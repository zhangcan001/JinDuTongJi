const assert = require("node:assert/strict");
const { validateState, isDateText } = require("../server/validation");

const validState = {
  projects: [{ id: "p1", name: "测试项目" }],
  tasks: [{ id: "t1", projectId: "p1", name: "节点", progress: 50, planned: "2026-05-12" }],
  issues: [{ id: "i1", projectId: "p1", title: "整改", deadline: "2026-05-20" }],
  projectScopes: { p1: { buildings: [] } }
};

assert.deepEqual(validateState(validState), { ok: true });
assert.equal(validateState({ ...validState, tasks: [{ id: "t1", projectId: "missing", progress: 0 }] }).ok, false);
assert.match(validateState({ ...validState, tasks: [{ id: "t1", projectId: "p1", progress: 101 }] }).error, /完成率/);
assert.match(validateState({ ...validState, issues: [{ id: "i1", projectId: "p1", deadline: "2026-99-99" }] }).error, /要求日期/);
assert.equal(isDateText("2026-05-12"), true);
assert.equal(isDateText("2026-99-99"), false);

console.log("server validation tests passed");
