const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");

assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/, "service worker must skip API requests");
assert.match(source, /networkFirst\(event\.request, "\.\/index\.html"\)/, "HTML navigation should use network-first caching");
assert.match(source, /cacheFirst\(event\.request\)/, "static assets should keep cache-first caching");
assert.doesNotMatch(source, /cache\.put\(event\.request/, "fetch handler should not blindly cache every response");

console.log("service worker tests passed");
