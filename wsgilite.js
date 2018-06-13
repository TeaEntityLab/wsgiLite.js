var url = require('url');
var path = require('path');

var fs = require('fs');

var http = require('http');
var RouteParser = require('route-parser');

// maps file extention to MIME typere
const mimeMap = {
  '.ico': 'image/x-icon',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword'
};

function extendMeta(meta, addition) {
  return Object.assign(meta, addition);
}
function MiddlewareRequestInfosToMeta(request, response, meta) {
  extendMeta(meta, {
    path: url.parse(request.url).pathname,
  });
}
function defineNoCORS(methods) {
  methods = methods ? methods : ['GET','POST','OPTIONS','PUT','PATCH','DELETE'];
  return function (request, response, meta) {
    // Website you wish to allow to connect
    response.setHeader('Access-Control-Allow-Origin', '*');

    // Request methods you wish to allow
    response.setHeader('Access-Control-Allow-Methods', methods.join(', '));

    // Request headers you wish to allow
    response.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type');

    // Set to true if you need the website to include cookies in the requests sent
    // to the API (e.g. in case you use sessions)
    response.setHeader('Access-Control-Allow-Credentials', true);
  }
}
function MiddlewareSkip404(meta) {
  meta.skip404 = true;
  return meta;
}
function defServeFileStatic(baseDir) {
  baseDir = baseDir ? baseDir : '.';

  return function (request, response, meta) {
    const pathname = meta.relativePath ? meta.relativePath : meta.path;
    const ext = path.parse(pathname).ext;
    const finalPath = `${__dirname}/${baseDir}/${pathname}`;

    var exist = fs.existsSync(finalPath);
    if(!exist) {
      return;
    }
    MiddlewareSkip404(meta);

    response.writeHead(200, {
      'Transfer-Encoding': 'chunked',
      'Content-type': mimeMap[ext] || 'text/plain',
      'X-Content-Type-Options': 'nosniff',
    });
    // read file from file system
    fs.readFile(finalPath, function(err, data){
      if(err){
        response.statusCode = 500;
        response.end(`Error getting the file: ${err}.`);
      } else {
        // if the file is found, set Content-type and send data
        response.end(data);
      }
    });
  }
}

class Route {
  constructor(rule, fn) {
    this.rule = rule;
    this.fn = fn;

    this.routeParser = new RouteParser(this.rule);
  }

  matches(request, response, meta) {
    var matchesAndParam = this.routeParser.match(url.parse(request.url).pathname);
    if (matchesAndParam) {
      var result = this.fn(request, response, extendMeta(meta, matchesAndParam));
      if (result) {
        response.end(typeof result === 'string' ? result : JSON.stringify(result));
      }
    }
  }
}

class WSGILite {
  constructor(config) {
    this.config = config ? config : {};
    this.middlewares = [
      MiddlewareRequestInfosToMeta,
    ];
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

    let finishedByMiddleware = false;

    this.middlewares.some((middleware) => {
      finishedByMiddleware = finishedByMiddleware || middleware(request, response, meta);
      return response.finished && finishedByMiddleware;
    });
    if ((! response.finished) && (! finishedByMiddleware)) {
      this.routes.some((route) => {
        route.matches(request, response, meta);
        return response.finished;
      });
    }
    return response.finished || finishedByMiddleware || meta.skip404;
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

  MiddlewareRequestInfosToMeta,
  defineNoCORS,
  defServeFileStatic,
  extendMeta,
  MiddlewareSkip404,
};
