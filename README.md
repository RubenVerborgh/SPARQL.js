# SPARQL.js – A SPARQL 1.1 parser for JavaScript
[![Build Status](https://travis-ci.org/RubenVerborgh/SPARQL.js.svg?branch=master)](https://travis-ci.org/RubenVerborgh/SPARQL.js)
[![npm version](https://badge.fury.io/js/sparqljs.svg)](https://www.npmjs.com/package/sparqljs)
[![DOI](https://zenodo.org/badge/22990236.svg)](https://zenodo.org/badge/latestdoi/22990236)

The [SPARQL 1.1 Query Language](http://www.w3.org/TR/sparql11-query/) allows to query datasources of [RDF triples](http://www.w3.org/TR/rdf11-concepts/).
SPARQL.js translates SPARQL into JSON and back,
so you can parse and build SPARQL queries in your JavaScript applications.

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
var generator = new SparqlGenerator();
parsedQuery.variables = ['?mickey'];
var generatedQuery = generator.stringify(parsedQuery);
```
### Standalone
```bash
$ sparql-to-json query.sparql
```

### Browser
Through [browserify](http://browserify.org/):
```bash
$ cd SPARQL.js
$ npm install
$ browserify sparql.js -s sparqljs -i fs -i path -i _process > sparqljs-browser.js
$ uglifyjs sparqljs-browser.js -c -m > sparqljs-browser-min.js
```

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
  "type": "query",
  "prefixes": {
    "dbpedia-owl": "http://dbpedia.org/ontology/"
  },
  "queryType": "SELECT",
  "variables": [ "?p", "?c" ],
  "where": [
    {
      "type": "bgp",
      "triples": [
        {
          "subject": "?p",
          "predicate": "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
          "object": "http://dbpedia.org/ontology/Artist"
        },
        {
          "subject": "?p",
          "predicate": "http://dbpedia.org/ontology/birthPlace",
          "object": "?c"
        },
        {
          "subject": "?c",
          "predicate": "http://xmlns.com/foaf/0.1/name",
          "object": "\"York\"@en"
        }
      ]
    }
  ]
}
```

The representation of triples is the same as that of the [N3.js library](https://github.com/RubenVerborgh/N3.js#triple-representation).

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
