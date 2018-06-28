# wsgiLite.js

[![npm download](https://img.shields.io/npm/dt/wsgilite.svg)](https://www.npmjs.com/package/wsgilite)
[![npm version](https://img.shields.io/npm/v/wsgilite.svg)](https://www.npmjs.com/package/wsgilite)

[![license](https://img.shields.io/github/license/TeaEntityLab/wsgiLite.js.svg?style=social&label=License)](https://github.com/TeaEntityLab/wsgiLite.js)
[![stars](https://img.shields.io/github/stars/TeaEntityLab/wsgiLite.js.svg?style=social&label=Stars)](https://github.com/TeaEntityLab/wsgiLite.js)
[![forks](https://img.shields.io/github/forks/TeaEntityLab/wsgiLite.js.svg?style=social&label=Fork)](https://github.com/TeaEntityLab/wsgiLite.js)

Lightweight WSGI framework, inspired by ROR &amp; Laravel frameworks

# Why

Though there're many frameworks have done WSGI server features, however they are somehow a little heavy;

Thus I make this project, and make it simple & almost just a pure nodejs http server.

# Features

* Built-in
  * Execution Timeout Customizing for each route
  * Exception-Handling(Exceptions in Middleware & Route handlers will be caught)
  * CSRF Checking
    * (built by csrf([npm](https://www.npmjs.com/package/csrf) [github](https://github.com/pillarjs/csrf)))
  * Path parameters parsing, routing path & methods matching
    * (built by route-parser([npm](https://www.npmjs.com/package/route-parser) [github](https://github.com/rcs/route-parser)))
  * Query parameters(built-in module **url**)
  * Form fields parsing
    * (built by formidable([npm](https://www.npmjs.com/package/formidable) [github](https://github.com/felixge/node-formidable)))
  * FastCGI style multiple processes serving(depending on CPU cores by default), reducing response time
    * (built-in module **cluster**)
* Optional extension
  * Static files serving(built-in module **fs**)
  * Template
    * (built by blueimp-tmpl([npm](https://www.npmjs.com/package/blueimp-tmpl) [github](https://github.com/blueimp/JavaScript-Templates)))

## Installation

```bash
npm i wsgilite
```

## Examples

```javascript
const {
  WSGILite,
} = require('wsgilite/wsgilite');
const {
  Template,
} = require('wsgilite/template');
const {
  mimeMap,
  defMiddlewareServeFileStatic,
  defMiddlewareServeFileStaticWithDirList,
} = require('wsgilite/file');
const {
  defFormCsrfCheckRoutes,
  defHeaderCsrfCheckRoutes,
  getCSRF_token,
  generateCSRFFormInput,
} = require('wsgilite/csrf');

// Settings

const wsgilite = new WSGILite({
  secret: 'abcdefg', // The secret key for CSRF
  logProcessMessage: true, // Log the multiple processes starting/ending messages.
  debug: true, // Debug mode, it will show stacktrace of errors in the responses
  isHttps: false, // Is it a https server?

  processNum: require('os').cpus().length, // N + 1 processes (cluster: 1 * master + n * fastcgi style http/https serving)
  // processNum: 0, // Single process
  // createServerOptions: {}, // Additional createServer options for http/https.createServer(options)
  onServerCreated: function (httpServer) {
    httpServer.timeout = 60*1000;
    console.log('server.timeout set');
  }, // Callback on one of servers created(this will be called in Multiple processes)
  onMessageMaster: function (worker, msg, handle) {
    console.log(`master got message: ${msg.event}`);
  }, // Optional: We could monitor and handle communications between cluster master & workers
  onMessageWorker: function (msg, handle) {
    console.log(`worker got message: ${msg.event}`);
  }, // Optional: We could monitor and handle communications between cluster master & workers

  workerServeTimesToRestart: 500, // Each child worker will auto-restart after it served 500 requests
});
const redirect = wsgilite.redirectAsFunction(); // Define redirect() in simple & shorter function style.
const template = new Template({
  baseDir: "demo/template", // Define the base dir of template files
});
const render = template.renderAsFunction(); // Define render() in simple & shorter function style.

// Middlewares

wsgilite.addMiddleware(async (request, response, meta)=>{
  meta.msg3 = 'I got it3';
});
wsgilite.addMiddleware(function * (request, response, meta) {
  return Promise.resolve(0).then(()=>meta.msg2 = 'I got it2');
});
wsgilite.addMiddleware((request, response, meta)=>{
  meta.msg = 'I got it';
});
// CSRF routes defining
wsgilite.addMiddleware(defFormCsrfCheckRoutes([
  '/upload', // Your can define more paths here
], wsgilite));
wsgilite.addMiddleware(defHeaderCsrfCheckRoutes([
  '/upload2', // Your can define more paths here
], wsgilite));

// Routes

// Print the `meta` object
wsgilite.GET('/', (request, response, meta)=>{
  return JSON.stringify(meta); // {"_skip404":true,"_url_path":"/","msg3":"I got it3","msg2":"I got it2","msg":"I got it"}
});

// The server will terminate
wsgilite.GET('/terminate', (request, response, meta)=>{
  response.end("terminate");
  wsgilite.terminate();
});

// Path parameters(until `/` or `?` or the end)
wsgilite.GET('/user/:id', function *(request, response, meta) {
  return yield Promise.resolve(meta); // {"_skip404":true,"_url_path":"/user/theID","msg3":"I got it3","msg2":"I got it2","msg":"I got it","id":"theID"}
});
// Path parameters(until `?` or the end)
wsgilite.GET('/file*relativePath', (request, response, meta)=>{
  defMiddlewareServeFileStatic('demo')(request, response, meta);
});

// Show the CSRF usages (token only & a form hidden input with the token)
wsgilite.GET('/csrf', function *(request, response, meta) {
  return getCSRF_token(request, response) + ` ${generateCSRFFormInput(request, response)}`; // CSRF_token
});
// CSRF checking (form)
wsgilite.POST('/upload', (request, response, meta)=>{
  return 'CSRF_token ok'; // CSRF_token ok
});
// CSRF checking (header)
wsgilite.POST('/upload2', (request, response, meta)=>{
  return 'x-csrf-token ok'; // x-csrf-token ok
});
wsgilite.GET('/heartbeat', async (request, response, meta)=>{
  return "ok"; // ok
});

// Redirect to an existing route
wsgilite.GET('/heartbeat2', async (request, response, meta)=>{
  redirect('/heartbeat')(request, response, meta); // ok
});
// Redirect to a non-existing route(will 404)
wsgilite.GET('/heartbeat3', async (request, response, meta)=>{
  redirect('/heartbeat999')(request, response, meta); // 404 File not found.
});

// Nested routing definitions
wsgilite.defSubRoute('test', function (defSub) {
  defSub.defSubRoute('change', function (defSub) {
    defSub.defSubRoute('for', function (defSub) {
      defSub.GET('it', async (request, response, meta)=>{
        return "Here we go"; // Here we go
      })
    });
  });
});

// Template usages
wsgilite.GET('/template', async (request, response, meta)=>{
  return render("features", {
            "title": "JavaScript Templates",
            "url": "https://github.com/blueimp/JavaScript-Templates",
            "features": [
                "lightweight & fast",
                "powerful",
                "zero dependencies"
            ]
        }).catch((e)=>{
          response.statusCode = 500;
          return e.stack;
        })
        ; // ok
});

// Post jobs to cluster master(if wsgilite.config.processNum > 0)
wsgilite.addClusterMasterRequestHandler(async (worker, msg, handle) => {
  // throw new Error("There's an exception");
  if (msg && msg.data && msg.data.action === 'readrecord') {
    return {data: 'user01'};
  }
});
wsgilite.GET('/requestActionOnClusterMaster', async function (request, response, meta) {
  // {"event":"MSG_WSGILITE_DO_THINGS_WORKER_SUCCESS","result":[{"data":"user01"}]}
  return wsgilite.requestActionOnClusterMaster({action: 'readrecord'}).catch((e)=>{
    console.log(`I got error: ${e.errorMessage}`);
    return e.errorMessage;
  });
});
// Post jobs to cluster master(Timeout cases)
wsgilite.addClusterMasterRequestHandler(async (worker, msg, handle) => {
  if (msg && msg.data && msg.data.action === 'streaming_timeout') {
    var rp = require('request-promise-native');
    await rp.get('https://www.sample-videos.com/video/mp4/240/big_buck_bunny_240p_30mb.mp4');
    return 'ok';
  }
});
wsgilite.GET('/requestActionOnClusterMasterTimeout', async function (request, response, meta) {
  // Timeout for 3000 ms
  return wsgilite.requestActionOnClusterMaster({action: 'streaming_timeout'}, 3000).catch((e)=>{
    console.log(`I got error: ${e.errorStacktrace}`);
    return e.errorStacktrace;
  });
});
// if (require('cluster').isMaster) {
//   // It could be called on cluster master
//   wsgilite.requestActionOnClusterMaster({action: 'readrecord'}).catch((e)=>{
//     return e.errorMessage;
//   }).then((msg)=>console.log(msg));
// }

// Exception
wsgilite.GET('/exception', async function (request, response, meta) {
  throw new Error("There's an exception"); // Error: There's an exception
});

// Timeout
let routeTimeout = wsgilite.GET('/timeout', async function (request, response, meta) {
  var rp = require('request-promise-native');
  await rp.get('https://www.sample-videos.com/video/mp4/240/big_buck_bunny_240p_30mb.mp4');
  return "ok";
});
routeTimeout.timeout = 5000;

wsgilite.listen(3333, 'localhost', function () {
  console.log('Server up');
});

```
