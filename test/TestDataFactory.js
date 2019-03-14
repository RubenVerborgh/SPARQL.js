// ## TestDataFactory functions
// Emulate old, pre-RDF/JS output (plain strings instead of Terms) to make tests pass

function namedNode(iri) {
  return iri;
}

function blankNode(name) {
  return '_:b' + name;
}

function literal(value, tag) {
  var suffix = '';
  if (tag)
    suffix = (/:/.test(tag) ? '^^' : '@') + tag;
  return '"' + value + '"' + suffix;
}

function variable(name) {
  return '?' + name;
}

module.exports = TestDataFactory = {
  namedNode: namedNode,
  blankNode: blankNode,
  variable:  variable,
  literal:   literal
};
