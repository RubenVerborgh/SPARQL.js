// Parses a JSON object, restoring `undefined` values
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
