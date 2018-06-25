const fs = require('fs');
const path = require('path');
const sep = path.sep;

const Maybe = require('fpEs/maybe');

const {
  actionMetaSkip404,
  actionMetaDoFnAndKeepConfigs,

  MiddlewareDefault404,
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

function defMiddlewareServeFileStatic(baseDir, doRawExceptionReturn) {
  baseDir = baseDir ? baseDir : '.';

  return function (request, response, meta) {
    const pathname = Maybe.just(meta.relativePath).isPresent() ? meta.relativePath : meta._url_path;
    const ext = path.parse(pathname).ext;
    const finalPath = `${process.cwd()}${sep}${baseDir}${sep}${pathname}`;

    /*
    var exist = fs.existsSync(finalPath);
    if(!exist) {
      actionMetaSkip404(meta, true);
      return;
    }
    */
    actionMetaSkip404(meta);

    let promise = new Promise(function(resolve, reject) {
      // read file from file
      var stream = fs.createReadStream(finalPath);

      stream.on('open', () => {
        response.writeHead(200, {
          'Transfer-Encoding': 'chunked',
          'Content-type': mimeMap[ext] || 'text/plain',
          'X-Content-Type-Options': 'nosniff',
        });
      });
      stream.on('data', (chunk) => {
        response.write(chunk);
      });
      stream.on('error', function(err){
        reject(err);
      });
      stream.on('end', () => {
        response.end();

        resolve(true);
      });
    });

    if (doRawExceptionReturn) {
      return promise;
    }

    return promise.catch((e)=>{
      if (e && e.code && e.code === 'ENOENT') {
        MiddlewareDefault404(request, response, meta)(false);
      } else {
        console.log(e);
        response.statusCode = 500;
        response.end(`Error getting the file: ${pathname}.`);
      }
      return e;
    });
  }
}

module.exports = {
  mimeMap,
  defMiddlewareServeFileStatic,
};
