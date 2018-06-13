var http = require('http');

class WSGILite {
  constructor(config) {
    this.config = config ? config : {};
    this.middlewares = [];

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
    this.middlewares.some((middleware) => {
      middleware(request, response);
      return response.finished;
    });
    return response.finished;
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

module.exports = {
  WSGILite,
};
