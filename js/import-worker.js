/* global XLSX */
importScripts("./vendor/xlsx.full.min.js");

function readWorkbookRows(workbook) {
  return workbook.SheetNames
    .filter((sheetName) => !/说明|填报说明|readme/i.test(sheetName))
    .flatMap((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false })
        .filter((row) => Object.values(row).some((value) => String(value || "").trim()))
        .map((row) => ({ ...row, 来源工作表: sheetName }));
    });
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
