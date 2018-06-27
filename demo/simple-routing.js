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

// Settings

const server = new WSGILite({
  secret: 'abcdefg', // The secret key for CSRF
  logProcessMessage: true, // Log the multiple processes starting/ending messages.
  debug: true, // Debug mode, it will show stacktrace of errors in the responses
  isHttps: false, // Is it a https server?
  processNum: require('os').cpus().length, // N + 1 processes (cluster: 1 * master + n * fastcgi style http/https serving)
  // processNum: 0, // Single process
  // createServerOptions: {}, // Additional createServer options for http/https.createServer(options)

  workerServeTimesToRestart: 500, // Each child worker will auto-restart after it served 500 requests
});
const redirect = server.redirectAsFunction(); // Define redirect() in simple & shorter function style.
const template = new Template({
  baseDir: "demo/template", // Define the base dir of template files
});
const render = template.renderAsFunction(); // Define render() in simple & shorter function style.

// Middlewares

server.addMiddleware(async (request, response, meta)=>{
  meta.msg3 = 'I got it3';
});
server.addMiddleware(function * (request, response, meta) {
  return Promise.resolve(0).then(()=>meta.msg2 = 'I got it2');
});
server.addMiddleware((request, response, meta)=>{
  meta.msg = 'I got it';
});
// CSRF routes defining
server.addMiddleware(defFormCsrfCheckRoutes([
  '/upload', // Your can define more paths here
], server));
server.addMiddleware(defHeaderCsrfCheckRoutes([
  '/upload2', // Your can define more paths here
], server));

// Routes

// Print the `meta` object
server.GET('/', (request, response, meta)=>{
  return JSON.stringify(meta); // {"_skip404":true,"_url_path":"/","msg3":"I got it3","msg2":"I got it2","msg":"I got it"}
});

// The server will terminate
server.GET('/terminate', (request, response, meta)=>{
  response.end("terminate");
  server.terminate();
});

// Path parameters(until `/` or `?` or the end)
server.GET('/user/:id', function *(request, response, meta) {
  return yield Promise.resolve(meta); // {"_skip404":true,"_url_path":"/user/theID","msg3":"I got it3","msg2":"I got it2","msg":"I got it","id":"theID"}
});
// Path parameters(until `?` or the end)
server.GET('/file*relativePath', (request, response, meta)=>{
  defMiddlewareServeFileStatic('demo')(request, response, meta);
});

// Show the CSRF usages (token only & a form hidden input with the token)
server.GET('/csrf', function *(request, response, meta) {
  return getCSRF_token(request, response) + ` ${generateCSRFFormInput(request, response)}`; // CSRF_token
});
// CSRF checking (form)
server.POST('/upload', (request, response, meta)=>{
  return 'CSRF_token ok'; // CSRF_token ok
});
// CSRF checking (header)
server.POST('/upload2', (request, response, meta)=>{
  return 'x-csrf-token ok'; // x-csrf-token ok
});
server.GET('/heartbeat', async (request, response, meta)=>{
  return "ok"; // ok
});

// Redirect to an existing route
server.GET('/heartbeat2', async (request, response, meta)=>{
  redirect('/heartbeat')(request, response, meta); // ok
});
// Redirect to a non-existing route(will 404)
server.GET('/heartbeat3', async (request, response, meta)=>{
  redirect('/heartbeat999')(request, response, meta); // 404 File not found.
});

// Nested routing definitions
server.defSubRoute('test', function (defSub) {
  defSub.defSubRoute('change', function (defSub) {
    defSub.defSubRoute('for', function (defSub) {
      defSub.GET('it', async (request, response, meta)=>{
        return "Here we go"; // Here we go
      })
    });
  });
});

// Template usages
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
