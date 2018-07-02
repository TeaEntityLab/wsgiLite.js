const {
  WSGILite,
} = require('../wsgilite');
const {
  Template,
} = require('../template');
const {
  mimeMap,
  defMiddlewareServeFileStatic,
  defMiddlewareServeFileStaticWithDirList,
} = require('../file');
const {
  defFormCsrfCheckRoutes,
  defHeaderCsrfCheckRoutes,
  getCSRF_token,
  generateCSRFFormInput,
} = require('../csrf');

// NOTE Test /wss1 websocket under commandline:
// curl --include --no-buffer --header "Connection: Upgrade" --header "Upgrade: websocket" --header "Host: example.com:80" --header "Origin: http://example.com:80" --header "Sec-WebSocket-Key: SGVsbG8sIHdvcmxkIQ==" --header "Sec-WebSocket-Version: 13" http://localhost:3333/wss1

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
    const url = require('url');
    const WebSocket = require('ws');

    const wss1 = new WebSocket.Server({ noServer: true });
    const wss2 = new WebSocket.Server({ noServer: true });
    wss1.on('connection', function connection(ws) {
      ws.on('message', function incoming(message) {
        console.log('received: %s', message);
      });
      ws.send('wss1 something');
    });
    wss2.on('connection', function connection(ws) {
      ws.on('message', function incoming(message) {
        console.log('received: %s', message);
      });
      ws.send('wss2 something');
    });

    httpServer.on('upgrade', function upgrade(request, socket, head) {
      const pathname = url.parse(request.url).pathname;

      if (pathname === '/wss1') {
        wss1.handleUpgrade(request, socket, head, function done(ws) {
          wss1.emit('connection', ws, request);
        });
      } else if (pathname === '/wss2') {
        wss2.handleUpgrade(request, socket, head, function done(ws) {
          wss2.emit('connection', ws, request);
        });
      }
    });

  }, // Callback on one of servers created(this will be called in Multiple processes)
  onMessageMaster: function (worker, msg, handle) {
    console.log(`master got message: ${msg.event}`);
  }, // Optional: We could monitor and handle communications between cluster master & workers
  onMessageWorker: function (msg, handle) {
    console.log(`worker got message: ${msg.event}`);
  }, // Optional: We could monitor and handle communications between cluster master & workers

  workerServeTimesToRestart: 500, // Each child worker will auto-restart after it served 500 requests
});

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
// Routes

// Print the `meta` object
wsgilite.GET('/', (request, response, meta)=>{
  return JSON.stringify(meta); // {"_skip404":true,"_url_path":"/","msg3":"I got it3","msg2":"I got it2","msg":"I got it"}
});
// Path parameters(until `/` or `?` or the end)
wsgilite.GET('/user/:id', function *(request, response, meta) {
  return yield Promise.resolve(meta); // {"_skip404":true,"_url_path":"/user/theID","msg3":"I got it3","msg2":"I got it2","msg":"I got it","id":"theID"}
});
// Path parameters(until `?` or the end)
wsgilite.GET('/file*relativePath', (request, response, meta)=>{
  defMiddlewareServeFileStatic('demo')(request, response, meta);
});

wsgilite.listen(3333, 'localhost', function () {
  console.log('Server up');
});
