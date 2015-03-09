// main object
var Generator = {};

// predefined functions
var predicatePatternToString;
var triplesToString;
var varOrUrl;
var expressionToString;
var valuesToString;

// data for lookups
var varSymbols = ['?', '_:', '"', '*']; // symbols presence of which means that string is SPARQL variable
var pathsBefore = ['^', '!']; // paths applied before params
var dualOps = ['<', '>', '>=', '<=', '&&', '!=', '=', '+', '-', '*', '/']; // dual operators that take arguments from left and right sides of self
var singleOps = ['lang', 'bound']; // single operators that wrap argument

/**
 * Handles given expression as triples
 * @param {object} expression - expression that contains triples
 */
var asTriples = function(expression) {
  return triplesToString(expression);
};

/**
 * Lookup object to determine function to apply based on expression type
 * @type {Object}
 */
var expTypes = {
  aggregate: function(expression) {
    var res = '';
    res += expression.aggregation.toUpperCase() + '(';
    res += expression.expression;
    res += ')';
    return res;
  },
  operation: function(expression) {
    var res = '';
    if (expression.operator === 'notexists') {
      res += ' NOT EXISTS {';
    } else if (expression.operator === 'exists') {
      res += ' EXISTS {';
    } else {
      res += expression.operator.toUpperCase() + '(';
    }
    expression.args.forEach(function(it, i) {
      res += expressionToString(it);
      if (i !== (expression.args.length - 1)) {
        res += ', ';
      }
    });
    if (expression.operator === 'notexists' || expression.operator === 'exists') {
      res += '}';
    } else {
      res += ')';
    }
    return res;
  },
  functionCall: function(expression) {
    var res = '';
    res += varOrUrl(expression.function) + '(';
    // process ops
    expression.args.forEach(function(op, i) {
      if (op.type === 'operation') {
        res += op.operator + '(';
        // process args
        op.args.forEach(function(arg) {
          res += varOrUrl(arg);
        });
        res += ')';
      } else if (typeof op === 'string') {
        res += varOrUrl(op);
      }
      if (i !== (expression.args.length - 1)) {
        res += ', ';
      }
    });
    res += ') ';
    return res;
  },
  bgp: asTriples,
  filter: asTriples,
  group: asTriples,
};

/**
 * Lookup object to determine function to apply based on triple type
 * @type {Object}
 */
var triplesTypes = {
  query: function(entries) {
    var res = '{\n';
    res += Generator.stringify(entries);
    res += '}\n';
    return res;
  },
  group: function(entries) {
    var res = '{\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
    return res;
  },
  graph: function(entries) {
    var g = varOrUrl(entries.name);
    var res = 'GRAPH ' + g + ' {\n';
    var data = entries.patterns || entries.triples;
    data.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
    return res;
  },
  bgp: function(entries) {
    var res = '';
    entries.triples.forEach(function(triple) {
      var s = varOrUrl(triple.subject);
      var p = varOrUrl(triple.predicate);
      var o = varOrUrl(triple.object);
      res += ' ' + s + ' ' + p + ' ' + o + ' .\n';
    });
    return res;
  },
  filter: function(entries) {
    var res = '';
    var ex = expressionToString(entries.expression);
    res += ' FILTER(' + ex + ')\n';
    return res;
  },
  bind: function(entries) {
    var res = '';
    var ex = expressionToString(entries.expression);
    var variable = entries.variable;
    res += 'BIND (' + ex + ' AS ' + variable + ')\n';
    return res;
  },
  optional: function(entries) {
    var res = 'OPTIONAL {\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
    return res;
  },
  union: function(entries) {
    var leftUnion = entries.patterns[0];
    var rightUnion = entries.patterns[1];
    var res = '{\n';
    res += triplesToString(leftUnion);
    res += '} UNION {\n';
    res += triplesToString(rightUnion);
    res += '}\n';
    return res;
  },
  values: function(entries) {
    var res = valuesToString(entries.values);
    return res;
  },
  minus: function(entries) {
    var res = 'MINUS {\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
    return res;
  },
  service: function(entries) {
    var res = 'SERVICE ';
    if (entries.silent) {
      res += 'SILENT ';
    }
    res += varOrUrl(entries.name) + ' {\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
    return res;
  },
};


/**
 * Generic update type function
 * @param {object} it - update object
 */
