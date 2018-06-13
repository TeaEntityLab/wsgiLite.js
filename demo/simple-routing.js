const {WSGILite} = require('wsgilite');

const server = new WSGILite();

server.addMiddleware((request, response, meta)=>{
  meta.msg = 'I got it';
});
server.addRoute('/', (request, response, meta)=>{
  response.statusCode = 200;
  response.end(JSON.stringify(meta)); // {"msg":"I got it"}
});
server.addRoute('/user/:id', (request, response, meta)=>{
  response.statusCode = 200;
  response.end(JSON.stringify(meta)); // {"msg":"I got it","id":"theID"}
});

server.listen(3333, 'localhost', function () {
  console.log('Server up');
});
