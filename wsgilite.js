var url = require("url");
var http = require('http');
var RouteParser = require('route-parser');


class Route {
  constructor(rule, fn) {
    this.rule = rule;
    this.fn = fn;

    this.routeParser = new RouteParser(this.rule);
  }

  matches(request, response, meta) {
    var matchesAndParam = this.routeParser.match(url.parse(request.url).pathname);
    if (matchesAndParam) {
      var result = this.fn(request, response, Object.assign(meta, matchesAndParam));
      if (result) {
        response.end(typeof result === 'string' ? result : JSON.stringify(result));
      }
    }
  }
}

class WSGILite {
  constructor(config) {
    this.config = config ? config : {};
    this.middlewares = [];
    this.routes = [];

    const self = this;
    self._server = http.createServer((request, response) => {

      Promise.resolve(0).then(() => {
        let finished = self.enterMiddlewares(request, response);
        if (!finished) {
          response.statusCode = 404;
          response.setHeader('Content-Type', 'text/plain');
          response.end('File not found.');
        }
      });

    });
  }

  enterMiddlewares(request, response) {
    let meta = {};

    this.middlewares.some((middleware) => {
      middleware(request, response, meta);
      return response.finished;
    });
    if (! response.finished) {
      this.routes.some((route) => {
        route.matches(request, response, meta);
        return response.finished;
      });
    }
    return response.finished;
  }

  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }
  removeMiddleware(middleware) {
    this.middlewares = this.middlewares.filter((item)=>item !== middleware);
  }
  addRoute(rule, fn) {
    this.routes.push(new Route(rule, fn));
  }
  removeRoute(obj) {
    let matches;
    if (typeof obj === 'function') {
      matches = (item)=>item.fn !== obj;
    } else {
      matches = (item)=>item.rule !== obj;
    }
    this.routes = this.routes.filter(matches);
  }

  listen(...args) {
    return this.server.listen(...args);
  }

  get server() {
    return this._server;
  }
}

module.exports = {
  Route,
  WSGILite,
};
