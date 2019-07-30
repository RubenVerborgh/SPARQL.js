var Term = require('n3').DataFactory.internal.Term;

// Wildcard constructor
class Wildcard extends Term {
  constructor() {
    super('');
    return WILDCARD || this;
  }

  get termType() {
    return 'Wildcard';
  }

  equals(other) {
    return other && (this.termType === other.termType);
  }
}

Object.defineProperty(Wildcard.prototype, 'value', {
  enumerable: true,
  value: '*',
});


// Wildcard singleton
var WILDCARD = new Wildcard();

module.exports.Wildcard = Wildcard;
