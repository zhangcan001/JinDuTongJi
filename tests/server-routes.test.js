const assert = require("node:assert/strict");
const { createRouteDispatcher } = require("../server/routes");
const legacyRoutes = require("../server/routes-static");

async function run() {
  let status = 0;
  let ended = "";
  const response = {
    writeHead(nextStatus) {
      status = nextStatus;
    },
    end(body = "") {
      ended = body;
    }
  };

  const dispatcher = createRouteDispatcher([
    {
      method: "GET",
      path: "/api/ping",
      handler(request, res) {
        assert.equal(request.method, "GET");
        res.writeHead(204);
        res.end("pong");
      }
    }
  ]);

  assert.equal(await dispatcher({ method: "GET", url: "/api/ping" }, response), true);
  assert.equal(status, 204);
  assert.equal(ended, "pong");
  assert.equal(await dispatcher({ method: "POST", url: "/api/ping" }, response), false);
  assert.equal(await dispatcher({ method: "GET", url: "/api/miss" }, response), false);
  assert.equal(legacyRoutes.createRouteDispatcher, createRouteDispatcher);
}

run()
  .then(() => console.log("server routes tests passed"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
