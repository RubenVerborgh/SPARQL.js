var SparqlGenerator = require('../sparql').Generator;
var SparqlParser = require('../sparql').Parser;

var fs = require('fs'),
    expect = require('chai').expect;

var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';
var unusedPrefixesPath = __dirname + '/../test/unusedPrefixes/';

describe('A SPARQL generator', function () {
  var defaultGenerator = new SparqlGenerator();
  var allPrefixesGenerator = new SparqlGenerator({allPrefixes: true});

  var queries = fs.readdirSync(queriesPath);
  queries = queries.map(function (q) { return q.replace(/\.sparql$/, ''); });
  queries.sort();

  queries.forEach(function (query) {
    var parsedQueryFile = parsedQueriesPath + query + '.json';
    if (!fs.existsSync(parsedQueryFile)) return;

    it('should correctly generate query "' + query + '"', function () {
      var parsedQuery = parseJSON(fs.readFileSync(parsedQueryFile, 'utf8'));
      var genQuery = allPrefixesGenerator.stringify(parsedQuery);
      expect(new SparqlParser().parse(genQuery)).to.deep.equal(parsedQuery);
    });
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
      var expectedQuery = fs.readFileSync(generatedQueryFile, 'utf8');
      var generatedQuery = defaultGenerator.stringify(parsedQuery);
      expect(generatedQuery + '\n').to.be.equal(expectedQuery);
    });
  });

  it('should use inherited prefixes', function () {
    var parser = new SparqlParser({rdfs: 'http://www.w3.org/2000/01/rdf-schema#'});
    var parsedQuery = parser.parse('SELECT * WHERE { ?s rdfs:label ?o }');
    var generatedQuery = defaultGenerator.stringify(parsedQuery);
    var expectedQuery =
      'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>\n' +
      'SELECT * WHERE { ?s rdfs:label ?o. }';
    expect(generatedQuery).to.be.equal(expectedQuery);
  });
});
