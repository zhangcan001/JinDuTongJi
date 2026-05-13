const assert = require("node:assert/strict");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function findPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

function request(port, method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: pathname,
      headers: {
        ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        ...headers
      }
    }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        let json = null;
        try {
          json = data ? JSON.parse(data) : null;
        } catch {}
        resolve({ status: res.statusCode, headers: res.headers, body: data, json });
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function requestRaw(port, method, pathname, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: pathname, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function waitForServer(port) {
  const started = Date.now();
  while (Date.now() - started < 10000) {
    try {
      const response = await request(port, "GET", "/api/health");
      if (response.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("server did not start");
}

(async () => {
  const port = await findPort();
  const server = spawn(process.execPath, ["--experimental-sqlite", "server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port)
    },
    stdio: "ignore"
  });

  try {
    await waitForServer(port);

    const anonymousState = await request(port, "GET", "/api/state");
    assert.equal(anonymousState.status, 200);

    const health = await request(port, "GET", "/api/health");
    assert.equal(health.status, 200);
    assert.ok(health.json.database.endsWith("jindu.sqlite"));
    assert.ok(health.json.backupDir.endsWith("backups"));
    assert.ok(health.json.logPath.endsWith("server.log"));

    const viewerWrite = await request(port, "PUT", "/api/state", { state: { projects: [], tasks: [], issues: [] }, baseVersion: 0 }, {
      "X-Jindu-Actor": "viewer"
    });
    assert.equal(viewerWrite.status, 403);

    const invalidTaskState = await request(port, "PUT", "/api/state", {
      state: {
        projects: [{ id: "p1", name: "测试项目" }],
        tasks: [{ id: "t1", projectId: "p1", name: "坏节点", progress: 101 }],
        issues: []
      },
      force: true
    }, { "X-Jindu-Actor": "admin" });
    assert.equal(invalidTaskState.status, 400);

    const projects = await request(port, "GET", "/api/projects");
    assert.equal(projects.status, 200);
    assert.ok(Array.isArray(projects.json.projects));

    const tasks = await request(port, "GET", "/api/tasks?limit=5&offset=0");
    assert.equal(tasks.status, 200);
    assert.equal(tasks.json.limit, 5);
    assert.ok(Number.isFinite(tasks.json.total));

    const missingBackup = await request(port, "POST", "/api/backups/missing.sqlite/restore", undefined, { "X-Jindu-Actor": "admin" });
    assert.equal(missingBackup.status, 404);

    const traversal = await requestRaw(port, "GET", "/..%2fpackage.json");
    assert.equal(traversal.status, 403);
  } finally {
    server.kill();
  }

  console.log("server security tests passed");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
