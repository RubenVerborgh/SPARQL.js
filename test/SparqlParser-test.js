var SparqlParser = require('../sparql').Parser;

var fs = require('fs');
var DataFactory = require('n3').DataFactory;

var expect = require("expect");
var toEqualParsedQuery = require("../test/matchers/toEqualParsedQuery");
expect.extend({
  toEqualParsedQuery,
});

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

      const parsed = parser.parse(query);
      expect(parsed).toEqualParsedQuery(parsedQuery);
    });
  });

  it('should throw an error on an invalid query', function () {
    var query = 'invalid', error = null;
    try { parser.parse(query); }
    catch (e) { error = e; }

    expect(error).not.toBeUndefined();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Parse error on line 1');
  });

  it('should preserve BGP and filter pattern order', function () {
    var parser = new SparqlParser();
    var query = 'SELECT * { ?s ?p "1" . FILTER(true) . ?s ?p "2"  }';
    var groups = parser.parse(query).where;
    expect(groups[0].type).toBe("bgp");
    expect(groups[1].type).toBe("filter");
    expect(groups[2].type).toBe("bgp");
  });

  describe('with pre-defined prefixes', function () {
    var prefixes = { a: 'ex:abc#', b: 'ex:def#' };
    var parser = new SparqlParser({ prefixes });

    it('should use those prefixes', function () {
      var query = 'SELECT * { a:a b:b "" }';
      var result_json = {subject: DataFactory.namedNode('ex:abc#a'),
      predicate: DataFactory.namedNode('ex:def#b'),
      object: DataFactory.literal("")};

      expect(parser.parse(query).where[0].triples[0]).toEqual(result_json);
    });

    it('should allow temporarily overriding prefixes', function () {
      var query = 'PREFIX a: <ex:xyz#> SELECT * { a:a b:b "" }';
      var result = {subject: DataFactory.namedNode("ex:xyz#a"),
        predicate:DataFactory.namedNode("ex:def#b"),
        object: DataFactory.literal(""),
      };
      expect(parser.parse(query).where[0].triples[0]).toEqualParsedQuery(result);

      var query2 = 'SELECT * { a:a b:b "" }';
      var result2 = {subject: DataFactory.namedNode("ex:abc#a"),
        predicate:DataFactory.namedNode("ex:def#b"),
        object: DataFactory.literal(""),
      };
      expect(parser.parse(query2).where[0].triples[0]).toEqualParsedQuery(result2);
    });

    it('should not change the original prefixes', function () {
      expect(prefixes).toEqual({ a: 'ex:abc#', b: 'ex:def#' });
    });

    it('should not take over changes to the original prefixes', function () {
      var query = 'SELECT * { a:a b:b "" }';
      var result = {subject: DataFactory.namedNode("ex:abc#a"),
        predicate: DataFactory.namedNode("ex:def#b"),
        object: DataFactory.literal("")
      };
      prefixes.a = 'ex:xyz#';

      expect(parser.parse(query).where[0].triples[0]).toEqualParsedQuery(result);
    });
  });

  describe('with pre-defined base IRI', function () {
    var parser = new SparqlParser({ baseIRI: 'http://ex.org/' });

    it('should use the base IRI', function () {
      var query = 'SELECT * { <> <#b> "" }';
      var result = '{"subject":{"termType":"NamedNode","value":"http://ex.org/"},"predicate":{"termType":"NamedNode","value":""},"object":{"termType":"Literal","value":"","language":"","datatype":{"termType":"NamedNode","value":"http://www.w3.org/2001/XMLSchema#string"}}}';
      var result = {subject: DataFactory.namedNode("http://ex.org/"),
        predicate: DataFactory.namedNode("http://ex.org/#b"),
        object: DataFactory.literal("")
      };

      expect(parser.parse(query).where[0].triples[0]).toEqualParsedQuery(result);
    });
  });

  it('should throw an error on relative IRIs if no base IRI is specified', function () {
    var query = 'SELECT * { <a> <b> <c> }', error = null;
    try { parser.parse(query); }
    catch (e) { error = e; }

    expect(error).not.toBeUndefined();
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Cannot resolve relative IRI a because no base IRI was set.');
  });

  describe('with group collapsing disabled', function () {
    var parser = new SparqlParser();

    it('should keep explicit pattern group', function () {
      var query = 'SELECT * WHERE { { ?s ?p ?o } ?a ?b ?c }';
      var result = ',"object":{"termType":"Variable","value":"c"}}]}]';
      var result = [
        {
          type: "group",
          patterns: [
            {
              type: "bgp",
              triples: [
                {
                  subject: DataFactory.variable("s"),
                  predicate: DataFactory.variable("p"),
                  object: DataFactory.variable("o")
                }
              ]
            }
          ]
        },
        {
          type: "bgp",
          triples: [
            {
              subject: DataFactory.variable("a"),
              predicate: DataFactory.variable("b"),
              object: DataFactory.variable("c")
            }
          ]
        }
      ];

      expect(parser.parse(query).where).toEqualParsedQuery(result);
    });

    it('should still collapse immediate union groups', function () {
      var query = 'SELECT * WHERE { { ?s ?p ?o } UNION { ?a ?b ?c } }';
      var result = '[{"type":"union","patterns":[{"type":"bgp","triples":[{"subject":{"termType":"Variable","value":"s"},"predicate":{"termType":"Variable","value":"p"},"object":{"termType":"Variable","value":"o"}}]},{"type":"bgp","triples":[{"subject":{"termType":"Variable","value":"a"},"predicate":{"termType":"Variable","value":"b"},"object":{"termType":"Variable","value":"c"}}]}]}]';

      expect(parser.parse(query).where).toEqualParsedQuery(parseJSON(result));
    });
  });
});
