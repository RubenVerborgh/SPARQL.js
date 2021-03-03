%{
  /*
    SPARQL parser in the Jison parser generator format.
  */

  var Wildcard = require('./Wildcard').Wildcard;

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
      XSD_BOOLEAN  = XSD + 'boolean';

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
    // Return absolute IRIs unmodified
    if (/^[a-z]+:/i.test(iri))
      return iri;
    if (!Parser.base)
      throw new Error('Cannot resolve relative IRI ' + iri + ' because no base IRI was set.');
    if (base !== Parser.base) {
      base = Parser.base;
      basePath = base.replace(/[^\/:]*$/, '');
      baseRoot = base.match(/^(?:[a-z]+:\/*)?[^\/]*/)[0];
    }
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
      return basePath + iri;
    }
  }

  // If the item is a variable, ensures it starts with a question mark
  function toVar(variable) {
    if (variable) {
      var first = variable[0];
      if (first === '?' || first === '$') return Parser.factory.variable(variable.substr(1));
    }
    return variable;
  }

  // Creates an operation with the given name and arguments
  function operation(operatorName, args) {
    return { type: 'operation', operator: operatorName, args: args || [] };
  }

  // Creates an expression with the given type and attributes
  function expression(expr, attr) {
    var expression = { expression: expr === '*'? new Wildcard() : expr };
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
  function groupDatasets(fromClauses, groupName) {
    var defaults = [], named = [], l = fromClauses.length, fromClause, group = {};
    if (!l)
      return null;
    for (var i = 0; i < l && (fromClause = fromClauses[i]); i++)
      (fromClause.named ? named : defaults).push(fromClause.iri);
    group[groupName || 'from'] = { default: defaults, named: named };
    return group;
  }

  // Converts the string to a number
  function toInt(string) {
    return parseInt(string, 10);
  }

  // Transforms a possibly single group into its patterns
  function degroupSingle(group) {
    return group.type === 'group' && group.patterns.length === 1 ? group.patterns[0] : group;
  }

  // Creates a literal with the given value and type
  function createTypedLiteral(value, type) {
    if (type && type.termType !== 'NamedNode'){
      type = Parser.factory.namedNode(type);
    }
    return Parser.factory.literal(value, type);
  }

  // Creates a literal with the given value and language
  function createLangLiteral(value, lang) {
    return Parser.factory.literal(value, lang);
  }

  // Creates a triple with the given subject, predicate, and object
  function triple(subject, predicate, object) {
    var triple = {};
    if (subject   != null) triple.subject   = subject;
    if (predicate != null) triple.predicate = predicate;
    if (object    != null) triple.object    = object;
    return triple;
  }

  // Creates a new blank node
  function blank(name) {
    if (typeof name === 'string') {  // Only use name if a name is given
      if (name.startsWith('e_')) return Parser.factory.blankNode(name);
      return Parser.factory.blankNode('e_' + name);
    }
    return Parser.factory.blankNode('g_' + blankId++);
  };
  var blankId = 0;
  Parser._resetBlanks = function () { blankId = 0; }

  // Regular expression and replacement strings to escape strings
  var escapeSequence = /\\u([a-fA-F0-9]{4})|\\U([a-fA-F0-9]{8})|\\(.)/g,
      escapeReplacements = { '\\': '\\', "'": "'", '"': '"',
                             't': '\t', 'b': '\b', 'n': '\n', 'r': '\r', 'f': '\f' },
      partialSurrogatesWithoutEndpoint = /[\uD800-\uDBFF]([^\uDC00-\uDFFF]|$)/,
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

    // Test for invalid unicode surrogate pairs
    if (partialSurrogatesWithoutEndpoint.exec(string)) {
      throw new Error('Invalid unicode codepoint of surrogate pair without corresponding codepoint in ' + string);
    }

    return string;
  }

  // Creates a list, collecting its (possibly blank) items and triples associated with those items
  function createList(objects) {
    var list = blank(), head = list, listItems = [], listTriples, triples = [];
    objects.forEach(function (o) { listItems.push(o.entity); appendAllTo(triples, o.triples); });

    // Build an RDF list out of the items
    for (var i = 0, j = 0, l = listItems.length, listTriples = Array(l * 2); i < l;)
      listTriples[j++] = triple(head, Parser.factory.namedNode(RDF_FIRST), listItems[i]),
      listTriples[j++] = triple(head, Parser.factory.namedNode(RDF_REST),  head = ++i < l ? blank() : Parser.factory.namedNode(RDF_NIL));

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

  // Simplifies groups by merging adjacent BGPs
  function mergeAdjacentBGPs(groups) {
    var merged = [], currentBgp;
    for (var i = 0, group; group = groups[i]; i++) {
      switch (group.type) {
        // Add a BGP's triples to the current BGP
        case 'bgp':
          if (group.triples.length) {
            if (!currentBgp)
              appendTo(merged, currentBgp = group);
            else
              appendAllTo(currentBgp.triples, group.triples);
          }
          break;
        // All other groups break up a BGP
        default:
          // Only add the group if its pattern is non-empty
          if (!group.patterns || group.patterns.length > 0) {
            appendTo(merged, group);
            currentBgp = null;
          }
      }
    }
    return merged;
  }

  // Return the id of an expression
  function getExpressionId(expression) {
    return expression.variable ? expression.variable.value : expression.value || expression.expression.value;
  }

  // Get all "aggregate"'s from an expression
  function getAggregatesOfExpression(expression) {
    if (!expression) {
      return [];
    }
    if (expression.type === 'aggregate') {
      return [expression];
    } else if (expression.type === "operation") {
      const aggregates = [];
      for (const arg of expression.args) {
        aggregates.push(...getAggregatesOfExpression(arg));
      }
      return aggregates;
    }
    return [];
  }

  // Get all variables used in an expression
  function getVariablesFromExpression(expression) {
    const variables = new Set();
    const visitExpression = function (expr) {
      if (!expr) { return; }
      if (expr.termType === "Variable") {
        variables.add(expr);
      } else if (expr.type === "operation") {
        expr.args.forEach(visitExpression);
      }
    };
    visitExpression(expression);
    return variables;
  }

  // Helper function to flatten arrays
  function flatten(input, depth = 1, stack = []) {
    for (const item of input) {
        if (depth > 0 && item instanceof Array) {
          flatten(item, depth - 1, stack);
        } else {
          stack.push(item);
        }
    }
    return stack;
  }

  function isVariable(term) {
    return term.termType === 'Variable';
  }

  function getBoundVarsFromGroupGraphPattern(pattern) {
    if (pattern.triples) {
      const boundVars = [];
      for (const triple of pattern.triples) {
        if (isVariable(triple.subject)) boundVars.push(triple.subject.value);
        if (isVariable(triple.predicate)) boundVars.push(triple.predicate.value);
        if (isVariable(triple.object)) boundVars.push(triple.object.value);
      }
      return boundVars;
    } else if (pattern.patterns) {
      const boundVars = [];
      for (const pat of pattern.patterns) {
        boundVars.push(...getBoundVarsFromGroupGraphPattern(pat));
      }
      return boundVars;
    }
    return [];
  }

  // Helper function to find duplicates in array
  function getDuplicatesInArray(array) {
    const sortedArray = array.slice().sort();
    const duplicates = [];
    for (let i = 0; i < sortedArray.length - 1; i++) {
      if (sortedArray[i + 1] == sortedArray[i]) {
        duplicates.push(sortedArray[i]);
      }
    }
    return duplicates;
  }

  function ensureSparqlStar(value) {
    if (!Parser.sparqlStar) {
      throw new Error('SPARQL* support is not enabled');
    }
    return value;
  }

  function ensureNoVariables(operations) {
    for (const operation of operations) {
      if (operation.type === 'graph' && operation.name.termType === 'Variable') {
        throw new Error('Detected illegal variable in GRAPH');
      }
      if (operation.type === 'bgp' || operation.type === 'graph') {
        for (const triple of operation.triples) {
          if (triple.subject.termType === 'Variable' ||
              triple.predicate.termType === 'Variable' ||
              triple.object.termType === 'Variable') {
            throw new Error('Detected illegal variable in BGP');
          }
        }
      }
    }
    return operations;
  }

  function ensureNoBnodes(operations) {
    for (const operation of operations) {
      if (operation.type === 'bgp') {
        for (const triple of operation.triples) {
          if (triple.subject.termType === 'BlankNode' ||
              triple.predicate.termType === 'BlankNode' ||
              triple.object.termType === 'BlankNode') {
            throw new Error('Detected illegal blank node in BGP');
          }
        }
      }
    }
    return operations;
  }
%}

