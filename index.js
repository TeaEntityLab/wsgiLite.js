var http = require('http');
var fp = require('fpEs');

class WSGILite {
  constructor() {
    this.middlewares = [];

    const self = this;
    self._server = http.createServer((request, response) => {
      self.enterMiddlewares(request, response);

      // response.statusCode = 200;
      // response.setHeader('Content-Type', 'text/plain');
      // response.end('Hello World!\n');
    });
  }

  enterMiddlewares(request, response) {
    this.middlewares.some((middleware)=>{
      middleware(request, response);
      if (response.finished) {
        return true;
      }
    });
  }

  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }
  removeMiddleware(middleware) {
    this.middlewares = this.middlewares.filter((item)=>item !== middleware);
  }

  listen(...args) {
    return this.server.listen(...args);
  }

  get server() {
    return this._server;
  }
}

module.exports = WSGILite;
