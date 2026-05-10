const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");

function startServer() {
  const server = http.createServer((req, res) => {
    const urlPath = req.url === "/" ? "/index.html" : req.url.split("?")[0];
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root) || !fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = ext === ".html" ? "text/html; charset=utf-8"
      : ext === ".css" ? "text/css; charset=utf-8"
      : ext === ".js" ? "application/javascript; charset=utf-8"
      : "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await startServer();
  const { port } = server.address();
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });

  await page.waitForSelector("#pageTitle");
  assert.equal(await page.textContent("#pageTitle"), "总览");
  assert.ok(await page.locator("#taskTable tr").count() > 0);

  await page.click('[data-view="schedule"]');
  await page.waitForSelector("#taskForm");
  assert.equal(await page.locator("#taskForm").isVisible(), true);

  await page.click('[data-view="scope"]');
  await page.waitForSelector("#buildingGrid");
  assert.equal(await page.locator("#buildingGrid").isVisible(), true);

  await page.click('[data-view="issues"]');
  await page.waitForSelector("#issueBoard");
  assert.equal(await page.locator("#issueBoard").isVisible(), true);

  await browser.close();
  server.close();
  console.log("ui smoke test passed");
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
