const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const systemChromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const fixtureDir = path.join(__dirname, ".tmp");

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

async function launchBrowser() {
  const options = { headless: true };
  if (process.env.CHROME_PATH) {
    return chromium.launch({ ...options, executablePath: process.env.CHROME_PATH });
  }
  try {
    return await chromium.launch(options);
  } catch (error) {
    if (fs.existsSync(systemChromePath)) {
      return chromium.launch({ ...options, executablePath: systemChromePath });
    }
    throw error;
  }
}

(async () => {
  let server;
  let browser;
  try {
  server = await startServer();
  const { port } = server.address();
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });

  await page.waitForSelector("#pageTitle");
  assert.equal(await page.textContent("#pageTitle"), "数据分析");
  assert.ok(await page.locator("#taskTable tr").count() > 0);
  assert.equal(await page.locator('[data-view="scope"]').isVisible(), true);
  assert.equal(await page.locator('[data-view="issues"]').isVisible(), false);
  assert.equal(await page.locator('[data-view="system"]').isVisible(), false);

  await page.click('[data-view="schedule"]');
  await page.waitForSelector("#scheduleView.active");
  assert.equal(await page.locator("#taskForm").isVisible(), false);
  assert.equal(await page.locator("#bulkTaskToolbar").isVisible(), false);
  assert.ok(await page.locator("#taskTable tr").count() > 0);

  fs.mkdirSync(fixtureDir, { recursive: true });
  const csvPath = path.join(fixtureDir, "import-preview.csv");
  fs.writeFileSync(csvPath, "\uFEFF楼栋,楼层,专业,施工单位,施工内容,计划完成时间,实际完成情况\nA1,1层,机电,机电单位,室内给水系统,2026-05-22,45%\n", "utf8");
  await page.click('[data-view="dashboard"]');
  await page.selectOption("#importModeSelect", "upsert");
  await page.setInputFiles("#excelInput", csvPath);
  await page.waitForSelector("#confirmImportBtn");
  assert.ok(await page.locator("#importPreviewPanel").textContent().then((text) => text.includes("导入预览")));
  assert.ok(await page.locator("#importResult").textContent().then((text) => text.includes("确认导入并同步")));
  assert.equal(await page.locator("#confirmImportTopBtn").isVisible(), true);
  await page.click("#confirmImportTopBtn");
  await page.waitForFunction(() => document.querySelector("#importResult")?.textContent.includes("已同步全局进度"));
  await page.waitForFunction(() => document.querySelector("#floorHeatmap")?.textContent.includes("A1"));
  await page.waitForFunction(() => document.querySelector("#dashboardImportHistory")?.textContent.includes("import-preview.csv"));
  await page.click('[data-view="schedule"]');
  await page.fill("#taskSearchInput", "室内给水系统");
  await page.waitForFunction(() => document.querySelector("#taskTable")?.textContent.includes("室内给水系统"));
  await page.fill("#taskSearchInput", "");

  await page.click('[data-view="dashboard"]');
  await page.setInputFiles("#excelInput", path.join(root, "assets", "progress-template.xlsx"));
  await page.waitForSelector("#confirmImportTopBtn");
  assert.ok(await page.locator("#importPreviewPanel").textContent().then((text) => text.includes("预览已生成")));
  await page.click("#confirmImportTopBtn");
  await page.waitForFunction(() => document.querySelector("#importResult")?.textContent.includes("已同步全局进度"));
  await page.click('[data-view="schedule"]');
  await page.fill("#taskSearchInput", "室内给水系统");
  await page.waitForFunction(() => document.querySelector("#taskTable")?.textContent.includes("室内给水系统"));
  await page.fill("#taskSearchInput", "");

  const backendSaveProbe = await page.evaluate(() => {
    const state = window.JinDu.getState();
    const snapshot = window.cloneData(state);
    snapshot.tasks = Array.from({ length: 900 }, (_, index) => ({
      id: `bulk-${index}`,
      projectId: "p1",
      name: `批量保存节点 ${index}`,
      owner: "UI测试单位",
      building: "A1",
      floor: "1层",
      system: "保存压力测试",
      planned: "2026-05-20",
      actual: "",
      progress: 50,
      note: "用于验证大体积后端状态保存不会触发 keepalive 请求体限制。"
    }));
    const requestBody = JSON.stringify({ state: snapshot, baseVersion: 1 });
    return { keepalive: window.shouldKeepBackendRequestAlive(requestBody), bodyLength: requestBody.length };
  });
  assert.ok(backendSaveProbe.bodyLength > 64 * 1024);
  assert.equal(backendSaveProbe.keepalive, false);

  await page.click('[data-view="scope"]');
  await page.waitForSelector("#buildingModel");
  assert.equal(await page.locator("#buildingModel").isVisible(), true);
  assert.equal(await page.locator(".project-admin-panel").isVisible(), false);
  assert.equal(await page.locator(".scope-maintenance").isVisible(), false);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('[data-view="dashboard"]');
  await page.waitForSelector("#dashboardView.active");
  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(horizontalOverflow <= 2, `mobile layout overflows horizontally by ${horizontalOverflow}px`);

  } finally {
    await browser?.close();
    server?.close();
  }
  console.log("ui smoke test passed");
})().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
