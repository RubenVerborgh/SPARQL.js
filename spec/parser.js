const { ErrorSkipped } = require('rdf-test-suite');
const { Parser } = require('..');

module.exports = {
  parse: async function (query, options) {
    const parser = new Parser(options);
    parser.parse(query);
  },
  query: function() {
    return Promise.reject(new ErrorSkipped('Querying is not supported'));
  },
  update: function() {
    return Promise.reject(new ErrorSkipped('Updating is not supported'));
  },
};
