const { Parser } = require('./lib/SparqlParser');
const { Generator } = require('./lib/SparqlGenerator');
const { Wildcard } = require('./lib/Wildcard');
const { DataFactory } = require('rdf-data-factory');

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
function _Parser({
    prefixes,
    baseIRI,
    factory,
    pathOnly,
    sparqlStar,
    skipValidation,
    skipUngroupedVariableCheck,
} = {}) {
  // Create a copy of the prefixes
  const prefixesCopy = {};
  for (const prefix in prefixes ?? {})
    prefixesCopy[prefix] = prefixes[prefix];

  // Create a new parser with the given prefixes
  // (Workaround for https://github.com/zaach/jison/issues/241)
  const parser = new Parser();
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
}

module.exports = {
  Parser: _Parser,
  Generator,
  Wildcard,
};
