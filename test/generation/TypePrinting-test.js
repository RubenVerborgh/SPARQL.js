const SparqlParser = require("../../sparql").Parser;
const SparqlGenerator = require("../../sparql").Generator;
const expect = require("expect");

const queryString = `SELECT ?toto WHERE {
  VALUES ?toto {
    "PARIS"^^<http://www.w3.org/2001/XMLSchema#string> 
  }
}`;
const queryInteger = `SELECT ?toto WHERE {
  VALUES ?toto {
    "42"^^<http://www.w3.org/2001/XMLSchema#integer> 
  }
}`;

function generateSparql(inputStringQuery, options) {
  const sparqlParser = new SparqlParser();
  let selectQueryAST;
  try {
    selectQueryAST = sparqlParser.parse(inputStringQuery);
  } catch (e) {
    throw Error(`Could not parse "${inputStringQuery}" :\n${e}`);
  }

  const generator = new SparqlGenerator(options);
  let outputQueryString;
  try {
    outputQueryString = generator.stringify(selectQueryAST);
  } catch (e) {
    throw Error(
      `Could not generate "${JSON.parse(selectQueryAST, null, 2)}" :\n${e}`
    );
  }
  return outputQueryString;
}

describe("Generation - Type Option", function () {
  describe("String Type Generation Tests", function () {
    it("should not generate type by default", function () {
      const expected = `SELECT ?toto WHERE {
  VALUES ?toto {
    "PARIS"
  }
}`;
      const outputQueryString = generateSparql(queryString);
      expect(expected).toEqual(outputQueryString);
    });
    it("should not generate type with false option", function () {
      const expected = `SELECT ?toto WHERE {
  VALUES ?toto {
    "PARIS"
  }
}`;
      const outputQueryString = generateSparql(queryString, {
        explicitDatatype: false,
      });
      expect(expected).toEqual(outputQueryString);
    });
    it("should generate type with true option", function () {
      const expected = `SELECT ?toto WHERE {
  VALUES ?toto {
    "PARIS"^^<http://www.w3.org/2001/XMLSchema#string>
  }
}`;
      const outputQueryString = generateSparql(queryString, {
        explicitDatatype: true,
      });
      expect(expected).toEqual(outputQueryString);
    });
  });


  describe("Integer Type Generation Tests", function () {
    it("should not generate type by default", function () {
      const expected = `SELECT ?toto WHERE {
  VALUES ?toto {
    42 
  }
}`;
      const outputQueryString = generateSparql(queryInteger);
      expect(expected).toEqual(outputQueryString);
    });
    it("should not generate type with false option", function () {
      const expected = `SELECT ?toto WHERE {
  VALUES ?toto {
    42 
  }
}`;
      const outputQueryString = generateSparql(queryInteger, {
        explicitDatatype: false,
      });
      expect(expected).toEqual(outputQueryString);
    });
    it("should generate type with true option", function () {
      const expected = `SELECT ?toto WHERE {
  VALUES ?toto {
    "42"^^<http://www.w3.org/2001/XMLSchema#integer>
  }
}`;
      const outputQueryString = generateSparql(queryInteger, {
        explicitDatatype: true,
      });
      expect(expected).toEqual(outputQueryString);
    });
  });
});
