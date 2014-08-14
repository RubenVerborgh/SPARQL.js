#!/usr/bin/env node
var fs = require('fs');
var lines = fs.readFileSync('SPARQL-EBNF.txt', { encoding: 'utf-8' }).split(/\n/);

// Parse all lines for terminals
var symbols = {}, terminals = {}, classes = {};
lines.forEach(function (line) {
  var parts = line.match(/^(\w+)\s*::=\s*(.*)$/);
  if (parts) {
    var name = parts[1], value = parts[2];
    if (!/[a-z]/.test(name)) {
      classes[name] = value;
    }
    else {
      var terminalMatcher = /(?:^|\s)(?:'([^']+)'|"([^"]+)")/g, match;
      while ((match = terminalMatcher.exec(value)) && (match = match[1] || match[2]))
        terminals[match] = toDoubleQuoted(match).replace(/^"(\w+) (\w+)"$/, '"$1"\\s+"$2"');
      symbols[name] = value;
    }
  }
});

function println() {
  var args = [''];
  for (var i = 0; i < arguments.length; i++)
    args[0] += (i === 0 ? '%s' : ' %s'), args[i + 1] = arguments[i];
  console.log.apply(console, args);
}

function toSingleQuoted(string) {
  return "'" + string.replace(/\\/g, '\\\\').replace(/'/g, '\\"') + "'";
}
function toDoubleQuoted(string) {
  return '"' + string.replace(/\\/g, '\\\\').replace(/"/g, "\\'") + '"';
}
function toTerminalId(string) {
  return toSingleQuoted(string).replace(/\s+/g, '');
}
function getLength(string) {
  return string.length;
}
function pad(string, length) {
  while (string.length < length)
    string += ' ';
  return string;
}
function escapeForRegex(string) {
  return string.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|"]/g, '\\$&');
}


// Generate JISON grammar skeleton

println('%lex\n');

// Write classes
var maxLength = Math.max.apply(null, Object.keys(classes).map(getLength)) + 1;
for (var className in classes) {
  var value = classes[className];
  value = value.replace(/(^|\s|\()([A-Z_]+)/g, '$1{$2}');
  value = value.replace(/'\\'/g, '"\\\\"');
  value = value.replace(/'"'/, '"\\""');
  value = value.replace(/'"""'/, '"\\"\\"\\""');
  value = value.replace(/'([^'"]+?)'/g, '"$1"').replace(/\s+/g, '');
  value = value.replace(/(\[\^?)([^-]+?)(\])(?!")/g, function (match, start, characters, end) {
    return start + escapeForRegex(characters) + end;
  });
  value = value.replace(/#x([0-9A-F]{4})/g, '\\u$1');
  value = value.replace(/#x([0-9A-F]{3})/g, '\\u0$1');
  value = value.replace(/#x([0-9A-F]{2})/g, '\\u00$1');
  value = value.replace(/#x([0-9A-F]{1})/g, '\\u000$1');
  value = value.replace('[\\u10000-\\uEFFFF]', '[\\uD800-\\uDB7F][\\uDC00-\\uDFFF]');
  value = value.replace(/\[(.+?)\]-\[(.+?)\]/g, '[$1$2]');
  println(pad(className, maxLength), value);
  terminals[className] = '{' + className + '}';
}
println();

println('%options flex case-insensitive\n');

println('%%\n');

// Write terminals
maxLength = Math.max.apply(null, Object.keys(terminals).map(getLength)) + 4;
println(pad('\\s+', maxLength), '/* ignore */');
for (var terminal in terminals) {
  println(pad(terminals[terminal], maxLength), "return", toTerminalId(terminal));
};
println(pad("<<EOF>>", maxLength), "return 'EOF'");
println(pad(".", maxLength), "return 'INVALID'");
println();

println('/lex\n');
println('%ebnf\n');
println('%start QueryUnit\n');
println('%%\n');

// Write production rules
symbols.QueryUnit = 'Query EOF';
for (var symbol in symbols) {
  println(symbol, ':', symbols[symbol].replace(/\s+/g, ' '), ';');
}
