var SparqlParser = require('../sparql').Parser;

var fs = require('fs'),
    expect = require('chai').expect;

var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';

describe('A SPARQL parser', function () {
  var parser = new SparqlParser();

  // Ensure the same blank node identifiers are used in every test
  beforeEach(function () { parser._resetBlanks(); });

  var queries = fs.readdirSync(queriesPath);
  queries = queries.map(function (q) { return q.replace(/\.sparql$/, ''); });
  queries.sort();

  queries.forEach(function (query) {
    var parsedQueryFile = parsedQueriesPath + query + '.json';
    if (!fs.existsSync(parsedQueryFile)) return;

    it('should correctly parse query "' + query + '"', function () {
      var parsedQuery = parseJSON(fs.readFileSync(parsedQueryFile, 'utf8'));
      query = fs.readFileSync(queriesPath + query + '.sparql', 'utf8');
      expect(parser.parse(query)).to.deep.equal(parsedQuery);
    });
  });

  it('should throw an error on an invalid query', function () {
    var query = 'invalid', error = null;
    try { parser.parse(query); }
    catch (e) { error = e; }

    expect(error).to.exist;
    expect(error).to.be.an.instanceof(Error);
    expect(error.message).to.include('Parse error on line 1');
  });

  describe('with pre-defined prefixes', function () {
    var prefixes = { a: 'abc#', b: 'def#' };
    var parser = new SparqlParser(prefixes);

    it('should use those prefixes', function () {
      var query = 'SELECT * { a:a b:b "" }';
      expect(parser.parse(query).where[0].triples[0])
        .to.deep.equal({subject: 'abc#a', predicate: 'def#b', object: '""'});
    });

    it('should allow temporarily overriding prefixes', function () {
      var query = 'PREFIX a: <xyz#> SELECT * { a:a b:b "" }';
      expect(parser.parse(query).where[0].triples[0])
        .to.deep.equal({subject: 'xyz#a', predicate: 'def#b', object: '""'});
      expect(parser.parse('SELECT * { a:a b:b "" }').where[0].triples[0])
        .to.deep.equal({subject: 'abc#a', predicate: 'def#b', object: '""'});
    });

    it('should not change the original prefixes', function () {
      expect(prefixes).to.deep.equal({ a: 'abc#', b: 'def#' });
    });

    it('should not take over changes to the original prefixes', function () {
      prefixes.a = 'xyz#';
      expect(parser.parse('SELECT * { a:a b:b "" }').where[0].triples[0])
        .to.deep.equal({subject: 'abc#a', predicate: 'def#b', object: '""'});
    });
  });
});
