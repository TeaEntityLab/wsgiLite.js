# wsgiLite.js

[![npm download](https://img.shields.io/npm/dt/wsgilite.svg)](https://www.npmjs.com/package/wsgilite)
[![npm version](https://img.shields.io/npm/v/wsgilite.svg)](https://www.npmjs.com/package/wsgilite)

[![license](https://img.shields.io/github/license/TeaEntityLab/wsgiLite.js.svg?style=social&label=License)](https://github.com/TeaEntityLab/wsgiLite.js)
[![stars](https://img.shields.io/github/stars/TeaEntityLab/wsgiLite.js.svg?style=social&label=Stars)](https://github.com/TeaEntityLab/wsgiLite.js)
[![forks](https://img.shields.io/github/forks/TeaEntityLab/wsgiLite.js.svg?style=social&label=Fork)](https://github.com/TeaEntityLab/wsgiLite.js)

Lightweight WSGI framework, inspired by ROR &amp; Laravel frameworks

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
} = require('wsgilite/file');
const {
  defFormCsrfCheckRoutes,
  defHeaderCsrfCheckRoutes,
  getCSRF_token,
  generateCSRFFormInput,
} = require('wsgilite/csrf');

const server = new WSGILite({
  secret: 'abcdefg',
  logProcessMessage: true,
  debug: true,

  workerServeTimesToRestart: 500, // Each child worker will auto-restart after it served 500 requests
});
const redirect = server.redirectAsFunction();
const template = new Template({
  baseDir: "demo/template",
});
const render = template.renderAsFunction();

server.addMiddleware(async (request, response, meta)=>{
  meta.msg3 = 'I got it3';
});
server.addMiddleware(function * (request, response, meta) {
  return Promise.resolve(0).then(()=>meta.msg2 = 'I got it2');
});
server.addMiddleware((request, response, meta)=>{
  meta.msg = 'I got it';
});
server.addMiddleware(defFormCsrfCheckRoutes([
  '/upload',
], server));
server.addMiddleware(defHeaderCsrfCheckRoutes([
  '/upload2',
], server));
server.GET('/', (request, response, meta)=>{
  return JSON.stringify(meta); // {"_skip404":true,"_url_path":"/","msg3":"I got it3","msg2":"I got it2","msg":"I got it"}
});
server.GET('/terminate', (request, response, meta)=>{
  response.end("terminate");
  server.terminate();
});
server.GET('/user/:id', function *(request, response, meta) {
  return yield Promise.resolve(meta); // {"_skip404":true,"_url_path":"/user/theID","msg3":"I got it3","msg2":"I got it2","msg":"I got it","id":"theID"}
});
server.GET('/file/*relativePath', (request, response, meta)=>{
  defMiddlewareServeFileStatic('demo')(request, response, meta);
});
server.GET('/csrf', function *(request, response, meta) {
  return getCSRF_token(request, response) + ` ${generateCSRFFormInput(request, response)}`; // CSRF_token
});
server.POST('/upload', (request, response, meta)=>{
  return 'CSRF_token ok'; // CSRF_token ok
});
server.POST('/upload2', (request, response, meta)=>{
  return 'x-csrf-token ok'; // x-csrf-token ok
});
server.GET('/heartbeat', async (request, response, meta)=>{
  return "ok"; // ok
});
server.GET('/heartbeat2', async (request, response, meta)=>{
  redirect('/heartbeat')(request, response, meta); // ok
});
server.GET('/heartbeat3', async (request, response, meta)=>{
  redirect('/heartbeat999')(request, response, meta); // 404 File not found.
});
server.defSubRoute('test', function (defSub) {
  defSub.defSubRoute('change', function (defSub) {
    defSub.defSubRoute('for', function (defSub) {
      defSub.GET('it', async (request, response, meta)=>{
        return "Here we go"; // Here we go
      })
    });
  });
});
server.GET('/template', async (request, response, meta)=>{
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

// Exception
server.GET('/exception', async function (request, response, meta) {
  throw new Error("There's an exception"); // Error: There's an exception
});
// Timeout
let routeTimeout = server.GET('/timeout', async function (request, response, meta) {
  var rp = require('request-promise-native');
  await rp.get('https://www.sample-videos.com/video/mp4/240/big_buck_bunny_240p_30mb.mp4');
  return "ok";
});
routeTimeout.timeout = 5000;

server.listen(3333, 'localhost', function () {
  console.log('Server up');
});

```
