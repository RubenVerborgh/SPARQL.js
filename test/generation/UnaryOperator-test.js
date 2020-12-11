const SparqlParser = require('../sparql').Parser;
const SparqlGenerator = require('../sparql').Generator;
const expect = require('expect');

describe('Unary Operator Support Test', function () {

  it('should unparse unary minus', function () {
    const query = `SELECT ?toto WHERE {
  VALUES ?toto {
    "-5"^^<http://www.w3.org/2001/XMLSchema#integer>
    12 
  }
  FILTER(?toto < (-(2  + 2 )))
}`;

    const sparqlParser = new SparqlParser();
    let selectQueryAST;
    try {
      selectQueryAST = sparqlParser.parse(query);
    } catch (e) {
      throw Error(`Could not parse "${query}" :\n${e}`);
    }

    const generator = new SparqlGenerator({});
    let outputQueryString;
    try {
      outputQueryString = generator.stringify(selectQueryAST);
    } catch (e) {
      throw Error(`Could not generate "${JSON.parse(selectQueryAST, null, 2)}" :\n${e}`);
    }

    const trimedInputQuery = query.replace(/  /g, " ");
    const trimedOutputQuery = outputQueryString.replace(/  /g, " ");

    expect(trimedOutputQuery).toEqual(trimedInputQuery);
  });
});
