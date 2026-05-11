let importToolsLoadPromise = null;
const IMPORT_TOOL_SCRIPTS = [
  "./js/import-file-reader.js",
  "./js/import-options.js",
  "./js/import-normalize.js",
  "./js/import-preview.js",
  "./js/import-apply.js",
  "./js/import-template.js",
  "./js/import-excel.js"
];

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
    importToolsLoadPromise = IMPORT_TOOL_SCRIPTS
      .reduce((promise, src) => promise.then(() => loadScriptOnce(src)), Promise.resolve())
      .then(() => {
        window.__jinduImportToolsReady = true;
      });
  }
  await importToolsLoadPromise;
}
exposeAppApi("ensureImportToolsLoaded", ensureImportToolsLoaded);

function preloadImportToolsWhenIdle() {
  const load = () => ensureImportToolsLoaded().catch(() => {});
  if ("requestIdleCallback" in window) window.requestIdleCallback(load, { timeout: 3000 });
  else setTimeout(load, 1200);
}

preloadImportToolsWhenIdle();

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
