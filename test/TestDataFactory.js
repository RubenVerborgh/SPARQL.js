// ## TestDataFactory functions
// Emulate old, pre-RDF/JS output (plain strings instead of Terms) to make tests pass

var XSD  = 'http://www.w3.org/2001/XMLSchema#';

const xsd = {
    decimal: XSD + 'decimal',
    boolean: XSD + 'boolean',
    double:  XSD + 'double',
    integer: XSD + 'integer',
    string:  XSD + 'string',
  };

// ### Creates an IRI
function namedNode(iri) {
  return iri;
}

// ### Creates a blank node
function blankNode(name) {
  return '_:b' + name;
}

// ### Creates a literal
function literal(value, languageOrDataType) {
  // Create a language-tagged string
  if (typeof languageOrDataType === 'string')
    return value + '@' + languageOrDataType.toLowerCase();

  // Create a datatyped literal
  var datatype = languageOrDataType && languageOrDataType.value || '';
  if (!datatype) {
    switch (typeof value) {
    // Convert a boolean
    case 'boolean':
      datatype = xsd.boolean;
      break;
    // Convert an integer or double
    case 'number':
      if (Number.isFinite(value))
        datatype = Number.isInteger(value) ? xsd.integer : xsd.double;
      else {
        datatype = xsd.double;
        if (!Number.isNaN(value))
          value = value > 0 ? 'INF' : '-INF';
      }
      break;
    // No datatype, so convert a plain string
    default:
      return value;
    }
  }
  return '"' + value + '"^^' + datatype;
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
