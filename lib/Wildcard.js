
// Wildcard constructor
class Wildcard {
  constructor() {
    return WILDCARD || this;
  }

  equals(other) {
    return other && (this.termType === other.termType);
  }
}

Object.defineProperty(Wildcard.prototype, 'value', {
  enumerable: true,
  value: '*',
});

Object.defineProperty(Wildcard.prototype, 'termType', {
  enumerable: true,
  value: 'Wildcard',
});


// Wildcard singleton
var WILDCARD = new Wildcard();

module.exports.Wildcard = Wildcard;
