
// Wildcard constructor
class Wildcard {
  constructor() {
    if (WILDCARD) {
      return WILDCARD;
    }

    Object.defineProperty(this, 'termType', {
      enumerable: true,
      value: 'Wildcard',
    });
    
    Object.defineProperty(this, 'value', {
      enumerable: true,
      value: '*',
    });

    return this;
  }

  equals(other) {
    return other && (this.termType === other.termType);
  }
}

// Wildcard singleton
var WILDCARD = new Wildcard();

module.exports.Wildcard = Wildcard;
