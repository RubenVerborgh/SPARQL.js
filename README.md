# SPARQL.js – A SPARQL 1.1 parser for JavaScript
[![Build Status](https://github.com/RubenVerborgh/SPARQL.js/workflows/CI/badge.svg)](https://github.com/RubenVerborgh/SPARQL.js/actions)
[![npm version](https://badge.fury.io/js/sparqljs.svg)](https://www.npmjs.com/package/sparqljs)
[![DOI](https://zenodo.org/badge/22990236.svg)](https://zenodo.org/badge/latestdoi/22990236)

The [SPARQL 1.1 Query Language](http://www.w3.org/TR/sparql11-query/) allows to query datasources of [RDF triples](http://www.w3.org/TR/rdf11-concepts/).
SPARQL.js translates SPARQL into JSON and back,
so you can parse and build SPARQL queries in your JavaScript applications.
It also contains support for the [SPARQL*](https://blog.liu.se/olafhartig/2019/01/10/position-statement-rdf-star-and-sparql-star/) extension
under the `sparqlStar` option.

It fully supports the [SPARQL 1.1 specification](http://www.w3.org/TR/sparql11-query/), including [property paths](http://www.w3.org/TR/sparql11-query/#propertypaths), [federation](http://www.w3.org/TR/sparql11-federated-query/), and [updates](http://www.w3.org/TR/sparql11-update/).

## Usage
### Library
```JavaScript
// Parse a SPARQL query to a JSON object
var SparqlParser = require('sparqljs').Parser;
var parser = new SparqlParser();
var parsedQuery = parser.parse(
  'PREFIX foaf: <http://xmlns.com/foaf/0.1/> ' +
  'SELECT * { ?mickey foaf:name "Mickey Mouse"@en; foaf:knows ?other. }');

// Regenerate a SPARQL query from a JSON object
var SparqlGenerator = require('sparqljs').Generator;
var generator = new SparqlGenerator({ /* prefixes, baseIRI, factory, sparqlStar */ });
parsedQuery.variables = ['?mickey'];
var generatedQuery = generator.stringify(parsedQuery);
```
Set `sparqlStar` to `true` to allow [SPARQL*](https://blog.liu.se/olafhartig/2019/01/10/position-statement-rdf-star-and-sparql-star/) syntax.

Set `pathOnly` to `true` to parse SPARQL paths such as `foaf:name/foaf:knows` rather than the full SPARQL Algebra.

### Validation

By default SPARQL.js throws on queries that are syntactically correct, but not allowed by the spec.
Set `skipValidation` to `true` to skip validation.

```JavaScript
// Parse a SPARQL query without validation.
var SparqlParser = require('sparqljs').Parser;
var parser = new SparqlParser({ skipValidation: true });
var parsedQuery = parser.parse(
  'select (?x as ?xString)' +
  '(count(?y) as ?count)' +
  '{ ?x ?y ?z }');
```

### Standalone
```bash
$ sparql-to-json --strict query.sparql
```
Parse [SPARQL*](https://blog.liu.se/olafhartig/2019/01/10/position-statement-rdf-star-and-sparql-star/) syntax by default.
For pure [SPARQL 1.1](http://www.w3.org/TR/sparql11-query/), use the `--strict` flag.

## Representation
Queries are represented in a JSON structure. The most easy way to get acquainted with this structure is to try the examples in the `queries` folder through `sparql-to-json`. All examples of the [SPARQL 1.1 specification](http://www.w3.org/TR/sparql11-query/) have been included, in case you wonder how a specific syntactical construct is represented.

Here is a simple query in SPARQL:
```SPARQL
PREFIX dbpedia-owl: <http://dbpedia.org/ontology/>
SELECT ?p ?c WHERE {
    ?p a dbpedia-owl:Artist.
    ?p dbpedia-owl:birthPlace ?c.
    ?c <http://xmlns.com/foaf/0.1/name> "York"@en.
}
```

And here is the same query in JSON:
```JSON
{
  "queryType": "SELECT",
  "variables": [
    {
      "termType": "Variable",
      "value": "p"
    },
    {
      "termType": "Variable",
      "value": "c"
    }
  ],
  "where": [
    {
      "type": "bgp",
      "triples": [
        {
          "subject": {
            "termType": "Variable",
            "value": "p"
          },
          "predicate": {
            "termType": "NamedNode",
            "value": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
          },
          "object": {
            "termType": "NamedNode",
            "value": "http://dbpedia.org/ontology/Artist"
          }
        },
        {
          "subject": {
            "termType": "Variable",
            "value": "p"
          },
          "predicate": {
            "termType": "NamedNode",
            "value": "http://dbpedia.org/ontology/birthPlace"
          },
          "object": {
            "termType": "Variable",
            "value": "c"
          }
        },
        {
          "subject": {
            "termType": "Variable",
            "value": "c"
          },
          "predicate": {
            "termType": "NamedNode",
            "value": "http://xmlns.com/foaf/0.1/name"
          },
          "object": {
            "termType": "Literal",
            "value": "York",
            "language": "en",
            "datatype": {
              "termType": "NamedNode",
              "value": "http://www.w3.org/1999/02/22-rdf-syntax-ns#langString"
            }
          }
        }
      ]
    }
  ],
  "type": "query",
  "prefixes": {
    "dbpedia-owl": "http://dbpedia.org/ontology/"
  }
}
```

The representation of triples uses the [RDF/JS representation](http://rdf.js.org/).

## Installation
```bash
$ [sudo] npm [-g] install sparqljs
```

# License, status and contributions
The SPARQL.js library is copyrighted by [Ruben Verborgh](http://ruben.verborgh.org/)
and released under the [MIT License](https://github.com/RubenVerborgh/SPARQL.js/blob/master/LICENSE.md).

[Contributions are welcome](https://github.com/RubenVerborgh/SPARQL.js/blob/master/CONTRIBUTING.md), and bug reports or pull requests are always helpful.

## Contributors
- Thanks to [Tim Ermilov](https://github.com/yamalight) for [driving the SPARQL generator](https://github.com/RubenVerborgh/SPARQL.js/pull/9)
