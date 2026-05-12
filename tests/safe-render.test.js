const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "js", "data.js"), "utf8");
const context = {
  window: {
    crypto: {
      randomUUID: () => "test-id"
    },
    structuredClone: (value) => JSON.parse(JSON.stringify(value))
  },
  console
};

vm.createContext(context);
vm.runInContext(`${source}\nthis.escapeHtml = escapeHtml; this.escapeAttr = escapeAttr; this.emptyStateHtml = emptyStateHtml;`, context);

assert.equal(context.escapeHtml(`<img src=x onerror=alert(1)>`), "&lt;img src=x onerror=alert(1)&gt;");
assert.equal(context.escapeAttr("`quote`"), "&#096;quote&#096;");
assert.match(context.emptyStateHtml("<script>alert(1)</script>", "A&B"), /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.doesNotMatch(context.emptyStateHtml("<script>alert(1)</script>", "A&B"), /<script>/);

console.log("safe render tests passed");
