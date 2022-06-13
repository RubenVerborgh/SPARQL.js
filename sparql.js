var Parser = require('./lib/SparqlParser').Parser;
var Generator = require('./lib/SparqlGenerator');
var Wildcard = require("./lib/Wildcard").Wildcard;
var { DataFactory } = require('rdf-data-factory');

module.exports = {
  /**
   * Creates a SPARQL parser with the given pre-defined prefixes and base IRI
   * @param options {
   *   prefixes?: { [prefix: string]: string },
   *   baseIRI?: string,
   *   factory?: import('rdf-js').DataFactory,
   *   sparqlStar?: boolean,
   *   skipValidation?: boolean,
   *   skipUngroupedVariableCheck?: boolean
   * }
   */
  Parser: function ({ prefixes, baseIRI, factory, sparqlStar, skipValidation, skipUngroupedVariableCheck, pathOnly } = {}) {

    // Create a copy of the prefixes
    var prefixesCopy = {};
    for (var prefix in prefixes || {})
      prefixesCopy[prefix] = prefixes[prefix];

    // Create a new parser with the given prefixes
    // (Workaround for https://github.com/zaach/jison/issues/241)
    var parser = new Parser();
    parser.parse = function () {
      Parser.base = baseIRI || '';
      Parser.prefixes = Object.create(prefixesCopy);
      Parser.factory = factory || new DataFactory();
      Parser.sparqlStar = Boolean(sparqlStar);
      Parser.pathOnly = Boolean(pathOnly);
      // We keep skipUngroupedVariableCheck for compatibility reasons.
      Parser.skipValidation = Boolean(skipValidation) || Boolean(skipUngroupedVariableCheck)
      return Parser.prototype.parse.apply(parser, arguments);
    };
    parser._resetBlanks = Parser._resetBlanks;
    return parser;
  },
  Generator: Generator,
  Wildcard: Wildcard,
};