%lex

IRIREF                "<"(?:[^<>\"\{\}\|\^`\\\u0000-\u0020])*">"
PNAME_NS              {PN_PREFIX}?":"
PNAME_LN              {PNAME_NS}{PN_LOCAL}
BLANK_NODE_LABEL      "_:"(?:{PN_CHARS_U}|[0-9])(?:(?:{PN_CHARS}|".")*{PN_CHARS})?
VAR                   [\?\$]{VARNAME}
LANGTAG               "@"[a-zA-Z]+(?:"-"[a-zA-Z0-9]+)*
INTEGER               [0-9]+
DECIMAL               [0-9]*"."[0-9]+
DOUBLE                [0-9]+"."[0-9]*{EXPONENT}|"."([0-9])+{EXPONENT}|([0-9])+{EXPONENT}
INTEGER_POSITIVE      "+"{INTEGER}
DECIMAL_POSITIVE      "+"{DECIMAL}
DOUBLE_POSITIVE       "+"{DOUBLE}
INTEGER_NEGATIVE      "-"{INTEGER}
DECIMAL_NEGATIVE      "-"{DECIMAL}
DOUBLE_NEGATIVE       "-"{DOUBLE}
EXPONENT              [eE][+-]?[0-9]+
STRING_LITERAL1       "'"(?:(?:[^\u0027\u005C\u000A\u000D])|{ECHAR})*"'"
STRING_LITERAL2       "\""(?:(?:[^\u0022\u005C\u000A\u000D])|{ECHAR})*'"'
STRING_LITERAL_LONG1  "'''"(?:(?:"'"|"''")?(?:[^'\\]|{ECHAR}))*"'''"
STRING_LITERAL_LONG2  "\"\"\""(?:(?:"\""|'""')?(?:[^\"\\]|{ECHAR}))*'"""'
ECHAR                 "\\"[tbnrf\\\"']|"\\u"{HEX}{HEX}{HEX}{HEX}|"\\U"{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}
NIL                   "("{WS}*")"
WS                    \u0020|\u0009|\u000D|\u000A
ANON                  "["{WS}*"]"
PN_CHARS_BASE         [A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF]
PN_CHARS_U            (?:{PN_CHARS_BASE}|"_")
VARNAME               (?:{PN_CHARS_U}|[0-9])(?:{PN_CHARS_U}|[0-9]|\u00B7|[\u0300-\u036F\u203F-\u2040])*
PN_CHARS              {PN_CHARS_U}|"-"|[0-9]|\u00B7|[\u0300-\u036F\u203F-\u2040]
PN_PREFIX             {PN_CHARS_BASE}(?:(?:{PN_CHARS}|".")*{PN_CHARS})?
PN_LOCAL              (?:{PN_CHARS_U}|":"|[0-9]|{PLX})(?:(?:{PN_CHARS}|"."|":"|{PLX})*(?:{PN_CHARS}|":"|{PLX}))?
PLX                   {PERCENT}|{PN_LOCAL_ESC}
PERCENT               "%"{HEX}{HEX}
HEX                   [0-9A-Fa-f]
PN_LOCAL_ESC          "\\"("_"|"~"|"."|"-"|"!"|"$"|"&"|"'"|"("|")"|"*"|"+"|","|";"|"="|"/"|"?"|"#"|"@"|"%")
COMMENT               "#"[^\n\r]*
SPACES_COMMENTS       (\s+|{COMMENT}\n\r?)+

%options flex case-insensitive

%%

\s+|{COMMENT}            /* ignore */
"BASE"                   return 'BASE'
"PREFIX"                 return 'PREFIX'
"SELECT"                 return 'SELECT'
"DISTINCT"               return 'DISTINCT'
"REDUCED"                return 'REDUCED'
"("                      return '('
"AS"                     return 'AS'
")"                      return ')'
"*"                      return '*'
"CONSTRUCT"              return 'CONSTRUCT'
"WHERE"                  return 'WHERE'
"{"                      return '{'
"}"                      return '}'
"DESCRIBE"               return 'DESCRIBE'
"ASK"                    return 'ASK'
"FROM"                   return 'FROM'
"NAMED"                  return 'NAMED'
"GROUP"                  return 'GROUP'
"BY"                     return 'BY'
"HAVING"                 return 'HAVING'
"ORDER"                  return 'ORDER'
"ASC"                    return 'ASC'
"DESC"                   return 'DESC'
"LIMIT"                  return 'LIMIT'
"OFFSET"                 return 'OFFSET'
"VALUES"                 return 'VALUES'
";"                      return ';'
"LOAD"                   return 'LOAD'
"SILENT"                 return 'SILENT'
"INTO"                   return 'INTO'
"CLEAR"                  return 'CLEAR'
"DROP"                   return 'DROP'
"CREATE"                 return 'CREATE'
"ADD"                    return 'ADD'
"TO"                     return 'TO'
"MOVE"                   return 'MOVE'
"COPY"                   return 'COPY'
"INSERT"{SPACES_COMMENTS}"DATA"  return 'INSERTDATA'
"DELETE"{SPACES_COMMENTS}"DATA"  return 'DELETEDATA'
"DELETE"{SPACES_COMMENTS}"WHERE" return 'DELETEWHERE'
"WITH"                   return 'WITH'
"DELETE"                 return 'DELETE'
"INSERT"                 return 'INSERT'
"USING"                  return 'USING'
"DEFAULT"                return 'DEFAULT'
"GRAPH"                  return 'GRAPH'
"ALL"                    return 'ALL'
"."                      return '.'
"OPTIONAL"               return 'OPTIONAL'
"SERVICE"                return 'SERVICE'
"BIND"                   return 'BIND'
"UNDEF"                  return 'UNDEF'
"MINUS"                  return 'MINUS'
"UNION"                  return 'UNION'
"FILTER"                 return 'FILTER'
"<<"                     return '<<'
">>"                     return '>>'
","                      return ','
"a"                      return 'a'
"|"                      return '|'
"/"                      return '/'
"^"                      return '^'
"?"                      return '?'
"+"                      return '+'
"!"                      return '!'
"["                      return '['
"]"                      return ']'
"||"                     return '||'
"&&"                     return '&&'
"="                      return '='
"!="                     return '!='
"<"                      return '<'
">"                      return '>'
"<="                     return '<='
">="                     return '>='
"IN"                     return 'IN'
"NOT"                    return 'NOT'
"-"                      return '-'
"BOUND"                  return 'BOUND'
"BNODE"                  return 'BNODE'
("RAND"|"NOW"|"UUID"|"STRUUID") return 'FUNC_ARITY0'
("LANG"|"DATATYPE"|"IRI"|"URI"|"ABS"|"CEIL"|"FLOOR"|"ROUND"|"STRLEN"|"STR"|"UCASE"|"LCASE"|"ENCODE_FOR_URI"|"YEAR"|"MONTH"|"DAY"|"HOURS"|"MINUTES"|"SECONDS"|"TIMEZONE"|"TZ"|"MD5"|"SHA1"|"SHA256"|"SHA384"|"SHA512"|"isIRI"|"isURI"|"isBLANK"|"isLITERAL"|"isNUMERIC") return 'FUNC_ARITY1'
("LANGMATCHES"|"CONTAINS"|"STRSTARTS"|"STRENDS"|"STRBEFORE"|"STRAFTER"|"STRLANG"|"STRDT"|"sameTerm") return 'FUNC_ARITY2'
"CONCAT"                 return 'CONCAT'
"COALESCE"               return 'COALESCE'
"IF"                     return 'IF'
"REGEX"                  return 'REGEX'
"SUBSTR"                 return 'SUBSTR'
"REPLACE"                return 'REPLACE'
"EXISTS"                 return 'EXISTS'
"COUNT"                  return 'COUNT'
"SUM"|"MIN"|"MAX"|"AVG"|"SAMPLE" return 'FUNC_AGGREGATE'
"GROUP_CONCAT"           return 'GROUP_CONCAT'
"SEPARATOR"              return 'SEPARATOR'
"^^"                     return '^^'
"true"|"false"           return 'BOOLEAN'
{IRIREF}                 return 'IRIREF'
{PNAME_NS}               return 'PNAME_NS'
{PNAME_LN}               return 'PNAME_LN'
{BLANK_NODE_LABEL}       return 'BLANK_NODE_LABEL'
{VAR}                    return 'VAR'
{LANGTAG}                return 'LANGTAG'
{INTEGER}                return 'INTEGER'
{DECIMAL}                return 'DECIMAL'
{DOUBLE}                 return 'DOUBLE'
{INTEGER_POSITIVE}       return 'INTEGER_POSITIVE'
{DECIMAL_POSITIVE}       return 'DECIMAL_POSITIVE'
{DOUBLE_POSITIVE}        return 'DOUBLE_POSITIVE'
{INTEGER_NEGATIVE}       return 'INTEGER_NEGATIVE'
{DECIMAL_NEGATIVE}       return 'DECIMAL_NEGATIVE'
{DOUBLE_NEGATIVE}        return 'DOUBLE_NEGATIVE'
{EXPONENT}               return 'EXPONENT'
{STRING_LITERAL1}        return 'STRING_LITERAL1'
{STRING_LITERAL2}        return 'STRING_LITERAL2'
{STRING_LITERAL_LONG1}   return 'STRING_LITERAL_LONG1'
{STRING_LITERAL_LONG2}   return 'STRING_LITERAL_LONG2'
{NIL}                    return 'NIL'
{ANON}                   return 'ANON'
<<EOF>>                  return 'EOF'
.                        return 'INVALID'

/lex

%ebnf

%start QueryOrUpdate

%%

QueryOrUpdate
    : Prologue ( Query | Update? ) EOF
    {
      // Set parser options
      $2 = $2 || {};
      if (Parser.base)
        $2.base = Parser.base;
      Parser.base = '';
      $2.prefixes = Parser.prefixes;
      Parser.prefixes = null;

      // Ensure that blank nodes are not used across INSERT DATA clauses
      if ($2.type === 'update') {
        const insertBnodesAll = {};
        for (const update of $2.updates) {
          if (update.updateType === 'insert') {
            // Collect bnodes for current insert clause
            const insertBnodes = {};
            for (const operation of update.insert) {
              if (operation.type === 'bgp' || operation.type === 'graph') {
                for (const triple of operation.triples) {
                  if (triple.subject.termType === 'BlankNode')
                    insertBnodes[triple.subject.value] = true;
                  if (triple.predicate.termType === 'BlankNode')
                    insertBnodes[triple.predicate.value] = true;
                  if (triple.object.termType === 'BlankNode')
                    insertBnodes[triple.object.value] = true;
                }
              }
            }

            // Check if the inserting bnodes don't clash with bnodes from a previous insert clause
            for (const bnode of Object.keys(insertBnodes)) {
              if (insertBnodesAll[bnode]) {
                throw new Error('Detected reuse blank node across different INSERT DATA clauses');
              }
              insertBnodesAll[bnode] = true;
            }
          }
        }
      }

      return $2;
    }
    ;
Prologue
    : ( BaseDecl | PrefixDecl )*;
Query
    : ( SelectQuery | ConstructQuery | DescribeQuery | AskQuery ) ValuesClause? -> extend($1, $2, { type: 'query' })
    ;
BaseDecl
    : 'BASE' IRIREF
    {
      Parser.base = resolveIRI($2)
    }
    ;
PrefixDecl
    : 'PREFIX' PNAME_NS IRIREF
    {
      if (!Parser.prefixes) Parser.prefixes = {};
      $2 = $2.substr(0, $2.length - 1);
      $3 = resolveIRI($3);
      Parser.prefixes[$2] = $3;
    }
    ;
SelectQuery
    : SelectClauseWildcard DatasetClause* WhereClause SolutionModifierNoGroup -> extend($1, groupDatasets($2), $3, $4)
    | SelectClauseVars     DatasetClause* WhereClause SolutionModifier
    {
      // Check for projection of ungrouped variable
      if (!Parser.skipUngroupedVariableCheck) {
        const counts = flatten($1.variables.map(vars => getAggregatesOfExpression(vars.expression)))
          .some(agg => agg.aggregation === "count" && !(agg.expression instanceof Wildcard));
        if (counts || $4.group) {
          for (const selectVar of $1.variables) {
            if (selectVar.termType === "Variable") {
              if (!$4.group || !$4.group.map(groupVar => getExpressionId(groupVar)).includes(getExpressionId(selectVar))) {
                throw Error("Projection of ungrouped variable (?" + getExpressionId(selectVar) + ")");
              }
            } else if (getAggregatesOfExpression(selectVar.expression).length === 0) {
              const usedVars = getVariablesFromExpression(selectVar.expression);
              for (const usedVar of usedVars) {
                if (!$4.group.map(groupVar => getExpressionId(groupVar)).includes(getExpressionId(usedVar))) {
                  throw Error("Use of ungrouped variable in projection of operation (?" + getExpressionId(usedVar) + ")");
                }
              }
            }
          }
        }
      }
      // Check if id of each AS-selected column is not yet bound by subquery
      const subqueries = $3.where.filter(w => w.type === "query");
      if (subqueries.length > 0) {
        const selectedVarIds = $1.variables.filter(v => v.variable && v.variable.value).map(v => v.variable.value);
        const subqueryIds = flatten(subqueries.map(sub => sub.variables)).map(v => v.value || v.variable.value);
        for (const selectedVarId of selectedVarIds) {
          if (subqueryIds.indexOf(selectedVarId) >= 0) {
            throw Error("Target id of 'AS' (?" + selectedVarId + ") already used in subquery");
          }
        }
      }
      $$ = extend($1, groupDatasets($2), $3, $4)
    }
    ;
SelectClauseWildcard
    : SelectClauseBase '*' -> extend($1, {variables: [new Wildcard()]})
    ;
SelectClauseVars
    : SelectClauseBase SelectClauseItem+
    {
      // Check if id of each selected column is different
      const selectedVarIds = $2.map(v => v.value || v.variable.value);
      const duplicates = getDuplicatesInArray(selectedVarIds);
      if (duplicates.length > 0) {
        throw Error("Two or more of the resulting columns have the same name (?" + duplicates[0] + ")");
      }

      $$ = extend($1, { variables: $2 })
    }
    ;
SelectClauseBase
    : 'SELECT' ( 'DISTINCT' | 'REDUCED' )? -> extend({ queryType: 'SELECT'}, $2 && ($1 = lowercase($2), $2 = {}, $2[$1] = true, $2))
    ;
SubSelect
    : SelectClauseWildcard WhereClause SolutionModifierNoGroup ValuesClause? -> extend($1, $2, $3, $4, { type: 'query' })
    | SelectClauseVars     WhereClause SolutionModifier        ValuesClause? -> extend($1, $2, $3, $4, { type: 'query' })
    ;
SelectClauseItem
    : VAR -> toVar($1)
    | '(' Expression 'AS' VAR ')' -> expression($2, { variable: toVar($4) })
    | '(' VarTriple 'AS' VAR ')' -> ensureSparqlStar(expression($2, { variable: toVar($4) }))
    ;
ConstructQuery
    : 'CONSTRUCT' ConstructTemplate DatasetClause* WhereClause SolutionModifier -> extend({ queryType: 'CONSTRUCT', template: $2 }, groupDatasets($3), $4, $5)
    | 'CONSTRUCT' DatasetClause* 'WHERE' '{' TriplesTemplate? '}' SolutionModifier -> extend({ queryType: 'CONSTRUCT', template: $5 = ($5 ? $5.triples : []) }, groupDatasets($2), { where: [ { type: 'bgp', triples: appendAllTo([], $5) } ] }, $7)
    ;
DescribeQuery
    : 'DESCRIBE' ( (VAR | iri)+ | '*' ) DatasetClause* WhereClause? SolutionModifier -> extend({ queryType: 'DESCRIBE', variables: $2 === '*' ? [new Wildcard()] : $2.map(toVar) }, groupDatasets($3), $4, $5)
    ;
AskQuery
    : 'ASK' DatasetClause* WhereClause SolutionModifier -> extend({ queryType: 'ASK' }, groupDatasets($2), $3, $4)
    ;
DatasetClause
    : 'FROM' 'NAMED'? iri -> { iri: $3, named: !!$2 }
    ;
WhereClause
    : 'WHERE'? GroupGraphPattern -> { where: $2.patterns }
    ;
SolutionModifier
    : GroupClause? SolutionModifierNoGroup -> extend($1, $2)
    ;
SolutionModifierNoGroup
    : HavingClause? OrderClause? LimitOffsetClauses? -> extend($1, $2, $3)
    ;
GroupClause
    : 'GROUP' 'BY' GroupCondition+ -> { group: $3 }
    ;
GroupCondition
    : BuiltInCall -> expression($1)
    | FunctionCall -> expression($1)
    | '(' Expression ')' -> expression($2)
    | '(' Expression 'AS' VAR ')' -> expression($2, { variable: toVar($4) })
    | VAR -> expression(toVar($1))
    ;
HavingClause
    : 'HAVING' Constraint+ -> { having: $2 }
    ;
OrderClause
    : 'ORDER' 'BY' OrderCondition+ -> { order: $3 }
    ;
OrderCondition
    : 'ASC'  BrackettedExpression -> expression($2)
    | 'DESC' BrackettedExpression -> expression($2, { descending: true })
    | Constraint -> expression($1)
    | VAR -> expression(toVar($1))
    ;
LimitOffsetClauses
    : 'LIMIT'  INTEGER -> { limit:  toInt($2) }
    | 'OFFSET' INTEGER -> { offset: toInt($2) }
    | 'LIMIT'  INTEGER 'OFFSET' INTEGER -> { limit: toInt($2), offset: toInt($4) }
    | 'OFFSET' INTEGER 'LIMIT'  INTEGER -> { limit: toInt($4), offset: toInt($2) }
    ;
ValuesClause
    : 'VALUES' InlineData -> { type: 'values', values: $2 }
    ;
InlineData
    : VAR '{' DataBlockValue* '}'
    {
      $$ = $3.map(function(v) { var o = {}; o[$1] = v; return o; })
    }
    |
    NIL '{' NIL* '}'
    {
      $$ = $3.map(function() { return {}; })
    }
    | '(' VAR+ ')' '{' DataBlockValueList* '}'
    {
      var length = $2.length;
      $2 = $2.map(toVar);
      $$ = $5.map(function (values) {
        if (values.length !== length)
          throw Error('Inconsistent VALUES length');
        var valuesObject = {};
        for(var i = 0; i<length; i++)
          valuesObject['?' + $2[i].value] = values[i];
        return valuesObject;
      });
    }
    ;
DataBlockValue
    : iri
    | Literal
    | ConstTriple -> ensureSparqlStar($1)
    | 'UNDEF' -> undefined
    ;
DataBlockValueList
    : '(' DataBlockValue+ ')' -> $2
    ;
Update
    : (Update1 ';' Prologue)* Update1 (';' Prologue)? -> { type: 'update', updates: appendTo($1, $2) }
    ;
Update1
    : 'LOAD' 'SILENT'? iri IntoGraphClause? -> extend({ type: 'load', silent: !!$2, source: $3 }, $4 && { destination: $4 })
    | ( 'CLEAR' | 'DROP' ) 'SILENT'? GraphRefAll -> { type: lowercase($1), silent: !!$2, graph: $3 }
    | ( 'ADD' | 'MOVE' | 'COPY' ) 'SILENT'? GraphOrDefault 'TO' GraphOrDefault -> { type: lowercase($1), silent: !!$2, source: $3, destination: $5 }
    | 'CREATE' 'SILENT'? 'GRAPH' iri -> { type: 'create', silent: !!$2, graph: { type: 'graph', name: $4 } }
    | 'INSERTDATA'  QuadPattern -> { updateType: 'insert',      insert: ensureNoVariables($2)                 }
    | 'DELETEDATA'  QuadPattern -> { updateType: 'delete',      delete: ensureNoBnodes(ensureNoVariables($2)) }
    | 'DELETEWHERE' QuadPattern -> { updateType: 'deletewhere', delete: ensureNoBnodes($2)                    }
    | WithClause? InsertClause DeleteClause? UsingClause* 'WHERE' GroupGraphPattern -> extend({ updateType: 'insertdelete' }, $1, { insert: $2 || [] }, { delete: $3 || [] }, groupDatasets($4, 'using'), { where: $6.patterns })
    | WithClause? DeleteClause InsertClause? UsingClause* 'WHERE' GroupGraphPattern -> extend({ updateType: 'insertdelete' }, $1, { delete: $2 || [] }, { insert: $3 || [] }, groupDatasets($4, 'using'), { where: $6.patterns })
    ;
DeleteClause
    : 'DELETE' QuadPattern -> ensureNoBnodes($2)
    ;
InsertClause
    : 'INSERT' QuadPattern -> $2
    ;
UsingClause
    : 'USING' 'NAMED'? iri -> { iri: $3, named: !!$2 }
    ;
WithClause
    : 'WITH' iri -> { graph: $2 }
    ;
IntoGraphClause
    : 'INTO' 'GRAPH' iri -> $3
    ;
GraphOrDefault
    : 'DEFAULT' -> { type: 'graph', default: true }
    | 'GRAPH'? iri -> { type: 'graph', name: $2 }
    ;
GraphRefAll
    : 'GRAPH' iri -> { type: 'graph', name: $2 }
    | ( 'DEFAULT' | 'NAMED' | 'ALL' ) { $$ = {}; $$[lowercase($1)] = true; }
    ;
QuadPattern
    : '{' TriplesTemplate? QuadsNotTriples* '}' -> $2 ? unionAll($3, [$2]) : unionAll($3)
    ;
QuadsNotTriples
    : 'GRAPH' (VAR | iri) '{' TriplesTemplate? '}' '.'? TriplesTemplate?
    {
      var graph = extend($4 || { triples: [] }, { type: 'graph', name: toVar($2) });
      $$ = $7 ? [graph, $7] : [graph];
    }
    ;
TriplesTemplate
    : (TriplesSameSubject '.')* TriplesSameSubject '.'? -> { type: 'bgp', triples: unionAll($1, [$2]) }
    ;
GroupGraphPattern
    : '{' SubSelect '}' -> { type: 'group', patterns: [ $2 ] }
    | '{' GroupGraphPatternSub '}'
    {
      // For every binding
      for (const binding of $2.filter(el => el.type === "bind")) {
        const index = $2.indexOf(binding);
        const boundVars = new Set();
        //Collect all bounded variables before the binding
        for (const el of $2.slice(0, index)) {
          if (el.type === "group" || el.type === "bgp") {
            getBoundVarsFromGroupGraphPattern(el).forEach(boundVar => boundVars.add(boundVar));
          }
        }
        // If binding with a non-free variable, throw error
        if (boundVars.has(binding.variable.value)) {
          throw Error("Variable used to bind is already bound (?" + binding.variable.value + ")");
        }
      }
      $$ = { type: 'group', patterns: $2 }
    }
    ;
GroupGraphPatternSub
    : TriplesBlock? GroupGraphPatternSubTail* -> $1 ? unionAll([$1], $2) : unionAll($2)
    ;
GroupGraphPatternSubTail
    : GraphPatternNotTriples '.'? TriplesBlock? -> $3 ? [$1, $3] : $1
    ;
TriplesBlock
    : (TriplesSameSubjectPath '.')* TriplesSameSubjectPath '.'? -> { type: 'bgp', triples: unionAll($1, [$2]) }
    ;
GraphPatternNotTriples
    : ( GroupGraphPattern 'UNION' )* GroupGraphPattern
    {
      if ($1.length)
        $$ = { type: 'union', patterns: unionAll($1.map(degroupSingle), [degroupSingle($2)]) };
      else
        $$ = $2;
    }
    | 'OPTIONAL' GroupGraphPattern -> extend($2, { type: 'optional' })
    | 'MINUS' GroupGraphPattern    -> extend($2, { type: 'minus' })
    | 'GRAPH' (VAR | iri) GroupGraphPattern -> extend($3, { type: 'graph', name: toVar($2) })
    | 'SERVICE' 'SILENT'? (VAR | iri) GroupGraphPattern -> extend($4, { type: 'service', name: toVar($3), silent: !!$2 })
    | 'FILTER' Constraint -> { type: 'filter', expression: $2 }
    | 'BIND' '(' Expression 'AS' VAR ')' -> { type: 'bind', variable: toVar($5), expression: $3 }
    | 'BIND' '(' VarTriple 'AS' VAR ')' -> ensureSparqlStar({ type: 'bind', variable: toVar($5), expression: $3 })
    | ValuesClause
    ;
Constraint
    : BrackettedExpression
    | BuiltInCall
    | FunctionCall
    ;
FunctionCall
    : iri NIL -> { type: 'functionCall', function: $1, args: [] }
    | iri '(' 'DISTINCT'? ( Expression ',' )* Expression ')' -> { type: 'functionCall', function: $1, args: appendTo($4, $5), distinct: !!$3 }
    ;
ExpressionList
    : NIL -> []
    | '(' ( Expression ',' )* Expression ')' -> appendTo($2, $3)
    ;
ConstructTemplate
    : '{' ConstructTriples? '}' -> $2
    ;
ConstructTriples
    : (TriplesSameSubject '.')* TriplesSameSubject '.'? -> unionAll($1, [$2])
    ;
TriplesSameSubject
    : (VarOrTerm | VarTriple) PropertyListNotEmpty -> $2.map(function (t) { return extend(triple($1), t); })
    | TriplesNode PropertyList -> appendAllTo($2.map(function (t) { return extend(triple($1.entity), t); }), $1.triples) /* the subject is a blank node, possibly with more triples */
    ;
PropertyList
    : PropertyListNotEmpty?
    ;
PropertyListNotEmpty
    : VerbObjectList ( SemiOptionalVerbObjectList )* -> unionAll([$1], $2)
    ;
SemiOptionalVerbObjectList
    : ';' VerbObjectList? -> unionAll($2)
    ;
VerbObjectList
    : Verb ObjectList -> objectListToTriples($1, $2)
    ;
Verb
    : VAR -> toVar($1)
    | iri
    | 'a' -> Parser.factory.namedNode(RDF_TYPE)
    ;
ObjectList
    : (GraphNode ',')* GraphNode -> appendTo($1, $2)
    ;
TriplesSameSubjectPath
    : (VarOrTerm | VarTriple) PropertyListPathNotEmpty -> $2.map(function (t) { return extend(triple($1), t); })
    | TriplesNodePath PropertyListPathNotEmpty? -> !$2 ? $1.triples : appendAllTo($2.map(function (t) { return extend(triple($1.entity), t); }), $1.triples) /* the subject is a blank node, possibly with more triples */
    ;
PropertyListPathNotEmpty
    : ( Path | VAR ) ( GraphNodePath ',' )* GraphNodePath PropertyListPathNotEmptyTail* -> objectListToTriples(toVar($1), appendTo($2, $3), $4)
    ;
PropertyListPathNotEmptyTail
    : ';' -> []
    | ';' ( Path | VAR ) ObjectList -> objectListToTriples(toVar($2), $3)
    ;
Path
    : ( PathSequence '|' )* PathSequence -> $1.length ? path('|',appendTo($1, $2)) : $2
    ;
PathSequence
    : ( PathEltOrInverse '/' )* PathEltOrInverse -> $1.length ? path('/', appendTo($1, $2)) : $2
    ;
PathElt
    : PathPrimary ( '?' | '*' | '+' )? -> $2 ? path($2, [$1]) : $1
    ;
PathEltOrInverse
    : '^'? PathElt -> $1 ? path($1, [$2]) : $2;
    ;
PathPrimary
    : iri
    | 'a' -> Parser.factory.namedNode(RDF_TYPE)
    | '!' PathNegatedPropertySet -> path($1, [$2])
    | '(' Path ')' -> $2
    ;
PathNegatedPropertySet
    : PathOneInPropertySet
    | NIL -> []
    | '(' ( PathOneInPropertySet '|' )* PathOneInPropertySet? ')' -> path('|', appendTo($2, $3))
    ;
PathOneInPropertySet
    : iri
    | 'a' -> Parser.factory.namedNode(RDF_TYPE)
    | '^' iri -> path($1, [$2])
    | '^' 'a' -> path($1, [Parser.factory.namedNode(RDF_TYPE)])
    ;
TriplesNode
    : '(' GraphNode+ ')' -> createList($2)
    | '[' PropertyListNotEmpty ']' -> createAnonymousObject($2)
    ;
TriplesNodePath
    : '(' GraphNodePath+ ')' -> createList($2)
    | '[' PropertyListPathNotEmpty ']' -> createAnonymousObject($2)
    ;
GraphNode
    : (VarOrTerm | VarTriple) -> { entity: $1, triples: [] } /* for consistency with TriplesNode */
    | TriplesNode
    ;
GraphNodePath
    : (VarOrTerm | VarTriple) -> { entity: $1, triples: [] } /* for consistency with TriplesNodePath */
    | TriplesNodePath
    ;
VarTriple
    : '<<' 'GRAPH' (VAR | iri) '{' (VarTriple | VarOrTerm) Verb (VarTriple | VarOrTerm) '}' '>>' -> ensureSparqlStar(Parser.factory.quad($5, $6, $7, toVar($3)))
    | '<<' (VarTriple | VarOrTerm) Verb (VarTriple | VarOrTerm) '>>' -> ensureSparqlStar(Parser.factory.quad($2, $3, $4))
    ;
ConstTriple
    : '<<' 'GRAPH' (VAR | iri) '{' (ConstTriple | Term) Verb (ConstTriple | Term) '}' '>>' -> ensureSparqlStar(Parser.factory.quad($5, $6, $7, toVar($3)))
    | '<<' (ConstTriple | Term) Verb (ConstTriple | Term) '>>' -> ensureSparqlStar(Parser.factory.quad($2, $3, $4))
    ;
VarOrTerm
    : VAR -> toVar($1)
    | Term
    ;
Term
    : iri
    | Literal
    | BLANK_NODE_LABEL -> blank($1.replace(/^(_:)/,''));
    | ANON -> blank()
    | NIL  -> Parser.factory.namedNode(RDF_NIL)
    ;
Expression
    : ConditionalAndExpression ExpressionTail* -> createOperationTree($1, $2)
    ;
ExpressionTail
    : '||' ConditionalAndExpression -> ['||', $2]
    ;
ConditionalAndExpression
    : RelationalExpression ConditionalAndExpressionTail* -> createOperationTree($1, $2)
    ;
ConditionalAndExpressionTail
    : '&&' RelationalExpression -> ['&&', $2]
    ;
RelationalExpression
    : AdditiveExpression
    | AdditiveExpression ( '=' | '!=' | '<' | '>' | '<=' | '>=' ) AdditiveExpression -> operation($2, [$1, $3])
    | AdditiveExpression 'NOT'? 'IN' ExpressionList -> operation($2 ? 'notin' : 'in', [$1, $4])
    ;
AdditiveExpression
    : MultiplicativeExpression AdditiveExpressionTail* -> createOperationTree($1, $2)
    ;
AdditiveExpressionTail
    : ( '+' | '-' ) MultiplicativeExpression -> [$1, $2]
    | NumericLiteralPositive MultiplicativeExpressionTail* -> ['+', createOperationTree($1, $2)]
    | NumericLiteralNegative MultiplicativeExpressionTail*
    {
      var negatedLiteral = createTypedLiteral($1.value.replace('-', ''), $1.datatype);
      $$ = ['-', createOperationTree(negatedLiteral, $2)];
    }
    ;
MultiplicativeExpression
    : UnaryExpression MultiplicativeExpressionTail* -> createOperationTree($1, $2)
    ;
MultiplicativeExpressionTail
    : ( '*' | '/' ) UnaryExpression -> [$1, $2]
    ;
UnaryExpression
    : '+'? PrimaryExpression -> $2
    | '!'  PrimaryExpression -> operation($1, [$2])
    | '-'  PrimaryExpression -> operation('UMINUS', [$2])
    ;
PrimaryExpression
    : BrackettedExpression
    | BuiltInCall
    | iri
    | FunctionCall
    | Literal
    | VAR -> toVar($1)
    ;
BrackettedExpression
    : '(' Expression ')' -> $2
    ;
BuiltInCall
    : Aggregate
    | FUNC_ARITY0 NIL -> operation(lowercase($1))
    | FUNC_ARITY1 '(' Expression ')' -> operation(lowercase($1), [$3])
    | FUNC_ARITY2 '(' Expression ',' Expression ')' -> operation(lowercase($1), [$3, $5])
    | 'IF' '(' Expression ',' Expression ',' Expression ')' -> operation(lowercase($1), [$3, $5, $7])
    | ( 'CONCAT' | 'COALESCE' | 'SUBSTR' | 'REGEX' | 'REPLACE' ) ExpressionList -> operation(lowercase($1), $2)
    | 'BOUND' '(' VAR ')' -> operation('bound', [toVar($3)])
    | 'BNODE' NIL -> operation($1, [])
    | 'BNODE' '(' Expression ')' -> operation($1, [$3])
    | 'NOT'? 'EXISTS' GroupGraphPattern -> operation($1 ? 'notexists' :'exists', [degroupSingle($3)])
    ;
Aggregate
    : 'COUNT' '(' 'DISTINCT'? ( '*' | Expression ) ')' -> expression($4, { type: 'aggregate', aggregation: lowercase($1), distinct: !!$3 })
    | FUNC_AGGREGATE '(' 'DISTINCT'? Expression ')' -> expression($4, { type: 'aggregate', aggregation: lowercase($1), distinct: !!$3 })
    | 'GROUP_CONCAT' '(' 'DISTINCT'? Expression GroupConcatSeparator? ')'  -> expression($4, { type: 'aggregate', aggregation: lowercase($1), distinct: !!$3, separator: $5 || ' ' })
    ;
GroupConcatSeparator
    : ';' 'SEPARATOR' '=' String -> $4
    ;
Literal
    : String -> createTypedLiteral($1)
    | String LANGTAG  -> createLangLiteral($1, lowercase($2.substr(1)))
    | String '^^' iri -> createTypedLiteral($1, $3)
    | INTEGER -> createTypedLiteral($1, XSD_INTEGER)
    | DECIMAL -> createTypedLiteral($1, XSD_DECIMAL)
    | DOUBLE  -> createTypedLiteral(lowercase($1), XSD_DOUBLE)
    | NumericLiteralPositive
    | NumericLiteralNegative
    | BOOLEAN -> createTypedLiteral($1.toLowerCase(), XSD_BOOLEAN)
    ;
String
    : STRING_LITERAL1 -> unescapeString($1, 1)
    | STRING_LITERAL2 -> unescapeString($1, 1)
    | STRING_LITERAL_LONG1 -> unescapeString($1, 3)
    | STRING_LITERAL_LONG2 -> unescapeString($1, 3)
    ;
NumericLiteralPositive
    : INTEGER_POSITIVE -> createTypedLiteral($1.substr(1), XSD_INTEGER)
    | DECIMAL_POSITIVE -> createTypedLiteral($1.substr(1), XSD_DECIMAL)
    | DOUBLE_POSITIVE  -> createTypedLiteral($1.substr(1).toLowerCase(), XSD_DOUBLE)
    ;
NumericLiteralNegative
    : INTEGER_NEGATIVE -> createTypedLiteral($1, XSD_INTEGER)
    | DECIMAL_NEGATIVE -> createTypedLiteral($1, XSD_DECIMAL)
    | DOUBLE_NEGATIVE  -> createTypedLiteral(lowercase($1), XSD_DOUBLE)
    ;
iri
    : IRIREF -> Parser.factory.namedNode(resolveIRI($1))
    | PNAME_LN
    {
      var namePos = $1.indexOf(':'),
          prefix = $1.substr(0, namePos),
          expansion = Parser.prefixes[prefix];
      if (!expansion) throw new Error('Unknown prefix: ' + prefix);
      var uriString = resolveIRI(expansion + $1.substr(namePos + 1));
      $$ = Parser.factory.namedNode(uriString);
    }
    | PNAME_NS
    {
      $1 = $1.substr(0, $1.length - 1);
      if (!($1 in Parser.prefixes)) throw new Error('Unknown prefix: ' + $1);
      var uriString = resolveIRI(Parser.prefixes[$1]);
      $$ = Parser.factory.namedNode(uriString);
    }
    ;
