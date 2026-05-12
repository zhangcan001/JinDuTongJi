function ensureSpreadsheetRuntime() {
  if (!window.XLSX) throw new Error("Excel 解析库未加载成功，请确认本地 js/vendor/xlsx.full.min.js 文件存在并已正确加载。");
}

function loadSpreadsheetRuntime() {
  if (window.XLSX) return Promise.resolve();
  if (window.loadingXlsxRuntime) return window.loadingXlsxRuntime;
  updateImportProgress("正在加载本地 Excel 解析库");
  window.loadingXlsxRuntime = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "./js/vendor/xlsx.full.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Excel 解析库加载失败"));
    document.head.appendChild(script);
  });
  return window.loadingXlsxRuntime;
}

async function parseImportFileRows(file) {
  if (window.Worker) {
    try {
      return await parseImportFileRowsInWorker(file);
    } catch (error) {
      if (error?.name === "AbortError") throw error;
    }
  }
  return parseImportFileRowsOnMainThread(file);
}

async function parseImportFileRowsOnMainThread(file) {
  await loadSpreadsheetRuntime();
  ensureSpreadsheetRuntime();
  updateImportProgress("正在读取文件");
  const buffer = await file.arrayBuffer();
  updateImportProgress("正在解析工作表");
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  updateImportProgress("正在整理有效行");
  const rows = readWorkbookRows(workbook);
  updateImportProgress("文件解析完成");
  return rows;
}

function parseImportFileRowsInWorker(file) {
  const requestId = createId();
  cancelActiveImportWorker();
  updateImportProgress("正在启动后台解析");
  activeImportWorker = new Worker("./js/import-worker.js");
  return new Promise((resolve, reject) => {
    activeImportReject = reject;
    activeImportWorker.onmessage = (event) => {
      const data = event.data || {};
      if (data.id !== requestId) return;
      if (data.type === "progress") updateImportProgress(data.message);
      if (data.type === "done") {
        activeImportWorker.terminate();
        activeImportWorker = null;
        activeImportReject = null;
        updateImportProgress("文件解析完成");
        resolve(data.rows || []);
      }
      if (data.type === "error") {
        activeImportWorker.terminate();
        activeImportWorker = null;
        activeImportReject = null;
        reject(new Error(data.message));
      }
    };
    activeImportWorker.onerror = (error) => {
      activeImportWorker?.terminate();
      activeImportWorker = null;
      activeImportReject = null;
      reject(error);
    };
    file.arrayBuffer().then((buffer) => {
      activeImportWorker?.postMessage({ id: requestId, buffer }, [buffer]);
    }).catch(reject);
  });
}

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
    const row = cells[index] || [];
    const score = importHeaderRowScore(row);
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
