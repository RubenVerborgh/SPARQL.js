// ## TestDataFactory functions
// Emulate old, pre-RDF/JS output (plain strings instead of Terms) to make tests pass

// ### Creates an IRI
function namedNode(iri) {
  return iri;
}

// ### Creates a blank node
function blankNode(name) {
  return '_:b' + name;
}

// ### Creates a literal
function literal(value, tag) {
  if (tag) {
    if (tag.length < 10) // hacky "heuristic" for test purposes only
      return value + '@' + tag; // language tag
    return value + '^^' + tag; // typed literal
  }
  return value;
}

// ### Creates a variable
function variable(name) {
  return '?' + name;
}

// ## Module exports
module.exports = TestDataFactory = {
  // ### Public factory functions
  namedNode: namedNode,
  blankNode: blankNode,
  variable:  variable,
  literal:   literal
};
