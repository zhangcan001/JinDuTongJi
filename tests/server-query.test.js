const assert = require("node:assert/strict");
const { pagedTableQuery } = require("../server/query");

const tasksQuery = pagedTableQuery({
  table: "tasks",
  filters: [
    { column: "project_id", value: "p1" },
    { column: "owner", value: "" }
  ],
  orderBy: "project_id, planned, name",
  limit: 20,
  offset: 0
});

assert.match(tasksQuery.rowsSql, /FROM tasks WHERE project_id = \? ORDER BY project_id, planned, name LIMIT \? OFFSET \?/);
assert.deepEqual(tasksQuery.params, ["p1", 20, 0]);

assert.throws(() => pagedTableQuery({
  table: "tasks; DROP TABLE tasks",
  filters: [],
  orderBy: "project_id, planned, name",
  limit: 20,
  offset: 0
}), /Unsupported table/);

assert.throws(() => pagedTableQuery({
  table: "tasks",
  filters: [{ column: "project_id OR 1=1", value: "p1" }],
  orderBy: "project_id, planned, name",
  limit: 20,
  offset: 0
}), /Unsupported filter column/);

assert.throws(() => pagedTableQuery({
  table: "issues",
  filters: [],
  orderBy: "deadline; DROP TABLE issues",
  limit: 20,
  offset: 0
}), /Unsupported orderBy/);

console.log("server query tests passed");
