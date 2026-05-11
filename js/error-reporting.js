const reportedClientErrors = new Set();

function reportClientError(source, error) {
  try {
    const message = String(error?.message || error || "未知错误").slice(0, 300);
    const stack = String(error?.stack || "").split("\n").slice(0, 3).join(" | ").slice(0, 500);
    const key = `${source}:${message}`;
    if (reportedClientErrors.has(key)) return;
    reportedClientErrors.add(key);
    if (reportedClientErrors.size > 30) reportedClientErrors.clear();
    if (typeof fetch !== "function" || location.protocol === "file:") return;
    fetch("./api/audit", {
      method: "POST",
      headers: typeof backendJsonHeaders === "function" ? backendJsonHeaders() : { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "client.error",
        detail: `${source}: ${message}${stack ? ` | ${stack}` : ""}`,
        role: typeof currentRole === "function" ? currentRole() : "unknown"
      }),
      keepalive: true
    }).catch(() => {});
  } catch {}
}

window.addEventListener?.("error", (event) => {
  reportClientError("window.error", event.error || event.message);
});

window.addEventListener?.("unhandledrejection", (event) => {
  reportClientError("unhandledrejection", event.reason);
});
