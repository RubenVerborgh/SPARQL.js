var Generator = {};

var predicatePatternToString;
var triplesToString;

var varSymbols = ['?', '_:', '"', '*'];
var varOrUrl = function(it) {
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
    return it.replace('\\', '\\\\');
  }
};

var pathsBefore = ['^', '!'];
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

var dualOps = ['<', '>', '>=', '<=', '&&', '!=', '=', '+', '-', '*', '/'];
var singleOps = ['lang', 'bound'];
var expressionToString = function(expression) {
  var op;
  var arg1;
  var arg2;
  var res;

  var expop = expression.operator || '';

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
  } else if (expression.operator === '!') {
    res = '';
    op = expression.operator;
    res += op;
    arg1 = expressionToString(expression.args[0]);
    res += arg1;
    return res;
  } else if (singleOps.indexOf(expop.toLowerCase()) !== -1) {
    res = '';
    op = expression.operator;
    res += op + '(';
    arg1 = varOrUrl(expression.args[0]);
    res += arg1 + ')';
    return res;
  } else if (expop.toLowerCase() === 'langmatches') {
    res = '';
    op = expression.operator;
    res += op + '(';
    arg1 = expressionToString(expression.args[0]);
    arg2 = expression.args[1];
    res += arg1 + ', ' + arg2 + ')';
    return res;
  } else if (expression.type === 'aggregate') {
    res = '';
    res += expression.aggregation.toUpperCase() + '(';
    res += expression.expression;
    res += ')';
    return res;
  } else if (expression.type === 'operation') {
    res = '';
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
  } else if (expression.type === 'functionCall') {
    res = '';
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
  } else if (expression.type === 'bgp' || expression.type === 'filter' || expression.type === 'group') {
    return triplesToString(expression);
  } else if (typeof expression === 'string') {
    return varOrUrl(expression);
  }
};

var valuesToString = function(values) {
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

triplesToString = function(entries) {
  var ex;
  var res = '';
  // do work depeding on type
  if (entries.type === 'query') {
    res += '{\n';
    res += Generator.stringify(entries);
    res += '}\n';
  } else if (entries.type === 'group') {
    res += '{\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
  } else if (entries.type === 'graph') {
    var g = varOrUrl(entries.name);
    res += 'GRAPH ' + g + ' {\n';
    var data = entries.patterns || entries.triples;
    data.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
  } else if (entries.type === 'bgp') {
    entries.triples.forEach(function(triple) {
      var s = varOrUrl(triple.subject);
      var p = varOrUrl(triple.predicate);
      var o = varOrUrl(triple.object);
      res += ' ' + s + ' ' + p + ' ' + o + ' .\n';
    });
  } else if (entries.type === 'filter') {
    ex = expressionToString(entries.expression);
    res += ' FILTER(' + ex + ')\n';
  } else if (entries.type === 'bind') {
    ex = expressionToString(entries.expression);
    var variable = entries.variable;
    res += 'BIND (' + ex + ' AS ' + variable + ')\n';
  } else if (entries.type === 'optional') {
    res += 'OPTIONAL {\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
  } else if (entries.type === 'union') {
    var leftUnion = entries.patterns[0];
    var rightUnion = entries.patterns[1];
    res += '{\n';
    res += triplesToString(leftUnion);
    res += '} UNION {\n';
    res += triplesToString(rightUnion);
    res += '}\n';
  } else if (entries.type === 'values') {
    res += valuesToString(entries.values);
  } else if (entries.type === 'minus') {
    res += 'MINUS {\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
  } else if (entries.type === 'service') {
    res += 'SERVICE ';
    if (entries.silent) {
      res += 'SILENT ';
    }
    res += varOrUrl(entries.name) + ' {\n';
    entries.patterns.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
  } else if (entries.subject && entries.object && entries.predicate) {
    var s = varOrUrl(entries.subject);
    var p = varOrUrl(entries.predicate);
    var o = varOrUrl(entries.object);
    res += ' ' + s + ' ' + p + ' ' + o + ' .\n';
  }

  return res;
};

var exprToString = function(it) {
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

var updateToString = function(it) {
  var res = '';
  if (it.type === 'load') {
    res += 'LOAD ';
    if (it.source) {
      res += varOrUrl(it.source);
    }
    if (it.destination) {
      res += ' INTO GRAPH ';
      res += varOrUrl(it.destination);
    }
  } else if (it.updateType === 'insertdelete') {
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
  } else if (it.updateType === 'insert') {
    res += 'INSERT DATA {\n';
    it.insert.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}';
  } else if (it.updateType === 'delete') {
    res += 'DELETE DATA {\n';
    it.delete.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}';
  } else if (it.updateType === 'deletewhere') {
    res += 'DELETE WHERE {\n';
    it.delete.forEach(function(it) {
      res += triplesToString(it);
    });
    res += '}\n';
  } else if (it.type === 'copy' || it.type === 'move' || it.type === 'add') {
    res += it.type.toUpperCase() + ' ';
    if (it.source.default) {
      res += 'DEFAULT ';
    }
    res += 'TO ';
    res += varOrUrl(it.destination.name);
  }

  return res;
};

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
      queryString += exprToString(it);
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
