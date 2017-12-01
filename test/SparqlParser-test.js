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

  it('should preserve BGP and filter pattern order', function () {
    var parser = new SparqlParser();
    var query = 'SELECT * { ?s ?p "1" . FILTER(true) . ?s ?p "2"  }';
    var groups = parser.parse(query).where;
    expect(groups[0].type).to.equal("bgp");
    expect(groups[1].type).to.equal("filter");
    expect(groups[2].type).to.equal("bgp");
  });

  describe('with pre-defined prefixes', function () {
    var prefixes = { a: 'ex:abc#', b: 'ex:def#' };
    var parser = new SparqlParser(prefixes);

    it('should use those prefixes', function () {
      var query = 'SELECT * { a:a b:b "" }';
      expect(parser.parse(query).where[0].triples[0])
        .to.deep.equal({subject: 'ex:abc#a', predicate: 'ex:def#b', object: '""'});
    });

    it('should allow temporarily overriding prefixes', function () {
      var query = 'PREFIX a: <ex:xyz#> SELECT * { a:a b:b "" }';
      expect(parser.parse(query).where[0].triples[0])
        .to.deep.equal({subject: 'ex:xyz#a', predicate: 'ex:def#b', object: '""'});
      expect(parser.parse('SELECT * { a:a b:b "" }').where[0].triples[0])
        .to.deep.equal({subject: 'ex:abc#a', predicate: 'ex:def#b', object: '""'});
    });

    it('should not change the original prefixes', function () {
      expect(prefixes).to.deep.equal({ a: 'ex:abc#', b: 'ex:def#' });
    });

    it('should not take over changes to the original prefixes', function () {
      prefixes.a = 'ex:xyz#';
      expect(parser.parse('SELECT * { a:a b:b "" }').where[0].triples[0])
        .to.deep.equal({subject: 'ex:abc#a', predicate: 'ex:def#b', object: '""'});
    });
  });

  describe('with pre-defined base IRI', function () {
    var parser = new SparqlParser(null, 'http://ex.org/');

    it('should use the base IRI', function () {
      var query = 'SELECT * { <> <#b> "" }';
      expect(parser.parse(query).where[0].triples[0])
        .to.deep.equal({subject: 'http://ex.org/', predicate: 'http://ex.org/#b', object: '""'});
    });
  });

  it('should throw an error on relative IRIs if no base IRI is specified', function () {
    var query = 'SELECT * { <a> <b> <c> }', error = null;
    try { parser.parse(query); }
    catch (e) { error = e; }

    expect(error).to.exist;
    expect(error).to.be.an.instanceof(Error);
    expect(error.message).to.include('Cannot resolve relative IRI a because no base IRI was set.');
  });

  describe('with group collapsing disabled', function () {
    var parser = new SparqlParser(null, null);

    it('should keep explicit pattern group', function () {
      var query = 'SELECT * WHERE { { ?s ?p ?o } ?a ?b ?c }';
      expect(parser.parse(query).where).to.deep.equal([
        {
          type: 'group',
          patterns: [
            { type: 'bgp', triples: [{subject: '?s', predicate: '?p', object: '?o'}] },
          ]
        },
        { type: 'bgp', triples: [{subject: '?a', predicate: '?b', object: '?c'}] },
      ]);
    });

    it('should still collapse immediate union groups', function () {
      var query = 'SELECT * WHERE { { ?s ?p ?o } UNION { ?a ?b ?c } }';
      expect(parser.parse(query).where).to.deep.equal([
        {
          type: 'union',
          patterns: [
            { type: 'bgp', triples: [{subject: '?s', predicate: '?p', object: '?o'}] },
            { type: 'bgp', triples: [{subject: '?a', predicate: '?b', object: '?c'}] },
          ]
        },
      ]);
    });
  });
});
