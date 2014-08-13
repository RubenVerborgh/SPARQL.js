#!/usr/bin/env node
var fs = require('fs');
var lines = fs.readFileSync('SPARQL-EBNF.txt', { encoding: 'utf-8' }).split(/\n/);

// Parse all lines for terminals
var symbols = {}, terminals = {};
lines.forEach(function (line) {
  var parts = line.match(/^(\w+)\s*::=\s*(.*)$/);
  if (parts) {
    var name = parts[1], value = parts[2];
    symbols[name] = value;
    var terminalMatcher = /(?:^|\s)(?:'([^']+)'|"([^"]+)")/g, match;
    while ((match = terminalMatcher.exec(value)) && (match = match[1] || match[2]))
      terminals[match] = match;
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

function pad(string, length) {
  while (string.length < length)
    string += ' ';
  return string;
}


// Generate JISON grammar skeleton

println('%lex\n');

println('%options flex case-insensitive\n');

println('%%\n');

// Write terminals
terminals = Object.keys(terminals);
var maxLength = Math.max.apply(null, terminals.map(function (t) { return t.length; })) + 4;
println(pad('\\s+', maxLength), '/* ignore */');
terminals.forEach(function (terminal) {
  var pattern = toDoubleQuoted(terminal).replace(/^"(\w+) (\w+)"$/, '"$1"\\s+"$2"');
  println(pad(pattern, maxLength), "return", toTerminalId(terminal));
});
println(pad("<<EOF>>", maxLength), "return 'EOF'\n");

println('/lex\n');
println('%ebnf\n');
println('%%\n');

// Write production rules
println('query');
println('  : (' + terminals.map(toTerminalId).join(' | ') + ') EOF;');
