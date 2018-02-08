var XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

function Generator(options, prefixes) {
  this._options = options || {};

  prefixes = prefixes || {};
  this._prefixByIri = {};
  var prefixIris = [];
  for (var prefix in prefixes) {
    var iri = prefixes[prefix];
    if (typeof iri === 'string') {
      this._prefixByIri[iri] = prefix;
      prefixIris.push(iri);
    }
  }
  var iriList = prefixIris.join('|').replace(/[\]\/\(\)\*\+\?\.\\\$]/g, '\\$&');
  this._prefixRegex = new RegExp('^(' + iriList + ')([a-zA-Z][\\-_a-zA-Z0-9]*)$');
  this._usedPrefixes = {};
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
    query += this.group(q.template, true) + '\n';

  if (q.from)
    query += mapJoin(q.from.default || [], '', function (g) { return 'FROM ' + this.toEntity(g) + '\n'; }, this) +
             mapJoin(q.from.named || [], '', function (g) { return 'FROM NAMED ' + this.toEntity(g) + '\n'; }, this);
  if (q.where)
    query += 'WHERE ' + this.group(q.where, true)  + '\n';

  if (q.updates)
    query += mapJoin(q.updates, ';\n', this.toUpdate, this);

  if (q.group)
    query += 'GROUP BY ' + mapJoin(q.group, undefined, function (it) {
      var result = isString(it.expression) ? it.expression : '(' + this.toExpression(it.expression) + ')';
      return it.variable ? '(' + result + ' AS ' + it.variable + ')' : result;
    }, this) + '\n';
  if (q.having)
    query += 'HAVING (' + mapJoin(q.having, undefined, this.toExpression, this) + ')\n';
  if (q.order)
    query += 'ORDER BY ' + mapJoin(q.order, undefined, function (it) {
      var expr = '(' + this.toExpression(it.expression) + ')';
      return !it.descending ? expr : 'DESC ' + expr;
    }, this) + '\n';

  if (q.offset)
    query += 'OFFSET ' + q.offset + '\n';
  if (q.limit)
    query += 'LIMIT ' + q.limit + '\n';

  if (q.values)
    query += this.values(q);

  // stringify prefixes at the end to mark used ones
  query = this.baseAndPrefixes(q) + query;
  return query.trim();
};

Generator.prototype.baseAndPrefixes = function (q) {
  var base = q.base ? ('BASE <' + q.base + '>\n') : '';
  var prefixes = '';
  for (var key in q.prefixes) {
    if (this._options.allPrefixes || this._usedPrefixes[key])
      prefixes += 'PREFIX ' + key + ': <' + q.prefixes[key] + '>\n';
  }
  return base + prefixes;
};

// Converts the parsed SPARQL pattern into a SPARQL pattern
Generator.prototype.toPattern = function (pattern) {
  var type = pattern.type || (pattern instanceof Array) && 'array' ||
             (pattern.subject && pattern.predicate && pattern.object ? 'triple' : '');
  if (!(type in this))
    throw new Error('Unknown entry type: ' + type);
  return this[type](pattern);
};

Generator.prototype.triple = function (t) {
  return this.toEntity(t.subject) + ' ' + this.toEntity(t.predicate) + ' ' + this.toEntity(t.object) + '.';
};

Generator.prototype.array = function (items) {
  return mapJoin(items, '\n', this.toPattern, this);
};

Generator.prototype.bgp = function (bgp) {
  return mapJoin(bgp.triples, '\n', this.triple, this);
};

Generator.prototype.graph = function (graph) {
  return 'GRAPH ' + this.toEntity(graph.name) + ' ' + this.group(graph);
};

Generator.prototype.group = function (group, inline) {
  group = inline !== true ? this.array(group.patterns || group.triples)
                          : this.toPattern(group.type !== 'group' ? group : group.patterns);
  return group.indexOf('\n') === -1 ? '{ ' + group + ' }' : '{\n' + indent(group) + '\n}';
};

Generator.prototype.query = function (query) {
  return this.toQuery(query);
};

Generator.prototype.filter = function (filter) {
  return 'FILTER(' + this.toExpression(filter.expression) + ')';
};

Generator.prototype.bind = function (bind) {
  return 'BIND(' + this.toExpression(bind.expression) + ' AS ' + bind.variable + ')';
};

Generator.prototype.optional = function (optional) {
  return 'OPTIONAL ' + this.group(optional);
};

Generator.prototype.union = function (union) {
  return mapJoin(union.patterns, '\nUNION\n', function (p) { return this.group(p, true); }, this);
};

Generator.prototype.minus = function (minus) {
  return 'MINUS ' + this.group(minus);
};

Generator.prototype.values = function (valuesList) {
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
};

Generator.prototype.service = function (service) {
  return 'SERVICE ' + (service.silent ? 'SILENT ' : '') + this.toEntity(service.name) + ' ' +
         this.group(service);
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
        return operator + ' ' + this.group(args[0], true);
      // Other expressions
      default:
        return operator + '(' + mapJoin(args, ', ', this.toExpression, this) + ')';
      }
    default:
      throw new Error('Unknown expression type: ' + expr.type);
  }
};

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
      return '(' + items[0] + path + ')';
    // infix operator
    default:
      return '(' + items.join(path) + ')';
    }
  }
};
var escape = /["\\\t\n\r\b\f]/g,
    escapeReplacer = function (c) { return escapeReplacements[c]; },
    escapeReplacements = { '\\': '\\\\', '"': '\\"', '\t': '\\t',
                           '\n': '\\n', '\r': '\\r', '\b': '\\b', '\f': '\\f' };

// Represent the IRI, as a prefixed name when possible
Generator.prototype.encodeIRI = function (iri) {
  var prefixMatch = this._prefixRegex.exec(iri);
  if (prefixMatch) {
    var prefix = this._prefixByIri[prefixMatch[1]];
    this._usedPrefixes[prefix] = true;
    return prefix + ':' + prefixMatch[2];
  }
  return '<' + iri + '>';
};

// Converts the parsed update object into a SPARQL update clause
Generator.prototype.toUpdate = function (update) {
  switch (update.type || update.updateType) {
  case 'load':
    return 'LOAD' + (update.source ? ' ' + this.toEntity(update.source) : '') +
           (update.destination ? ' INTO GRAPH ' + this.toEntity(update.destination) : '');
  case 'insert':
    return 'INSERT DATA '  + this.group(update.insert, true);
  case 'delete':
    return 'DELETE DATA '  + this.group(update.delete, true);
  case 'deletewhere':
    return 'DELETE WHERE ' + this.group(update.delete, true);
  case 'insertdelete':
    return (update.graph ? 'WITH ' + this.toEntity(update.graph) + '\n' : '') +
           (update.delete.length ? 'DELETE ' + this.group(update.delete, true) + '\n' : '') +
           (update.insert.length ? 'INSERT ' + this.group(update.insert, true) + '\n' : '') +
           'WHERE ' + this.group(update.where, true);
  case 'add':
  case 'copy':
  case 'move':
    return update.type.toUpperCase() + (update.source.default ? ' DEFAULT ' : ' ') +
           'TO ' + this.toEntity(update.destination.name);
  default:
    throw new Error('Unknown update query type: ' + update.type);
  }
};

// Checks whether the object is a string
function isString(object) { return typeof object === 'string'; }

// Maps the array with the given function, and joins the results using the separator
function mapJoin(array, sep, func, self) {
  return array.map(func, self).join(isString(sep) ? sep : ' ');
}

// Indents each line of the string
function indent(text) { return text.replace(/^/gm, '  '); }

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
