# wsgiLite.js
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
  getCSRF_token,
  generateCSRFFormInput,
} = require('wsgilite');

const server = new WSGILite();

server.addMiddleware((request, response, meta)=>{
  meta.msg = 'I got it';
});
server.addMiddleware(defFormCsrfCheckRoutes([
  '/upload',
]));
server.GET('/', (request, response, meta)=>{
  response.end(JSON.stringify(meta)); // {"path":"/","msg":"I got it"}
});
server.GET('/user/:id', (request, response, meta)=>{
  return meta; // {"path":"/user/theID","msg":"I got it","id":"theID"}
});
server.GET('/file/*relativePath', (request, response, meta)=>{
  defMiddlewareServeFileStatic('demo')(request, response, meta);
});
server.GET('/csrf', (request, response, meta)=>{
  return getCSRF_token(request, response) + ` ${generateCSRFFormInput(request, response)}`; // CSRF_token
});
server.POST('/upload', (request, response, meta)=>{
  return 'CSRF_token ok'; // CSRF_token ok
});
server.GET('/heartbeat', (request, response, meta)=>{
  return "ok"; // ok
});

server.listen(3333, 'localhost', function () {
  console.log('Server up');
});

```
