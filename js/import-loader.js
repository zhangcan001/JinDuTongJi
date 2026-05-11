let importToolsLoadPromise = null;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法加载脚本：${src}`));
    document.body.appendChild(script);
  });
}

async function ensureImportToolsLoaded() {
  if (window.__jinduImportToolsReady) return;
  if (!importToolsLoadPromise) {
    importToolsLoadPromise = loadScriptOnce("./js/import-file-reader.js")
      .then(() => loadScriptOnce("./js/import-excel.js"))
      .then(() => {
        window.__jinduImportToolsReady = true;
      });
  }
  await importToolsLoadPromise;
}

async function importProgressExcel(event) {
  await ensureImportToolsLoaded();
  return window.importProgressExcel(event);
}

async function importPastedTable(event) {
  await ensureImportToolsLoaded();
  return window.importPastedTable(event);
}

async function downloadExcelTemplate(event) {
  await ensureImportToolsLoaded();
  return window.downloadExcelTemplate(event);
}

async function cancelImportParse(event) {
  await ensureImportToolsLoaded();
  return window.cancelImportParse(event);
}

async function exportImportErrors(event) {
  await ensureImportToolsLoaded();
  return window.exportImportErrors(event);
}

async function approvePendingImports(event) {
  await ensureImportToolsLoaded();
  return window.approvePendingImports(event);
}
