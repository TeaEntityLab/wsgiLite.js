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

function actionGetFileRelativePathFromMeta(meta) {
  return Maybe.just(meta.relativePath).isPresent() ? meta.relativePath : meta._url_path;
}
function MiddlewareDefaultFileError(request, response, meta) {
  return function (e, pathname) {
    console.log(e);
    if (e && e.code && (e.code === 'ENOENT' || e.code === 'EISDIR')) {
      MiddlewareDefault404(request, response, meta)(false);
    } else {
      response.statusCode = 500;
      response.end(`Error getting the file: ${pathname}.`);
    }

    return e;
  }
}
function defMiddlewareServeFileStatic(baseDir, doRawExceptionReturn) {
  baseDir = baseDir ? baseDir : '.';

  return function (request, response, meta) {
    const pathname = actionGetFileRelativePathFromMeta(meta);
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

      let hasHeaderWritten = false;
      stream.on('data', (chunk) => {
        if (!hasHeaderWritten) {
          hasHeaderWritten = true;
          response.writeHead(200, {
            'Transfer-Encoding': 'chunked',
            'Content-type': mimeMap[ext] || 'text/plain',
            'X-Content-Type-Options': 'nosniff',
          });
        }
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
      MiddlewareDefaultFileError(request, response, meta)(e, pathname);
      return e;
    });
  }
}
function MiddlewareResponseFolderFileList(request, response, meta) {
  return (baseDir, pathname) => {
    const finalPath = `${process.cwd()}${sep}${baseDir}${sep}${pathname}`;

    fs.readdir(finalPath, (e, files) => {
      if (e) {
        MiddlewareDefaultFileError(request, response, meta)(e, pathname);
      } else {

        try {
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
        } catch (e) {
          console.log(e);
        }

        response.write(
`
<html lang="en">
<head><meta charset="utf-8"><link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0/css/bootstrap.min.css" integrity="sha384-Gn5384xqQ1aoWXA+058RXPxPg6fy4IWvTNh0E263XmFcJlSAwiGgFAW/dAiS6JXm" crossorigin="anonymous"></head>
<body>
<ul class="list-group">
${files.map((file)=>`<li class="list-group-item"></li><a href="${meta._url_path}/${file}">${file}</a></li>`).join('')}
</ul>
</body>
</html>
`
        );
        response.end();
      }
    })
  };
}

module.exports = {
  mimeMap,
  defMiddlewareServeFileStatic,
  defMiddlewareServeFileStaticWithDirList: function (baseDir, doRawExceptionReturn) {
    return function (request, response, meta) {
      return defMiddlewareServeFileStatic(baseDir, true)(request, response, meta).catch((e) => {
        const pathname = actionGetFileRelativePathFromMeta(meta);
        // const ext = path.parse(pathname).ext;
        const finalPath = `${process.cwd()}${sep}${baseDir}${sep}${pathname}`;

        if (e && e.code === 'EISDIR') {
          console.log(`${pathname} is a folder`);
          MiddlewareResponseFolderFileList(response, response, meta)(baseDir, pathname);
          return true;
        } else {
          MiddlewareDefaultFileError(request, response, meta)(e, pathname);
          return e;
        }
      });
    };
  },
};
