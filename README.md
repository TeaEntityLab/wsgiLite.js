# wsgiLite.js
Lightweight WSGI framework, inspired by ROR &amp; Laravel frameworks

## Installation

```bash
npm i wsgilite
```

## Examples

```javascript

const {WSGILite} = require('wsgilite');

const server = new WSGILite();

server.addMiddleware((request, response)=>{
  response.statusCode = 200;
  response.end('ok');
});

server.listen(3333, 'localhost', function () {
  console.log('Server up');
});

```
