const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const include = ["index.html", "styles.css", "manifest.json", "sw.js", "js", "assets"];
const vendorMetadata = {
  "js/vendor/xlsx.full.min.js": {
    package: "xlsx",
    purpose: "Local Excel import/export runtime loaded on demand by js/import-loader.js"
  }
};
const files = [];

function collect(target) {
  const full = path.join(root, target);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    fs.readdirSync(full).forEach((entry) => collect(path.join(target, entry)));
    return;
  }
  if (!/\.(html|css|js|json|xlsx)$/.test(target)) return;
  const buffer = fs.readFileSync(full);
  files.push({
    path: target.replaceAll("\\", "/"),
    bytes: buffer.length,
    hash: crypto.createHash("sha256").update(buffer).digest("hex").slice(0, 16)
  });
}

include.forEach(collect);
const manifest = {
  generatedAt: new Date().toISOString(),
  vendor: vendorMetadata,
  files: files.sort((a, b) => a.path.localeCompare(b.path))
};

fs.writeFileSync(path.join(root, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const assetPaths = manifest.files
  .map((file) => `./${file.path}`)
  .filter((filePath) => filePath !== "./sw.js" && filePath !== "./build-manifest.json");
if (!assetPaths.includes("./")) assetPaths.unshift("./");
const versionHash = crypto
  .createHash("sha256")
  .update(manifest.files.map((file) => `${file.path}:${file.hash}`).join("|"))
  .digest("hex")
  .slice(0, 16);
const swAssets = [
  `self.JINDU_SW_VERSION = "${versionHash}";`,
  `self.JINDU_SW_ASSETS = ${JSON.stringify(assetPaths, null, 2)};`,
  ""
].join("\n");
fs.writeFileSync(path.join(root, "js", "sw-assets.js"), swAssets, "utf8");
console.log(`build manifest generated (${manifest.files.length} files)`);
