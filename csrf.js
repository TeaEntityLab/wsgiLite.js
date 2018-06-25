const Cookies = require('cookies');

const {
  defCheckRoutes,
  actionResponseHeaderContentTypeTextPlainSilent,
} = require('./common');

function getCSRF_token (request, response) {
  var cookies = new Cookies(request, response);
  var CSRF_token = cookies.get('CSRF_token');
  return CSRF_token;
}

module.exports = {
  getCSRF_token,
  generateCSRFFormInput: function (request, response) {
    return `<input type="hidden" name="CSRF_token" id="csrf-token" value="${getCSRF_token(request, response)}" />`;
  },
  defMiddlewareGenerateCsrf: function (wsgilite) {
    if (!wsgilite) {throw new Error('wsgilite is not given')}

    return function (request, response, meta) {
      var CSRF_token = getCSRF_token(request, response);
      if ((!CSRF_token) || (!wsgilite.tokens.verify(wsgilite.secret, CSRF_token))) {

        var token = wsgilite.tokens.create(wsgilite.secret);

        var cookies = new Cookies(request, response);
        cookies.set('CSRF_token', token, {
          maxAge: wsgilite.config.csrfMaxAge,
        });
      }
    }
  },
  defFormCsrfCheckRoutes: function (rules, wsgilite) {
    if (!wsgilite) {throw new Error('wsgilite is not given')}

    return defCheckRoutes(rules, function (request, response, meta) {
      var CSRF_token = getCSRF_token(request, response);

      if (CSRF_token != meta.CSRF_token || (!wsgilite.tokens.verify(wsgilite.secret, CSRF_token))) {
        actionResponseHeaderContentTypeTextPlainSilent(response);
        response.statusCode = 403;
        response.end('CSRF detected.');
      }
    });
  },
  defHeaderCsrfCheckRoutes: function (rules, wsgilite) {
    if (!wsgilite) {throw new Error('wsgilite is not given')}

    return defCheckRoutes(rules, function (request, response, meta) {
      var CSRF_token = request.headers['x-csrf-token'];

      if ((CSRF_token != meta.CSRF_token) || (!wsgilite.tokens.verify(wsgilite.secret, CSRF_token))) {
        actionResponseHeaderContentTypeTextPlainSilent(response);
        response.statusCode = 403;
        response.end('CSRF detected.');
      }
    });
  },
};
