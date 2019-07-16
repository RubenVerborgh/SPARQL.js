var SparqlParser = require('../sparql').Parser;

var fs = require('fs'),
    expect = require('chai').expect;

var N3 = require("n3");

var queriesPath = __dirname + '/../queries/';
var parsedQueriesPath = __dirname + '/../test/parsedQueries/';

// Test function which checks if object are equal, keeping into account how N3.DataFactory works
function objectsEqual(one, two){
  if (isPrimitive(one) || one === undefined){
    return one === two;
  }

  if (one instanceof N3.DataFactory.internal.Term){
    return one.equals(two);
  } else if (two instanceof N3.DataFactory.internal.Term){
    return two.equals(one);
  } else {
    if (Array.isArray(one) && Array.isArray(two)){
      if (one.length !== two.length) return false;
      for (let i = 0; i < one.length; i++){
        if (! objectsEqual(one[i], two[i])) return false;
      }
    } else {
      let keys_first = Object.keys(one);

      for (key of keys_first){
        if (! objectsEqual(one[key], two[key])) return false;
      }
    }
    return true;
  }
}

function isPrimitive(value){
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

describe('A SPARQL parser', function () {
  var parser = new SparqlParser(null, null, null);

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

      expect(objectsEqual(parser.parse(query), parsedQuery)).to.equal(true);
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
    var parser = new SparqlParser(null, null, null);
    var query = 'SELECT * { ?s ?p "1" . FILTER(true) . ?s ?p "2"  }';
    var groups = parser.parse(query).where;
    expect(groups[0].type).to.equal("bgp");
    expect(groups[1].type).to.equal("filter");
    expect(groups[2].type).to.equal("bgp");
  });

  describe('with pre-defined prefixes', function () {
    var prefixes = { a: 'ex:abc#', b: 'ex:def#' };
    var parser = new SparqlParser(prefixes, null, null);

    it('should use those prefixes', function () {
      var query = 'SELECT * { a:a b:b "" }';
      var result_json = '{"subject":{"termType":"NamedNode","value":"ex:abc#a"},"predicate":{"termType":"NamedNode","value":"ex:def#b"},"object":{"termType":"Literal","value":"","language":"","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}}}';

      expect(objectsEqual(parser.parse(query).where[0].triples[0], parseJSON(result_json)));
    });

    it('should allow temporarily overriding prefixes', function () {
      var query = 'PREFIX a: <ex:xyz#> SELECT * { a:a b:b "" }';
      var result = '{"subject":{"termType":"NamedNode","value":"ex:xyz#a"},"predicate":{"termType":"NamedNode","value":"ex:def#b"},"object":{"termType":"Literal","value":"","language":"","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}}}';
      expect(objectsEqual(parser.parse(query).where[0].triples[0], parseJSON(result))).to.equal(true);

      var query2 = 'SELECT * { a:a b:b "" }';
      var result2 = '{"subject":{"termType":"NamedNode","value":"ex:abc#a"},"predicate":{"termType":"NamedNode","value":"ex:def#b"},"object":{"termType":"Literal","value":"","language":"","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}}}';
      expect(objectsEqual(parser.parse(query2).where[0].triples[0], parseJSON(result2))).to.equal(true);
    });

    it('should not change the original prefixes', function () {
      expect(prefixes).to.deep.equal({ a: 'ex:abc#', b: 'ex:def#' });
    });

    it('should not take over changes to the original prefixes', function () {
      var query = 'SELECT * { a:a b:b "" }';
      var result = '{"subject":{"termType":"NamedNode","value":"ex:abc#a"},"predicate":{"termType":"NamedNode","value":"ex:def#b"},"object":{"termType":"Literal","value":"","language":"","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}}}';
      prefixes.a = 'ex:xyz#';

      expect(objectsEqual(parser.parse(query).where[0].triples[0], parseJSON(result))).to.equal(true);
    });
  });

  describe('with pre-defined base IRI', function () {
    var parser = new SparqlParser(null, 'http://ex.org/', null);

    it('should use the base IRI', function () {
      var query = 'SELECT * { <> <#b> "" }';
      var result = '{"subject":{"termType":"NamedNode","value":"http://ex.org/"},"predicate":{"termType":"NamedNode","value":"http://ex.org/#b"},"object":{"termType":"Literal","value":"","language":"","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}}}';

      expect(objectsEqual(parser.parse(query).where[0].triples[0], parseJSON(result)));
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
    var parser = new SparqlParser(null, null, null);

    it('should keep explicit pattern group', function () {
      var query = 'SELECT * WHERE { { ?s ?p ?o } ?a ?b ?c }';
      var result = '[{"type":"group","patterns":[{"type":"bgp","triples":[{"subject":{"termType":"Variable","value":"s"},"predicate":{"termType":"Variable","value":"p"},"object":{"termType":"Variable","value":"o"}}]}]},{"type":"bgp","triples":[{"subject":{"termType":"Variable","value":"a"},"predicate":{"termType":"Variable","value":"b"},"object":{"termType":"Variable","value":"c"}}]}]';

      expect(objectsEqual(parser.parse(query).where, parseJSON(result))).to.equal(true);
    });

    it('should still collapse immediate union groups', function () {
      var query = 'SELECT * WHERE { { ?s ?p ?o } UNION { ?a ?b ?c } }';
      var result = '[{"type":"union","patterns":[{"type":"bgp","triples":[{"subject":{"termType":"Variable","value":"s"},"predicate":{"termType":"Variable","value":"p"},"object":{"termType":"Variable","value":"o"}}]},{"type":"bgp","triples":[{"subject":{"termType":"Variable","value":"a"},"predicate":{"termType":"Variable","value":"b"},"object":{"termType":"Variable","value":"c"}}]}]}]';

      expect(objectsEqual(parser.parse(query).where, parseJSON(result))).to.equal(true);
    });
  });
});
