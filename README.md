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
  defServeFileStatic,
} = require('wsgilite');

const server = new WSGILite();

server.addMiddleware((request, response, meta)=>{
  meta.msg = 'I got it';
});
server.addRoute('/', (request, response, meta)=>{
  response.end(JSON.stringify(meta)); // {"path":"/","msg":"I got it"}
});
server.addRoute('/user/:id', (request, response, meta)=>{
  return meta; // {"path":"/user/theID","msg":"I got it","id":"theID"}
});
server.addRoute('/file/*relativePath', (request, response, meta)=>{
  defServeFileStatic('demo')(request, response, meta);
});
server.addRoute('/heartbeat', (request, response, meta)=>{
  return "ok"; // ok
});

server.listen(3333, 'localhost', function () {
  console.log('Server up');
});

```
