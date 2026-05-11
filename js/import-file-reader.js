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
      return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false })
        .filter((row) => Object.values(row).some((value) => String(value || "").trim()))
        .map((row) => ({ ...row, 来源工作表: sheetName }));
    });
}
