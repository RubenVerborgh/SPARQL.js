var SparqlGenerator = require('../sparql').Generator;
var SparqlParser = require('../sparql').Parser;

var fs = require('fs'),
    expect = require('expect'),
    os = require('os');

var toEqualParsedQuery = require("../test/matchers/toEqualParsedQuery");
expect.extend({toEqualParsedQuery});

var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';
var unusedPrefixesPath = __dirname + '/../test/unusedPrefixes/';

describe('A SPARQL generator', function () {
  it('should preserve mentioned prefixes in the query', function () {
    var parser = new SparqlParser({
      prefixes: {
        schema: "https://schema.org/",
        owl: "http://www.w3.org/2002/07/owl#"
      }
    });
    var parsedQuery = parser.parse('PREFIX db_opt: <https://db.control.param_10> \n SELECT * WHERE {?s a owl:Class}');
    var generator = new SparqlGenerator({allPrefixes: false, keepQueryPrefixes: true});
    var generatedQuery = generator.stringify(parsedQuery);
    var expectedQuery ='PREFIX db_opt: <https://db.control.param_10>\nPREFIX owl: <http://www.w3.org/2002/07/owl#>\nSELECT * WHERE { ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> owl:Class. }';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  var defaultGenerator = new SparqlGenerator();

  describe('in SPARQL mode', () => {
    testQueries('sparql', { allPrefixes: true });
    testQueries('sparqlstar', { allPrefixes: true, mustError: true });
  });

  describe('in SPARQL* mode', () => {
    testQueries('sparql', { allPrefixes: true, sparqlStar: true });
    testQueries('sparqlstar', { allPrefixes: true, sparqlStar: true });
  });

  var queriesWithUnusedPrefixes = fs.readdirSync(unusedPrefixesPath)
    .filter(function (query) { return query.endsWith('.json'); })
    .map(function (query) { return query.replace(/\.json$/, ''); });

  queriesWithUnusedPrefixes.forEach(function (query) {
    var parsedQueryFile = unusedPrefixesPath + query + '.json';
    var generatedQueryFile = unusedPrefixesPath + query + '.sparql';
    if (!fs.existsSync(generatedQueryFile)) return;

    it('should remove unused prefixes from "' + query + '"', function () {
      var parsedQuery = parseJSON(fs.readFileSync(parsedQueryFile, 'utf8'));
      var expectedQuery = fs.readFileSync(generatedQueryFile, 'utf8')
        .split(os.EOL).join('\n');
      var generatedQuery = defaultGenerator.stringify(parsedQuery);
      expect(generatedQuery + '\n').toEqual(expectedQuery);
    });
  });

  it('should use inherited prefixes', function () {
    var prefixes = { rdfs: 'http://www.w3.org/2000/01/rdf-schema#' };
    var parser = new SparqlParser({ prefixes });
    var parsedQuery = parser.parse('SELECT * WHERE { ?s rdfs:label ?o }');
    var generatedQuery = defaultGenerator.stringify(parsedQuery);
    var expectedQuery =
      'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' +
      'SELECT * WHERE { ?s rdfs:label ?o. }';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  it('should separate triples with same subject by semicolon', function () {
    var parser = new SparqlParser();
    var parsedQuery = parser.parse('SELECT * WHERE { <t:s> <t:p1> <t:o1>; <t:p2> <t:o2> }');
    var generatedQuery = defaultGenerator.stringify(parsedQuery);
    var expectedQuery =
      'SELECT * WHERE {\n' +
      '  <t:s> <t:p1> <t:o1>;\n' +
      '    <t:p2> <t:o2>.\n' +
      '}';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  it('should separate triples with same subject and predicate by comma', function () {
    var parser = new SparqlParser();
    var parsedQuery = parser.parse('SELECT * WHERE { <t:s> <t:p> <t:o1>, <t:o2> }');
    var generatedQuery = defaultGenerator.stringify(parsedQuery);
    var expectedQuery = 'SELECT * WHERE { <t:s> <t:p> <t:o1>, <t:o2>. }';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  it('should omit datatype for xsd:string literal if requested', function () {
    var parser = new SparqlParser();
    var parsedQuery = parser.parse('SELECT * WHERE { ?s ?p "foo" }');
    var generator = new SparqlGenerator();
    var generatedQuery = generator.stringify(parsedQuery);
    var expectedQuery = 'SELECT * WHERE { ?s ?p "foo". }';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  it('should omit brackets for group by with a single variable', function () {
    var parser = new SparqlParser();
    var parsedQuery = parser.parse('SELECT ?k (COUNT(?a) AS ?c) WHERE { ?a <t:p> ?k } GROUP BY ?k');
    var generator = new SparqlGenerator();
    var generatedQuery = generator.stringify(parsedQuery);
    var expectedQuery =
      'SELECT ?k (COUNT(?a) AS ?c) WHERE { ?a <t:p> ?k. }\n' +
      'GROUP BY ?k';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  it('should preserve source graph in sparql 1.1 update ADD operation', function () {
    var parser = new SparqlParser();
    var parsedQuery = parser.parse('ADD <http://example.com/my-graph> TO <http://example.com/your-graph>');
    var generator = new SparqlGenerator();
    var generatedQuery = generator.stringify(parsedQuery);
    var expectedQuery =
      'ADD <http://example.com/my-graph> TO <http://example.com/your-graph>';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  it('should preserve source, default graph in sparql 1.1 update MOVE operation', function () {
    var parser = new SparqlParser();
    var parsedQuery = parser.parse('MOVE DEFAULT TO <http://example.org/named>');
    var generator = new SparqlGenerator();
    var generatedQuery = generator.stringify(parsedQuery);
    var expectedQuery =
      'MOVE DEFAULT TO <http://example.org/named>';
    expect(generatedQuery).toEqual(expectedQuery);
  });

  it('should preserve source, default graph in sparql 1.1 update MOVE operation', function () {
    var parser = new SparqlParser();
    var parsedQuery = parser.parse('COPY SILENT DEFAULT TO <http://example.org/named>');
    var generator = new SparqlGenerator();
    var generatedQuery = generator.stringify(parsedQuery);
    var expectedQuery =
      'COPY SILENT DEFAULT TO <http://example.org/named>';
    expect(generatedQuery).toEqual(expectedQuery);
  });
});

function testQueries(directory, settings) {
  var generator = new SparqlGenerator(settings);

  var queries = fs.readdirSync(queriesPath + directory + '/');
  queries = queries.map(function (q) { return q.replace(/\.sparql$/, ''); });
  queries.sort();

  queries.forEach(function (query) {
    var parsedQueryFile = parsedQueriesPath + directory + '/' + query + '.json';
    if (!fs.existsSync(parsedQueryFile)) return;

    // In parsed query, replace "generated" prefixes with "existing" prefix
    // because all blanknodes in the generated query have explicit names.
    var parsedQuery = parseJSON(fs.readFileSync(parsedQueryFile, 'utf8').replace(/g_/g, 'e_'));

    if (settings.mustError) {
      it('should error when generating query "' + query + '"', function () {
        expect(() => generator.stringify(parsedQuery)).toThrow();
      });
    }
    else {
      it('should correctly generate query "' + query + '"', function () {
        var genQuery = generator.stringify(parsedQuery);

        const parsed = new SparqlParser({ sparqlStar: true }).parse(genQuery);
        expect(parsed).toEqualParsedQuery(parsedQuery);
      });
    }
  });
}
