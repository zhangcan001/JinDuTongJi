let activeConfirmDialog = null;

function notifyUser(message, tone = "warn") {
  if (typeof showToast === "function") {
    showToast(message, tone);
    return;
  }
  window.alert(message);
}

function confirmAction(message, options = {}) {
  if (!document.body || typeof escapeHtml !== "function") return Promise.resolve(window.confirm(message));
  if (activeConfirmDialog) activeConfirmDialog.remove();

  return new Promise((resolve) => {
    const dialog = document.createElement("div");
    activeConfirmDialog = dialog;
    dialog.className = "confirm-overlay";
    dialog.innerHTML = `
      <section class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
        <h2 id="confirmTitle">${escapeHtml(options.title || "确认操作")}</h2>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="ghost-btn" type="button" data-confirm-cancel>${escapeHtml(options.cancelText || "取消")}</button>
          <button class="primary-btn" type="button" data-confirm-ok>${escapeHtml(options.okText || "确认")}</button>
        </div>
      </section>
    `;

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
    dialog.querySelector("[data-confirm-ok]")?.focus();
  });
}
