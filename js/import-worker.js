/* global XLSX */
importScripts("./vendor/xlsx.full.min.js");

function readWorkbookRows(workbook) {
  return workbook.SheetNames
    .filter((sheetName) => !/说明|填报说明|readme/i.test(sheetName))
    .flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return readSheetRows(sheet, sheetName);
    });
}

function readSheetRows(sheet, sheetName) {
  const cells = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false, blankrows: false });
  if (!cells.length) return [];
  const headerRowIndex = detectImportHeaderRow(cells);
  const headers = normalizeImportHeaders(cells[headerRowIndex] || []);
  return cells
    .slice(headerRowIndex + 1)
    .map((values, offset) => rowFromImportCells(headers, values, sheetName, headerRowIndex + offset + 2))
    .filter((row) => Object.entries(row).some(([key, value]) => !key.startsWith("__") && key !== "来源工作表" && String(value || "").trim()));
}

function detectImportHeaderRow(cells) {
  const maxRows = Math.min(cells.length, 20);
  let best = { index: 0, score: -1 };
  for (let index = 0; index < maxRows; index += 1) {
    const score = importHeaderRowScore(cells[index] || []);
    if (score > best.score) best = { index, score };
  }
  return best.index;
}

function importHeaderRowScore(row) {
  const values = row.map((cell) => String(cell || "").trim()).filter(Boolean);
  if (!values.length) return 0;
  const matchedFields = new Set();
  values.forEach((value) => {
    const field = inferImportFieldForHeader(value);
    if (field) matchedFields.add(field);
  });
  return matchedFields.size * 10 + Math.min(values.length, 12) - (values.length === 1 ? 8 : 0);
}

function normalizeImportHeaders(headerCells) {
  const used = new Map();
  return headerCells.map((cell, index) => {
    const base = String(cell || "").trim() || `未命名列${index + 1}`;
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base}_${count}` : base;
  });
}

function rowFromImportCells(headers, values, sheetName, rowNumber) {
  const row = { 来源工作表: sheetName, __importRowNumber: rowNumber };
  headers.forEach((header, index) => {
    row[header] = values[index] ?? "";
  });
  return row;
}

function inferImportFieldForHeader(header) {
  const text = normalizeImportHeaderText(header);
  if (!text) return "";
  const matchers = [
    ["projectName", ["项目", "工程", "标段"]],
    ["building", ["楼栋", "楼号", "楼座", "栋号", "单体", "区域", "部位"]],
    ["floor", ["楼层", "层数", "施工层", "部位层"]],
    ["discipline", ["专业", "分部", "分项", "工种"]],
    ["owner", ["责任单位", "施工单位", "分包", "班组", "承包单位"]],
    ["system", ["施工内容", "工作内容", "任务内容", "作业内容", "工序", "系统"]],
    ["name", ["节点名称", "任务名称", "进度节点"]],
    ["planned", ["计划完成", "计划完工", "计划结束", "计划日期"]],
    ["actual", ["实际完成", "实际完工", "完成日期", "完成时间", "实际日期"]],
    ["progress", ["完成率", "完成比例", "百分比", "进度"]],
    ["completionStatus", ["完成情况", "施工状态", "进展状态", "当前状态"]],
    ["note", ["备注", "说明", "意见", "原因", "问题"]],
    ["plannedProgress", ["计划进度", "计划完成率"]]
  ];
  const matched = matchers.find(([, words]) => words.some((word) => text.includes(word)));
  return matched?.[0] || "";
}

function normalizeImportHeaderText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[_\-—/\\|·.]/g, "");
}

self.addEventListener("message", (event) => {
  const { id, buffer } = event.data || {};
  try {
    self.postMessage({ id, type: "progress", message: "正在读取工作表" });
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    self.postMessage({ id, type: "progress", message: "正在整理有效行" });
    const rows = readWorkbookRows(workbook);
    self.postMessage({ id, type: "done", rows });
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || "文件解析失败" });
  }
});