var updateGenericType = function(it) {
  var res = '';
  res += it.type.toUpperCase() + ' ';
  if (it.source.default) {
    res += 'DEFAULT ';
  }
  res += 'TO ';
  res += varOrUrl(it.destination.name);
  return res;
};

/**
 * Lookup object to determine function to apply based on update type
 * @type {Object}
 */
var updateTypes = {
  load: function(it) {
    var res = 'LOAD ';
    if (it.source) {
      res += varOrUrl(it.source);
    }
    if (it.destination) {
      res += ' INTO GRAPH ';
      res += varOrUrl(it.destination);
    }
    return res;
  },
  copy: updateGenericType,
  move: updateGenericType,
  add: updateGenericType,
  insertdelete: function(it) {
    var res = '';
    if (it.graph) {
      res += 'WITH ';
      res += varOrUrl(it.graph);
      res += '\n';
    }
    if (it.delete.length) {
      res += 'DELETE {\n';
      it.delete.forEach(function(it) {
        res += triplesToString(it);
      });
      res += '}\n';
    }
    if (it.insert.length) {
      res += 'INSERT {\n';
      it.insert.forEach(function(it) {
        res += triplesToString(it);
      });
      res += '}\n';
    }

    res += 'WHERE {\n';
    if (it.where.length) {
      it.where.forEach(function(it) {
        res += triplesToString(it);
      });
    }
    res += '}\n';
    return res;
  },
  insert: function(it) {
    var res = '';
    res += 'INSERT DATA {\n';
    it.insert.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}';
    return res;
  },
  delete: function(it) {
    var res = '';
    res += 'DELETE DATA {\n';
    it.delete.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}';
    return res;
  },
  deletewhere: function(it) {
    var res = '';
    res += 'DELETE WHERE {\n';
    it.delete.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
    return res;
  },
};

/**
 * Takes subject, predicate or object as input and returns stringified version of it
 * @param {string|object} it - subject, predicate or object as string or object
 */
varOrUrl = function(it) {
  if (typeof it === 'object') {
    return predicatePatternToString(it);
  }

  var isVar = false;
  varSymbols.forEach(function(symb) {
    if (it.indexOf(symb) !== -1) {
      isVar = true;
    }
  });
  if (!isVar) {
    return '<' + it + '>';
  } else if (it.indexOf('^^') !== -1) {
    var parts = it.split('^^');
    var left = parts[0];
    var right = parts[1];
    return left + '^^' + '<' + right + '>';
  } else {
    return it.replace(/\\/g, '\\\\');
  }
};

/**
 * Converts predicate pattern object to string
 * @param {object} obj - predicate pattern object
 */
predicatePatternToString = function(obj) {
  var res = '';
  if (obj.type === 'path') {
    if (obj.items.length > 1) {
      res += '(';
    }
    obj.items.forEach(function(it, i) {
      if (obj.items.length === 1 && pathsBefore.indexOf(obj.pathType) !== -1) {
        res += obj.pathType;
      }

      if (typeof it === 'string') {
        res += varOrUrl(it);
      } else if (typeof it === 'object') {
        res += predicatePatternToString(it);
      }

      if (i !== (obj.items.length - 1)) {
        res += obj.pathType;
      } else if (obj.items.length === 1 && pathsBefore.indexOf(obj.pathType) === -1) {
        res += obj.pathType;
      }
    });
    if (obj.items.length > 1) {
      res += ')';
    }
  }
  return res;
};


/**
 * Converts given expression to string
 * @param {object|string} expression - expression to convert to string
 */
