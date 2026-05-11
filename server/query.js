const TABLES = {
  tasks: {
    columns: new Set(["project_id", "owner", "review_status"]),
    orderBy: new Set(["project_id, planned, name"])
  },
  issues: {
    columns: new Set(["project_id", "status", "owner"]),
    orderBy: new Set(["project_id, deadline, title"])
  }
};

function assertSafeQueryPart(table, filters, orderBy) {
  const config = TABLES[table];
  if (!config) throw new Error(`Unsupported table: ${table}`);
  if (!config.orderBy.has(orderBy)) throw new Error(`Unsupported orderBy for ${table}: ${orderBy}`);
  filters.forEach((item) => {
    if (!config.columns.has(item.column)) throw new Error(`Unsupported filter column for ${table}: ${item.column}`);
  });
}

function pagedTableQuery({ table, select = "*", filters = [], orderBy, limit, offset }) {
  assertSafeQueryPart(table, filters, orderBy);
  const activeFilters = filters.filter((item) => item.value !== "" && item.value != null);
  const where = activeFilters.map((item) => `${item.column} = ?`);
  const params = activeFilters.map((item) => item.value);
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return {
    countSql: `SELECT COUNT(*) AS count FROM ${table} ${clause}`,
    rowsSql: `SELECT ${select} FROM ${table} ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    params: [...params, limit, offset],
    countParams: params
  };
}

module.exports = { pagedTableQuery };
