const MAX_IMPORT_FILE_BYTES = 8 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10000;
let activeImportWorker = null;
let activeImportReject = null;
let importCancelled = false;
let importBusy = false;


async function importProgressExcel(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (isImportFileTooLarge(file)) {
    els.importResult.textContent = "导入文件超过 8MB，建议按施工单位或楼栋拆分后再导入。";
    event.target.value = "";
    return;
  }

  try {
    importCancelled = false;
    setImportBusy(true, "正在读取导入文件");
    const rows = await parseImportFileRows(file);
    if (importCancelled) return;
    updateImportProgress("正在校验字段和范围");
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new Error(`本次文件包含 ${rows.length} 行，超过 ${MAX_IMPORT_ROWS} 行上限，请拆分后导入`);
    }
    pendingImport = buildPendingImport(file.name, rows);
    const { validation, preview } = pendingImport;
    els.importResult.textContent = `已解析 ${rows.length} 行：可导入 ${validation.validRows.length} 行，失败 ${validation.invalidRows.length} 行；预计新增 ${preview.created} 个节点，更新 ${preview.updated} 个节点。请在下方预览中点击“确认导入并同步”。`;
    renderImportValidation(validation);
    renderImportPreview(pendingImport);
  } catch (error) {
    els.importResult.textContent = error?.name === "AbortError" ? "已取消本次导入。" : `导入失败：${error.message || "请检查表头和文件格式"}`;
  } finally {
    setImportBusy(false);
    event.target.value = "";
  }
}

function buildPendingImport(fileName, sourceRows) {
  const rows = sourceRows.map((row, index) => ({ ...row, __importRowId: row.__importRowId || `row-${Date.now()}-${index}` }));
  const mapping = inferImportFieldMap(rows);
  state.uiPreferences = state.uiPreferences || {};
  state.uiPreferences.importFieldMap = { ...(state.uiPreferences.importFieldMap || {}), ...mapping };
  const validation = validateImportRows(rows);
  updateImportProgress("正在生成导入预览");
  const preview = previewImportedRows(validation.validRows);
  return {
    fileName,
    rows,
    validation,
    preview,
    mapping: { ...state.uiPreferences.importFieldMap },
    options: importOptions(),
    excludedRowIds: new Set(),
    approvedScopeKeys: new Set(preview.scopeSuggestions.map((item) => item.key)),
    previewPage: { edit: 1, created: 1, updated: 1, issues: 1 },
    restorePointId: null
  };
}

function setImportBusy(isBusy, message = "") {
  importBusy = isBusy;
  if (els.excelInput) els.excelInput.disabled = isBusy;
  const cancelButton = document.querySelector("#cancelImportParseBtn");
  if (cancelButton) cancelButton.hidden = !isBusy;
  if (message) updateImportProgress(message);
}

function updateImportProgress(message) {
  if (!els.importResult || !message) return;
  els.importResult.textContent = message;
}

function cancelActiveImportWorker() {
  if (!activeImportWorker) return;
  activeImportWorker.terminate();
  activeImportWorker = null;
  if (activeImportReject) {
    const error = new Error("导入已取消");
    error.name = "AbortError";
    activeImportReject(error);
    activeImportReject = null;
  }
}

function cancelImportParse() {
  if (!importBusy) return;
  importCancelled = true;
  cancelActiveImportWorker();
  setImportBusy(false);
  els.importResult.textContent = "已取消本次导入。";
}

function isImportFileTooLarge(file) {
  return Number(file?.size || 0) > MAX_IMPORT_FILE_BYTES;
}

