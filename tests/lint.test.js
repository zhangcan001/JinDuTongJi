const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const vendorDir = path.join(root, "js", "vendor");

function listFiles(dir, predicate, files = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (fullPath !== vendorDir && entry.name !== "node_modules" && entry.name !== ".git") listFiles(fullPath, predicate, files);
      return;
    }
    if (predicate(fullPath)) files.push(fullPath);
  });
  return files;
}

const jsFiles = listFiles(root, (file) => file.endsWith(".js"));
const debuggerStatementPattern = new RegExp("\\bdebugger\\s*;");
jsFiles.forEach((file) => {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${path.relative(root, file)} has a syntax error:\n${result.stderr}`);
  const source = fs.readFileSync(file, "utf8");
  assert.equal(debuggerStatementPattern.test(source), false, `${path.relative(root, file)} contains a debugger statement`);
});

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scriptSources = [...html.matchAll(/<script\s+src="([^"]+)"/g)].map((match) => match[1]);
scriptSources.forEach((src) => {
  const scriptPath = path.join(root, src.replace(/^\.\//, ""));
  assert.equal(fs.existsSync(scriptPath), true, `Missing script referenced by index.html: ${src}`);
});

console.log("lint checks passed");
