function ensureSpreadsheetRuntime() {
  if (!window.XLSX) {
    throw new Error("Excel 解析库未加载成功，请确认本地 js/vendor/xlsx.full.min.js 文件存在并已正确加载。");
  }
}

async function parseImportFileRows(file) {
  ensureSpreadsheetRuntime();
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  return readWorkbookRows(workbook);
}

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
