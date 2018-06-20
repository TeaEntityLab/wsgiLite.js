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
  defMiddlewareServeFileStatic,
  defFormCsrfCheckRoutes,
  defHeaderCsrfCheckRoutes,
  getCSRF_token,
  generateCSRFFormInput,
  Template,
} = require('wsgilite');

const server = new WSGILite({
  secret: 'abcdefg',
});
const template = new Template({
  baseDir: "demo/template",
});

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
  response.end(JSON.stringify(meta)); // {"url_path":"/","msg3":"I got it3","msg2":"I got it2","msg":"I got it"}
});
server.GET('/terminate', (request, response, meta)=>{
  server.terminate();
  return "";
});
server.GET('/user/:id', function *(request, response, meta) {
  return yield Promise.resolve(meta); // {"url_path":"/user/theID","msg3":"I got it3","msg2":"I got it2","msg":"I got it","id":"theID"}
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
  return template.render("features", {
            "title": "JavaScript Templates",
            "url": "https://github.com/blueimp/JavaScript-Templates",
            "features": [
                "lightweight & fast",
                "powerful",
                "zero dependencies"
            ]
        }); // ok
});

// Timeout
let routeSleep10 = server.GET('/sleep10', async function (request, response, meta) {
  // setTimeout(()=>response.end("OK"), 10*1000);
  var ts = Date.now();
  var handle = ()=> (Date.now() - ts < 10*1000 ? Promise.resolve().then(handle) : 'ok')
  Promise.resolve().then(handle);
});
routeSleep10.timeout = 5000;

server.listen(3333, 'localhost', function () {
  console.log('Server up');
});

```