expressionToString = function(expression) {
  var op;
  var arg1;
  var arg2;
  var res;
  // get operator if present
  var expop = expression.operator || '';
  expop = expop.toLowerCase();

  // figure out what to do
  if (dualOps.indexOf(expop) !== -1) {
    arg1 = expression.args[0];
    if (typeof arg1 === 'object') {
      arg1 = ' (' + expressionToString(arg1) + ') ';
    } else {
      arg1 = varOrUrl(arg1);
    }
    arg2 = expression.args[1];
    if (typeof arg2 === 'object') {
      arg2 = ' (' + expressionToString(arg2) + ') ';
    } else {
      arg2 = varOrUrl(arg2);
    }
    op = expression.operator;
    return arg1 + ' ' + op + ' ' + arg2;
  } else if (singleOps.indexOf(expop.toLowerCase()) !== -1) {
    res = '';
    op = expression.operator;
    res += op + '(';
    arg1 = varOrUrl(expression.args[0]);
    res += arg1 + ')';
    return res;
  } else if (expression.operator === '!') {
    res = '';
    op = expression.operator;
    res += op;
    arg1 = expressionToString(expression.args[0]);
    res += arg1;
    return res;
  } else if (expop === 'langmatches') {
    res = '';
    op = expression.operator;
    res += op + '(';
    arg1 = expressionToString(expression.args[0]);
    arg2 = expression.args[1];
    res += arg1 + ', ' + arg2 + ')';
    return res;
  } else if (expop === 'in' || expop === 'notin') {
    res = '';
    arg1 = expressionToString(expression.args[0]);
    res += arg1 + ' ';
    op = expression.operator.toUpperCase();
    res += op + '(';
    arg2 = '';
    var rightPart = expression.args[1];
    if (typeof rightPart === 'string') {
      arg2 = rightPart;
    } else if (typeof rightPart === 'object' && rightPart.length) {
      rightPart.forEach(function(it, i) {
        arg2 += expressionToString(it);
        if (i !== (rightPart.length - 1)){
          arg2 += ', ';
        }
      });
    }
    res += arg2 + ')';
    return res;
  } else if (expression.type && expTypes[expression.type]) {
    return expTypes[expression.type](expression);
  } else if (typeof expression === 'string') {
    return varOrUrl(expression);
  }
};

/**
 * Converts given values object to string
 * @param {object} values - object containing SPARQL VALUES
 */
valuesToString = function(values) {
  var res = ' VALUES ';
  // get all keys
  var keys = [];
  values.forEach(function(pair) {
    for(var key in pair) {
      if (keys.indexOf(key) === -1) {
        keys.push(key);
      }
    }
  });
  keys.sort();
  // print keys
  res += '( ';
  keys.forEach(function(key) {
    res += key + ' ';
  });
  res += ' ) {\n';
  // print values
  values.forEach(function(pair) {
    res += '( ';
    keys.forEach(function(key) {
      var kv = pair[key];
      if (!kv || kv === '{undefined}') {
        kv = 'UNDEF';
      } else {
        kv = varOrUrl(kv);
      }
      res += kv + ' ';
    });
    res += ' )\n';
  });
  res += '}\n';

  return res;
};

/**
 * Converts given triples object to string
 * @param {object} entries - object containing triples
 */
triplesToString = function(entries) {
  var res = '';
  // do work depeding on type
  if (entries.type && triplesTypes[entries.type]) {
    res += triplesTypes[entries.type](entries);
  } else if (entries.subject && entries.object && entries.predicate) {
    var s = varOrUrl(entries.subject);
    var p = varOrUrl(entries.predicate);
    var o = varOrUrl(entries.object);
    res += ' ' + s + ' ' + p + ' ' + o + ' .\n';
  }

  return res;
};

/**
 * Converts SPARQL ORDER expression to string
 * @param {object} it - order object
 */
var orderExprToString = function(it) {
  var res = '';
  if (typeof it.expression === 'string') {
    var dirOp = '';
    if (it.descending) {
      dirOp = 'DESC(';
    }
    var dirClose = '';
    if (it.descending) {
      dirClose = ')';
    }
    res += dirOp + it.expression + dirClose + ' ';
  } else if (typeof it.expression === 'object') {
    if (it.expression.type === 'functionCall') {
      res += varOrUrl(it.expression.function) + '(';
      // process ops
      it.expression.args.forEach(function(op) {
        if (op.type === 'operation') {
          res += op.operator + '(';
          // process args
          op.args.forEach(function(arg) {
            res += varOrUrl(arg);
          });
          res += ')';
        }
      });
      res += ') ';
    }
  }

  return res;
};

/**
 * Converst UPDATE object ot string
 * @param {object} it - update object
 */
var updateToString = function(it) {
  var res = '';
  if (it.type && updateTypes[it.type]) {
    res += updateTypes[it.type](it);
  } else if (it.updateType && updateTypes[it.updateType]) {
    res += updateTypes[it.updateType](it);
  }

  return res;
};

