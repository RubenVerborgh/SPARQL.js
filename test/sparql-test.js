var SparqlParser = require('../lib/sparql');

var fs = require('fs'),
    expect = require('chai').expect;

var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';

describe('The SPARQL parser', function () {
  // Ensure the same blank node identifiers are used in every test
  beforeEach(function () { SparqlParser.Parser._resetBlanks(); });

  var queries = fs.readdirSync(queriesPath);
  queries = queries.map(function (q) { return q.replace(/\.sparql$/, ''); });
  queries.sort();

  queries.forEach(function (query) {
    var parsedQueryFile = parsedQueriesPath + query + '.json';
    if (!fs.existsSync(parsedQueryFile)) return;

    it('should correctly parse query "' + query + '"', function () {
      var parsedQuery = parseJSON(fs.readFileSync(parsedQueryFile, 'utf8'));
      query = fs.readFileSync(queriesPath + query + '.sparql', 'utf8');
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

// Parses a JSON object, restoring `undefined` values
function parseJSON(string) {
  var object = JSON.parse(string);
  return /"\{undefined\}"/.test(string) ? restoreUndefined(object) : object;
}

// Recursively replace values of "{undefined}" by `undefined`
function restoreUndefined(object) {
  for (var key in object) {
    var item = object[key];
    if (typeof item === 'object')
      object[key] = restoreUndefined(item);
    else if (item === '{undefined}')
      object[key] = undefined;
  }
  return object;
}
