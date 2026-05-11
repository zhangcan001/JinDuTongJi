const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");

assert.match(source, /url\.pathname\.startsWith\("\/api\/"\)/, "service worker must skip API requests");
assert.match(source, /networkFirst\(event\.request, "\.\/index\.html"\)/, "HTML navigation should use network-first caching");
assert.match(source, /cacheFirst\(event\.request\)/, "static assets should keep cache-first caching");
assert.doesNotMatch(source, /cache\.put\(event\.request/, "fetch handler should not blindly cache every response");

const assetsSource = fs.readFileSync(path.join(root, "js", "sw-assets.js"), "utf8");
assert.match(source, /importScripts\("\.\/js\/sw-assets\.js"\)/, "service worker should load generated assets");
assert.match(assetsSource, /self\.JINDU_SW_VERSION = "[a-f0-9]{16}"/, "generated service worker assets should include a hash version");
assert.match(assetsSource, /\.\/index\.html/, "generated service worker assets should cache index.html");
assert.match(assetsSource, /\.\/js\/main\.js/, "generated service worker assets should cache app scripts");

console.log("service worker tests passed");
