const url = require('url');
const RouteParser = require('route-parser');

const AsyncFunction = (async () => {}).constructor;
const GeneratorFunction = (function* () {}).constructor;

function actionResponseHeaderContentTypeTextPlainSilent(response) {
  try {
    response.setHeader('Content-Type', 'text/plain');
  } catch (e) {
    // console.log(e);
  }
}

module.exports = {
  defCheckRoutes: function (rules, match) {
    return function (request, response, meta) {
      var result = rules.filter((rule)=>(new RouteParser(rule)).match(meta._url_path));
      if ((!result) || result.length <= 0) {
        // Not target
        return;
      }

      match(request, response, meta);
    }
  },

  extendMeta: function (meta, addition) {
    return Object.assign(meta, addition);
  },
  actionMetaSkip404: function (meta, reverse) {
    meta._skip404 = !reverse ? true : false;
    return meta;
  },
  actionMetaDoFnAndKeepConfigs: function (fn, meta) {
    let _skip404 = meta._skip404;
    let _url_path = meta._url_path;
    fn(meta);
    meta._skip404 = _skip404;
    meta._url_path = _url_path ? _url_path : meta._url_path;
    return meta;
  },
  actionResponseHeaderContentTypeTextPlainSilent,
  MiddlewareDefault404: function (request, response, meta) {
    return (finished) => {
      if (!finished) {
        actionResponseHeaderContentTypeTextPlainSilent(response);
        response.statusCode = 404;
        response.end('404 File not found.');
      }
    };
  },
  MiddlewareDefaultCatchException: function (request, response, meta) {
    return (e, debug) => {
      actionResponseHeaderContentTypeTextPlainSilent(response);
      response.statusCode = 500;
      response.write('500 Internal Server Error\n');
      response.end(debug && e ? e.stack : '');

      console.log(e);
    };
  },

  isAsyncFunction: function (fn) {
    // return fn instanceof AsyncFunction && AsyncFunction !== Function && AsyncFunction !== GeneratorFunction === true;
    return fn instanceof AsyncFunction;
  },
  isNextable: function (obj) {
    return obj && typeof obj.next === 'function';
  },
  isThenable: function (obj) {
    return obj && typeof obj.then === 'function';
  },

};
