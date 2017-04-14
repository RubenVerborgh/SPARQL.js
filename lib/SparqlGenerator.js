var XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

/**
 * @param options {
 *   allPrefixes: boolean
 * }
 */
module.exports = function SparqlGenerator(options) {
  return {
    stringify: function (q) { return new Generator(options, q.prefixes).toQuery(q); }
  };
};

function Generator(options, prefixes) {
  this.options = options || {};

  prefixes = prefixes || {};
  var prefixesArray = Object.keys(prefixes);
  var iriList = prefixesArray
    .map(function (prefix) { return prefixes[prefix] })
    .join('|')
    .replace(/[\]\/\(\)\*\+\?\.\\\$]/g, '\\$&');
  this.prefixRegex = new RegExp('^(' + iriList + ')[a-zA-Z][\\-_a-zA-Z0-9]*$', 'g');
  this.prefixByIri = prefixesArray.reduce(function (acc, prefix) {
    acc[prefixes[prefix]] = prefix;
    return acc;
  }, {});
  this.usedPrefixes = {};

  this.patterns = {};
  for (var key in PATTERNS) {
    this.patterns[key] = PATTERNS[key].bind(this);
  }
}

// Converts the parsed query object into a SPARQL query
Generator.prototype.toQuery = function (q) {
  var query = '';

  if (q.queryType)
    query += q.queryType.toUpperCase() + ' ';
  if (q.reduced)
    query += 'REDUCED ';
  if (q.distinct)
    query += 'DISTINCT ';

  if (q.variables)
    query += mapJoin(q.variables, undefined, function (variable) {
      return isString(variable) ? this.toEntity(variable) :
             '(' + this.toExpression(variable.expression) + ' AS ' + variable.variable + ')';
    }, this) + ' ';
  else if (q.template)
    query += this.patterns.group(q.template, true) + '\n';

  if (q.from)
    query += mapJoin(q.from.default || [], '', function (g) { return 'FROM ' + this.toEntity(g) + '\n'; }, this) +
             mapJoin(q.from.named || [], '', function (g) { return 'FROM NAMED ' + this.toEntity(g) + '\n'; }, this);
  if (q.where)
    query += 'WHERE ' + this.patterns.group(q.where, true)  + '\n';

  if (q.updates)
    query += mapJoin(q.updates, ';\n', this.toUpdate, this);

  if (q.group)
    query += 'GROUP BY ' + mapJoin(q.group, undefined, function (it) {
      return isString(it.expression) ? it.expression : '(' + this.toExpression(it.expression) + ')';
    }, this) + '\n';
  if (q.having)
    query += 'HAVING (' + mapJoin(q.having, undefined, this.toExpression, this) + ')\n';
  if (q.order)
    query += 'ORDER BY ' + mapJoin(q.order, undefined, function (it) {
      var expr = this.toExpression(it.expression);
      return !it.descending ? expr : 'DESC(' + expr + ')';
    }, this) + '\n';

  if (q.offset)
    query += 'OFFSET ' + q.offset + '\n';
  if (q.limit)
    query += 'LIMIT ' + q.limit + '\n';

  if (q.values)
    query += this.patterns.values(q);

  // stringify prefixes at the end to mark used ones
  query = this.baseAndPrefixes(q) + query;
  return query.trim();
}

Generator.prototype.baseAndPrefixes = function (q) {
  var base = q.base ? ('BASE <' + q.base + '>\n') : '';
  var prefixes = '';
  for (var key in q.prefixes) {
    if (!this.options.allPrefixes && !this.usedPrefixes[key]) { continue; }
    prefixes += 'PREFIX ' + key + ': <' + q.prefixes[key] + '>\n';
  }
  return base + prefixes;
}

// Converts the parsed SPARQL pattern into a SPARQL pattern
Generator.prototype.toPattern = function (pattern) {
  var type = pattern.type || (pattern instanceof Array) && 'array' ||
             (pattern.subject && pattern.predicate && pattern.object ? 'triple' : '');
  if (!(type in this.patterns))
    throw new Error('Unknown entry type: ' + type);
  return this.patterns[type](pattern);
}
var PATTERNS = {
  triple: function (t) {
    return this.toEntity(t.subject) + ' ' + this.toEntity(t.predicate) + ' ' + this.toEntity(t.object) + '.';
  },
  array: function (items) {
    return mapJoin(items, '\n', this.toPattern, this);
  },
  bgp: function (bgp) {
    return mapJoin(bgp.triples, '\n', this.patterns.triple, this);
  },
  graph: function (graph) {
    return 'GRAPH ' + this.toEntity(graph.name) + ' ' + this.patterns.group(graph);
  },
  group: function (group, inline) {
    group = inline !== true ? this.patterns.array(group.patterns || group.triples)
                            : this.toPattern(group.type !== 'group' ? group : group.patterns);
    return group.indexOf('\n') === -1 ? '{ ' + group + ' }' : '{\n' + indent(group) + '\n}';
  },
  query: function (query) {
    return '{\n' + indent(this.toQuery(query)) + '\n}';
  },
  filter: function (filter) {
    return 'FILTER(' + this.toExpression(filter.expression) + ')';
  },
  bind: function (bind) {
    return 'BIND(' + this.toExpression(bind.expression) + ' AS ' + bind.variable + ')';
  },
  optional: function (optional) {
    return 'OPTIONAL ' + this.patterns.group(optional);
  },
  union: function (union) {
    return mapJoin(union.patterns, '\nUNION\n', function (p) { return this.patterns.group(p, true); }, this);
  },
  minus: function (minus) {
    return 'MINUS ' + this.patterns.group(minus);
  },
  values: function (valuesList) {
    // Gather unique keys
    var keys = Object.keys(valuesList.values.reduce(function (keyHash, values) {
      for (var key in values) keyHash[key] = true;
      return keyHash;
    }, {}));
    // Create value rows
    return 'VALUES (' + keys.join(' ') + ') {\n' +
      mapJoin(valuesList.values, '\n', function (values) {
        return '  (' + mapJoin(keys, undefined, function (key) {
          return values[key] !== undefined ? this.toEntity(values[key]) : 'UNDEF';
        }, this) + ')';
      }, this) + '\n}';
  },
  service: function (service) {
    return 'SERVICE ' + (service.silent ? 'SILENT ' : '') + this.toEntity(service.name) + ' ' +
           this.patterns.group(service);
  },
};

