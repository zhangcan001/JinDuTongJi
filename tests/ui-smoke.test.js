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
  await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "networkidle" });

  await page.waitForSelector("#pageTitle");
  assert.equal(await page.textContent("#pageTitle"), "总览");
  assert.ok(await page.locator("#taskTable tr").count() > 0);

  await page.click('[data-view="schedule"]');
  await page.waitForSelector("#taskForm");
  assert.equal(await page.locator("#taskForm").isVisible(), true);

  await page.fill('#taskForm input[name="name"]', "UI测试节点");
  await page.fill('#taskForm input[name="floor"]', "1层");
  await page.fill('#taskForm input[name="owner"]', "UI测试单位");
  await page.fill('#taskForm input[name="planned"]', "2026-05-20");
  await page.fill('#taskForm input[name="progress"]', "25");
  await page.click("#taskSubmitBtn");
  await page.fill("#taskSearchInput", "UI测试节点");
  await page.waitForFunction(() => document.querySelector("#taskTable")?.textContent.includes("UI测试节点"));

  await page.selectOption("#roleSelect", "viewer");
  await page.fill('#taskForm input[name="name"]', "只读不应新增");
  await page.fill('#taskForm input[name="owner"]', "只读单位");
  await page.fill('#taskForm input[name="planned"]', "2026-05-21");
  await page.click("#taskSubmitBtn");
  await page.waitForTimeout(100);
  await page.fill("#taskSearchInput", "只读不应新增");
  assert.equal(await page.locator("#taskTable").textContent().then((text) => text.includes("只读不应新增")), false);
  await page.selectOption("#roleSelect", "admin");
  await page.fill("#taskSearchInput", "");

  fs.mkdirSync(fixtureDir, { recursive: true });
  const csvPath = path.join(fixtureDir, "import-preview.csv");
  fs.writeFileSync(csvPath, "\uFEFF楼栋,楼层,专业,施工单位,施工内容,计划完成时间,实际完成情况\nA1,1层,机电,机电单位,室内给水系统,2026-05-22,施工中\n", "utf8");
  await page.setInputFiles("#excelInput", csvPath);
  await page.waitForSelector("#confirmImportBtn");
  assert.ok(await page.locator("#importPreviewPanel").textContent().then((text) => text.includes("导入预览")));

  await page.click('[data-view="scope"]');
  await page.waitForSelector("#buildingGrid");
  assert.equal(await page.locator("#buildingGrid").isVisible(), true);

  await page.click('[data-view="issues"]');
  await page.waitForSelector("#issueBoard");
  assert.equal(await page.locator("#issueBoard").isVisible(), true);

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
