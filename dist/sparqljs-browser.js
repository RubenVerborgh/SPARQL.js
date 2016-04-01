(function(f){if(typeof exports==="object"&&typeof module!=="undefined"){module.exports=f()}else if(typeof define==="function"&&define.amd){define([],f)}else{var g;if(typeof window!=="undefined"){g=window}else if(typeof global!=="undefined"){g=global}else if(typeof self!=="undefined"){g=self}else{g=this}g.sparqljs = f()}})(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var XSD_INTEGER = 'http://www.w3.org/2001/XMLSchema#integer';

module.exports = function SparqlGenerator() { return { stringify: toQuery }; };

// Converts the parsed query object into a SPARQL query
function toQuery(q) {
  var query = '';
  for (var key in q.prefixes)
    query += 'PREFIX ' + key + ': <' + q.prefixes[key] + '>\n';

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

},{}],2:[function(require,module,exports){
(function (process){
/* parser generated by jison 0.4.17 */
/*
  Returns a Parser object of the following structure:

  Parser: {
    yy: {}
  }

  Parser.prototype: {
    yy: {},
    trace: function(),
    symbols_: {associative list: name ==> number},
    terminals_: {associative list: number ==> name},
    productions_: [...],
    performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate, $$, _$),
    table: [...],
    defaultActions: {...},
    parseError: function(str, hash),
    parse: function(input),

    lexer: {
        EOF: 1,
        parseError: function(str, hash),
        setInput: function(input),
        input: function(),
        unput: function(str),
        more: function(),
        less: function(n),
        pastInput: function(),
        upcomingInput: function(),
        showPosition: function(),
        test_match: function(regex_match_array, rule_index),
        next: function(),
        lex: function(),
        begin: function(condition),
        popState: function(),
        _currentRules: function(),
        topState: function(),
        pushState: function(condition),

        options: {
            ranges: boolean           (optional: true ==> token location info will include a .range[] member)
            flex: boolean             (optional: true ==> flex-like lexing behaviour where the rules are tested exhaustively to find the longest match)
            backtrack_lexer: boolean  (optional: true ==> lexer regexes are tested in order and for each matching regex the action code is invoked; the lexer terminates the scan when a token is returned by the action code)
        },

        performAction: function(yy, yy_, $avoiding_name_collisions, YY_START),
        rules: [...],
        conditions: {associative list: name ==> set},
    }
  }


  token location info (@$, _$, etc.): {
    first_line: n,
    last_line: n,
    first_column: n,
    last_column: n,
    range: [start_number, end_number]       (where the numbers are indexes into the input string, regular zero-based)
  }


  the parseError function receives a 'hash' object with these members for lexer and parser errors: {
    text:        (matched text)
    token:       (the produced terminal token, if any)
    line:        (yylineno)
  }
  while parser (grammar) errors will also provide these members, i.e. parser errors deliver a superset of attributes: {
    loc:         (yylloc)
    expected:    (string describing the set of expected tokens)
    recoverable: (boolean: TRUE when the parser has a error recovery rule available for this particular error)
  }
*/
var SparqlParser = (function(){
var o=function(k,v,o,l){for(o=o||{},l=k.length;l--;o[k[l]]=v);return o},$V0=[11,14,23,33,42,47,95,105,108,110,111,120,121,126,288,289,290,291,292],$V1=[95,105,108,110,111,120,121,126,288,289,290,291,292],$V2=[1,21],$V3=[1,25],$V4=[6,82],$V5=[37,38,50],$V6=[37,50],$V7=[1,55],$V8=[1,57],$V9=[1,53],$Va=[1,56],$Vb=[27,28,283],$Vc=[12,15,277],$Vd=[107,129,286,293],$Ve=[12,15,107,129,277],$Vf=[1,76],$Vg=[1,80],$Vh=[1,82],$Vi=[107,129,286,287,293],$Vj=[12,15,107,129,277,287],$Vk=[1,89],$Vl=[2,229],$Vm=[1,88],$Vn=[12,15,27,28,79,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277],$Vo=[6,37,38,50,60,67,70,78,80,82],$Vp=[6,12,15,27,37,38,50,60,67,70,78,80,82,277],$Vq=[6,12,15,27,28,30,31,37,38,40,50,60,67,70,78,79,80,82,89,104,107,120,121,123,128,155,156,158,161,162,163,181,192,203,208,210,211,213,214,222,237,242,259,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,294,297,298,300,301,302,303,304,305,306,307,308,309],$Vr=[1,104],$Vs=[1,105],$Vt=[6,12,15,27,28,38,40,79,82,107,155,156,158,161,162,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,294],$Vu=[27,31],$Vv=[2,284],$Vw=[1,118],$Vx=[1,116],$Vy=[6,192],$Vz=[2,301],$VA=[2,289],$VB=[37,123],$VC=[6,40,67,70,78,80,82],$VD=[2,231],$VE=[1,132],$VF=[1,134],$VG=[1,144],$VH=[1,150],$VI=[1,153],$VJ=[1,149],$VK=[1,151],$VL=[1,147],$VM=[1,148],$VN=[1,154],$VO=[1,155],$VP=[1,158],$VQ=[1,159],$VR=[1,160],$VS=[1,161],$VT=[1,162],$VU=[1,163],$VV=[1,164],$VW=[1,165],$VX=[1,166],$VY=[1,167],$VZ=[1,168],$V_=[1,169],$V$=[6,60,67,70,78,80,82],$V01=[27,28,37,38,50],$V11=[12,15,27,28,79,203,237,239,240,241,243,245,246,248,249,252,254,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,301,309,310,311,312,313,314],$V21=[2,374],$V31=[12,15,40,79,89,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277],$V41=[6,104,192],$V51=[40,107],$V61=[6,40,70,78,80,82],$V71=[2,313],$V81=[2,305],$V91=[12,15,27,181,277],$Va1=[2,341],$Vb1=[2,337],$Vc1=[12,15,27,28,31,38,40,79,82,107,155,156,158,161,162,163,181,192,203,208,210,211,213,214,242,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,294],$Vd1=[12,15,27,28,30,31,38,40,79,82,89,107,155,156,158,161,162,163,181,192,203,208,210,211,213,214,222,237,242,259,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,294,298,301,302,303,304,305,306,307,308,309],$Ve1=[12,15,27,28,30,31,38,40,79,82,89,107,155,156,158,161,162,163,181,192,203,208,210,211,213,214,222,237,242,259,261,262,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,294,298,301,302,303,304,305,306,307,308,309],$Vf1=[1,227],$Vg1=[1,238],$Vh1=[6,40,78,80,82],$Vi1=[1,249],$Vj1=[1,251],$Vk1=[1,252],$Vl1=[1,253],$Vm1=[1,254],$Vn1=[1,256],$Vo1=[1,257],$Vp1=[2,405],$Vq1=[1,260],$Vr1=[1,261],$Vs1=[1,262],$Vt1=[1,268],$Vu1=[1,263],$Vv1=[1,264],$Vw1=[1,265],$Vx1=[1,266],$Vy1=[1,267],$Vz1=[1,274],$VA1=[1,273],$VB1=[38,40,82,107,155,156,158,161,162],$VC1=[1,282],$VD1=[1,283],$VE1=[40,107,294],$VF1=[12,15,27,28,31,79,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277],$VG1=[12,15,27,28,31,38,40,79,82,107,155,156,158,161,162,163,192,210,211,213,214,242,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,294],$VH1=[12,15,27,28,79,239,240,241,243,245,246,248,249,252,254,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,309,310,311,312,313,314],$VI1=[2,398],$VJ1=[1,301],$VK1=[1,302],$VL1=[1,303],$VM1=[12,15,31,40,79,89,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277],$VN1=[28,40],$VO1=[2,304],$VP1=[6,40,82],$VQ1=[6,12,15,28,40,70,78,80,82,239,240,241,243,245,246,248,249,252,254,277,309,310,311,312,313,314],$VR1=[6,12,15,27,28,38,40,70,73,75,78,79,80,82,107,155,156,158,161,162,163,210,213,214,239,240,241,243,245,246,248,249,252,254,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,294,309,310,311,312,313,314],$VS1=[6,12,15,27,28,30,31,38,40,67,70,73,75,78,79,80,82,107,155,156,158,161,162,163,192,210,213,214,222,237,239,240,241,242,243,245,246,248,249,252,254,259,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,294,298,301,302,303,304,305,306,307,308,309,310,311,312,313,314],$VT1=[1,326],$VU1=[1,325],$VV1=[1,332],$VW1=[1,331],$VX1=[28,163],$VY1=[6,12,15,27,28,40,67,70,78,80,82,239,240,241,243,245,246,248,249,252,254,277,309,310,311,312,313,314],$VZ1=[6,12,15,27,28,30,31,38,40,60,67,70,73,75,78,79,80,82,107,155,156,158,161,162,163,192,210,213,214,222,237,239,240,241,242,243,245,246,248,249,252,254,259,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,294,295,298,301,302,303,304,305,306,307,308,309,310,311,312,313,314],$V_1=[12,15,28,181,203,208,277],$V$1=[2,355],$V02=[1,354],$V12=[38,40,82,107,155,156,158,161,162,294],$V22=[2,343],$V32=[12,15,27,28,31,38,40,79,82,107,155,156,158,161,162,163,181,192,210,211,213,214,242,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,294],$V42=[30,31,192,242,302,303],$V52=[30,31,192,222,237,242,259,271,272,273,274,275,276,301,302,303,304,305,306,307,308,309],$V62=[30,31,192,222,237,242,259,271,272,273,274,275,276,283,298,301,302,303,304,305,306,307,308,309],$V72=[1,387],$V82=[1,402],$V92=[1,399],$Va2=[1,400],$Vb2=[12,15,27,28,79,203,237,239,240,241,243,245,246,248,249,252,254,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,301,309,310,311,312,313,314],$Vc2=[12,15,27,28,38,40,79,82,107,155,156,158,161,162,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277],$Vd2=[12,15,27,277],$Ve2=[12,15,27,28,38,40,79,82,107,155,156,158,161,162,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,294],$Vf2=[2,316],$Vg2=[12,15,27,181,192,277],$Vh2=[1,453],$Vi2=[1,454],$Vj2=[12,15,31,79,89,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277],$Vk2=[6,12,15,27,28,40,73,75,78,80,82,239,240,241,243,245,246,248,249,252,254,277,309,310,311,312,313,314],$Vl2=[2,311],$Vm2=[12,15,28,181,203,277],$Vn2=[38,40,82,107,155,156,158,161,162,192,211,294],$Vo2=[12,15,27,28,40,79,107,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277],$Vp2=[12,15,27,28,31,79,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,297,298],$Vq2=[12,15,27,28,31,79,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,297,298,300,301],$Vr2=[1,545],$Vs2=[1,546],$Vt2=[2,299],$Vu2=[12,15,31,181,208,277];
var parser = {trace: function trace() { },
yy: {},
symbols_: {"error":2,"QueryOrUpdateUnit":3,"QueryOrUpdateUnit_repetition0":4,"QueryOrUpdateUnit_group0":5,"EOF":6,"Query":7,"Query_group0":8,"Query_option0":9,"BaseDecl":10,"BASE":11,"IRIREF":12,"PrefixDecl":13,"PREFIX":14,"PNAME_NS":15,"SelectQuery":16,"SelectClause":17,"SelectQuery_repetition0":18,"WhereClause":19,"SolutionModifier":20,"SubSelect":21,"SubSelect_option0":22,"SELECT":23,"SelectClause_option0":24,"SelectClause_group0":25,"SelectClauseItem":26,"VAR":27,"(":28,"Expression":29,"AS":30,")":31,"ConstructQuery":32,"CONSTRUCT":33,"ConstructTemplate":34,"ConstructQuery_repetition0":35,"ConstructQuery_repetition1":36,"WHERE":37,"{":38,"ConstructQuery_option0":39,"}":40,"DescribeQuery":41,"DESCRIBE":42,"DescribeQuery_group0":43,"DescribeQuery_repetition0":44,"DescribeQuery_option0":45,"AskQuery":46,"ASK":47,"AskQuery_repetition0":48,"DatasetClause":49,"FROM":50,"DatasetClause_option0":51,"iri":52,"WhereClause_option0":53,"GroupGraphPattern":54,"SolutionModifier_option0":55,"SolutionModifier_option1":56,"SolutionModifier_option2":57,"SolutionModifier_option3":58,"GroupClause":59,"GROUP":60,"BY":61,"GroupClause_repetition_plus0":62,"GroupCondition":63,"BuiltInCall":64,"FunctionCall":65,"HavingClause":66,"HAVING":67,"HavingClause_repetition_plus0":68,"OrderClause":69,"ORDER":70,"OrderClause_repetition_plus0":71,"OrderCondition":72,"ASC":73,"BrackettedExpression":74,"DESC":75,"Constraint":76,"LimitOffsetClauses":77,"LIMIT":78,"INTEGER":79,"OFFSET":80,"ValuesClause":81,"VALUES":82,"InlineData":83,"InlineData_repetition0":84,"InlineData_repetition1":85,"InlineData_repetition2":86,"DataBlockValue":87,"Literal":88,"UNDEF":89,"DataBlockValueList":90,"DataBlockValueList_repetition0":91,"Update":92,"Update_repetition0":93,"Update1":94,"LOAD":95,"Update1_option0":96,"Update1_option1":97,"Update1_group0":98,"Update1_option2":99,"GraphRefAll":100,"Update1_group1":101,"Update1_option3":102,"GraphOrDefault":103,"TO":104,"CREATE":105,"Update1_option4":106,"GRAPH":107,"INSERTDATA":108,"QuadPattern":109,"DELETEDATA":110,"DELETEWHERE":111,"Update1_option5":112,"InsertClause":113,"Update1_option6":114,"Update1_repetition0":115,"Update1_option7":116,"DeleteClause":117,"Update1_option8":118,"Update1_repetition1":119,"DELETE":120,"INSERT":121,"UsingClause":122,"USING":123,"UsingClause_option0":124,"WithClause":125,"WITH":126,"IntoGraphClause":127,"INTO":128,"DEFAULT":129,"GraphOrDefault_option0":130,"GraphRefAll_group0":131,"QuadPattern_option0":132,"QuadPattern_repetition0":133,"QuadsNotTriples":134,"QuadsNotTriples_group0":135,"QuadsNotTriples_option0":136,"QuadsNotTriples_option1":137,"QuadsNotTriples_option2":138,"TriplesTemplate":139,"TriplesTemplate_repetition0":140,"TriplesSameSubject":141,"TriplesTemplate_option0":142,"GroupGraphPatternSub":143,"GroupGraphPatternSub_option0":144,"GroupGraphPatternSub_repetition0":145,"GroupGraphPatternSubTail":146,"GraphPatternNotTriples":147,"GroupGraphPatternSubTail_option0":148,"GroupGraphPatternSubTail_option1":149,"TriplesBlock":150,"TriplesBlock_repetition0":151,"TriplesSameSubjectPath":152,"TriplesBlock_option0":153,"GraphPatternNotTriples_repetition0":154,"OPTIONAL":155,"MINUS":156,"GraphPatternNotTriples_group0":157,"SERVICE":158,"GraphPatternNotTriples_option0":159,"GraphPatternNotTriples_group1":160,"FILTER":161,"BIND":162,"NIL":163,"FunctionCall_option0":164,"FunctionCall_repetition0":165,"ExpressionList":166,"ExpressionList_repetition0":167,"ConstructTemplate_option0":168,"ConstructTriples":169,"ConstructTriples_repetition0":170,"ConstructTriples_option0":171,"VarOrTerm":172,"PropertyListNotEmpty":173,"TriplesNode":174,"PropertyList":175,"PropertyList_option0":176,"PropertyListNotEmpty_repetition0":177,"VerbObjectList":178,"Verb":179,"ObjectList":180,"a":181,"ObjectList_repetition0":182,"GraphNode":183,"PropertyListPathNotEmpty":184,"TriplesNodePath":185,"TriplesSameSubjectPath_option0":186,"PropertyListPathNotEmpty_group0":187,"PropertyListPathNotEmpty_repetition0":188,"GraphNodePath":189,"PropertyListPathNotEmpty_repetition1":190,"PropertyListPathNotEmptyTail":191,";":192,"PropertyListPathNotEmptyTail_group0":193,"Path":194,"Path_repetition0":195,"PathSequence":196,"PathSequence_repetition0":197,"PathEltOrInverse":198,"PathElt":199,"PathPrimary":200,"PathElt_option0":201,"PathEltOrInverse_option0":202,"!":203,"PathNegatedPropertySet":204,"PathOneInPropertySet":205,"PathNegatedPropertySet_repetition0":206,"PathNegatedPropertySet_option0":207,"^":208,"TriplesNode_repetition_plus0":209,"[":210,"]":211,"TriplesNodePath_repetition_plus0":212,"BLANK_NODE_LABEL":213,"ANON":214,"Expression_repetition0":215,"ConditionalAndExpression":216,"ConditionalAndExpression_repetition0":217,"RelationalExpression":218,"AdditiveExpression":219,"RelationalExpression_group0":220,"RelationalExpression_option0":221,"IN":222,"MultiplicativeExpression":223,"AdditiveExpression_repetition0":224,"AdditiveExpressionTail":225,"AdditiveExpressionTail_group0":226,"NumericLiteralPositive":227,"AdditiveExpressionTail_repetition0":228,"NumericLiteralNegative":229,"AdditiveExpressionTail_repetition1":230,"UnaryExpression":231,"MultiplicativeExpression_repetition0":232,"MultiplicativeExpressionTail":233,"MultiplicativeExpressionTail_group0":234,"UnaryExpression_option0":235,"PrimaryExpression":236,"-":237,"Aggregate":238,"FUNC_ARITY0":239,"FUNC_ARITY1":240,"FUNC_ARITY2":241,",":242,"IF":243,"BuiltInCall_group0":244,"BOUND":245,"BNODE":246,"BuiltInCall_option0":247,"EXISTS":248,"COUNT":249,"Aggregate_option0":250,"Aggregate_group0":251,"FUNC_AGGREGATE":252,"Aggregate_option1":253,"GROUP_CONCAT":254,"Aggregate_option2":255,"Aggregate_option3":256,"GroupConcatSeparator":257,"SEPARATOR":258,"=":259,"String":260,"LANGTAG":261,"^^":262,"DECIMAL":263,"DOUBLE":264,"true":265,"false":266,"STRING_LITERAL1":267,"STRING_LITERAL2":268,"STRING_LITERAL_LONG1":269,"STRING_LITERAL_LONG2":270,"INTEGER_POSITIVE":271,"DECIMAL_POSITIVE":272,"DOUBLE_POSITIVE":273,"INTEGER_NEGATIVE":274,"DECIMAL_NEGATIVE":275,"DOUBLE_NEGATIVE":276,"PNAME_LN":277,"QueryOrUpdateUnit_repetition0_group0":278,"SelectClause_option0_group0":279,"DISTINCT":280,"REDUCED":281,"SelectClause_group0_repetition_plus0":282,"*":283,"DescribeQuery_group0_repetition_plus0_group0":284,"DescribeQuery_group0_repetition_plus0":285,"NAMED":286,"SILENT":287,"CLEAR":288,"DROP":289,"ADD":290,"MOVE":291,"COPY":292,"ALL":293,".":294,"UNION":295,"PropertyListNotEmpty_repetition0_repetition_plus0":296,"|":297,"/":298,"PathElt_option0_group0":299,"?":300,"+":301,"||":302,"&&":303,"!=":304,"<":305,">":306,"<=":307,">=":308,"NOT":309,"CONCAT":310,"COALESCE":311,"SUBSTR":312,"REGEX":313,"REPLACE":314,"$accept":0,"$end":1},
terminals_: {2:"error",6:"EOF",11:"BASE",12:"IRIREF",14:"PREFIX",15:"PNAME_NS",23:"SELECT",27:"VAR",28:"(",30:"AS",31:")",33:"CONSTRUCT",37:"WHERE",38:"{",40:"}",42:"DESCRIBE",47:"ASK",50:"FROM",60:"GROUP",61:"BY",67:"HAVING",70:"ORDER",73:"ASC",75:"DESC",78:"LIMIT",79:"INTEGER",80:"OFFSET",82:"VALUES",89:"UNDEF",95:"LOAD",104:"TO",105:"CREATE",107:"GRAPH",108:"INSERTDATA",110:"DELETEDATA",111:"DELETEWHERE",120:"DELETE",121:"INSERT",123:"USING",126:"WITH",128:"INTO",129:"DEFAULT",155:"OPTIONAL",156:"MINUS",158:"SERVICE",161:"FILTER",162:"BIND",163:"NIL",181:"a",192:";",203:"!",208:"^",210:"[",211:"]",213:"BLANK_NODE_LABEL",214:"ANON",222:"IN",237:"-",239:"FUNC_ARITY0",240:"FUNC_ARITY1",241:"FUNC_ARITY2",242:",",243:"IF",245:"BOUND",246:"BNODE",248:"EXISTS",249:"COUNT",252:"FUNC_AGGREGATE",254:"GROUP_CONCAT",258:"SEPARATOR",259:"=",261:"LANGTAG",262:"^^",263:"DECIMAL",264:"DOUBLE",265:"true",266:"false",267:"STRING_LITERAL1",268:"STRING_LITERAL2",269:"STRING_LITERAL_LONG1",270:"STRING_LITERAL_LONG2",271:"INTEGER_POSITIVE",272:"DECIMAL_POSITIVE",273:"DOUBLE_POSITIVE",274:"INTEGER_NEGATIVE",275:"DECIMAL_NEGATIVE",276:"DOUBLE_NEGATIVE",277:"PNAME_LN",280:"DISTINCT",281:"REDUCED",283:"*",286:"NAMED",287:"SILENT",288:"CLEAR",289:"DROP",290:"ADD",291:"MOVE",292:"COPY",293:"ALL",294:".",295:"UNION",297:"|",298:"/",300:"?",301:"+",302:"||",303:"&&",304:"!=",305:"<",306:">",307:"<=",308:">=",309:"NOT",310:"CONCAT",311:"COALESCE",312:"SUBSTR",313:"REGEX",314:"REPLACE"},
productions_: [0,[3,3],[7,2],[10,2],[13,3],[16,4],[21,4],[17,3],[26,1],[26,5],[32,5],[32,7],[41,5],[46,4],[49,3],[19,2],[20,4],[59,3],[63,1],[63,1],[63,3],[63,5],[63,1],[66,2],[69,3],[72,2],[72,2],[72,1],[72,1],[77,2],[77,2],[77,4],[77,4],[81,2],[83,4],[83,6],[87,1],[87,1],[87,1],[90,3],[92,2],[94,4],[94,3],[94,5],[94,4],[94,2],[94,2],[94,2],[94,6],[94,6],[117,2],[113,2],[122,3],[125,2],[127,3],[103,1],[103,2],[100,2],[100,1],[109,4],[134,7],[139,3],[54,3],[54,3],[143,2],[146,3],[150,3],[147,2],[147,2],[147,2],[147,3],[147,4],[147,2],[147,6],[147,1],[76,1],[76,1],[76,1],[65,2],[65,6],[166,1],[166,4],[34,3],[169,3],[141,2],[141,2],[175,1],[173,2],[178,2],[179,1],[179,1],[179,1],[180,2],[152,2],[152,2],[184,4],[191,1],[191,3],[194,2],[196,2],[199,2],[198,2],[200,1],[200,1],[200,2],[200,3],[204,1],[204,1],[204,4],[205,1],[205,1],[205,2],[205,2],[174,3],[174,3],[185,3],[185,3],[183,1],[183,1],[189,1],[189,1],[172,1],[172,1],[172,1],[172,1],[172,1],[172,1],[29,2],[216,2],[218,1],[218,3],[218,4],[219,2],[225,2],[225,2],[225,2],[223,2],[233,2],[231,2],[231,2],[231,2],[236,1],[236,1],[236,1],[236,1],[236,1],[236,1],[74,3],[64,1],[64,2],[64,4],[64,6],[64,8],[64,2],[64,4],[64,2],[64,4],[64,3],[238,5],[238,5],[238,6],[257,4],[88,1],[88,2],[88,3],[88,1],[88,1],[88,1],[88,1],[88,1],[88,1],[88,1],[260,1],[260,1],[260,1],[260,1],[227,1],[227,1],[227,1],[229,1],[229,1],[229,1],[52,1],[52,1],[52,1],[278,1],[278,1],[4,0],[4,2],[5,1],[5,1],[8,1],[8,1],[8,1],[8,1],[9,0],[9,1],[18,0],[18,2],[22,0],[22,1],[279,1],[279,1],[24,0],[24,1],[282,1],[282,2],[25,1],[25,1],[35,0],[35,2],[36,0],[36,2],[39,0],[39,1],[284,1],[284,1],[285,1],[285,2],[43,1],[43,1],[44,0],[44,2],[45,0],[45,1],[48,0],[48,2],[51,0],[51,1],[53,0],[53,1],[55,0],[55,1],[56,0],[56,1],[57,0],[57,1],[58,0],[58,1],[62,1],[62,2],[68,1],[68,2],[71,1],[71,2],[84,0],[84,2],[85,0],[85,2],[86,0],[86,2],[91,0],[91,2],[93,0],[93,3],[96,0],[96,1],[97,0],[97,1],[98,1],[98,1],[99,0],[99,1],[101,1],[101,1],[101,1],[102,0],[102,1],[106,0],[106,1],[112,0],[112,1],[114,0],[114,1],[115,0],[115,2],[116,0],[116,1],[118,0],[118,1],[119,0],[119,2],[124,0],[124,1],[130,0],[130,1],[131,1],[131,1],[131,1],[132,0],[132,1],[133,0],[133,2],[135,1],[135,1],[136,0],[136,1],[137,0],[137,1],[138,0],[138,1],[140,0],[140,3],[142,0],[142,1],[144,0],[144,1],[145,0],[145,2],[148,0],[148,1],[149,0],[149,1],[151,0],[151,3],[153,0],[153,1],[154,0],[154,3],[157,1],[157,1],[159,0],[159,1],[160,1],[160,1],[164,0],[164,1],[165,0],[165,3],[167,0],[167,3],[168,0],[168,1],[170,0],[170,3],[171,0],[171,1],[176,0],[176,1],[296,1],[296,2],[177,0],[177,3],[182,0],[182,3],[186,0],[186,1],[187,1],[187,1],[188,0],[188,3],[190,0],[190,2],[193,1],[193,1],[195,0],[195,3],[197,0],[197,3],[299,1],[299,1],[299,1],[201,0],[201,1],[202,0],[202,1],[206,0],[206,3],[207,0],[207,1],[209,1],[209,2],[212,1],[212,2],[215,0],[215,3],[217,0],[217,3],[220,1],[220,1],[220,1],[220,1],[220,1],[220,1],[221,0],[221,1],[224,0],[224,2],[226,1],[226,1],[228,0],[228,2],[230,0],[230,2],[232,0],[232,2],[234,1],[234,1],[235,0],[235,1],[244,1],[244,1],[244,1],[244,1],[244,1],[247,0],[247,1],[250,0],[250,1],[251,1],[251,1],[253,0],[253,1],[255,0],[255,1],[256,0],[256,1]],
performAction: function anonymous(yytext, yyleng, yylineno, yy, yystate /* action[1] */, $$ /* vstack */, _$ /* lstack */) {
/* this == yyval */

var $0 = $$.length - 1;
switch (yystate) {
case 1:

      $$[$0-1].prefixes = Parser.prefixes;
      Parser.prefixes = null;
      base = basePath = baseRoot = '';
      return $$[$0-1];
    
break;
case 2:
this.$ = extend($$[$0-1], $$[$0], { type: 'query' });
break;
case 3:

      base = resolveIRI($$[$0])
      basePath = base.replace(/[^\/]*$/, '');
      baseRoot = base.match(/^(?:[a-z]+:\/*)?[^\/]*/)[0];
    
break;
case 4:

      if (!Parser.prefixes) Parser.prefixes = {};
      $$[$0-1] = $$[$0-1].substr(0, $$[$0-1].length - 1);
      $$[$0] = resolveIRI($$[$0]);
      Parser.prefixes[$$[$0-1]] = $$[$0];
    
break;
case 5:
this.$ = extend($$[$0-3], groupDatasets($$[$0-2]), $$[$0-1], $$[$0]);
break;
case 6:
this.$ = extend({ type: 'query' }, $$[$0-3], $$[$0-2], $$[$0-1], $$[$0]);
break;
case 7:
this.$ = extend({ queryType: 'SELECT', variables: $$[$0] === '*' ? ['*'] : $$[$0] }, $$[$0-1] && ($$[$0-2] = lowercase($$[$0-1]), $$[$0-1] = {}, $$[$0-1][$$[$0-2]] = true, $$[$0-1]));
break;
case 8: case 89: case 121: case 146:
this.$ = toVar($$[$0]);
break;
case 9: case 21:
this.$ = expression($$[$0-3], { variable: toVar($$[$0-1]) });
break;
case 10:
this.$ = extend({ queryType: 'CONSTRUCT', template: $$[$0-3] }, groupDatasets($$[$0-2]), $$[$0-1], $$[$0]);
break;
case 11:
this.$ = extend({ queryType: 'CONSTRUCT', template: $$[$0-2] = ($$[$0-2] ? $$[$0-2].triples : []) }, groupDatasets($$[$0-5]), { where: [ { type: 'bgp', triples: appendAllTo([], $$[$0-2]) } ] }, $$[$0]);
break;
case 12:
this.$ = extend({ queryType: 'DESCRIBE', variables: $$[$0-3] === '*' ? ['*'] : $$[$0-3].map(toVar) }, groupDatasets($$[$0-2]), $$[$0-1], $$[$0]);
break;
case 13:
this.$ = extend({ queryType: 'ASK' }, groupDatasets($$[$0-2]), $$[$0-1], $$[$0]);
break;
case 14: case 52:
this.$ = { iri: $$[$0], named: !!$$[$0-1] };
break;
case 15:
this.$ = { where: $$[$0].patterns };
break;
case 16:
this.$ = extend($$[$0-3], $$[$0-2], $$[$0-1], $$[$0]);
break;
case 17:
this.$ = { group: $$[$0] };
break;
case 18: case 19: case 25: case 27:
this.$ = expression($$[$0]);
break;
case 20:
this.$ = expression($$[$0-1]);
break;
case 22: case 28:
this.$ = expression(toVar($$[$0]));
break;
case 23:
this.$ = { having: $$[$0] };
break;
case 24:
this.$ = { order: $$[$0] };
break;
case 26:
this.$ = expression($$[$0], { descending: true });
break;
case 29:
this.$ = { limit:  toInt($$[$0]) };
break;
case 30:
this.$ = { offset: toInt($$[$0]) };
break;
case 31:
this.$ = { limit: toInt($$[$0-2]), offset: toInt($$[$0]) };
break;
case 32:
this.$ = { limit: toInt($$[$0]), offset: toInt($$[$0-2]) };
break;
case 33:
this.$ = { type: 'values', values: $$[$0] };
break;
case 34:

      $$[$0-3] = toVar($$[$0-3]);
      this.$ = $$[$0-1].map(function(v) { var o = {}; o[$$[$0-3]] = v; return o; })
    
break;
case 35:

      var length = $$[$0-4].length;
      $$[$0-4] = $$[$0-4].map(toVar);
      this.$ = $$[$0-1].map(function (values) {
        if (values.length !== length)
          throw Error('Inconsistent VALUES length');
        var valuesObject = {};
        for(var i = 0; i<length; i++)
          valuesObject[$$[$0-4][i]] = values[i];
        return valuesObject;
      });
    
break;
case 38:
this.$ = undefined;
break;
case 39: case 62: case 82: case 105: case 147:
this.$ = $$[$0-1];
break;
case 40:
this.$ = { type: 'update', updates: appendTo($$[$0-1], $$[$0]) };
break;
case 41:
this.$ = extend({ type: 'load', silent: !!$$[$0-2], source: $$[$0-1] }, $$[$0] && { destination: $$[$0] });
break;
case 42:
this.$ = { type: lowercase($$[$0-2]), silent: !!$$[$0-1], graph: $$[$0] };
break;
case 43:
this.$ = { type: lowercase($$[$0-4]), silent: !!$$[$0-3], source: $$[$0-2], destination: $$[$0] };
break;
case 44:
this.$ = { type: 'create', silent: !!$$[$0-2], graph: $$[$0-1] };
break;
case 45:
this.$ = { updateType: 'insert',      insert: $$[$0] };
break;
case 46:
this.$ = { updateType: 'delete',      delete: $$[$0] };
break;
case 47:
this.$ = { updateType: 'deletewhere', delete: $$[$0] };
break;
case 48:
this.$ = extend({ updateType: 'insertdelete' }, $$[$0-5], { insert: $$[$0-4] || [] }, { delete: $$[$0-3] || [] }, groupDatasets($$[$0-2]), { where: $$[$0].patterns });
break;
case 49:
this.$ = extend({ updateType: 'insertdelete' }, $$[$0-5], { delete: $$[$0-4] || [] }, { insert: $$[$0-3] || [] }, groupDatasets($$[$0-2]), { where: $$[$0].patterns });
break;
case 50: case 51: case 54: case 138:
this.$ = $$[$0];
break;
case 53:
this.$ = { graph: $$[$0] };
break;
case 55:
this.$ = { type: 'graph', default: true };
break;
case 56: case 57:
this.$ = { type: 'graph', name: $$[$0] };
break;
case 58:
 this.$ = {}; this.$[lowercase($$[$0])] = true; 
break;
case 59:
this.$ = $$[$0-2] ? unionAll($$[$0-1], [$$[$0-2]]) : unionAll($$[$0-1]);
break;
case 60:

      var graph = extend($$[$0-3] || { triples: [] }, { type: 'graph', name: toVar($$[$0-5]) });
      this.$ = $$[$0] ? [graph, $$[$0]] : [graph];
    
break;
case 61: case 66:
this.$ = { type: 'bgp', triples: unionAll($$[$0-2], [$$[$0-1]]) };
break;
case 63:

      // Simplify the groups by merging adjacent BGPs and moving filters to the back
      if ($$[$0-1].length > 1) {
        var groups = [], currentBgp, filters = [];
        for (var i = 0, group; group=$$[$0-1][i]; i++) {
          switch (group.type) {
            // Add a BGP's triples to the current BGP
            case 'bgp':
              if (group.triples.length) {
                if (!currentBgp)
                  appendTo(groups, currentBgp = group);
                else
                  appendAllTo(currentBgp.triples, group.triples);
              }
              break;
            // Save filters separately
            case 'filter':
              appendTo(filters, group);
              break;
            // All other groups break up a BGP
            default:
              // Only add the group if its pattern is non-empty
              if (!group.patterns || group.patterns.length > 0) {
                appendTo(groups, group);
                currentBgp = null;
              }
          }
        }
        $$[$0-1] = appendAllTo(groups, filters);
      }
      this.$ = { type: 'group', patterns: $$[$0-1] }
    
break;
case 64:
this.$ = $$[$0-1] ? unionAll([$$[$0-1]], $$[$0]) : unionAll($$[$0]);
break;
case 65:
this.$ = $$[$0] ? [$$[$0-2], $$[$0]] : $$[$0-2];
break;
case 67:
this.$ = $$[$0-1].length ? { type: 'union', patterns: unionAll($$[$0-1].map(degroupSingle), [degroupSingle($$[$0])]) } : degroupSingle($$[$0]);
break;
case 68:
this.$ = extend($$[$0], { type: 'optional' });
break;
case 69:
this.$ = extend($$[$0], { type: 'minus' });
break;
case 70:
this.$ = extend($$[$0], { type: 'graph', name: toVar($$[$0-1]) });
break;
case 71:
this.$ = extend($$[$0], { type: 'service', name: toVar($$[$0-1]), silent: !!$$[$0-2] });
break;
case 72:
this.$ = { type: 'filter', expression: $$[$0] };
break;
case 73:
this.$ = { type: 'bind', variable: toVar($$[$0-1]), expression: $$[$0-3] };
break;
case 78:
this.$ = { type: 'functionCall', function: $$[$0-1], args: [] };
break;
case 79:
this.$ = { type: 'functionCall', function: $$[$0-5], args: appendTo($$[$0-2], $$[$0-1]), distinct: !!$$[$0-3] };
break;
case 80: case 96: case 107: case 187: case 197: case 209: case 211: case 221: case 225: case 245: case 247: case 249: case 251: case 253: case 274: case 280: case 291: case 301: case 307: case 313: case 317: case 327: case 329: case 333: case 341: case 343: case 349: case 351: case 355: case 357: case 366: case 374: case 376: case 386: case 390: case 392: case 394:
this.$ = [];
break;
case 81:
this.$ = appendTo($$[$0-2], $$[$0-1]);
break;
case 83:
this.$ = unionAll($$[$0-2], [$$[$0-1]]);
break;
case 84: case 93:
this.$ = $$[$0].map(function (t) { return extend(triple($$[$0-1]), t); });
break;
case 85:
this.$ = appendAllTo($$[$0].map(function (t) { return extend(triple($$[$0-1].entity), t); }), $$[$0-1].triples) /* the subject is a blank node, possibly with more triples */;
break;
case 87:
this.$ = unionAll($$[$0-1], [$$[$0]]);
break;
case 88:
this.$ = objectListToTriples($$[$0-1], $$[$0]);
break;
case 91: case 103: case 110:
this.$ = RDF_TYPE;
break;
case 92:
this.$ = appendTo($$[$0-1], $$[$0]);
break;
case 94:
this.$ = !$$[$0] ? $$[$0-1].triples : appendAllTo($$[$0].map(function (t) { return extend(triple($$[$0-1].entity), t); }), $$[$0-1].triples) /* the subject is a blank node, possibly with more triples */;
break;
case 95:
this.$ = objectListToTriples(toVar($$[$0-3]), appendTo($$[$0-2], $$[$0-1]), $$[$0]);
break;
case 97:
this.$ = objectListToTriples(toVar($$[$0-1]), $$[$0]);
break;
case 98:
this.$ = $$[$0-1].length ? path('|',appendTo($$[$0-1], $$[$0])) : $$[$0];
break;
case 99:
this.$ = $$[$0-1].length ? path('/', appendTo($$[$0-1], $$[$0])) : $$[$0];
break;
case 100:
this.$ = $$[$0] ? path($$[$0], [$$[$0-1]]) : $$[$0-1];
break;
case 101:
this.$ = $$[$0-1] ? path($$[$0-1], [$$[$0]]) : $$[$0];;
break;
case 104: case 111:
this.$ = path($$[$0-1], [$$[$0]]);
break;
case 108:
this.$ = path('|', appendTo($$[$0-2], $$[$0-1]));
break;
case 112:
this.$ = path($$[$0-1], [RDF_TYPE]);
break;
case 113: case 115:
this.$ = createList($$[$0-1]);
break;
case 114: case 116:
this.$ = createAnonymousObject($$[$0-1]);
break;
case 117:
this.$ = { entity: $$[$0], triples: [] } /* for consistency with TriplesNode */;
break;
case 119:
this.$ = { entity: $$[$0], triples: [] } /* for consistency with TriplesNodePath */;
break;
case 125:
this.$ = blank();
break;
case 126:
this.$ = RDF_NIL;
break;
case 127:
this.$ = $$[$0-1].length ? operation('||', appendTo($$[$0-1], $$[$0])) : $$[$0];
break;
case 128:
this.$ = $$[$0-1].length ? operation('&&', appendTo($$[$0-1], $$[$0])) : $$[$0];
break;
case 130:
this.$ = operation($$[$0-1], [$$[$0-2], $$[$0]]);
break;
case 131:
this.$ = operation($$[$0-2] ? 'notin' : 'in', [$$[$0-3], $$[$0]]);
break;
case 132: case 136:
this.$ = createOperationTree($$[$0-1], $$[$0]);
break;
case 133: case 137:
this.$ = [$$[$0-1], $$[$0]];
break;
case 134:
this.$ = ['+', createOperationTree($$[$0-1], $$[$0])];
break;
case 135:
this.$ = ['-', createOperationTree($$[$0-1].replace('-', ''), $$[$0])];
break;
case 139:
this.$ = operation($$[$0-1], [$$[$0]]);
break;
case 140:
this.$ = operation('UMINUS', [$$[$0]]);
break;
case 149:
this.$ = operation(lowercase($$[$0-1]));
break;
case 150:
this.$ = operation(lowercase($$[$0-3]), [$$[$0-1]]);
break;
case 151:
this.$ = operation(lowercase($$[$0-5]), [$$[$0-3], $$[$0-1]]);
break;
case 152:
this.$ = operation(lowercase($$[$0-7]), [$$[$0-5], $$[$0-3], $$[$0-1]]);
break;
case 153:
this.$ = operation(lowercase($$[$0-1]), $$[$0]);
break;
case 154:
this.$ = operation('bound', [toVar($$[$0-1])]);
break;
case 155:
this.$ = operation($$[$0-1], []);
break;
case 156:
this.$ = operation($$[$0-3], [$$[$0-1]]);
break;
case 157:
this.$ = operation($$[$0-2] ? 'notexists' :'exists', [degroupSingle($$[$0])]);
break;
case 158: case 159:
this.$ = expression($$[$0-1], { type: 'aggregate', aggregation: lowercase($$[$0-4]), distinct: !!$$[$0-2] });
break;
case 160:
this.$ = expression($$[$0-2], { type: 'aggregate', aggregation: lowercase($$[$0-5]), distinct: !!$$[$0-3], separator: $$[$0-1] || ' ' });
break;
case 161:
this.$ = $$[$0].substr(1, $$[$0].length - 2);
break;
case 163:
this.$ = $$[$0-1] + lowercase($$[$0]);
break;
case 164:
this.$ = $$[$0-2] + '^^' + $$[$0];
break;
case 165: case 179:
this.$ = createLiteral($$[$0], XSD_INTEGER);
break;
case 166: case 180:
this.$ = createLiteral($$[$0], XSD_DECIMAL);
break;
case 167: case 181:
this.$ = createLiteral(lowercase($$[$0]), XSD_DOUBLE);
break;
case 170:
this.$ = XSD_TRUE;
break;
case 171:
this.$ = XSD_FALSE;
break;
case 172: case 173:
this.$ = unescapeString($$[$0], 1);
break;
case 174: case 175:
this.$ = unescapeString($$[$0], 3);
break;
case 176:
this.$ = createLiteral($$[$0].substr(1), XSD_INTEGER);
break;
case 177:
this.$ = createLiteral($$[$0].substr(1), XSD_DECIMAL);
break;
case 178:
this.$ = createLiteral($$[$0].substr(1).toLowerCase(), XSD_DOUBLE);
break;
case 182:
this.$ = resolveIRI($$[$0]);
break;
case 183:

      var namePos = $$[$0].indexOf(':'),
          prefix = $$[$0].substr(0, namePos),
          expansion = Parser.prefixes[prefix];
      if (!expansion) throw new Error('Unknown prefix: ' + prefix);
      this.$ = resolveIRI(expansion + $$[$0].substr(namePos + 1));
    
break;
case 184:

      $$[$0] = $$[$0].substr(0, $$[$0].length - 1);
      if (!($$[$0] in Parser.prefixes)) throw new Error('Unknown prefix: ' + $$[$0]);
      this.$ = resolveIRI(Parser.prefixes[$$[$0]]);
    
break;
case 188: case 198: case 206: case 210: case 212: case 218: case 222: case 226: case 240: case 242: case 244: case 246: case 248: case 250: case 252: case 275: case 281: case 292: case 308: case 340: case 352: case 371: case 373: case 387: case 391: case 393: case 395:
$$[$0-1].push($$[$0]);
break;
case 205: case 217: case 239: case 241: case 243: case 339: case 370: case 372:
this.$ = [$$[$0]];
break;
case 254: case 302: case 314: case 318: case 328: case 330: case 334: case 342: case 344: case 350: case 356: case 358: case 367: case 375: case 377:
$$[$0-2].push($$[$0-1]);
break;
}
},
table: [o($V0,[2,187],{3:1,4:2}),{1:[3]},o($V1,[2,253],{5:3,278:4,7:5,92:6,10:7,13:8,8:9,93:10,16:13,32:14,41:15,46:16,17:17,11:[1,11],14:[1,12],23:$V2,33:[1,18],42:[1,19],47:[1,20]}),{6:[1,22]},o($V0,[2,188]),{6:[2,189]},{6:[2,190]},o($V0,[2,185]),o($V0,[2,186]),{6:[2,195],9:23,81:24,82:$V3},{94:26,95:[1,27],98:28,101:29,105:[1,30],108:[1,31],110:[1,32],111:[1,33],112:34,116:35,120:[2,276],121:[2,270],125:41,126:[1,42],288:[1,36],289:[1,37],290:[1,38],291:[1,39],292:[1,40]},{12:[1,43]},{15:[1,44]},o($V4,[2,191]),o($V4,[2,192]),o($V4,[2,193]),o($V4,[2,194]),o($V5,[2,197],{18:45}),o($V6,[2,211],{34:46,36:47,38:[1,48]}),{12:$V7,15:$V8,27:$V9,43:49,52:54,277:$Va,283:[1,51],284:52,285:50},o($V5,[2,225],{48:58}),o($Vb,[2,203],{24:59,279:60,280:[1,61],281:[1,62]}),{1:[2,1]},{6:[2,2]},{6:[2,196]},{27:[1,64],28:[1,65],83:63},{6:[2,40],192:[1,66]},o($Vc,[2,255],{96:67,287:[1,68]}),o($Vd,[2,261],{99:69,287:[1,70]}),o($Ve,[2,266],{102:71,287:[1,72]}),{106:73,107:[2,268],287:[1,74]},{38:$Vf,109:75},{38:$Vf,109:77},{38:$Vf,109:78},{113:79,121:$Vg},{117:81,120:$Vh},o($Vi,[2,259]),o($Vi,[2,260]),o($Vj,[2,263]),o($Vj,[2,264]),o($Vj,[2,265]),{120:[2,277],121:[2,271]},{12:$V7,15:$V8,52:83,277:$Va},o($V0,[2,3]),{12:[1,84]},{19:85,37:$Vk,38:$Vl,49:86,50:$Vm,53:87},o($V5,[2,209],{35:90}),{37:[1,91],49:92,50:$Vm},o($Vn,[2,333],{168:93,169:94,170:95,40:[2,331]}),o($Vo,[2,221],{44:96}),o($Vo,[2,219],{52:54,284:97,12:$V7,15:$V8,27:$V9,277:$Va}),o($Vo,[2,220]),o($Vp,[2,217]),o($Vp,[2,215]),o($Vp,[2,216]),o($Vq,[2,182]),o($Vq,[2,183]),o($Vq,[2,184]),{19:98,37:$Vk,38:$Vl,49:99,50:$Vm,53:87},{25:100,26:103,27:$Vr,28:$Vs,282:101,283:[1,102]},o($Vb,[2,204]),o($Vb,[2,201]),o($Vb,[2,202]),o($Vt,[2,33]),{38:[1,106]},o($Vu,[2,247],{85:107}),o($V1,[2,254]),{12:$V7,15:$V8,52:108,277:$Va},o($Vc,[2,256]),{100:109,107:[1,110],129:[1,112],131:111,286:[1,113],293:[1,114]},o($Vd,[2,262]),o($Vc,$Vv,{103:115,130:117,107:$Vw,129:$Vx}),o($Ve,[2,267]),{107:[1,119]},{107:[2,269]},o($Vy,[2,45]),o($Vn,$Vz,{132:120,139:121,140:122,40:$VA,107:$VA}),o($Vy,[2,46]),o($Vy,[2,47]),o($VB,[2,272],{114:123,117:124,120:$Vh}),{38:$Vf,109:125},o($VB,[2,278],{118:126,113:127,121:$Vg}),{38:$Vf,109:128},o([120,121],[2,53]),o($V0,[2,4]),o($VC,$VD,{20:129,55:130,59:131,60:$VE}),o($V5,[2,198]),{38:$VF,54:133},o($Vc,[2,227],{51:135,286:[1,136]}),{38:[2,230]},{19:137,37:$Vk,38:$Vl,49:138,50:$Vm,53:87},{38:[1,139]},o($V6,[2,212]),{40:[1,140]},{40:[2,332]},{12:$V7,15:$V8,27:$VG,28:$VH,52:145,79:$VI,88:146,141:141,163:$VJ,172:142,174:143,210:$VK,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($V$,[2,223],{53:87,45:170,49:171,19:172,37:$Vk,38:$Vl,50:$Vm}),o($Vp,[2,218]),o($VC,$VD,{55:130,59:131,20:173,60:$VE}),o($V5,[2,226]),o($V5,[2,7]),o($V5,[2,207],{26:174,27:$Vr,28:$Vs}),o($V5,[2,208]),o($V01,[2,205]),o($V01,[2,8]),o($V11,$V21,{29:175,215:176}),o($V31,[2,245],{84:177}),{27:[1,179],31:[1,178]},o($Vy,[2,257],{97:180,127:181,128:[1,182]}),o($Vy,[2,42]),{12:$V7,15:$V8,52:183,277:$Va},o($Vy,[2,58]),o($Vy,[2,286]),o($Vy,[2,287]),o($Vy,[2,288]),{104:[1,184]},o($V41,[2,55]),{12:$V7,15:$V8,52:185,277:$Va},o($Vc,[2,285]),{12:$V7,15:$V8,52:186,277:$Va},o($V51,[2,291],{133:187}),o($V51,[2,290]),{12:$V7,15:$V8,27:$VG,28:$VH,52:145,79:$VI,88:146,141:188,163:$VJ,172:142,174:143,210:$VK,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($VB,[2,274],{115:189}),o($VB,[2,273]),o([37,120,123],[2,51]),o($VB,[2,280],{119:190}),o($VB,[2,279]),o([37,121,123],[2,50]),o($V4,[2,5]),o($V61,[2,233],{56:191,66:192,67:[1,193]}),o($VC,[2,232]),{61:[1,194]},o([6,40,60,67,70,78,80,82],[2,15]),o($Vn,$V71,{21:195,143:196,17:197,144:198,150:199,151:200,23:$V2,38:$V81,40:$V81,82:$V81,107:$V81,155:$V81,156:$V81,158:$V81,161:$V81,162:$V81}),{12:$V7,15:$V8,52:201,277:$Va},o($Vc,[2,228]),o($VC,$VD,{55:130,59:131,20:202,60:$VE}),o($V5,[2,210]),o($Vn,$Vz,{140:122,39:203,139:204,40:[2,213]}),o($V5,[2,82]),{40:[2,335],171:205,294:[1,206]},o($V91,$Va1,{173:207,177:208}),o($V91,$Va1,{177:208,175:209,176:210,173:211,40:$Vb1,107:$Vb1,294:$Vb1}),o($Vc1,[2,121]),o($Vc1,[2,122]),o($Vc1,[2,123]),o($Vc1,[2,124]),o($Vc1,[2,125]),o($Vc1,[2,126]),{12:$V7,15:$V8,27:$VG,28:$VH,52:145,79:$VI,88:146,163:$VJ,172:214,174:215,183:213,209:212,210:$VK,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($V91,$Va1,{177:208,173:216}),o($Vd1,[2,162],{261:[1,217],262:[1,218]}),o($Vd1,[2,165]),o($Vd1,[2,166]),o($Vd1,[2,167]),o($Vd1,[2,168]),o($Vd1,[2,169]),o($Vd1,[2,170]),o($Vd1,[2,171]),o($Ve1,[2,172]),o($Ve1,[2,173]),o($Ve1,[2,174]),o($Ve1,[2,175]),o($Vd1,[2,176]),o($Vd1,[2,177]),o($Vd1,[2,178]),o($Vd1,[2,179]),o($Vd1,[2,180]),o($Vd1,[2,181]),o($VC,$VD,{55:130,59:131,20:219,60:$VE}),o($Vo,[2,222]),o($V$,[2,224]),o($V4,[2,13]),o($V01,[2,206]),{30:[1,220]},o($V11,[2,376],{216:221,217:222}),{12:$V7,15:$V8,40:[1,223],52:225,79:$VI,87:224,88:226,89:$Vf1,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},{38:[1,228]},o($Vu,[2,248]),o($Vy,[2,41]),o($Vy,[2,258]),{107:[1,229]},o($Vy,[2,57]),o($Vc,$Vv,{130:117,103:230,107:$Vw,129:$Vx}),o($V41,[2,56]),o($Vy,[2,44]),{40:[1,231],107:[1,233],134:232},o($V51,[2,303],{142:234,294:[1,235]}),{37:[1,236],122:237,123:$Vg1},{37:[1,239],122:240,123:$Vg1},o($Vh1,[2,235],{57:241,69:242,70:[1,243]}),o($V61,[2,234]),{12:$V7,15:$V8,28:$Vi1,52:259,64:247,65:248,68:244,74:246,76:245,238:250,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,244:255,245:$Vn1,246:$Vo1,247:258,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1},{12:$V7,15:$V8,27:$Vz1,28:$VA1,52:259,62:269,63:270,64:271,65:272,238:250,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,244:255,245:$Vn1,246:$Vo1,247:258,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1},{40:[1,275]},{40:[1,276]},{19:277,37:$Vk,38:$Vl,53:87},o($VB1,[2,307],{145:278}),o($VB1,[2,306]),{12:$V7,15:$V8,27:$VG,28:$VC1,52:145,79:$VI,88:146,152:279,163:$VJ,172:280,185:281,210:$VD1,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($Vo,[2,14]),o($V4,[2,10]),{40:[1,284]},{40:[2,214]},{40:[2,83]},o($Vn,[2,334],{40:[2,336]}),o($VE1,[2,84]),{12:$V7,15:$V8,27:[1,287],52:288,178:285,179:286,181:[1,289],277:$Va},o($VE1,[2,85]),o($VE1,[2,86]),o($VE1,[2,338]),{12:$V7,15:$V8,27:$VG,28:$VH,31:[1,290],52:145,79:$VI,88:146,163:$VJ,172:214,174:215,183:291,210:$VK,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($VF1,[2,370]),o($VG1,[2,117]),o($VG1,[2,118]),{211:[1,292]},o($Vd1,[2,163]),{12:$V7,15:$V8,52:293,277:$Va},o($V4,[2,12]),{27:[1,294]},o([30,31,192,242],[2,127],{302:[1,295]}),o($VH1,$VI1,{218:296,219:297,223:298,231:299,235:300,203:$VJ1,237:$VK1,301:$VL1}),o($Vt,[2,34]),o($V31,[2,246]),o($VM1,[2,36]),o($VM1,[2,37]),o($VM1,[2,38]),o($VN1,[2,249],{86:304}),{12:$V7,15:$V8,52:305,277:$Va},o($Vy,[2,43]),o([6,37,120,121,123,192],[2,59]),o($V51,[2,292]),{12:$V7,15:$V8,27:[1,307],52:308,135:306,277:$Va},o($V51,[2,61]),o($Vn,[2,302],{40:$VO1,107:$VO1}),{38:$VF,54:309},o($VB,[2,275]),o($Vc,[2,282],{124:310,286:[1,311]}),{38:$VF,54:312},o($VB,[2,281]),o($VP1,[2,237],{58:313,77:314,78:[1,315],80:[1,316]}),o($Vh1,[2,236]),{61:[1,317]},o($V61,[2,23],{74:246,64:247,65:248,238:250,244:255,247:258,52:259,76:318,12:$V7,15:$V8,28:$Vi1,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,245:$Vn1,246:$Vo1,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1}),o($VQ1,[2,241]),o($VR1,[2,75]),o($VR1,[2,76]),o($VR1,[2,77]),o($V11,$V21,{215:176,29:319}),o($VS1,[2,148]),{163:[1,320]},{28:[1,321]},{28:[1,322]},{28:[1,323]},{28:$VT1,163:$VU1,166:324},{28:[1,327]},{28:[1,329],163:[1,328]},{248:[1,330]},{28:$VV1,163:$VW1},{28:[1,333]},{28:[1,334]},{28:[1,335]},o($VX1,[2,400]),o($VX1,[2,401]),o($VX1,[2,402]),o($VX1,[2,403]),o($VX1,[2,404]),{248:[2,406]},o($VC,[2,17],{238:250,244:255,247:258,52:259,64:271,65:272,63:336,12:$V7,15:$V8,27:$Vz1,28:$VA1,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,245:$Vn1,246:$Vo1,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1}),o($VY1,[2,239]),o($VY1,[2,18]),o($VY1,[2,19]),o($V11,$V21,{215:176,29:337}),o($VY1,[2,22]),o($VZ1,[2,62]),o($VZ1,[2,63]),o($VC,$VD,{55:130,59:131,20:338,60:$VE}),{38:[2,317],40:[2,64],81:348,82:$V3,107:[1,344],146:339,147:340,154:341,155:[1,342],156:[1,343],158:[1,345],161:[1,346],162:[1,347]},o($VB1,[2,315],{153:349,294:[1,350]}),o($V_1,$V$1,{184:351,187:352,194:353,195:355,27:$V02}),o($V12,[2,345],{187:352,194:353,195:355,186:356,184:357,12:$V$1,15:$V$1,28:$V$1,181:$V$1,203:$V$1,208:$V$1,277:$V$1,27:$V02}),{12:$V7,15:$V8,27:$VG,28:$VC1,52:145,79:$VI,88:146,163:$VJ,172:360,185:361,189:359,210:$VD1,212:358,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($V_1,$V$1,{187:352,194:353,195:355,184:362,27:$V02}),o($VC,$VD,{55:130,59:131,20:363,60:$VE}),o([40,107,211,294],[2,87],{296:364,192:[1,365]}),o($Vn,$V22,{180:366,182:367}),o($Vn,[2,89]),o($Vn,[2,90]),o($Vn,[2,91]),o($V32,[2,113]),o($VF1,[2,371]),o($V32,[2,114]),o($Vd1,[2,164]),{31:[1,368]},o($V11,[2,375]),o([30,31,192,242,302],[2,128],{303:[1,369]}),o($V42,[2,129],{220:370,221:371,222:[2,384],259:[1,372],304:[1,373],305:[1,374],306:[1,375],307:[1,376],308:[1,377],309:[1,378]}),o($V52,[2,386],{224:379}),o($V62,[2,394],{232:380}),{12:$V7,15:$V8,27:$V72,28:$Vi1,52:384,64:383,65:385,74:382,79:$VI,88:386,227:156,229:157,236:381,238:250,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,244:255,245:$Vn1,246:$Vo1,247:258,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1},{12:$V7,15:$V8,27:$V72,28:$Vi1,52:384,64:383,65:385,74:382,79:$VI,88:386,227:156,229:157,236:388,238:250,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,244:255,245:$Vn1,246:$Vo1,247:258,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1},{12:$V7,15:$V8,27:$V72,28:$Vi1,52:384,64:383,65:385,74:382,79:$VI,88:386,227:156,229:157,236:389,238:250,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,244:255,245:$Vn1,246:$Vo1,247:258,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1},o($VH1,[2,399]),{28:[1,392],40:[1,390],90:391},o($Vy,[2,54]),{38:[1,393]},{38:[2,293]},{38:[2,294]},o($Vy,[2,48]),{12:$V7,15:$V8,52:394,277:$Va},o($Vc,[2,283]),o($Vy,[2,49]),o($VP1,[2,16]),o($VP1,[2,238]),{79:[1,395]},{79:[1,396]},{12:$V7,15:$V8,27:$V82,28:$Vi1,52:259,64:247,65:248,71:397,72:398,73:$V92,74:246,75:$Va2,76:401,238:250,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,244:255,245:$Vn1,246:$Vo1,247:258,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1},o($VQ1,[2,242]),{31:[1,403]},o($VS1,[2,149]),o($V11,$V21,{215:176,29:404}),o($V11,$V21,{215:176,29:405}),o($V11,$V21,{215:176,29:406}),o($VS1,[2,153]),o($VS1,[2,80]),o($V11,[2,329],{167:407}),{27:[1,408]},o($VS1,[2,155]),o($V11,$V21,{215:176,29:409}),{38:$VF,54:410},o($VS1,[2,78]),o($V11,[2,325],{164:411,280:[1,412]}),o($Vb2,[2,407],{250:413,280:[1,414]}),o($V11,[2,411],{253:415,280:[1,416]}),o($V11,[2,413],{255:417,280:[1,418]}),o($VY1,[2,240]),{30:[1,420],31:[1,419]},{22:421,40:[2,199],81:422,82:$V3},o($VB1,[2,308]),o($Vc2,[2,309],{148:423,294:[1,424]}),{38:$VF,54:425},{38:$VF,54:426},{38:$VF,54:427},{12:$V7,15:$V8,27:[1,429],52:430,157:428,277:$Va},o($Vd2,[2,321],{159:431,287:[1,432]}),{12:$V7,15:$V8,28:$Vi1,52:259,64:247,65:248,74:246,76:433,238:250,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,244:255,245:$Vn1,246:$Vo1,247:258,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1},{28:[1,434]},o($Ve2,[2,74]),o($VB1,[2,66]),o($Vn,[2,314],{38:$Vf2,40:$Vf2,82:$Vf2,107:$Vf2,155:$Vf2,156:$Vf2,158:$Vf2,161:$Vf2,162:$Vf2}),o($V12,[2,93]),o($Vn,[2,349],{188:435}),o($Vn,[2,347]),o($Vn,[2,348]),o($V_1,[2,357],{196:436,197:437}),o($V12,[2,94]),o($V12,[2,346]),{12:$V7,15:$V8,27:$VG,28:$VC1,31:[1,438],52:145,79:$VI,88:146,163:$VJ,172:360,185:361,189:439,210:$VD1,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($VF1,[2,372]),o($VG1,[2,119]),o($VG1,[2,120]),{211:[1,440]},o($V4,[2,11]),o($V91,[2,342],{192:[1,441]}),o($Vg2,[2,339]),o([40,107,192,211,294],[2,88]),{12:$V7,15:$V8,27:$VG,28:$VH,52:145,79:$VI,88:146,163:$VJ,172:214,174:215,183:442,210:$VK,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($V01,[2,9]),o($V11,[2,377]),o($VH1,$VI1,{223:298,231:299,235:300,219:443,203:$VJ1,237:$VK1,301:$VL1}),{222:[1,444]},o($V11,[2,378]),o($V11,[2,379]),o($V11,[2,380]),o($V11,[2,381]),o($V11,[2,382]),o($V11,[2,383]),{222:[2,385]},o([30,31,192,222,242,259,302,303,304,305,306,307,308,309],[2,132],{225:445,226:446,227:447,229:448,237:[1,450],271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,301:[1,449]}),o($V52,[2,136],{233:451,234:452,283:$Vh2,298:$Vi2}),o($V62,[2,138]),o($V62,[2,141]),o($V62,[2,142]),o($V62,[2,143],{28:$VV1,163:$VW1}),o($V62,[2,144]),o($V62,[2,145]),o($V62,[2,146]),o($V62,[2,139]),o($V62,[2,140]),o($Vt,[2,35]),o($VN1,[2,250]),o($Vj2,[2,251],{91:455}),o($Vn,$Vz,{140:122,136:456,139:457,40:[2,295]}),o($VB,[2,52]),o($VP1,[2,29],{80:[1,458]}),o($VP1,[2,30],{78:[1,459]}),o($Vh1,[2,24],{74:246,64:247,65:248,238:250,244:255,247:258,52:259,76:401,72:460,12:$V7,15:$V8,27:$V82,28:$Vi1,73:$V92,75:$Va2,239:$Vj1,240:$Vk1,241:$Vl1,243:$Vm1,245:$Vn1,246:$Vo1,248:$Vp1,249:$Vq1,252:$Vr1,254:$Vs1,277:$Va,309:$Vt1,310:$Vu1,311:$Vv1,312:$Vw1,313:$Vx1,314:$Vy1}),o($Vk2,[2,243]),{28:$Vi1,74:461},{28:$Vi1,74:462},o($Vk2,[2,27]),o($Vk2,[2,28]),o([6,12,15,27,28,30,31,38,40,70,73,75,78,79,80,82,107,155,156,158,161,162,163,192,210,213,214,222,237,239,240,241,242,243,245,246,248,249,252,254,259,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,283,294,298,301,302,303,304,305,306,307,308,309,310,311,312,313,314],[2,147]),{31:[1,463]},{242:[1,464]},{242:[1,465]},o($V11,$V21,{215:176,29:466}),{31:[1,467]},{31:[1,468]},o($VS1,[2,157]),o($V11,[2,327],{165:469}),o($V11,[2,326]),o($V11,$V21,{215:176,251:470,29:472,283:[1,471]}),o($Vb2,[2,408]),o($V11,$V21,{215:176,29:473}),o($V11,[2,412]),o($V11,$V21,{215:176,29:474}),o($V11,[2,414]),o($VY1,[2,20]),{27:[1,475]},{40:[2,6]},{40:[2,200]},o($Vn,$V71,{151:200,149:476,150:477,38:$Vl2,40:$Vl2,82:$Vl2,107:$Vl2,155:$Vl2,156:$Vl2,158:$Vl2,161:$Vl2,162:$Vl2}),o($Vc2,[2,310]),o($Ve2,[2,67],{295:[1,478]}),o($Ve2,[2,68]),o($Ve2,[2,69]),{38:$VF,54:479},{38:[2,319]},{38:[2,320]},{12:$V7,15:$V8,27:[1,481],52:482,160:480,277:$Va},o($Vd2,[2,322]),o($Ve2,[2,72]),o($V11,$V21,{215:176,29:483}),{12:$V7,15:$V8,27:$VG,28:$VC1,52:145,79:$VI,88:146,163:$VJ,172:360,185:361,189:484,210:$VD1,213:$VL,214:$VM,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},o($VF1,[2,98],{297:[1,485]}),o($Vm2,[2,364],{198:486,202:487,208:[1,488]}),o($Vc1,[2,115]),o($VF1,[2,373]),o($Vc1,[2,116]),o($Vg2,[2,340]),o($Vn2,[2,92],{242:[1,489]}),o($V42,[2,130]),{28:$VT1,163:$VU1,166:490},o($V52,[2,387]),o($VH1,$VI1,{231:299,235:300,223:491,203:$VJ1,237:$VK1,301:$VL1}),o($V62,[2,390],{228:492}),o($V62,[2,392],{230:493}),o($V11,[2,388]),o($V11,[2,389]),o($V62,[2,395]),o($VH1,$VI1,{235:300,231:494,203:$VJ1,237:$VK1,301:$VL1}),o($V11,[2,396]),o($V11,[2,397]),{12:$V7,15:$V8,31:[1,495],52:225,79:$VI,87:496,88:226,89:$Vf1,227:156,229:157,260:152,263:$VN,264:$VO,265:$VP,266:$VQ,267:$VR,268:$VS,269:$VT,270:$VU,271:$VV,272:$VW,273:$VX,274:$VY,275:$VZ,276:$V_,277:$Va},{40:[1,497]},{40:[2,296]},{79:[1,498]},{79:[1,499]},o($Vk2,[2,244]),o($Vk2,[2,25]),o($Vk2,[2,26]),o($VS1,[2,150]),o($V11,$V21,{215:176,29:500}),o($V11,$V21,{215:176,29:501}),{31:[1,502],242:[1,503]},o($VS1,[2,154]),o($VS1,[2,156]),o($V11,$V21,{215:176,29:504}),{31:[1,505]},{31:[2,409]},{31:[2,410]},{31:[1,506]},{31:[2,415],192:[1,509],256:507,257:508},{31:[1,510]},o($VB1,[2,65]),o($VB1,[2,312]),{38:[2,318]},o($Ve2,[2,70]),{38:$VF,54:511},{38:[2,323]},{38:[2,324]},{30:[1,512]},o($Vn2,[2,351],{190:513,242:[1,514]}),o($V_1,[2,356]),o([12,15,27,28,31,79,163,210,213,214,263,264,265,266,267,268,269,270,271,272,273,274,275,276,277,297],[2,99],{298:[1,515]}),{12:$V7,15:$V8,28:[1,521],52:518,181:[1,519],199:516,200:517,203:[1,520],277:$Va},o($Vm2,[2,365]),o($Vn,[2,344]),o($V42,[2,131]),o($V52,[2,133]),o($V52,[2,134],{234:452,233:522,283:$Vh2,298:$Vi2}),o($V52,[2,135],{234:452,233:523,283:$Vh2,298:$Vi2}),o($V62,[2,137]),o($VN1,[2,39]),o($Vj2,[2,252]),o($Vo2,[2,297],{137:524,294:[1,525]}),o($VP1,[2,31]),o($VP1,[2,32]),{31:[1,526]},{242:[1,527]},o($VS1,[2,81]),o($V11,[2,330]),{31:[1,528],242:[1,529]},o($VS1,[2,158]),o($VS1,[2,159]),{31:[1,530]},{31:[2,416]},{258:[1,531]},o($VY1,[2,21]),o($Ve2,[2,71]),{27:[1,532]},o([38,40,82,107,155,156,158,161,162,211,294],[2,95],{191:533,192:[1,534]}),o($Vn,[2,350]),o($V_1,[2,358]),o($Vp2,[2,101]),o($Vp2,[2,362],{201:535,299:536,283:[1,538],300:[1,537],301:[1,539]}),o($Vq2,[2,102]),o($Vq2,[2,103]),{12:$V7,15:$V8,28:[1,543],52:544,163:[1,542],181:$Vr2,204:540,205:541,208:$Vs2,277:$Va},o($V_1,$V$1,{195:355,194:547}),o($V62,[2,391]),o($V62,[2,393]),o($Vn,$Vz,{140:122,138:548,139:549,40:$Vt2,107:$Vt2}),o($Vo2,[2,298]),o($VS1,[2,151]),o($V11,$V21,{215:176,29:550}),o($VS1,[2,79]),o($V11,[2,328]),o($VS1,[2,160]),{259:[1,551]},{31:[1,552]},o($Vn2,[2,352]),o($Vn2,[2,96],{195:355,193:553,194:554,12:$V$1,15:$V$1,28:$V$1,181:$V$1,203:$V$1,208:$V$1,277:$V$1,27:[1,555]}),o($Vp2,[2,100]),o($Vp2,[2,363]),o($Vp2,[2,359]),o($Vp2,[2,360]),o($Vp2,[2,361]),o($Vq2,[2,104]),o($Vq2,[2,106]),o($Vq2,[2,107]),o($Vu2,[2,366],{206:556}),o($Vq2,[2,109]),o($Vq2,[2,110]),{12:$V7,15:$V8,52:557,181:[1,558],277:$Va},{31:[1,559]},o($V51,[2,60]),o($V51,[2,300]),{31:[1,560]},{260:561,267:$VR,268:$VS,269:$VT,270:$VU},o($Ve2,[2,73]),o($Vn,$V22,{182:367,180:562}),o($Vn,[2,353]),o($Vn,[2,354]),{12:$V7,15:$V8,31:[2,368],52:544,181:$Vr2,205:564,207:563,208:$Vs2,277:$Va},o($Vq2,[2,111]),o($Vq2,[2,112]),o($Vq2,[2,105]),o($VS1,[2,152]),{31:[2,161]},o($Vn2,[2,97]),{31:[1,565]},{31:[2,369],297:[1,566]},o($Vq2,[2,108]),o($Vu2,[2,367])],
defaultActions: {5:[2,189],6:[2,190],22:[2,1],23:[2,2],24:[2,196],74:[2,269],89:[2,230],94:[2,332],204:[2,214],205:[2,83],268:[2,406],307:[2,293],308:[2,294],378:[2,385],421:[2,6],422:[2,200],429:[2,319],430:[2,320],457:[2,296],471:[2,409],472:[2,410],478:[2,318],481:[2,323],482:[2,324],508:[2,416],561:[2,161]},
parseError: function parseError(str, hash) {
    if (hash.recoverable) {
        this.trace(str);
    } else {
        function _parseError (msg, hash) {
            this.message = msg;
            this.hash = hash;
        }
        _parseError.prototype = Error;

        throw new _parseError(str, hash);
    }
},
parse: function parse(input) {
    var self = this, stack = [0], tstack = [], vstack = [null], lstack = [], table = this.table, yytext = '', yylineno = 0, yyleng = 0, recovering = 0, TERROR = 2, EOF = 1;
    var args = lstack.slice.call(arguments, 1);
    var lexer = Object.create(this.lexer);
    var sharedState = { yy: {} };
    for (var k in this.yy) {
        if (Object.prototype.hasOwnProperty.call(this.yy, k)) {
            sharedState.yy[k] = this.yy[k];
        }
    }
    lexer.setInput(input, sharedState.yy);
    sharedState.yy.lexer = lexer;
    sharedState.yy.parser = this;
    if (typeof lexer.yylloc == 'undefined') {
        lexer.yylloc = {};
    }
    var yyloc = lexer.yylloc;
    lstack.push(yyloc);
    var ranges = lexer.options && lexer.options.ranges;
    if (typeof sharedState.yy.parseError === 'function') {
        this.parseError = sharedState.yy.parseError;
    } else {
        this.parseError = Object.getPrototypeOf(this).parseError;
    }
    function popStack(n) {
        stack.length = stack.length - 2 * n;
        vstack.length = vstack.length - n;
        lstack.length = lstack.length - n;
    }
    _token_stack:
        var lex = function () {
            var token;
            token = lexer.lex() || EOF;
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }
            return token;
        };
    var symbol, preErrorSymbol, state, action, a, r, yyval = {}, p, len, newState, expected;
    while (true) {
        state = stack[stack.length - 1];
        if (this.defaultActions[state]) {
            action = this.defaultActions[state];
        } else {
            if (symbol === null || typeof symbol == 'undefined') {
                symbol = lex();
            }
            action = table[state] && table[state][symbol];
        }
                    if (typeof action === 'undefined' || !action.length || !action[0]) {
                var errStr = '';
                expected = [];
                for (p in table[state]) {
                    if (this.terminals_[p] && p > TERROR) {
                        expected.push('\'' + this.terminals_[p] + '\'');
                    }
                }
                if (lexer.showPosition) {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ':\n' + lexer.showPosition() + '\nExpecting ' + expected.join(', ') + ', got \'' + (this.terminals_[symbol] || symbol) + '\'';
                } else {
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
                }
                this.parseError(errStr, {
                    text: lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
            }
        if (action[0] instanceof Array && action.length > 1) {
            throw new Error('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol);
        }
        switch (action[0]) {
        case 1:
            stack.push(symbol);
            vstack.push(lexer.yytext);
            lstack.push(lexer.yylloc);
            stack.push(action[1]);
            symbol = null;
            if (!preErrorSymbol) {
                yyleng = lexer.yyleng;
                yytext = lexer.yytext;
                yylineno = lexer.yylineno;
                yyloc = lexer.yylloc;
                if (recovering > 0) {
                    recovering--;
                }
            } else {
                symbol = preErrorSymbol;
                preErrorSymbol = null;
            }
            break;
        case 2:
            len = this.productions_[action[1]][1];
            yyval.$ = vstack[vstack.length - len];
            yyval._$ = {
                first_line: lstack[lstack.length - (len || 1)].first_line,
                last_line: lstack[lstack.length - 1].last_line,
                first_column: lstack[lstack.length - (len || 1)].first_column,
                last_column: lstack[lstack.length - 1].last_column
            };
            if (ranges) {
                yyval._$.range = [
                    lstack[lstack.length - (len || 1)].range[0],
                    lstack[lstack.length - 1].range[1]
                ];
            }
            r = this.performAction.apply(yyval, [
                yytext,
                yyleng,
                yylineno,
                sharedState.yy,
                action[1],
                vstack,
                lstack
            ].concat(args));
            if (typeof r !== 'undefined') {
                return r;
            }
            if (len) {
                stack = stack.slice(0, -1 * len * 2);
                vstack = vstack.slice(0, -1 * len);
                lstack = lstack.slice(0, -1 * len);
            }
            stack.push(this.productions_[action[1]][0]);
            vstack.push(yyval.$);
            lstack.push(yyval._$);
            newState = table[stack[stack.length - 2]][stack[stack.length - 1]];
            stack.push(newState);
            break;
        case 3:
            return true;
        }
    }
    return true;
}};

  /*
    SPARQL parser in the Jison parser generator format.
  */

  // Common namespaces and entities
  var RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      RDF_TYPE  = RDF + 'type',
      RDF_FIRST = RDF + 'first',
      RDF_REST  = RDF + 'rest',
      RDF_NIL   = RDF + 'nil',
      XSD = 'http://www.w3.org/2001/XMLSchema#',
      XSD_INTEGER  = XSD + 'integer',
      XSD_DECIMAL  = XSD + 'decimal',
      XSD_DOUBLE   = XSD + 'double',
      XSD_BOOLEAN  = XSD + 'boolean',
      XSD_TRUE =  '"true"^^'  + XSD_BOOLEAN,
      XSD_FALSE = '"false"^^' + XSD_BOOLEAN;

  var base = '', basePath = '', baseRoot = '';

  // Returns a lowercase version of the given string
  function lowercase(string) {
    return string.toLowerCase();
  }

  // Appends the item to the array and returns the array
  function appendTo(array, item) {
    return array.push(item), array;
  }

  // Appends the items to the array and returns the array
  function appendAllTo(array, items) {
    return array.push.apply(array, items), array;
  }

  // Extends a base object with properties of other objects
  function extend(base) {
    if (!base) base = {};
    for (var i = 1, l = arguments.length, arg; i < l && (arg = arguments[i] || {}); i++)
      for (var name in arg)
        base[name] = arg[name];
    return base;
  }

  // Creates an array that contains all items of the given arrays
  function unionAll() {
    var union = [];
    for (var i = 0, l = arguments.length; i < l; i++)
      union = union.concat.apply(union, arguments[i]);
    return union;
  }

  // Resolves an IRI against a base path
  function resolveIRI(iri) {
    // Strip off possible angular brackets
    if (iri[0] === '<')
      iri = iri.substring(1, iri.length - 1);
    switch (iri[0]) {
    // An empty relative IRI indicates the base IRI
    case undefined:
      return base;
    // Resolve relative fragment IRIs against the base IRI
    case '#':
      return base + iri;
    // Resolve relative query string IRIs by replacing the query string
    case '?':
      return base.replace(/(?:\?.*)?$/, iri);
    // Resolve root relative IRIs at the root of the base IRI
    case '/':
      return baseRoot + iri;
    // Resolve all other IRIs at the base IRI's path
    default:
      return /^[a-z]+:/.test(iri) ? iri : basePath + iri;
    }
  }

  // If the item is a variable, ensures it starts with a question mark
  function toVar(variable) {
    if (variable) {
      var first = variable[0];
      if (first === '?') return variable;
      if (first === '$') return '?' + variable.substr(1);
    }
    return variable;
  }

  // Creates an operation with the given name and arguments
  function operation(operatorName, args) {
    return { type: 'operation', operator: operatorName, args: args || [] };
  }

  // Creates an expression with the given type and attributes
  function expression(expr, attr) {
    var expression = { expression: expr };
    if (attr)
      for (var a in attr)
        expression[a] = attr[a];
    return expression;
  }

  // Creates a path with the given type and items
  function path(type, items) {
    return { type: 'path', pathType: type, items: items };
  }

  // Transforms a list of operations types and arguments into a tree of operations
  function createOperationTree(initialExpression, operationList) {
    for (var i = 0, l = operationList.length, item; i < l && (item = operationList[i]); i++)
      initialExpression = operation(item[0], [initialExpression, item[1]]);
    return initialExpression;
  }

  // Group datasets by default and named
  function groupDatasets(fromClauses) {
    var defaults = [], named = [], l = fromClauses.length, fromClause;
    for (var i = 0; i < l && (fromClause = fromClauses[i]); i++)
      (fromClause.named ? named : defaults).push(fromClause.iri);
    return l ? { from: { default: defaults, named: named } } : null;
  }

  // Converts the number to a string
  function toInt(string) {
    return parseInt(string, 10);
  }

  // Transforms a possibly single group into its patterns
  function degroupSingle(group) {
    return group.type === 'group' && group.patterns.length === 1 ? group.patterns[0] : group;
  }

  // Creates a literal with the given value and type
  function createLiteral(value, type) {
    return '"' + value + '"^^' + type;
  }

  // Creates a triple with the given subject, predicate, and object
  function triple(subject, predicate, object) {
    var triple = {};
    if (subject   != null) triple.subject   = subject;
    if (predicate != null) triple.predicate = predicate;
    if (object    != null) triple.object    = object;
    return triple;
  }

  // Creates a new blank node identifier
  function blank() {
    return '_:b' + blankId++;
  };
  var blankId = 0;
  Parser._resetBlanks = function () { blankId = 0; }

  // Regular expression and replacement strings to escape strings
  var escapeSequence = /\\u([a-fA-F0-9]{4})|\\U([a-fA-F0-9]{8})|\\(.)/g,
      escapeReplacements = { '\\': '\\', "'": "'", '"': '"',
                             't': '\t', 'b': '\b', 'n': '\n', 'r': '\r', 'f': '\f' },
      fromCharCode = String.fromCharCode;

  // Translates escape codes in the string into their textual equivalent
  function unescapeString(string, trimLength) {
    string = string.substring(trimLength, string.length - trimLength);
    try {
      string = string.replace(escapeSequence, function (sequence, unicode4, unicode8, escapedChar) {
        var charCode;
        if (unicode4) {
          charCode = parseInt(unicode4, 16);
          if (isNaN(charCode)) throw new Error(); // can never happen (regex), but helps performance
          return fromCharCode(charCode);
        }
        else if (unicode8) {
          charCode = parseInt(unicode8, 16);
          if (isNaN(charCode)) throw new Error(); // can never happen (regex), but helps performance
          if (charCode < 0xFFFF) return fromCharCode(charCode);
          return fromCharCode(0xD800 + ((charCode -= 0x10000) >> 10), 0xDC00 + (charCode & 0x3FF));
        }
        else {
          var replacement = escapeReplacements[escapedChar];
          if (!replacement) throw new Error();
          return replacement;
        }
      });
    }
    catch (error) { return ''; }
    return '"' + string + '"';
  }

  // Creates a list, collecting its (possibly blank) items and triples associated with those items
  function createList(objects) {
    var list = blank(), head = list, listItems = [], listTriples, triples = [];
    objects.forEach(function (o) { listItems.push(o.entity); appendAllTo(triples, o.triples); });

    // Build an RDF list out of the items
    for (var i = 0, j = 0, l = listItems.length, listTriples = Array(l * 2); i < l;)
      listTriples[j++] = triple(head, RDF_FIRST, listItems[i]),
      listTriples[j++] = triple(head, RDF_REST,  head = ++i < l ? blank() : RDF_NIL);

    // Return the list's identifier, its triples, and the triples associated with its items
    return { entity: list, triples: appendAllTo(listTriples, triples) };
  }

  // Creates a blank node identifier, collecting triples with that blank node as subject
  function createAnonymousObject(propertyList) {
    var entity = blank();
    return {
      entity: entity,
      triples: propertyList.map(function (t) { return extend(triple(entity), t); })
    };
  }

  // Collects all (possibly blank) objects, and triples that have them as subject
  function objectListToTriples(predicate, objectList, otherTriples) {
    var objects = [], triples = [];
    objectList.forEach(function (l) {
      objects.push(triple(null, predicate, l.entity));
      appendAllTo(triples, l.triples);
    });
    return unionAll(objects, otherTriples || [], triples);
  }
/* generated by jison-lex 0.3.4 */
var lexer = (function(){
var lexer = ({

EOF:1,

parseError:function parseError(str, hash) {
        if (this.yy.parser) {
            this.yy.parser.parseError(str, hash);
        } else {
            throw new Error(str);
        }
    },

// resets the lexer, sets new input
setInput:function (input, yy) {
        this.yy = yy || this.yy || {};
        this._input = input;
        this._more = this._backtrack = this.done = false;
        this.yylineno = this.yyleng = 0;
        this.yytext = this.matched = this.match = '';
        this.conditionStack = ['INITIAL'];
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0
        };
        if (this.options.ranges) {
            this.yylloc.range = [0,0];
        }
        this.offset = 0;
        return this;
    },

// consumes and returns one char from the input
input:function () {
        var ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        var lines = ch.match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
        } else {
            this.yylloc.last_column++;
        }
        if (this.options.ranges) {
            this.yylloc.range[1]++;
        }

        this._input = this._input.slice(1);
        return ch;
    },

// unshifts one char (or a string) into the input
unput:function (ch) {
        var len = ch.length;
        var lines = ch.split(/(?:\r\n?|\n)/g);

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        //this.yyleng -= len;
        this.offset -= len;
        var oldLines = this.match.split(/(?:\r\n?|\n)/g);
        this.match = this.match.substr(0, this.match.length - 1);
        this.matched = this.matched.substr(0, this.matched.length - 1);

        if (lines.length - 1) {
            this.yylineno -= lines.length - 1;
        }
        var r = this.yylloc.range;

        this.yylloc = {
            first_line: this.yylloc.first_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.first_column,
            last_column: lines ?
                (lines.length === oldLines.length ? this.yylloc.first_column : 0)
                 + oldLines[oldLines.length - lines.length].length - lines[0].length :
              this.yylloc.first_column - len
        };

        if (this.options.ranges) {
            this.yylloc.range = [r[0], r[0] + this.yyleng - len];
        }
        this.yyleng = this.yytext.length;
        return this;
    },

// When called from action, caches matched text and appends it on next action
more:function () {
        this._more = true;
        return this;
    },

// When called from action, signals the lexer that this rule fails to match the input, so the next matching rule (regex) should be tested instead.
reject:function () {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });

        }
        return this;
    },

// retain first n characters of the match
less:function (n) {
        this.unput(this.match.slice(n));
    },

// displays already matched input, i.e. for error messages
pastInput:function () {
        var past = this.matched.substr(0, this.matched.length - this.match.length);
        return (past.length > 20 ? '...':'') + past.substr(-20).replace(/\n/g, "");
    },

// displays upcoming input, i.e. for error messages
upcomingInput:function () {
        var next = this.match;
        if (next.length < 20) {
            next += this._input.substr(0, 20-next.length);
        }
        return (next.substr(0,20) + (next.length > 20 ? '...' : '')).replace(/\n/g, "");
    },

// displays the character position where the lexing error occurred, i.e. for error messages
showPosition:function () {
        var pre = this.pastInput();
        var c = new Array(pre.length + 1).join("-");
        return pre + this.upcomingInput() + "\n" + c + "^";
    },

// test the lexed token: return FALSE when not a match, otherwise return token
test_match:function (match, indexed_rule) {
        var token,
            lines,
            backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(0),
                done: this.done
            };
            if (this.options.ranges) {
                backup.yylloc.range = this.yylloc.range.slice(0);
            }
        }

        lines = match[0].match(/(?:\r\n?|\n).*/g);
        if (lines) {
            this.yylineno += lines.length;
        }
        this.yylloc = {
            first_line: this.yylloc.last_line,
            last_line: this.yylineno + 1,
            first_column: this.yylloc.last_column,
            last_column: lines ?
                         lines[lines.length - 1].length - lines[lines.length - 1].match(/\r?\n?/)[0].length :
                         this.yylloc.last_column + match[0].length
        };
        this.yytext += match[0];
        this.match += match[0];
        this.matches = match;
        this.yyleng = this.yytext.length;
        if (this.options.ranges) {
            this.yylloc.range = [this.offset, this.offset += this.yyleng];
        }
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match[0].length);
        this.matched += match[0];
        token = this.performAction.call(this, this.yy, this, indexed_rule, this.conditionStack[this.conditionStack.length - 1]);
        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
                this[k] = backup[k];
            }
            return false; // rule action called reject() implying the next rule should be tested instead.
        }
        return false;
    },

// return next match in input
next:function () {
        if (this.done) {
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        var token,
            match,
            tempMatch,
            index;
        if (!this._more) {
            this.yytext = '';
            this.match = '';
        }
        var rules = this._currentRules();
        for (var i = 0; i < rules.length; i++) {
            tempMatch = this._input.match(this.rules[rules[i]]);
            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                match = tempMatch;
                index = i;
                if (this.options.backtrack_lexer) {
                    token = this.test_match(tempMatch, rules[i]);
                    if (token !== false) {
                        return token;
                    } else if (this._backtrack) {
                        match = false;
                        continue; // rule action called reject() implying a rule MISmatch.
                    } else {
                        // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                        return false;
                    }
                } else if (!this.options.flex) {
                    break;
                }
            }
        }
        if (match) {
            token = this.test_match(match, rules[index]);
            if (token !== false) {
                return token;
            }
            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
        }
        if (this._input === "") {
            return this.EOF;
        } else {
            return this.parseError('Lexical error on line ' + (this.yylineno + 1) + '. Unrecognized text.\n' + this.showPosition(), {
                text: "",
                token: null,
                line: this.yylineno
            });
        }
    },

// return next match that has a token
lex:function lex() {
        var r = this.next();
        if (r) {
            return r;
        } else {
            return this.lex();
        }
    },

// activates a new lexer condition state (pushes the new lexer condition state onto the condition stack)
begin:function begin(condition) {
        this.conditionStack.push(condition);
    },

// pop the previously active lexer condition state off the condition stack
popState:function popState() {
        var n = this.conditionStack.length - 1;
        if (n > 0) {
            return this.conditionStack.pop();
        } else {
            return this.conditionStack[0];
        }
    },

// produce the lexer rule set which is active for the currently active lexer condition state
_currentRules:function _currentRules() {
        if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]].rules;
        } else {
            return this.conditions["INITIAL"].rules;
        }
    },

// return the currently active lexer condition state; when an index argument is provided it produces the N-th previous condition state, if available
topState:function topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        } else {
            return "INITIAL";
        }
    },

// alias for begin(condition)
pushState:function pushState(condition) {
        this.begin(condition);
    },

// return the number of states currently on the stack
stateStackSize:function stateStackSize() {
        return this.conditionStack.length;
    },
options: {"flex":true,"case-insensitive":true},
performAction: function anonymous(yy,yy_,$avoiding_name_collisions,YY_START) {
var YYSTATE=YY_START;
switch($avoiding_name_collisions) {
case 0:/* ignore */
break;
case 1:return 11
break;
case 2:return 14
break;
case 3:return 23
break;
case 4:return 280
break;
case 5:return 281
break;
case 6:return 28
break;
case 7:return 30
break;
case 8:return 31
break;
case 9:return 283
break;
case 10:return 33
break;
case 11:return 37
break;
case 12:return 38
break;
case 13:return 40
break;
case 14:return 42
break;
case 15:return 47
break;
case 16:return 50
break;
case 17:return 286
break;
case 18:return 60
break;
case 19:return 61
break;
case 20:return 67
break;
case 21:return 70
break;
case 22:return 73
break;
case 23:return 75
break;
case 24:return 78
break;
case 25:return 80
break;
case 26:return 82
break;
case 27:return 192
break;
case 28:return 95
break;
case 29:return 287
break;
case 30:return 128
break;
case 31:return 288
break;
case 32:return 289
break;
case 33:return 105
break;
case 34:return 290
break;
case 35:return 104
break;
case 36:return 291
break;
case 37:return 292
break;
case 38:return 108
break;
case 39:return 110
break;
case 40:return 111
break;
case 41:return 126
break;
case 42:return 120
break;
case 43:return 121
break;
case 44:return 123
break;
case 45:return 129
break;
case 46:return 107
break;
case 47:return 293
break;
case 48:return 294
break;
case 49:return 155
break;
case 50:return 158
break;
case 51:return 162
break;
case 52:return 89
break;
case 53:return 156
break;
case 54:return 295
break;
case 55:return 161
break;
case 56:return 242
break;
case 57:return 181
break;
case 58:return 297
break;
case 59:return 298
break;
case 60:return 208
break;
case 61:return 300
break;
case 62:return 301
break;
case 63:return 203
break;
case 64:return 210
break;
case 65:return 211
break;
case 66:return 302
break;
case 67:return 303
break;
case 68:return 259
break;
case 69:return 304
break;
case 70:return 305
break;
case 71:return 306
break;
case 72:return 307
break;
case 73:return 308
break;
case 74:return 222
break;
case 75:return 309
break;
case 76:return 237
break;
case 77:return 245
break;
case 78:return 246
break;
case 79:return 239
break;
case 80:return 240
break;
case 81:return 241
break;
case 82:return 310
break;
case 83:return 311
break;
case 84:return 243
break;
case 85:return 313
break;
case 86:return 312
break;
case 87:return 314
break;
case 88:return 248
break;
case 89:return 249
break;
case 90:return 252
break;
case 91:return 254
break;
case 92:return 258
break;
case 93:return 262
break;
case 94:return 265
break;
case 95:return 266
break;
case 96:return 12
break;
case 97:return 15
break;
case 98:return 277
break;
case 99:return 213
break;
case 100:return 27
break;
case 101:return 261
break;
case 102:return 79
break;
case 103:return 263
break;
case 104:return 264
break;
case 105:return 271
break;
case 106:return 272
break;
case 107:return 273
break;
case 108:return 274
break;
case 109:return 275
break;
case 110:return 276
break;
case 111:return 'EXPONENT'
break;
case 112:return 267
break;
case 113:return 268
break;
case 114:return 269
break;
case 115:return 270
break;
case 116:return 163
break;
case 117:return 214
break;
case 118:return 6
break;
case 119:return 'INVALID'
break;
case 120:console.log(yy_.yytext);
break;
}
},
rules: [/^(?:\s+|#[^\n\r]*)/i,/^(?:BASE)/i,/^(?:PREFIX)/i,/^(?:SELECT)/i,/^(?:DISTINCT)/i,/^(?:REDUCED)/i,/^(?:\()/i,/^(?:AS)/i,/^(?:\))/i,/^(?:\*)/i,/^(?:CONSTRUCT)/i,/^(?:WHERE)/i,/^(?:\{)/i,/^(?:\})/i,/^(?:DESCRIBE)/i,/^(?:ASK)/i,/^(?:FROM)/i,/^(?:NAMED)/i,/^(?:GROUP)/i,/^(?:BY)/i,/^(?:HAVING)/i,/^(?:ORDER)/i,/^(?:ASC)/i,/^(?:DESC)/i,/^(?:LIMIT)/i,/^(?:OFFSET)/i,/^(?:VALUES)/i,/^(?:;)/i,/^(?:LOAD)/i,/^(?:SILENT)/i,/^(?:INTO)/i,/^(?:CLEAR)/i,/^(?:DROP)/i,/^(?:CREATE)/i,/^(?:ADD)/i,/^(?:TO)/i,/^(?:MOVE)/i,/^(?:COPY)/i,/^(?:INSERT\s+DATA)/i,/^(?:DELETE\s+DATA)/i,/^(?:DELETE\s+WHERE)/i,/^(?:WITH)/i,/^(?:DELETE)/i,/^(?:INSERT)/i,/^(?:USING)/i,/^(?:DEFAULT)/i,/^(?:GRAPH)/i,/^(?:ALL)/i,/^(?:\.)/i,/^(?:OPTIONAL)/i,/^(?:SERVICE)/i,/^(?:BIND)/i,/^(?:UNDEF)/i,/^(?:MINUS)/i,/^(?:UNION)/i,/^(?:FILTER)/i,/^(?:,)/i,/^(?:a)/i,/^(?:\|)/i,/^(?:\/)/i,/^(?:\^)/i,/^(?:\?)/i,/^(?:\+)/i,/^(?:!)/i,/^(?:\[)/i,/^(?:\])/i,/^(?:\|\|)/i,/^(?:&&)/i,/^(?:=)/i,/^(?:!=)/i,/^(?:<)/i,/^(?:>)/i,/^(?:<=)/i,/^(?:>=)/i,/^(?:IN)/i,/^(?:NOT)/i,/^(?:-)/i,/^(?:BOUND)/i,/^(?:BNODE)/i,/^(?:(RAND|NOW|UUID|STUUID))/i,/^(?:(LANG|DATATYPE|IRI|URI|ABS|CEIL|FLOOR|ROUND|STRLEN|STR|UCASE|LCASE|ENCODE_FOR_URI|YEAR|MONTH|DAY|HOURS|MINUTES|SECONDS|TIMEZONE|TZ|MD5|SHA1|SHA256|SHA384|SHA512|isIRI|isURI|isBLANK|isLITERAL|isNUMERIC))/i,/^(?:(LANGMATCHES|CONTAINS|STRSTARTS|STRENDS|STRBEFORE|STRAFTER|STRLANG|STRDT|sameTerm))/i,/^(?:CONCAT)/i,/^(?:COALESCE)/i,/^(?:IF)/i,/^(?:REGEX)/i,/^(?:SUBSTR)/i,/^(?:REPLACE)/i,/^(?:EXISTS)/i,/^(?:COUNT)/i,/^(?:SUM|MIN|MAX|AVG|SAMPLE)/i,/^(?:GROUP_CONCAT)/i,/^(?:SEPARATOR)/i,/^(?:\^\^)/i,/^(?:true)/i,/^(?:false)/i,/^(?:(<([^<>\"\{\}\|\^`\\\u0000-\u0020])*>))/i,/^(?:((([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])(((((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040])|\.)*(((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040]))?)?:))/i,/^(?:(((([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])(((((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040])|\.)*(((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040]))?)?:)((((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|:|[0-9]|((%([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f]))|(\\(_|~|\.|-|!|\$|&|'|\(|\)|\*|\+|,|;|=|\/|\?|#|@|%))))(((((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040])|\.|:|((%([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f]))|(\\(_|~|\.|-|!|\$|&|'|\(|\)|\*|\+|,|;|=|\/|\?|#|@|%))))*((((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040])|:|((%([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f]))|(\\(_|~|\.|-|!|\$|&|'|\(|\)|\*|\+|,|;|=|\/|\?|#|@|%)))))?)))/i,/^(?:(_:(((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|[0-9])(((((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040])|\.)*(((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|-|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040]))?))/i,/^(?:([\?\$]((((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|[0-9])(((?:([A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF])|_))|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040])*)))/i,/^(?:(@[a-zA-Z]+(-[a-zA-Z0-9]+)*))/i,/^(?:([0-9]+))/i,/^(?:([0-9]*\.[0-9]+))/i,/^(?:([0-9]+\.[0-9]*([eE][+-]?[0-9]+)|\.([0-9])+([eE][+-]?[0-9]+)|([0-9])+([eE][+-]?[0-9]+)))/i,/^(?:(\+([0-9]+)))/i,/^(?:(\+([0-9]*\.[0-9]+)))/i,/^(?:(\+([0-9]+\.[0-9]*([eE][+-]?[0-9]+)|\.([0-9])+([eE][+-]?[0-9]+)|([0-9])+([eE][+-]?[0-9]+))))/i,/^(?:(-([0-9]+)))/i,/^(?:(-([0-9]*\.[0-9]+)))/i,/^(?:(-([0-9]+\.[0-9]*([eE][+-]?[0-9]+)|\.([0-9])+([eE][+-]?[0-9]+)|([0-9])+([eE][+-]?[0-9]+))))/i,/^(?:([eE][+-]?[0-9]+))/i,/^(?:('(([^\u0027\u005C\u000A\u000D])|(\\[tbnrf\\\"']|\\u([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])|\\U([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])))*'))/i,/^(?:("(([^\u0022\u005C\u000A\u000D])|(\\[tbnrf\\\"']|\\u([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])|\\U([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])))*"))/i,/^(?:('''(('|'')?([^'\\]|(\\[tbnrf\\\"']|\\u([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])|\\U([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f]))))*'''))/i,/^(?:("""(("|"")?([^\"\\]|(\\[tbnrf\\\"']|\\u([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])|\\U([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f])([0-9]|[A-F]|[a-f]))))*"""))/i,/^(?:(\((\u0020|\u0009|\u000D|\u000A)*\)))/i,/^(?:(\[(\u0020|\u0009|\u000D|\u000A)*\]))/i,/^(?:$)/i,/^(?:.)/i,/^(?:.)/i],
conditions: {"INITIAL":{"rules":[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59,60,61,62,63,64,65,66,67,68,69,70,71,72,73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88,89,90,91,92,93,94,95,96,97,98,99,100,101,102,103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119,120],"inclusive":true}}
});
return lexer;
})();
parser.lexer = lexer;
function Parser () {
  this.yy = {};
}
Parser.prototype = parser;parser.Parser = Parser;
return new Parser;
})();


if (typeof require !== 'undefined' && typeof exports !== 'undefined') {
exports.parser = SparqlParser;
exports.Parser = SparqlParser.Parser;
exports.parse = function () { return SparqlParser.parse.apply(SparqlParser, arguments); };
exports.main = function commonjsMain(args) {
    if (!args[1]) {
        console.log('Usage: '+args[0]+' FILE');
        process.exit(1);
    }
    var source = require('fs').readFileSync(require('path').normalize(args[1]), "utf8");
    return exports.parser.parse(source);
};
if (typeof module !== 'undefined' && require.main === module) {
  exports.main(process.argv.slice(1));
}
}
}).call(this,require('_process'))
},{"_process":4,"fs":4,"path":4}],3:[function(require,module,exports){
var Parser = require('./lib/SparqlParser').Parser;
var Generator = require('./lib/SparqlGenerator');

module.exports = {
  // Creates a SPARQL parser with the given pre-defined prefixes
  Parser: function (prefixes) {
    // Create a copy of the prefixes
    var prefixesCopy = {};
    for (var prefix in prefixes || {})
      prefixesCopy[prefix] = prefixes[prefix];

    // Create a new parser with the given prefixes
    // (Workaround for https://github.com/zaach/jison/issues/241)
    var parser = new Parser();
    parser.parse = function () {
      Parser.prefixes = Object.create(prefixesCopy);
      return Parser.prototype.parse.apply(parser, arguments);
    };
    parser._resetBlanks = Parser._resetBlanks;
    return parser;
  },
  Generator: Generator,
};

},{"./lib/SparqlGenerator":1,"./lib/SparqlParser":2}],4:[function(require,module,exports){

},{}]},{},[3])(3)
});