// Converts the parsed expression object into a SPARQL expression
Generator.prototype.toExpression = function (expr) {
  if (isString(expr))
    return this.toEntity(expr);

  switch (expr.type.toLowerCase()) {
    case 'aggregate':
      return expr.aggregation.toUpperCase() +
             '(' + (expr.distinct ? 'DISTINCT ' : '') + this.toExpression(expr.expression) +
             (expr.separator ? '; SEPARATOR = ' + this.toEntity('"' + expr.separator + '"') : '') + ')';
    case 'functioncall':
      return this.toEntity(expr.function) + '(' + mapJoin(expr.args, ', ', this.toExpression, this) + ')';
    case 'operation':
      var operator = expr.operator.toUpperCase(), args = expr.args || [];
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
          return (isString(args[0]) ? this.toEntity(args[0]) : '(' + this.toExpression(args[0]) + ')') +
                 ' ' + operator + ' ' +
                 (isString(args[1]) ? this.toEntity(args[1]) : '(' + this.toExpression(args[1]) + ')');
      // Unary operators
      case '!':
        return '!' + this.toExpression(args[0]);
      // IN and NOT IN
      case 'notin':
        operator = 'NOT IN';
      case 'in':
        return this.toExpression(args[0]) + ' ' + operator +
               '(' + (isString(args[1]) ? args[1] : mapJoin(args[1], ', ', this.toExpression, this)) + ')';
      // EXISTS and NOT EXISTS
      case 'notexists':
        operator = 'NOT EXISTS';
      case 'exists':
        return operator + ' ' + this.patterns.group(args[0], true);
      // Other expressions
      default:
        return operator + '(' + mapJoin(args, ', ', this.toExpression, this) + ')';
      }
    default:
      throw new Error('Unknown expression type: ' + expr.type);
  }
}

// Converts the parsed entity (or property path) into a SPARQL entity
Generator.prototype.toEntity = function (value) {
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
        if (datatype === XSD_INTEGER && /^\d+$/.test(lexical))
          // Add space to avoid confusion with decimals in broken parsers
          return lexical + ' ';
        value += '^^' + this.encodeIRI(datatype);
      }
      return value;
    // IRI
    default:
      return this.encodeIRI(value);
    }
  }
  // property path
  else {
    var items = value.items.map(this.toEntity, this), path = value.pathType;
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

Generator.prototype.encodeIRI = function (iri) {
  // try to represent the IRI as prefixed name
  this.prefixRegex.lastIndex = 0;
  var prefixMatch, longestPrefix, prefixLength = -1;
  while (prefixMatch = this.prefixRegex.exec(iri)) {
    const matchedPrefixIRI = prefixMatch[1];
    if (matchedPrefixIRI.length > prefixLength) {
      longestPrefix = this.prefixByIri[matchedPrefixIRI];
      prefixLength = matchedPrefixIRI.length;
    }
  }

  if (longestPrefix !== undefined) {
    this.usedPrefixes[longestPrefix] = true;
    return longestPrefix + ':' + iri.substring(prefixLength);
  }

  return '<' + iri + '>';
}

// Converts the parsed update object into a SPARQL update clause
Generator.prototype.toUpdate = function (update) {
  switch (update.type || update.updateType) {
  case 'load':
    return 'LOAD' + (update.source ? ' ' + this.toEntity(update.source) : '') +
           (update.destination ? ' INTO GRAPH ' + this.toEntity(update.destination) : '');
  case 'insert':
    return 'INSERT DATA '  + this.patterns.group(update.insert, true);
  case 'delete':
    return 'DELETE DATA '  + this.patterns.group(update.delete, true);
  case 'deletewhere':
    return 'DELETE WHERE ' + this.patterns.group(update.delete, true);
  case 'insertdelete':
    return (update.graph ? 'WITH ' + this.toEntity(update.graph) + '\n' : '') +
           (update.delete.length ? 'DELETE ' + this.patterns.group(update.delete, true) + '\n' : '') +
           (update.insert.length ? 'INSERT ' + this.patterns.group(update.insert, true) + '\n' : '') +
           'WHERE ' + this.patterns.group(update.where, true);
  case 'add':
  case 'copy':
  case 'move':
    return update.type.toUpperCase() + (update.source.default ? ' DEFAULT ' : ' ') +
           'TO ' + this.toEntity(update.destination.name);
  default:
    throw new Error('Unknown update query type: ' + update.type);
  }
}

// Checks whether the object is a string
function isString(object) { return typeof object === 'string'; }

// Maps the array with the given function, and joins the results using the separator
function mapJoin(array, sep, func, self) {
  return array.map(func, self).join(isString(sep) ? sep : ' ');
}

// Indents each line of the string
function indent(text) { return text.replace(/^/gm, '  '); }
