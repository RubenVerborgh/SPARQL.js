const SparqlParser = require('../../sparql').Parser;
const SparqlGenerator = require('../../sparql').Generator;
const expect = require('expect');

describe('Property Path Support Test', function () {

  it('should unparse double inverse property path', function () {
    const query = `ASK WHERE { ?s ^(^<a:a>) ?o. }`;

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