/**
 * Converts SPARQL variable object (or string) to properly formatted string
 * @param {string|object} variable - variable object or string
 */
var variableToString = function(variable) {
  if (typeof variable === 'string') {
    return ' ' + varOrUrl(variable) + ' ';
  } else if (typeof variable === 'object') {
    var res = '';
    var exp;
    if (typeof variable.expression === 'string') {
      exp = varOrUrl(variable.expression);
      var varParam = varOrUrl(variable.variable);
      res += ' (' + exp + ' AS ' + varParam + ') ';
    } else {
      res = ' (';
      exp = variable.expression;
      if (exp) {
        res += expressionToString(exp);
      }
      var resVar = variable.variable;
      if (resVar) {
        res += ' AS ';
        res += resVar;
      }
      res += ') ';
    }

    return res;
  }
};

/**
 * Converts FROM object into string
 * @param {object} from - SPARQL FROM object
 */
var parseFrom = function(from) {
  var res = '\n';
  if (from.default) {
    from.default.forEach(function(g) {
      res += 'FROM ' + varOrUrl(g) + '\n';
    });
  }
  if (from.named) {
    from.named.forEach(function(g) {
      res += 'FROM NAMED ' + varOrUrl(g) + '\n';
    });
  }
  return res;
};

/**
 * Stringifies given query object
 * @param  {object} queryObject - query object produced by sparql parser
 * @return {string}             string representation of given SPARQL query
 */
Generator.stringify = function (queryObject) {
  // init query string
  var queryString = '';
  // add prefixes
  if (queryObject.prefixes) {
    for(var key in queryObject.prefixes) {
      queryString += 'PREFIX ' + key + ': <' + queryObject.prefixes[key] + '>\n';
    }
  }

  // add type
  if (queryObject.queryType) {
    queryString += queryObject.queryType;
  }
  if (queryObject.reduced) {
    queryString += ' REDUCED ';
  }
  // add distinc if present
  if (queryObject.distinct) {
    queryString += ' DISTINCT ';
  }
   // construct template
  if (queryObject.template) {
    queryString += ' {\n';
    queryObject.template.forEach(function(triple) {
      var s = varOrUrl(triple.subject);
      var p = varOrUrl(triple.predicate);
      var o = varOrUrl(triple.object);
      queryString += ' ' + s + ' ' + p + ' ' + o + ' .\n';
    });
    queryString += '} ';
  }
  // add variables
  if (queryObject.variables) {
    queryObject.variables.forEach(function(variable) {
      queryString += variableToString(variable);
    });
  }
  // from part
  if (queryObject.from) {
    queryString += parseFrom(queryObject.from);
  }
  // where part
  if (queryObject.where) {
    queryString += ' WHERE {\n';
    // process where clause
    queryObject.where.forEach(function(entries) {
      queryString += triplesToString(entries);
    });
    // close where
    queryString += '}\n';
  }

  // update part
  if (queryObject.updates) {
    var len = queryObject.updates.length;
    queryObject.updates.forEach(function(it, i) {
      queryString += updateToString(it);
      if (len > 1 && i !== (len - 1)) {
        queryString += '; ';
      }
    });
  }

  // values
  if (queryObject.values) {
    queryString += valuesToString(queryObject.values);
  }

  // order
  if (queryObject.order) {
    queryString += 'ORDER BY ';
    queryObject.order.forEach(function(it) {
      queryString += orderExprToString(it);
    });
  }

  // group
  if (queryObject.group) {
    queryString += 'GROUP BY ';
    queryObject.group.forEach(function(it) {
      if (typeof it.expression === 'string') {
        queryString += it.expression + ' ';
      } else {
        queryString += '(' + expressionToString(it.expression) + ') ';
      }
    });
    queryString += '\n';
  }

  // having
  if (queryObject.having) {
    queryString += 'HAVING (';
    queryObject.having.forEach(function(it) {
      queryString += expressionToString(it);
    });
    queryString += ')\n';
  }

  // offset
  if (queryObject.offset) {
    queryString += 'OFFSET ' + queryObject.offset + '\n';
  }

  // limit
  if (queryObject.limit) {
    queryString += 'LIMIT ' + queryObject.limit + '\n';
  }

  return queryString; //.replace(/\s\s+/g, ' ');
};

module.exports = Generator;
