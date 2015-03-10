var SparqlGenerator = require('../sparql').Generator;
var SparqlParser = require('../sparql').Parser;

var fs = require('fs'),
    expect = require('chai').expect;

var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';

describe('A SPARQL generator', function () {
  var generator = new SparqlGenerator();

  var queries = fs.readdirSync(queriesPath);
  queries = queries.map(function (q) { return q.replace(/\.sparql$/, ''); });
  queries.sort();

  queries.forEach(function (query) {
    var parsedQueryFile = parsedQueriesPath + query + '.json';
    if (!fs.existsSync(parsedQueryFile)) return;

    it('should correctly generate query "' + query + '"', function () {
      var parsedQuery = parseJSON(fs.readFileSync(parsedQueryFile, 'utf8'));
      var genQuery = generator.stringify(parsedQuery);
      expect(new SparqlParser().parse(genQuery)).to.deep.equal(parsedQuery);
    });
  });
});
