window.JinDu = window.JinDu || {};

function exposeAppApi(name, value) {
  window.JinDu[name] = value;
  return value;
}

function safeTemplateHtml(strings, ...values) {
  return strings.reduce((html, part, index) => html + part + (values[index] == null ? "" : String(values[index])), "");
}

function setSafeHtml(element, html) {
  if (element) element.innerHTML = String(html || "");
}
