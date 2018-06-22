const url = require('url');

const fs = require('fs');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

const http = require('http');

const RouteParser = require('route-parser');
const formidable = require('formidable')

const Tokens = require('csrf')

const MonadIO = require('fpEs/monadio');
const Maybe = require('fpEs/maybe');

const {
  isAsyncFunction,
  isNextable,
  isThenable,

  extendMeta,
  actionMetaSkip404,
  actionMetaDoFnAndKeepConfigs,
} = require('./common');

const {
  defMiddlewareGenerateCsrf,
  defHeaderCsrfCheckRoutes,
  defFormCsrfCheckRoutes,

  getCSRF_token,
  generateCSRFFormInput,
} = require('./csrf');

function MiddlewareRequestInfosToMeta(request, response, meta) {
  var url_parts = url.parse(request.url, true);
  actionMetaDoFnAndKeepConfigs(()=>{
    extendMeta(meta, {
      ...url_parts.query,
      _url_path: url_parts.pathname,
    });
  }, meta);
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
    var matchesAndParam = this.routeParser.match(meta._url_path);
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

          console.log(`Execution Timeout: '${self.rule}' -> ${self.timeout}ms`);

          // NOTE This is for cluster worker exiting
          process.exit(0);
        }, self.timeout);
      }

      if (isAsyncFunction(self.fn)) {
        Promise.resolve().then(()=>self.fn(request, response, meta)).then((v)=>{
          self.tryReturn(response, v);
          return;
        });
        return;
      }

      var result = self.fn(request, response, extendMeta(meta, matchesAndParam));
      if (isNextable(result)) {
        result = MonadIO.generatorToPromise(()=>result);

        if (isThenable(result)) {
          Promise.resolve().then(()=>result).then((v)=>{
            self.tryReturn(response, v);
            return;
          });
          return;
        }
      }

      self.tryReturn(response, result);
    }
  }
  tryReturn(response, result) {
    if (Maybe.just(result).isPresent()) {
      response.end(typeof result === 'string' ? result : JSON.stringify(result));

      if (this.wsgilite.config.workerServeTimesToRestart > 0) {
        this.wsgilite.serveTimes ++;
        if (this.wsgilite.serveTimes >= this.wsgilite.config.workerServeTimesToRestart && cluster.isWorker) {
          // NOTE The cluster worker will auto-restart to avoid memory leaks.
          process.exit(0);
        }
      }
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

const MSG_WSGILITE_TERMINATE_MASTER = 'MSG_WSGILITE_TERMINATE_MASTER';
const MSG_WSGILITE_TERMINATE_WORKER = 'MSG_WSGILITE_TERMINATE_WORKER';
class WSGILite extends DefSubRoute {
  constructor(config) {
    super(null, '');
    this.config = config ? config : {};
    this.config.csrfMaxAge = Maybe.just(this.config.csrfMaxAge).isPresent() ? this.config.csrfMaxAge : 2*1000*60*60;
    this.config.enableFormParsing = Maybe.just(this.config.enableFormParsing).isPresent() ? this.config.enableFormParsing : true;

    this.config.processNum = Maybe.just(this.config.processNum).isPresent() ? this.config.processNum : numCPUs;
    this.config.softExitWorker = Maybe.just(this.config.softExitWorker).isPresent() ? this.config.softExitWorker : true;
    this.config.workerServeTimesToRestart = Maybe.just(this.config.workerServeTimesToRestart).isPresent() ? this.config.workerServeTimesToRestart : 0;
    this.config.logProcessMessage = Maybe.just(this.config.logProcessMessage).isPresent() ? this.config.logProcessMessage : false;

    this.config.debug = Maybe.just(this.config.debug).isPresent() ? this.config.debug : false;

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
    this.workers = [];
    this.isDying = false;
    this.serveTimes = 0;
  }

  doRouting(request, response, meta) {
    const self = this;
    return Promise.resolve(0).then(()=>self.enterMiddlewares(request, response, meta)).then((finished) => {
      if (!finished) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'text/plain');
        response.end('404 File not found.');
      }
    });
  }
  enterMiddlewares(request, response, meta) {
    const self = this;
    return MonadIO.generatorToPromise(function *() {

      if (self.config.enableFormParsing) {
        var err = yield new Promise(function(resolve, reject) {
          var form = new formidable.IncomingForm();
          form.parse(request, function(err, fields, files) {
            if (err) {
              reject(err);
              return;
            }

            actionMetaDoFnAndKeepConfigs(()=>{
              meta = Object.assign(meta, fields, files);
            }, meta);

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
          // NOTE Dont wait for result if matched
          // if (anyPromiseResult) {
          //   yield anyPromiseResult;
          // }

          if (response.finished || meta._skip404) {
            break;
          }
        }
      }

      return response.finished || meta._skip404;
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
      } else {
        actionMetaSkip404(meta, true);
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

  createServer() {
    const self = this;
    return http.createServer((request, response) => {

      let meta = {};
      self.doRouting(request, response, meta);

    });
  }

  listen(...args) {
    if (cluster.isMaster) {
      this.isDying = false;

      if (this.config.logProcessMessage || this.config.debug) {console.log(`Master ${process.pid} is running`);}
      // Fork workers.
      for (let i = 0; i < this.config.processNum; i++) {
        var worker = cluster.fork();
        worker.on('message', (msg) => {
          if (this.config.logProcessMessage || this.config.debug) {console.log(msg);}
          if (msg === MSG_WSGILITE_TERMINATE_MASTER) {
            this.terminate();
          }
        })
        this.workers.push(worker);
      }
      cluster.on('exit', (worker, code, signal) => {
        if (this.config.logProcessMessage || this.config.debug) {console.log(`worker ${worker.process.pid} died`);}
        if (!this.isDying) {
          this.workers.push(cluster.fork());
          return;
        }
      });
    } else {
      process.on('message', (msg) => {
        if (this.config.logProcessMessage || this.config.debug) {console.log(msg);}
        if (msg == MSG_WSGILITE_TERMINATE_WORKER) {
          process.exit(0);
        }
      });
      // Workers can share any TCP connection
      // In this case it is an HTTP server
      this._server = this.createServer();
      this._server.timeout = 0;
      this._server.listen(...args);
      if (this.config.logProcessMessage || this.config.debug) {console.log(`Worker ${process.pid} started`);}
    }
  }
  terminate() {
    if (cluster.isMaster) {
      this.isDying = true;
      this.workers.forEach((worker) => {
        if (this.config.softExitWorker) {
          worker.send(MSG_WSGILITE_TERMINATE_WORKER);
        } else {
          worker.kill();
        }
      });
      while (this.workers.length > 0) {
          this.workers.pop();
      }
    } else {
      process.send(MSG_WSGILITE_TERMINATE_MASTER);
    }
  }

  // get server() {
  //   return this._server;
  // }
}

module.exports = {
  Route,
  WSGILite,

  MiddlewareRequestInfosToMeta,
  defMiddlewareNoCORS,
};
