var SparqlParser = require('../lib/sparql');

var fs = require('fs'),
    expect = require('chai').expect;

var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';

describe('The SPARQL parser', function () {
  // Ensure the same blank node identifiers are used in every test
  beforeEach(function () { SparqlParser.Parser._resetBlanks(); });

  fs.readdirSync(queriesPath).forEach(function (queryFile) {
    var parsedQueryFile = parsedQueriesPath + queryFile.replace('.sparql', '.json');
    if (!fs.existsSync(parsedQueryFile)) return;

    it('should correctly parse ' + queryFile, function () {
      var query = fs.readFileSync(queriesPath + queryFile, 'utf8');
      var parsedQuery = JSON.parse(fs.readFileSync(parsedQueryFile, 'utf8'));
      expect(SparqlParser.parse(query)).to.deep.equal(parsedQuery);
    });
  });

  it('should throw an error on an invalid query', function () {
    var query = 'invalid', error = null;
    try { SparqlParser.parse(query); }
    catch (e) { error = e; }

    expect(error).to.exist;
    expect(error).to.be.an.instanceof(Error);
    expect(error.message).to.include('Parse error on line 1');
  });
});
