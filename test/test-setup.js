var N3 = require("n3");

// Parses a JSON object, restoring `undefined` values
global.parseJSON = function parseJSON(string) {
  var object = JSON.parse(string);
  return /"\{undefined\}"/.test(string) ? restoreUndefined(object) : object;
}

// Recursively replace values of "{undefined}" by `undefined`
function restoreUndefined(object) {
  for (var key in object) {
    var item = object[key];
    if (typeof item === 'object')
      object[key] = restoreUndefined(item);
    else if (item === '{undefined}')
      object[key] = undefined;
  }
  return object;
}



// Test function which checks if object are equal, keeping into account how N3.DataFactory works
global.objectsEqual = function (one, two){
  if (isPrimitive(one) || one === undefined){
    return one === two;
  }

  if (one instanceof N3.DataFactory.internal.Term){
    return one.equals(two);
  } else if (two instanceof N3.DataFactory.internal.Term){
    return two.equals(one);
  } else {
    if (Array.isArray(one) && Array.isArray(two)){
      if (one.length !== two.length) return false;
      for (let i = 0; i < one.length; i++){
        if (! objectsEqual(one[i], two[i])) return false;
      }
    } else {
      let keys_first = Object.keys(one);

      for (key of keys_first){
        if (! objectsEqual(one[key], two[key])) return false;
      }
    }
    return true;
  }
};

global.isPrimitive = function (value){
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
};
