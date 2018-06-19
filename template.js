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
        return fs.readFileSync(filename, 'utf8');
    };
  }

  render(id, data) {
    data = data ? data : {};
    return this.tmpl(id, data);
  }
}

module.exports = {
  Template,
};
