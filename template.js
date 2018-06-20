const fs = require('fs');

const path = require('path');
const sep = path.sep;

class Template {
  constructor(config) {
    var self = this;

    self.config = config ? config : {};
    self.config.baseDir = self.config.baseDir ? self.config.baseDir : '.';
    self.config.extName = self.config.extName ? self.config.extName : '.html';

    self.tmpl = require('blueimp-tmpl');
    self.tmpl.load = function (id) {
        var filename = `${__dirname}${sep}${self.config.baseDir}${sep}${id}${self.config.extName}`;
        // console.log('Loading ' + filename);

        var result;
        try {
          result = fs.readFileSync(filename, 'utf8');
        } catch (e) {
          console.log(e);
          result = `Error: Loading Template ${id}${self.config.extName} has failed.`;
        }
        return result;
    };
  }

  renderTemplate(id, data) {
    data = data ? data : {};
    return this.tmpl(id, data);
  }
  render(id, data) {
    return new Promise((resolve, reject)=>{
      try {
        var result = this.renderTemplate(id, data);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    });
  }
  renderResponse(response, id, data) {
    return this.render(id, data).then((result)=>{
      response.end(this.renderTemplate(id, data));

      return result;
    }).catch((e)=>{
      response.statusCode = 500;
      response.write(`Error: Loading Template ${id}${this.config.extName} has failed.\n`);
      response.write(e.toString());
      response.end();

      // return Promise.reject(e);
      return e;
    });
  }
}

module.exports = {
  Template,
};
