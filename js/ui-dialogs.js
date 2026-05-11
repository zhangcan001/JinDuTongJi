let activeConfirmDialog = null;

function notifyUser(message, tone = "warn") {
  if (typeof showToast === "function") {
    showToast(message, tone);
    return;
  }
  window.alert(message);
}

function userFacingError(error, fallback = "操作失败") {
  const message = error?.message || fallback;
  if (message.includes("JSON")) return `${fallback}：文件格式不正确，请确认导入的是系统导出的 JSON 备份。`;
  if (message.includes("fetch") || message.includes("failed")) return `${fallback}：后端服务暂不可用，请刷新系统状态后重试。`;
  if (message.includes("quota") || message.includes("存储")) return `${fallback}：浏览器存储空间不足，请先导出备份并清理旧数据。`;
  return `${fallback}：${message}`;
}

function confirmAction(message, options = {}) {
  if (!document.body || typeof escapeHtml !== "function") return Promise.resolve(window.confirm(message));
  if (activeConfirmDialog) activeConfirmDialog.remove();

  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    activeConfirmDialog = dialog;
    dialog.className = "confirm-overlay";
    const panel = document.createElement("section");
    panel.className = "confirm-dialog";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "confirmTitle");

    const title = document.createElement("h2");
    title.id = "confirmTitle";
    title.textContent = options.title || "确认操作";

    const body = document.createElement("p");
    body.textContent = message;

    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const cancelButton = document.createElement("button");
    cancelButton.className = "ghost-btn";
    cancelButton.type = "button";
    cancelButton.dataset.confirmCancel = "";
    cancelButton.textContent = options.cancelText || "取消";

    const okButton = document.createElement("button");
    okButton.className = "primary-btn";
    okButton.type = "button";
    okButton.dataset.confirmOk = "";
    okButton.textContent = options.okText || "确认";

    actions.append(cancelButton, okButton);
    panel.append(title, body, actions);
    dialog.append(panel);

    const close = (answer) => {
      dialog.remove();
      if (activeConfirmDialog === dialog) activeConfirmDialog = null;
      resolve(answer);
    };

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog || event.target.closest("[data-confirm-cancel]")) close(false);
      if (event.target.closest("[data-confirm-ok]")) close(true);
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close(false);
    });
    document.body.appendChild(dialog);
    okButton.focus();
  });
}
