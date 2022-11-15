const diff = require('jest-diff');
const {Wildcard} = require('../../lib/Wildcard');
const {BlankNode, Variable, NamedNode, DefaultGraph, Quad} = require('rdf-data-factory');

function toEqualParsedQuery(received, expected) {
    const options = {
        isNot: this.isNot,
        promise: this.promise,
    };

    let message;
    let pass;

    pass = objectsEqual(received, expected);
    message = pass
        ? () =>
            this.utils.matcherHint('toEqualParsedQuery', undefined, undefined, options) +
            '\n\n' +
            `Expected: ${this.utils.printExpected(expected)}\n` +
            `Received: ${this.utils.printReceived(received)}`
        : () => {
            const diffString = diff(expected, received, {
                expand: this.expand,
            });
            return (
                this.utils.matcherHint('toEqualParsedQuery', undefined, undefined, options) +
                '\n\n' +
                (diffString && diffString.includes('- Expect')
                    ? `Difference:\n\n${diffString}`
                    : `Expected: ${this.utils.printExpected(expected)}\n` +
                    `Received: ${this.utils.printReceived(received)}`)
            );
        };



    return {actual: received, message, pass};
}


// Test function which checks if object are equal
let objectsEqual = function (received, expected){
    if (isPrimitive(received) || received === undefined){
        return received === expected;
    }

    if (isTerm(received)) {
        return received.equals(expected);
    } else if (isTerm(expected)) {
        return expected.equals(received);
    } else {
        if (Array.isArray(received)){
            if (! Array.isArray(expected)) return false;
            if (received.length !== expected.length) return false;
            for (let i = 0; i < received.length; i++){
                if (! objectsEqual(received[i], expected[i])) return false;
            }
        } else { // received == object
            if (isPrimitive(expected) || Array.isArray(expected)) return false;
            let keys_first = Object.keys(received);

            for (let key of keys_first){
                if (! objectsEqual(received[key], expected[key])) return false;
            }

            // We do this to make sure that we are not missing keys in the received object
            let keys_second = Object.keys(expected);
            for (let key of keys_second){
                if (! objectsEqual(received[key], expected[key])) return false;
            }
        }
        return true;
    }
};

function isTerm(value) {
    return value instanceof DefaultGraph
        || value instanceof NamedNode
        || value instanceof BlankNode
        || value instanceof Variable
        || value instanceof Wildcard
        || value instanceof Quad;
}

function isPrimitive(value){
    return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

module.exports = toEqualParsedQuery;
