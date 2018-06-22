const fs = require('fs');
const path = require('path');
const sep = path.sep;

const {
  actionMetaSkip404,
  actionMetaDoFnAndKeepConfigs,
} = require('./common');

// maps file extention to MIME typere
const mimeMap = {
  '.ico': 'image/x-icon',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword'
};

module.exports = {
  mimeMap,
  defMiddlewareServeFileStatic: function (baseDir) {
    baseDir = baseDir ? baseDir : '.';

    return function (request, response, meta) {
      const pathname = meta.relativePath ? meta.relativePath : meta.url_path;
      const ext = path.parse(pathname).ext;
      const finalPath = `${__dirname}${sep}${baseDir}${sep}${pathname}`;

      var exist = fs.existsSync(finalPath);
      if(!exist) {
        return;
      }
      actionMetaSkip404(meta);

      response.writeHead(200, {
        'Transfer-Encoding': 'chunked',
        'Content-type': mimeMap[ext] || 'text/plain',
        'X-Content-Type-Options': 'nosniff',
      });
      // read file from file

      var stream = fs.createReadStream(finalPath);

      stream.on('data', (chunk) => {
        response.write(chunk);
      });
      stream.on('error', function(err){
        response.statusCode = 500;
        response.end(`Error getting the file: ${err}.`);
      });
      stream.on('end', () => {
        response.end();
      });
    }
  },
};
