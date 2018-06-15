const url = require('url');
const path = require('path');
const sep = path.sep;

const fs = require('fs');

const http = require('http');

const RouteParser = require('route-parser');
const formidable = require('formidable')

const csrfCheck = require('server-csrf-check');
const Cookies = require( "cookies" );
const Tokens = require('csrf')

const MonadIO = require('fpEs/monadio');

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
  extendMeta(meta, {
    ...url_parts.query,
    url_path: url_parts.pathname,
  });
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
    if ((! csrfCheck(request, response)) || false) {
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
    this.config.csrfMaxAge = this.config.csrfMaxAge ? this.config.csrfMaxAge : 2*1000*60*60;
    this.config.enableFormParsing = this.config.enableFormParsing ? this.config.enableFormParsing : true;
    this.tokens = new Tokens();
    this.secret = this.config.secret ? this.config.secret : this.tokens.secretSync();
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
    return MonadIO.doM(function *() {
      let meta = {};

      if (self.config.enableFormParsing) {
        var err = yield new Promise(function(resolve, reject) {
          var form = new formidable.IncomingForm();
          form.parse(request, function(err, fields, files) {
            if (err) {
              reject(err);
              return;
            }

            meta = Object.assign(meta, fields, files);
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

      let finishedByMiddleware = false;
      self.middlewares.some((middleware) => {
        finishedByMiddleware = finishedByMiddleware || middleware(request, response, meta);
        return response.finished && finishedByMiddleware;
      });

      if ((! response.finished) && (! finishedByMiddleware)) {
        self.routes.some((route) => {
          route.matches(request, response, meta);
          return response.finished;
        });
      }
      return response.finished || finishedByMiddleware || meta.skip404;
    });
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
  defMethod(method, rule, fn) {
    this.addRoute(rule, function (request, response, meta) {
      if (request.method == method) {
        return fn(request, response, meta);
      }
    });
  }

  GET(rule, fn) {
    this.defMethod('GET', rule, fn);
  }
  HEAD(rule, fn) {
    this.defMethod('HEAD', rule, fn);
  }
  POST(rule, fn) {
    this.defMethod('POST', rule, fn);
  }
  PUT(rule, fn) {
    this.defMethod('PUT', rule, fn);
  }
  DELETE(rule, fn) {
    this.defMethod('DELETE', rule, fn);
  }
  CONNECT(rule, fn) {
    this.defMethod('CONNECT', rule, fn);
  }
  OPTIONS(rule, fn) {
    this.defMethod('OPTIONS', rule, fn);
  }
  TRACE(rule, fn) {
    this.defMethod('TRACE', rule, fn);
  }
  PATCH(rule, fn) {
    this.defMethod('PATCH', rule, fn);
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
