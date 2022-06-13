var SparqlParser = require('../sparql').Parser;

var fs = require('fs');
var { DataFactory } = require('rdf-data-factory');

var expect = require("expect");
var toEqualParsedQuery = require("./matchers/toEqualParsedQuery");
expect.extend({
  toEqualParsedQuery,
});

var dataFactory = new DataFactory();
var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';

describe('A SPARQL path parser', function () {
  var parser = new SparqlParser({ pathOnly: true });

  // Ensure the same blank node identifiers are used in every test
  beforeEach(function () { parser._resetBlanks(); });

  describe('in pathOnly mode', () => {
    testQueries('paths', { pathOnly: true, prefixes: { ex: "http://example.org/" } });
  });

  describe('in pathOnly mode SPARQL queries should fail', () => {
    testQueries('sparql', { pathOnly: true, mustError: true })
    testQueries('sparql-skip-validation', { pathOnly: true, mustError: true })
    testQueries('sparqlstar', { pathOnly: true, mustError: true })
  });
});

function testQueries(directory, settings) {
  var parser = new SparqlParser(settings);

  var queries = fs.readdirSync(queriesPath + directory + '/');
  queries = queries.map(function (q) { return q.replace(/\.sparql$/, ''); });
  queries.sort();

  queries.forEach(function (query) {
    var sparql = fs.readFileSync(queriesPath + directory + '/' + query + '.sparql', 'utf8');

    var parsedQueryFile = parsedQueriesPath + directory + '/' + query + '.json';
    if (settings.mustError || !fs.existsSync(parsedQueryFile)) {
      it('should error when parsing query "' + query + '"', function () {
        expect(() => parser.parse(sparql)).toThrow();
      });
    }
    else {
      it('should correctly parse query "' + query + '"', function () {
        var parsedQuery = parseJSON(fs.readFileSync(parsedQueryFile, 'utf8'));

        const parsed = parser.parse(sparql);
        expect(parsed).toEqualParsedQuery(parsedQuery);
      });
    }
  });
}
