var XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

module.exports = function SparqlGenerator() { return { stringify: toQuery }; };


window.prefixes = null;
window.usedPrefixes = {};

// Converts the parsed query object into a SPARQL query
function toQuery(q) {
  var query = ''
  window.prefixes = q.prefixes;

  if (q.queryType)
    query += q.queryType.toUpperCase() + ' ';
  if (q.reduced)
    query += 'REDUCED ';
  if (q.distinct)
    query += 'DISTINCT ';

  if (q.variables)
    query += mapJoin(q.variables, function (variable) {
      return isString(variable) ? toEntity(variable) :
             '(' + toExpression(variable.expression) + ' AS ' + variable.variable + ')';
    }) + ' ';
  else if (q.template)
    query += patterns.group(q.template, true) + '\n';

  if (q.from)
    query += mapJoin(q.from.default || [], function (g) { return 'FROM ' + toEntity(g) + '\n'; }, '') +
             mapJoin(q.from.named || [], function (g) { return 'FROM NAMED ' + toEntity(g) + '\n'; }, '');
  if (q.where)
    query += 'WHERE ' + patterns.group(q.where, true)  + '\n';

  if (q.updates)
    query += mapJoin(q.updates, toUpdate, ';\n');

  if (q.group)
    query += 'GROUP BY ' + mapJoin(q.group, function (it) {
      return isString(it.expression) ? it.expression : '(' + toExpression(it.expression) + ')';
    }) + '\n';
  if (q.having)
    query += 'HAVING (' + mapJoin(q.having, toExpression) + ')\n';
  if (q.order)
    query += 'ORDER BY ' + mapJoin(q.order, function (it) {
      var expr = toExpression(it.expression);
      return !it.descending ? expr : 'DESC(' + expr + ')';
    }) + '\n';

  if (q.offset)
    query += 'OFFSET ' + q.offset + '\n';
  if (q.limit)
    query += 'LIMIT ' + q.limit + '\n';

  if (q.values)
    query += patterns.values(q);

  for (var key in q.prefixes){
    if( !window.usedPrefixes[key] )
      continue;
    query = 'PREFIX ' + key + ': <' + q.prefixes[key] + '>\n' + query;
  }

  return query.trim();
}

// Converts the parsed SPARQL pattern into a SPARQL pattern
function toPattern(pattern) {
  var type = pattern.type || (pattern instanceof Array) && 'array' ||
             (pattern.subject && pattern.predicate && pattern.object ? 'triple' : '');
  if (!(type in patterns))
    throw new Error('Unknown entry type: ' + type);
  return patterns[type](pattern);
}
var patterns = {
  triple: function (t) {
    return toEntity(t.subject) + ' ' + toEntity(t.predicate) + ' ' + toEntity(t.object) + '.';
  },
  array: function (items) {
    return mapJoin(items, toPattern, '\n');
  },
  bgp: function (bgp) {
    return mapJoin(bgp.triples, patterns.triple, '\n');
  },
  graph: function (graph) {
    return 'GRAPH ' + toEntity(graph.name) + ' ' + patterns.group(graph);
  },
  group: function (group, inline) {
    group = inline !== true ? patterns.array(group.patterns || group.triples)
                            : toPattern(group.type !== 'group' ? group : group.patterns);
    return group.indexOf('\n') === -1 ? '{ ' + group + ' }' : '{\n' + indent(group) + '\n}';
  },
  query: function (query) {
    return '{\n' + indent(toQuery(query)) + '\n}';
  },
  filter: function (filter) {
    return 'FILTER(' + toExpression(filter.expression) + ')';
  },
  bind: function (bind) {
    return 'BIND(' + toExpression(bind.expression) + ' AS ' + bind.variable + ')';
  },
  optional: function (optional) {
    return 'OPTIONAL ' + patterns.group(optional);
  },
  union: function (union) {
    return mapJoin(union.patterns, function (p) { return patterns.group(p, true); }, '\nUNION\n');
  },
  minus: function (minus) {
    return 'MINUS ' + patterns.group(minus);
  },
  values: function (valuesList) {
    // Gather unique keys
    var keys = Object.keys(valuesList.values.reduce(function (keyHash, values) {
      for (var key in values) keyHash[key] = true;
      return keyHash;
    }, {}));
    // Create value rows
    return 'VALUES (' + keys.join(' ') + ') {\n' +
      mapJoin(valuesList.values, function (values) {
        return '  (' + mapJoin(keys, function (key) {
          return values[key] !== undefined ? toEntity(values[key]) : 'UNDEF';
        }) + ')';
      }, '\n') + '\n}';
  },
  service: function (service) {
    return 'SERVICE ' + (service.silent ? 'SILENT ' : '') + toEntity(service.name) + ' ' +
           patterns.group(service);
  },
};

