const url = require('url');
const path = require('path');
const sep = path.sep;

const fs = require('fs');

const http = require('http');

const RouteParser = require('route-parser');
const formidable = require('formidable')

const Cookies = require( "cookies" );
const Tokens = require('csrf')

const MonadIO = require('fpEs/monadio');
const Maybe = require('fpEs/maybe');

const AsyncFunction = (async () => {}).constructor;
const GeneratorFunction = (function* () {}).constructor;
function isAsyncFunction(fn) {
  // return fn instanceof AsyncFunction && AsyncFunction !== Function && AsyncFunction !== GeneratorFunction === true;
  return fn instanceof AsyncFunction;
}
function isNextable(obj) {
  return obj && typeof obj.next === 'function';
}
function isThenable(obj) {
  return obj && typeof obj.then === 'function';
}

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
  var url_parts = url.parse(request.url, true);
  var skip404 = meta.skip404;
  extendMeta(meta, {
    ...url_parts.query,
    url_path: url_parts.pathname,
  });
  meta.skip404 = skip404;
}
function defCheckRoutes(rules, match) {
  return function (request, response, meta) {
    var result = rules.filter((rule)=>(new RouteParser(rule)).match(url.parse(request.url).pathname));
    if ((!result) || result.length <= 0) {
      // Not target
      return;
    }

    match(request, response, meta);
  }
}
function getCSRF_token(request, response) {
  var cookies = new Cookies(request, response);
  var CSRF_token = cookies.get('CSRF_token');
  return CSRF_token;
}
function generateCSRFFormInput(request, response) {
  return `<input type="hidden" name="CSRF_token" id="csrf-token" value="${getCSRF_token(request, response)}" />`;
}
function defMiddlewareGenerateCsrf(wsgilite) {
  if (!wsgilite) {throw new Error('wsgilite is not given')}

  return function (request, response, meta) {
    var CSRF_token = getCSRF_token(request, response);
    if ((!CSRF_token) || (!wsgilite.tokens.verify(wsgilite.secret, CSRF_token))) {

      var token = wsgilite.tokens.create(wsgilite.secret);

      var cookies = new Cookies(request, response);
      cookies.set('CSRF_token', token, {
        maxAge: wsgilite.config.csrfMaxAge,
      });
    }
  }
}
function defFormCsrfCheckRoutes(rules, wsgilite) {
  if (!wsgilite) {throw new Error('wsgilite is not given')}

  return defCheckRoutes(rules, function (request, response, meta) {
    var CSRF_token = getCSRF_token(request, response);

    if (CSRF_token != meta.CSRF_token || (!wsgilite.tokens.verify(wsgilite.secret, CSRF_token))) {
      response.statusCode = 403;
      response.setHeader('Content-Type', 'text/plain');
      response.end('CSRF detected.');
    }
  });
}
function defHeaderCsrfCheckRoutes(rules, wsgilite) {
  if (!wsgilite) {throw new Error('wsgilite is not given')}

  return defCheckRoutes(rules, function (request, response, meta) {
    var CSRF_token = request.headers['x-csrf-token'];

    if ((CSRF_token != meta.CSRF_token) || (!wsgilite.tokens.verify(wsgilite.secret, CSRF_token))) {
      response.statusCode = 403;
      response.setHeader('Content-Type', 'text/plain');
      response.end('CSRF detected.');
    }
  });
}
function defMiddlewareNoCORS(methods) {
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
function actionMetaSkip404(meta) {
  meta.skip404 = true;
  return meta;
}
function defMiddlewareServeFileStatic(baseDir) {
  baseDir = baseDir ? baseDir : '.';

  return function (request, response, meta) {
    const pathname = meta.relativePath ? meta.relativePath : meta.url_path;
    const ext = path.parse(pathname).ext;
    const finalPath = `${__dirname}${sep}${baseDir}${sep}${pathname}`;

    var exist = fs.existsSync(finalPath);
    if(!exist) {
      return;
    }
    actionMetaSkip404(meta);

    response.writeHead(200, {
      'Transfer-Encoding': 'chunked',
      'Content-type': mimeMap[ext] || 'text/plain',
      'X-Content-Type-Options': 'nosniff',
    });
    // read file from file

    var stream = fs.createReadStream(finalPath);

    stream.on('data', (chunk) => {
      response.write(chunk);
    });
    stream.on('error', function(err){
      response.statusCode = 500;
      response.end(`Error getting the file: ${err}.`);
    });
    stream.on('end', () => {
      response.end();
    });
  }
}

class Route {
  constructor(wsgilite, rule, fn) {
    this.wsgilite = wsgilite;
    this.rule = rule;
    this.fn = fn;

    this.timeout = 120*1000;
    this.timeoutMessage = '504 Gateway Timeout';

    this.routeParser = new RouteParser(this.rule);
  }

  matches(request, response, meta) {
    var matchesAndParam = this.routeParser.match(url.parse(request.url).pathname);
    if (matchesAndParam) {
      var self = this;

      actionMetaSkip404(meta);
      if (self.timeout > 0) {
        setTimeout(()=>{
          if (response.finished) {
            return;
          }

          response.statusCode = 504;
          response.end(self.timeoutMessage);

          console.log(`Execution Timeout: '${self.rule}' -> ${self.timeout}ms`)
        }, self.timeout);
      }

      if (isAsyncFunction(self.fn)) {
        return self.fn(request, response, meta).then((v)=>{
          self.tryReturn(response, v);
          return;
        });
      }

      var result = self.fn(request, response, extendMeta(meta, matchesAndParam));
      if (isNextable(result)) {
        result = MonadIO.generatorToPromise(()=>result);

        if (isThenable(result)) {
          return result.then((v)=>{
            self.tryReturn(response, v);
            return;
          });
        }
      }

      self.tryReturn(response, result);
    }
  }
  tryReturn(response, result) {
    if (Maybe.just(result).isPresent()) {
      response.end(typeof result === 'string' ? result : JSON.stringify(result));
    }
  }
}

class DefSubRoute {
  constructor(parent, rule) {
    this.parent = parent;
    this.rule = rule;
  }

  defSubRoute(rule, defFn) {
    defFn(new DefSubRoute(this, rule));
  }

  defMethod(method, rule, fn) {
    var upperPath = `${this.rule}/${rule}`;
    return this.parent.defMethod(method, upperPath, fn);
  }

  GET(rule, fn) {
    return this.defMethod('GET', rule, fn);
  }
  HEAD(rule, fn) {
    return this.defMethod('HEAD', rule, fn);
  }
  POST(rule, fn) {
    return this.defMethod('POST', rule, fn);
  }
  PUT(rule, fn) {
    return this.defMethod('PUT', rule, fn);
  }
  DELETE(rule, fn) {
    return this.defMethod('DELETE', rule, fn);
  }
  CONNECT(rule, fn) {
    return this.defMethod('CONNECT', rule, fn);
  }
  OPTIONS(rule, fn) {
    return this.defMethod('OPTIONS', rule, fn);
  }
  TRACE(rule, fn) {
    return this.defMethod('TRACE', rule, fn);
  }
  PATCH(rule, fn) {
    return this.defMethod('PATCH', rule, fn);
  }
}

class WSGILite extends DefSubRoute {
  constructor(config) {
    super(null, '');
    this.config = config ? config : {};
    this.config.csrfMaxAge = this.config.csrfMaxAge ? this.config.csrfMaxAge : 2*1000*60*60;
    this.config.enableFormParsing = this.config.enableFormParsing ? this.config.enableFormParsing : true;
    this.tokens = new Tokens();
    // this.secret = this.config.secret ? this.config.secret : this.tokens.secretSync();
    if (!this.config.secret) {
      throw new Error('WSGILite needs secret key.\nFor Examples:\nvar server = new WSGILite({"secret":"asdfasdf"});');
    }
    this.secret = this.config.secret;
    this.middlewares = [
      MiddlewareRequestInfosToMeta,
      defMiddlewareGenerateCsrf(this),
    ];
    this.routes = [];

    const self = this;
    self._server = http.createServer((request, response) => {

      Promise.resolve(0).then(()=>self.enterMiddlewares(request, response)).then((finished) => {
        if (!finished) {
          response.statusCode = 404;
          response.setHeader('Content-Type', 'text/plain');
          response.end('404 File not found.');
        }
      });

    });
  }

  enterMiddlewares(request, response) {
    const self = this;
    return MonadIO.generatorToPromise(function *() {
      let meta = {};

      if (self.config.enableFormParsing) {
        var err = yield new Promise(function(resolve, reject) {
          var form = new formidable.IncomingForm();
          form.parse(request, function(err, fields, files) {
            if (err) {
              reject(err);
              return;
            }

            let skip404 = meta.skip404;
            meta = Object.assign(meta, fields, files);
            meta.skip404 = skip404;
            resolve();
          });
        });

        if (err) {
          console.log(err);
          response.statusCode = 500;
          response.setHeader('Content-Type', 'text/plain');
          response.end('500 Internal Server Error');
          return true;
        }
      }

      for (var i = 0; i < self.middlewares.length; i++) {
        var middleware = self.middlewares[i];
        if (response.finished) {
          break;
        }

        var anyPromiseResult = middleware(request, response, meta);
        if (anyPromiseResult) {
          if (isAsyncFunction(middleware)) {
            anyPromiseResult = yield anyPromiseResult;
          } else if (isNextable(anyPromiseResult)) {
            anyPromiseResult = MonadIO.generatorToPromise(()=>anyPromiseResult);
          }
          if (isThenable(anyPromiseResult)) {
            yield anyPromiseResult;
          }
        }
      }

      if (! response.finished) {

        for (var i = 0; i < self.routes.length; i++) {
          let route = self.routes[i]
          var anyPromiseResult = route.matches(request, response, meta);
          if (anyPromiseResult) {
            yield anyPromiseResult;
          }

          if (response.finished || meta.skip404) {
            break;
          }
        }
      }

      return response.finished || meta.skip404;
    });
  }

  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }
  removeMiddleware(middleware) {
    this.middlewares = this.middlewares.filter((item)=>item !== middleware);
  }
  addRoute(rule, fn) {
    var route = new Route(this, rule, fn);
    this.routes.push(route);

    return route;
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
  defMethod(method, rule, fn) {
    var checker = function (request, response, meta) {
      if (request.method == method) {
        return fn(request, response, meta);
      }
    };

    if (isAsyncFunction(fn)) {
      return this.addRoute(rule, async function (request, response, meta) {
        return checker(request, response, meta);
      });
    } else {
      return this.addRoute(rule, checker);
    }
  }
  defSubRoute(rule, defFn) {
    if ((!rule) || rule.length <= 0) {
      rule = '/';
    }
    if (rule[0] !== '/') {
      rule = `/${rule}`;
    }
    DefSubRoute.prototype.defSubRoute.call(this, rule, defFn);
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

  extendMeta,
  actionMetaSkip404,

  defMiddlewareNoCORS,
  defMiddlewareServeFileStatic,
  defHeaderCsrfCheckRoutes,
  defFormCsrfCheckRoutes,

  getCSRF_token,
  generateCSRFFormInput,
};
