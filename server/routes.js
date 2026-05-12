function createRouteDispatcher(routes = []) {
  const routeList = Array.isArray(routes) ? routes : [];
  return async function routeDispatcher(request, response, context = {}) {
    const parsedUrl = new URL(request.url, `http://${context.host || "127.0.0.1"}:${context.port || 4173}`);
    for (const route of routeList) {
      const methodMatches = !route.method || route.method === request.method;
      const pathMatches = typeof route.match === "function" ? route.match(parsedUrl, request) : route.path === parsedUrl.pathname;
      if (!methodMatches || !pathMatches) continue;
      await route.handler(request, response, parsedUrl, context);
      return true;
    }
    return false;
  };
}

module.exports = { createRouteDispatcher };