// Converts the parsed expression object into a SPARQL expression
function toExpression(expr) {
  if (isString(expr))
    return toEntity(expr);

  switch (expr.type.toLowerCase()) {
    case 'aggregate':
      return expr.aggregation.toUpperCase() +
             '(' + (expr.distinct ? 'DISTINCT ' : '') + toExpression(expr.expression) +
             (expr.separator ? '; SEPARATOR = ' + toEntity('"' + expr.separator + '"') : '') + ')';
    case 'functioncall':
      return toEntity(expr.function) + '(' + mapJoin(expr.args, toExpression, ', ') + ')';
    case 'operation':
      var operator = expr.operator.toUpperCase(), args = expr.args || [], arg = args[0];
      switch (expr.operator.toLowerCase()) {
      // Infix operators
      case '<':
      case '>':
      case '>=':
      case '<=':
      case '&&':
      case '||':
      case '=':
      case '!=':
      case '+':
      case '-':
      case '*':
      case '/':
        return mapJoin(args, function (arg) {
          return isString(arg) ? toEntity(arg) : '(' + toExpression(arg) + ')';
        }, ' ' + operator + ' ');
      // Unary operators
      case '!':
        return '!' + toExpression(arg);
      // IN and NOT IN
      case 'notin':
        operator = 'NOT IN';
      case 'in':
        return toExpression(arg) + ' ' + operator +
               '(' + (isString(arg = args[1]) ? arg : mapJoin(arg, toExpression, ', ')) + ')';
      // EXISTS and NOT EXISTS
      case 'notexists':
        operator = 'NOT EXISTS';
      case 'exists':
        return operator + ' ' + patterns.group(arg, true);
      // Other expressions
      default:
        return operator + '(' + mapJoin(args, toExpression, ', ') + ')';
      }
    default:
      throw new Error('Unknown expression type: ' + expr.type);
  }
}

// Converts the parsed entity (or property path) into a SPARQL entity
function toEntity(value) {
  // regular entity
  if (isString(value)) {
    switch (value[0]) {
    // variable, * selector, or blank node
    case '?':
    case '$':
    case '*':
    case '_':
      return value;
    // literal
    case '"':
      var match = value.match(/^"([^]*)"(?:(@.+)|\^\^(.+))?$/) || {},
          lexical = match[1] || '', language = match[2] || '', datatype = match[3];
      value = '"' + lexical.replace(escape, escapeReplacer) + '"' + language;
      if (datatype) {
        if (datatype === XSD_INTEGER && /^\d+$/.test(lexical)) return lexical;
        value += '^^<' + datatype + '>';
      }
      return value;
    // IRI
    default:
      for (var key in window.prefixes) {
        if( value.indexOf(window.prefixes[key]) === 0 ){
          window.usedPrefixes[key] = true;
          value = value.replace(window.prefixes[key], '');
          return key +':'+ value;
	}
      }

      return '<' + value + '>';
    }
  }
  // property path
  else {
    var items = value.items.map(toEntity), path = value.pathType;
    switch (path) {
    // prefix operator
    case '^':
    case '!':
      return path + items[0];
    // postfix operator
    case '*':
    case '+':
    case '?':
      return items[0] + path;
    // infix operator
    default:
      return '(' + items.join(path) + ')';
    }
  }
}
var escape = /["\\\t\n\r\b\f]/g,
    escapeReplacer = function (c) { return escapeReplacements[c]; },
    escapeReplacements = { '\\': '\\\\', '"': '\\"', '\t': '\\t',
                           '\n': '\\n', '\r': '\\r', '\b': '\\b', '\f': '\\f' };

// Converts the parsed update object into a SPARQL update clause
function toUpdate(update) {
  switch (update.type || update.updateType) {
  case 'load':
    return 'LOAD' + (update.source ? ' ' + toEntity(update.source) : '') +
           (update.destination ? ' INTO GRAPH ' + toEntity(update.destination) : '');
  case 'insert':
    return 'INSERT DATA '  + patterns.group(update.insert, true);
  case 'delete':
    return 'DELETE DATA '  + patterns.group(update.delete, true);
  case 'deletewhere':
    return 'DELETE WHERE ' + patterns.group(update.delete, true);
  case 'insertdelete':
    return (update.graph ? 'WITH ' + toEntity(update.graph) + '\n' : '') +
           (update.delete.length ? 'DELETE ' + patterns.group(update.delete, true) + '\n' : '') +
           (update.insert.length ? 'INSERT ' + patterns.group(update.insert, true) + '\n' : '') +
           'WHERE ' + patterns.group(update.where, true);
  case 'add':
  case 'copy':
  case 'move':
    return update.type.toUpperCase() + (update.source.default ? ' DEFAULT ' : ' ') +
           'TO ' + toEntity(update.destination.name);
  default:
    throw new Error('Unknown update query type: ' + update.type);
  }
}

// Checks whether the object is a string
function isString(object) { return typeof object === 'string'; }

// Maps the array with the given function, and joins the results using the separator
function mapJoin(array, func, sep) { return array.map(func).join(isString(sep) ? sep : ' '); }

// Indents each line of the string
function indent(text) { return text.replace(/^/gm, '  '); }
