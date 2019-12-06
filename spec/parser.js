const { ErrorSkipped } = require('rdf-test-suite');
const { Parser } = require('..');

module.exports = {
  parse: async function (query, options) {
    const parser = new Parser({ baseIRI: options.baseIRI });
    parser.parse(query);
  },
  query: function() {
    return Promise.reject(new ErrorSkipped('Querying is not supported'));
  },
};
