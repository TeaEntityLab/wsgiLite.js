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
  defHeaderCsrfCheckRoutes,
  getCSRF_token,
  generateCSRFFormInput,
} = require('wsgilite');

const server = new WSGILite({
  secret: 'abcdefg',
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
  response.end(JSON.stringify(meta)); // {"url_path":"/","msg":"I got it"}
});
server.GET('/user/:id', function *(request, response, meta) {
  return yield Promise.resolve(meta); // {"url_path":"/user/theID","msg":"I got it","id":"theID"}
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

server.listen(3333, 'localhost', function () {
  console.log('Server up');
});

```
