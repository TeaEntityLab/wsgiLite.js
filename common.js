const url = require('url');
const RouteParser = require('route-parser');

const AsyncFunction = (async () => {}).constructor;
const GeneratorFunction = (function* () {}).constructor;

module.exports = {
  defCheckRoutes: function (rules, match) {
    return function (request, response, meta) {
      var result = rules.filter((rule)=>(new RouteParser(rule)).match(url.parse(request.url).pathname));
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
    fn(meta);
    meta._skip404 = _skip404;
    return meta;
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
