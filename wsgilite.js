const url = require('url');

const fs = require('fs');
const cluster = require('cluster');
const numCPUs = require('os').cpus().length;

const http = require('http');
const https = require('https');

const RouteParser = require('route-parser');
const formidable = require('formidable')

const Tokens = require('csrf')

const MonadIO = require('fpEs/monadio');
const Maybe = require('fpEs/maybe');
const {
  clone,
} = require('fpEs/fp');

const {
  isAsyncFunction,
  isNextable,
  isThenable,

  extendMeta,
  actionMetaSkip404,
  actionMetaDoFnAndKeepConfigs,
  MiddlewareDefault404,
  MiddlewareDefaultCatchException,
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

    this.middlewareCatchException = MiddlewareDefaultCatchException;
  }

  matches(request, response, meta) {
    var matchesAndParam = this.routeParser.match(meta._url_path);
    if (matchesAndParam) {
      var self = this;
      let errorHandler = self.errorHandler(request, response, meta);

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
        Promise.resolve().then(()=>self.fn(request, response, meta)).catch(errorHandler).then((v)=>{
          self.tryReturn(response, v);
          return;
        });
        return;
      }

      var result;
      try {
        result = self.fn(request, response, extendMeta(meta, matchesAndParam));
      } catch (e) {
        errorHandler(e);
        return;
      }

      if (isNextable(result)) {
        result = MonadIO.generatorToPromise(()=>result);

        if (isThenable(result)) {
          Promise.resolve().then(()=>result).catch(errorHandler).then((v)=>{
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
  errorHandler(request, response, meta) {
    return (e)=>this.middlewareCatchException(request, response, meta)(e, this.wsgilite.config.debug);
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
    // this.config.createServerOptions = Maybe.just(this.config.createServerOptions).isPresent() ? this.config.createServerOptions : {};
    this.config.isHttps = Maybe.just(this.config.isHttps).isPresent() ? this.config.isHttps : false;
    this.config.csrfMaxAge = Maybe.just(this.config.csrfMaxAge).isPresent() ? this.config.csrfMaxAge : 2*1000*60*60;
    this.config.csrfMaxAge = (+this.config.csrfMaxAge) > 0 ? (+this.config.csrfMaxAge) : 2*1000*60*60;
    this.config.enableFormParsing = Maybe.just(this.config.enableFormParsing).isPresent() ? !!this.config.enableFormParsing : true;
    this.config.formidableIncomingFormSettings = Maybe.just(this.config.formidableIncomingFormSettings).isPresent() ? this.config.formidableIncomingFormSettings : {};

    this.config.processNum = Maybe.just(this.config.processNum).isPresent() ? this.config.processNum : numCPUs;
    this.config.softExitWorker = Maybe.just(this.config.softExitWorker).isPresent() ? !!this.config.softExitWorker : true;
    this.config.workerServeTimesToRestart = Maybe.just(this.config.workerServeTimesToRestart).isPresent() ? (+this.config.workerServeTimesToRestart) : 0;
    this.config.logProcessMessage = Maybe.just(this.config.logProcessMessage).isPresent() ? !!this.config.logProcessMessage : false;
    this.config.onServerCreated = Maybe.just(this.config.onServerCreated).isPresent() && typeof this.config.onServerCreated === 'function' ? this.config.onServerCreated : ()=>{};

    this.config.debug = Maybe.just(this.config.debug).isPresent() ? !!this.config.debug : false;

    this.config.middleware404 = Maybe.just(this.config.middleware404).isPresent() ? this.config.middleware404 : MiddlewareDefault404;
    this.config.middlewareCatchException = Maybe.just(this.config.middlewareCatchException).isPresent() ? this.config.middlewareCatchException : MiddlewareDefaultCatchException;

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

  redirect(path) {
    const self = this;
    return (request, response, meta)=>{
      // Brand new one
      meta = clone(meta);

      // New Path
      meta._url_path = path;
      // Possibly 404
      actionMetaSkip404(meta, true);
      // Do routing again!!
      let errorHandler = self.errorHandler(request, response, meta);
      this.enterMiddlewares(request, response, meta).catch(errorHandler).then(this.config.middleware404(request, response, meta)).catch(errorHandler);
    };
  }
  redirectAsFunction() {
    return (path) => this.redirect(path);
  }
  doRouting(request, response, meta) {
    const self = this;
    let errorHandler = self.errorHandler(request, response, meta);
    return Promise.resolve(0).then(()=>this.preprocessAndEnterMiddlewares(request, response, meta)).catch(errorHandler).then(this.config.middleware404(request, response, meta)).catch(errorHandler);
  }
  preprocessAndEnterMiddlewares(request, response, meta) {
    const self = this;
    let errorHandler = self.errorHandler(request, response, meta);

    let enterMiddlewaresFunctor = ()=>self.enterMiddlewares(request, response, meta).catch(errorHandler);
    return MonadIO.generatorToPromise(function *() {

      if (self.config.enableFormParsing) {
        return new Promise(function(resolve, reject) {
          var form = new formidable.IncomingForm();
          Object.assign(form, self.config.formidableIncomingFormSettings);
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
        }).catch(errorHandler).then(enterMiddlewaresFunctor);
      }

      return enterMiddlewaresFunctor();
    });
  }
  enterMiddlewares(request, response, meta) {
    const self = this;
    let errorHandler = self.errorHandler(request, response, meta);
    return MonadIO.generatorToPromise(function *() {
      for (var i = 0; i < self.middlewares.length; i++) {
        var middleware = self.middlewares[i];
        if (response.finished) {
          break;
        }

        var anyPromiseResult = undefined;
        try {
          anyPromiseResult = middleware(request, response, meta);
        } catch (e) {
          errorHandler(e);
          return;
        }

        if (anyPromiseResult) {
          if (isAsyncFunction(middleware)) {
            anyPromiseResult = yield anyPromiseResult.catch(errorHandler);
          } else if (isNextable(anyPromiseResult)) {
            anyPromiseResult = MonadIO.generatorToPromise(()=>anyPromiseResult).catch(errorHandler);
          }
          if (isThenable(anyPromiseResult)) {
            yield anyPromiseResult.catch(errorHandler);
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
  errorHandler(request, response, meta) {
    return (e)=>this.config.middlewareCatchException(request, response, meta)(e, this.config.debug);
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

    let listener = (request, response) => {

      let meta = {};
      self.doRouting(request, response, meta);

    };

    let serverClass = self.config.isHttps ? https : http;
    if (
      self.config.createServerOptions
      && (self.config.isHttps || Number(process.version.match(/^v(\d+\.\d+)/)[1]) >= 9.6)
    ) {
      return serverClass.createServer(self.config.createServerOptions, listener);
    } else {
      return serverClass.createServer(listener);
    }
  }

  listen(...args) {
    if (cluster.isMaster && this.config.processNum > 0) {
      this.isDying = false;

      if (this.config.logProcessMessage || this.config.debug) {console.log(`Master ${process.pid} is running`);}
      // Fork workers.
      for (let i = 0; i < this.config.processNum; i++) {
        var worker = cluster.fork();
        if (this.config.logProcessMessage || this.config.debug) {console.log(`worker ${worker.process.pid} forked`);}
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
      if (this.config.processNum <= 0) {
        this.handleSingleProcessServerSocket();
      }
      this.config.onServerCreated(this._server);
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

      if (this.config.processNum <= 0 && this._server) {
        this.terminateForSingleProcessServer();
      }
    } else {
      process.send(MSG_WSGILITE_TERMINATE_MASTER);
    }
  }
  terminateForSingleProcessServer() {

    // Close the server
    this._server.close(() => {
      if (this.config.debug) {console.log('Server closed!');}
    });
    // Destroy all open sockets
    for (var socketId in this._sockets) {
      if (this.config.debug) {console.log('socket', socketId, 'destroyed');}
      this._sockets[socketId].destroy();
    }

    setImmediate(() => this._server.emit('close'));
  }
  handleSingleProcessServerSocket() {
    // Maintain a hash of all connected sockets
    var nextSocketId = 0;
    this._sockets = {};
    this._server.on('connection', (socket) => {
      // Add a newly connected socket
      var socketId = nextSocketId++;
      this._sockets[socketId] = socket;
      if (this.config.debug) {console.log('socket', socketId, 'opened');}

      // Remove the socket when it closes
      socket.on('close', () => {
        if (this.config.debug) {console.log('socket', socketId, 'closed');}

        delete this._sockets[socketId];
      });

      // Extend socket lifetime for demo purposes
      socket.setTimeout(0);
    });
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
