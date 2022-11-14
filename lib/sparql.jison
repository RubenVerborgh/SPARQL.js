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

  function nestedTriple(subject, predicate, object) {
    return {
      termType: "Quad",
      subject,
      predicate,
      object
    }
  }

  // Creates a triple with the given subject, predicate, and object
  function triple(subject, predicate, object, annotations) {
    var triple = {};
    if (subject   != null) triple.subject   = subject;
    if (predicate != null) triple.predicate = predicate;
    if (object    != null) triple.object    = object;
    if (annotations != null) triple.annotations = annotations;
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
      let annotation = null;
      if (l.annotation) {
        // objects.push(triple(l.subject, l.predicate, l.object))
        // throw new Error(`${JSON.stringify(l, null, 2)}${JSON.stringify(objects, null, 2)}`)
        // triples.push(triple(l.subject, l.predicate, l.object))
        annotation = l.annotation
        l = l.object;
      }
        // throw new Error(`annotation is ${JSON.stringify(l.annotation, null, 2)}`);
      objects.push(triple(null, predicate, l.entity, annotation));
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
      throw new Error('SPARQL-star support is not enabled');
    }
    return value;
  }

  function _applyAnnotations(subject, annotations, arr) {
    for (const annotation of annotations) {
      const t = triple(
        subject,
        annotation.predicate,
        annotation.object
      )

      // const t = Parser.factory.quad(subject, annotation.predicate, annotation.object);
      // delete t.graph;
      
      // const t = {
      //   subject,
      //   predicate: annotation.predicate,
      //   object: annotation.object,
      //   termType: "Quad",
      //   value: "",
      // }
      // const t = triple(subject, annotation.predicate, annotation.object);
      // t.termType = 'Triple';

      arr.push(t);

      if (annotation.annotations) {
        _applyAnnotations(nestedTriple(
        subject,
        annotation.predicate,
        annotation.object
      ), annotation.annotations, arr)
      }
    }
  }

  function applyAnnotations(triples) {
    if (Parser.sparqlStar) {
      const newTriples = [];

      triples.forEach(t => {
        const s = triple(t.subject, t.predicate, t.object);

        newTriples.push(s);

        if (t.annotations) {
          _applyAnnotations(nestedTriple(t.subject, t.predicate, t.object), t.annotations, newTriples);
        }
      });

      return newTriples;
    }
    return triples;
  }

  function ensureSparqlStarNestedQuads(value) {
    if (!Parser.sparqlStarNestedQuads) {
      throw new Error('Lenient SPARQL-star support with nested quads is not enabled');
    }
    return value;sparqlStar
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

// [139]
IRIREF                "<"(?:[^<>\"\{\}\|\^`\\\u0000-\u0020])*">"
// [140]
PNAME_NS              {PN_PREFIX}?":"
// [141]
PNAME_LN              {PNAME_NS}{PN_LOCAL}
// [142]
BLANK_NODE_LABEL      "_:"(?:{PN_CHARS_U}|[0-9])(?:(?:{PN_CHARS}|".")*{PN_CHARS})?
// [108] (and [143]-[144])
VAR                   [\?\$]{VARNAME}
// [145]
LANGTAG               "@"[a-zA-Z]+(?:"-"[a-zA-Z0-9]+)*
// [146]
INTEGER               [0-9]+
// [147]
DECIMAL               [0-9]*"."[0-9]+
// [148]
DOUBLE                [0-9]+"."[0-9]*{EXPONENT}|"."([0-9])+{EXPONENT}|([0-9])+{EXPONENT}
// [149]
INTEGER_POSITIVE      "+"{INTEGER}
// [150]
DECIMAL_POSITIVE      "+"{DECIMAL}
// [151]
DOUBLE_POSITIVE       "+"{DOUBLE}
// [152]
INTEGER_NEGATIVE      "-"{INTEGER}
// [153]
DECIMAL_NEGATIVE      "-"{DECIMAL}
// [154]
DOUBLE_NEGATIVE       "-"{DOUBLE}
// [155]
EXPONENT              [eE][+-]?[0-9]+
// [156]
STRING_LITERAL1       "'"(?:(?:[^\u0027\u005C\u000A\u000D])|{ECHAR})*"'"
// [157]
STRING_LITERAL2       "\""(?:(?:[^\u0022\u005C\u000A\u000D])|{ECHAR})*'"'
// [158]
STRING_LITERAL_LONG1  "'''"(?:(?:"'"|"''")?(?:[^'\\]|{ECHAR}))*"'''"
// [159]
STRING_LITERAL_LONG2  "\"\"\""(?:(?:"\""|'""')?(?:[^\"\\]|{ECHAR}))*'"""'
// [160]
ECHAR                 "\\"[tbnrf\\\"']|"\\u"{HEX}{HEX}{HEX}{HEX}|"\\U"{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}
// [161]
NIL                   "("{WS}*")"
// [162]
WS                    \u0020|\u0009|\u000D|\u000A
// [163]
ANON                  "["{WS}*"]"
// [164]
PN_CHARS_BASE         [A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02FF\u0370-\u037D\u037F-\u1FFF\u200C-\u200D\u2070-\u218F\u2C00-\u2FEF\u3001-\uD7FF\uF900-\uFDCF\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF]
// [165]
PN_CHARS_U            (?:{PN_CHARS_BASE}|"_")
// [166]
VARNAME               (?:{PN_CHARS_U}|[0-9])(?:{PN_CHARS_U}|[0-9]|\u00B7|[\u0300-\u036F\u203F-\u2040])*
// [167]
PN_CHARS              {PN_CHARS_U}|"-"|[0-9]|\u00B7|[\u0300-\u036F\u203F-\u2040]
// [168]
PN_PREFIX             {PN_CHARS_BASE}(?:(?:{PN_CHARS}|".")*{PN_CHARS})?
// [169]
PN_LOCAL              (?:{PN_CHARS_U}|":"|[0-9]|{PLX})(?:(?:{PN_CHARS}|"."|":"|{PLX})*(?:{PN_CHARS}|":"|{PLX}))?
// [170]
PLX                   {PERCENT}|{PN_LOCAL_ESC}
// [171]
PERCENT               "%"{HEX}{HEX}
// [172]
HEX                   [0-9A-Fa-f]
// [173]
PN_LOCAL_ESC          "\\"("_"|"~"|"."|"-"|"!"|"$"|"&"|"'"|"("|")"|"*"|"+"|","|";"|"="|"/"|"?"|"#"|"@"|"%")
// TODO: Work out where this fits into the production grammar
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
"{|"                     return '{|'
"|}"                     return '|}'
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
("LANG"|"DATATYPE"|"IRI"|"URI"|"ABS"|"CEIL"|"FLOOR"|"ROUND"|"STRLEN"|"STR"|"UCASE"|"LCASE"|"ENCODE_FOR_URI"|"YEAR"|"MONTH"|"DAY"|"HOURS"|"MINUTES"|"SECONDS"|"TIMEZONE"|"TZ"|"MD5"|"SHA1"|"SHA256"|"SHA384"|"SHA512"|"isIRI"|"isURI"|"isBLANK"|"isLITERAL"|"isNUMERIC"|"SUBJECT"|"PREDICATE"|"OBJECT"|"isTRIPLE") return 'FUNC_ARITY1'
("LANGMATCHES"|"CONTAINS"|"STRSTARTS"|"STRENDS"|"STRBEFORE"|"STRAFTER"|"STRLANG"|"STRDT"|"sameTerm") return 'FUNC_ARITY2'
"CONCAT"                 return 'CONCAT'
"COALESCE"               return 'COALESCE'
("IF"|"TRIPLE")          return 'FUNC_ARITY3'
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
    : Prologue ( QueryUnit | Update? ) EOF
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

// TODO: Properly factor out queryUnit

// [1]
QueryUnit
  : Query
  ;

// [2]
// TODO: Work out why ValuesClause was optional
Query
    : ( SelectQuery | ConstructQuery | DescribeQuery | AskQuery ) ValuesClause? -> { ...$1, ...$2, type: 'query' }
    ;

// [3]
UpdateUnit
    : Update
    ;

// [4]
Prologue
    : ( BaseDecl | PrefixDecl )*
    ;

// [5]
BaseDecl
    : 'BASE' IRIREF
    {
      Parser.base = resolveIRI($2)
    }
    ;

// [6]
PrefixDecl
    : 'PREFIX' PNAME_NS IRIREF
    {
      if (!Parser.prefixes) Parser.prefixes = {};
      $2 = $2.substr(0, $2.length - 1);
      $3 = resolveIRI($3);
      Parser.prefixes[$2] = $3;
    }
    ;

// [7] Didn't check use of SolutionModifierNoGroup seems off as this introduces a havinClause where not expected.
SelectQuery
    : SelectClauseWildcard DatasetClause* WhereClause SolutionModifierNoGroup -> { ...$1, ...groupDatasets($2), ...$3, ...$4 }
    | SelectClauseVars     DatasetClause* WhereClause SolutionModifier
    {
      // Check for projection of ungrouped variable
      if (!Parser.skipValidation) {
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
                if (!$4.group || !$4.group.map || !$4.group.map(groupVar => getExpressionId(groupVar)).includes(getExpressionId(usedVar))) {
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
SelectClauseItem
    : Var
    | '(' Expression 'AS' Var ')' -> expression($2, { variable: $4 })
    // TODO: Remove this
    | '(' VarTriple 'AS' Var ')' -> ensureSparqlStar(expression($2, { variable: $4 }))
    ;

// [8] Didn't check - optional clause seems disjoint with grammar
SubSelect
    : SelectClauseWildcard WhereClause SolutionModifierNoGroup ValuesClause? -> extend($1, $2, $3, $4, { type: 'query' })
    | SelectClauseVars     WhereClause SolutionModifier        ValuesClause? -> extend($1, $2, $3, $4, { type: 'query' })
    ;

// TODO: See what 9 is
// [10] Didn't check
ConstructQuery
    : 'CONSTRUCT' ConstructTemplate DatasetClause* WhereClause SolutionModifier -> extend({ queryType: 'CONSTRUCT', template: $2 }, groupDatasets($3), $4, $5)
    | 'CONSTRUCT' DatasetClause* 'WHERE' '{' TriplesTemplate? '}' SolutionModifier -> extend({ queryType: 'CONSTRUCT', template: $5 = ($5 ? $5.triples : []) }, groupDatasets($2), { where: [ { type: 'bgp', triples: appendAllTo([], $5) } ] }, $7)
    ;

// [11]
DescribeQuery
    : 'DESCRIBE' ( VarOrIri+ | '*' ) DatasetClause* WhereClause? SolutionModifier -> extend({ queryType: 'DESCRIBE', variables: $2 === '*' ? [new Wildcard()] : $2 }, groupDatasets($3), $4, $5)
    ;

// [12]
// TODO: See why this has solution modifier rather than ValuesClause.
AskQuery
    : 'ASK' DatasetClause* WhereClause SolutionModifier -> extend({ queryType: 'ASK' }, groupDatasets($2), $3, $4)
    ;

// [13]
DatasetClause
    : 'FROM' (DefaultGraphClause | NamedGraphClause) -> $2
    ;

// [14]
DefaultGraphClause
    : SourceSelector -> { iri: $1, named: false }
    ;

// [15]
NamedGraphClause
    : 'NAMED' SourceSelector -> { iri: $2, named: true }
    ;

// [16]
SourceSelector
    : iri
    ;

// [17]
WhereClause
    : 'WHERE'? GroupGraphPattern -> { where: $2.patterns }
    ;

// [18]
SolutionModifier
    : GroupClause? SolutionModifierNoGroup -> extend($1, $2)
    ;

// TODO: See why this is necessary rather than just existing in [18]
SolutionModifierNoGroup
    : HavingClause? OrderClause? LimitOffsetClauses? -> extend($1, $2, $3)
    ;

// [19]
GroupClause
    : 'GROUP' 'BY' GroupCondition+ -> { group: $3 }
    ;

// [20]
GroupCondition
    : BuiltInCall -> expression($1)
    | FunctionCall -> expression($1)
    | '(' Expression ')' -> expression($2)
    | '(' Expression 'AS' Var ')' -> expression($2, { variable: $4 })
    | Var -> expression($1)
    ;

// [21]
HavingClause
    : 'HAVING' HavingCondition+ -> { having: $2 }
    ;

// [22]
HavingCondition
    : Constraint
    ;

// [23]
OrderClause
    : 'ORDER' 'BY' OrderCondition+ -> { order: $3 }
    ;

// [24]
OrderCondition
    : 'ASC'  BrackettedExpression -> expression($2)
    | 'DESC' BrackettedExpression -> expression($2, { descending: true })
    | Constraint -> expression($1)
    | Var -> expression($1)
    ;

// [25]
LimitOffsetClauses
    : LimitClause -> { limit: $1 }
    | OffsetClause -> { offset: $2 }
    | LimitClause OffsetClause -> { limit: $1, offset: $2 }
    | OffsetClause LimitClause -> { limit: $2, offset: $1 }
    ;

// [26]
LimitClause
    : 'LIMIT' INTEGER -> toInt($2)
    ;

// [27]
OffsetClause
    : 'OFFSET' INTEGER -> toInt($2)
    ;

// [28]
// TODO: See why we have InlineData rather than data block here
// TODO: See why it is not all optional
// TODO: Double check this
ValuesClause
    : 'VALUES' InlineData -> { type: 'values', values: $2 }
    ;

InlineData
    : VAR '{' DataBlockValue* '}' -> $3.map(v => ({ [$1]: v }))
    | NIL '{' NIL* '}' -> $3.map(() => ({}))
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

DataBlockValueList
    : '(' DataBlockValue+ ')' -> $2
    ;

// [29]
// TODO: Establish why this is totally different to the published grammar
Update
    : (Update1 ';' Prologue)* Update1 (';' Prologue)? -> { type: 'update', updates: appendTo($1, $2) }
    ;

// [30]
Update1
    : Load
    | ClearOrDrop
    | AddOrMoveOrCopy
    | Create
    | InsertData
    | DeleteData
    | DeleteWhere
    | Modify
    ;


// [31]
// TODO: See if into graph clause is needed
Load
    : 'LOAD' 'SILENT'? iri IntoGraphClause? -> extend({ type: 'load', silent: !!$2, source: $3 }, $4 && { destination: $4 })
    ;

IntoGraphClause
    : 'INTO' GraphRef -> $2
    ;

// [32]-[33]
ClearOrDrop
    : ( 'CLEAR' | 'DROP' ) 'SILENT'? GraphRefAll -> { type: lowercase($1), silent: !!$2, graph: $3 }
    ;


// [34]
Create
    : 'CREATE' 'SILENT'? GraphRef -> { type: 'create', silent: !!$2, graph: { type: 'graph', name: $3 } }
    ;

// [35]-[37]
AddOrMoveOrCopy
    : ( 'ADD' | 'MOVE' | 'COPY' ) 'SILENT'? GraphOrDefault 'TO' GraphOrDefault -> { type: lowercase($1), silent: !!$2, source: $3, destination: $5 }
    ;

// [38]
InsertData
    : 'INSERTDATA' QuadPattern -> { updateType: 'insert', insert: ensureNoVariables($2) }
    ;

// [39]
DeleteData
    : 'DELETEDATA' QuadPattern -> { updateType: 'delete', delete: ensureNoBnodes(ensureNoVariables($2)) }
    ;

// [40]
DeleteWhere
    : 'DELETEWHERE' QuadPattern -> { updateType: 'deletewhere', delete: ensureNoBnodes($2) }
    ;

// [41]
Modify
    : WithClause? InsertDeleteClause UsingClause* 'WHERE' GroupGraphPattern -> { updateType: 'insertdelete', ...$1, ...$2, ...groupDatasets($3, 'using'), where: $5.patterns }
    ;

InsertDeleteClause
    : DeleteClause InsertClause? -> { delete: $1, insert: $2 || [] }
    | InsertClause -> { delete: [], insert: $1 }
    ;

// [42]
DeleteClause
    : 'DELETE' QuadPattern -> ensureNoBnodes($2)
    ;

// [43]
InsertClause
    : 'INSERT' QuadPattern -> $2
    ;

// [44]
UsingClause
    : 'USING' 'NAMED'? iri -> { iri: $3, named: !!$2 }
    ;

WithClause
    : 'WITH' iri -> { graph: $2 }
    ;

// [45]
GraphOrDefault
    : 'DEFAULT' -> { type: 'graph', default: true }
    | 'GRAPH'? iri -> { type: 'graph', name: $2 }
    ;

// [46]
GraphRef
    : 'GRAPH' iri -> $2
    ;

// [47]
GraphRefAll
    : GraphRef -> { type: 'graph', name: $1 }
    | ( 'DEFAULT' | 'NAMED' | 'ALL' ) -> { [lowercase($1)]: true }
    ;

// [48]
QuadPattern
    : QuadBraces
    ; 

// [49]
QuadData
    : QuadBraces
    ;


// [48]
QuadPattern
    : '{' Quads '}' -> $2
    ; 

// [49]
QuadData
    : '{' Quads '}' -> $2
    ;

// [50]
Quads
    : TriplesTemplate? QuadsNotTriples* -> $1 ? unionAll($2, [$1]) : unionAll($2)
    // TODO: Actually use this grammar (which *is* different)
    // it seems like the problem comes down to TriplesTemplate not being correct
    // : TriplesTemplate? ( QuadsNotTriples "."? TriplesTemplate? ) *
    ;

// [51]
QuadsNotTriples
// TODO Fix this - it is actually the definition for quad
    : 'GRAPH' VarOrIri '{' TriplesTemplate? '}' '.'? TriplesTemplate?
    {
      var graph = extend($4 || { triples: [] }, { type: 'graph', name: $2 });
      $$ = $7 ? [graph, $7] : [graph];
    }
    ;

// [52]
// TODO: See why this is not identical to the grammar
TriplesTemplate
    : (TriplesSameSubject '.')* TriplesSameSubject '.'? -> { type: 'bgp', triples: unionAll($1, [$2]) }
    ;

// [53]
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

// [54]
GroupGraphPatternSub
    : TriplesBlock? GroupGraphPatternSubTail* -> $1 ? unionAll([$1], $2) : unionAll($2)
    ;

GroupGraphPatternSubTail
    : GraphPatternNotTriples '.'? TriplesBlock? -> $3 ? [$1, $3] : $1
    ;

// [55]
// TODO: See why this is not identical to the grammar
TriplesBlock
    : (TriplesSameSubjectPath '.')* TriplesSameSubjectPath '.'? -> { type: 'bgp', triples: unionAll($1, [$2]) }
    ;

// [56]
// TODO: Use this
// GraphPatternNotTriples
//     : GroupOrUnionGraphPattern
//     | OptionalGraphPattern
//     | MinusGraphPattern
//     | GraphGraphPattern
//     | ServiceGraphPattern
//     | Filter
//     | Bind
//     | InlineData
//     ;

GraphPatternNotTriples
    : GroupOrUnionGraphPattern
    | OptionalGraphPattern
    | MinusGraphPattern
    | GraphGraphPattern
    | ServiceGraphPattern
    | Filter
    | Bind
    // TODO: See what covers this (it *might* be subsumed by Bind with the renewed definition of experession)
    | 'BIND' '(' VarTriple 'AS' Var ')' -> ensureSparqlStar({ type: 'bind', variable: $5, expression: $3 })
    | ValuesClause
    ;


// [57]
OptionalGraphPattern
    : 'OPTIONAL' GroupGraphPattern -> extend($2, { type: 'optional' })
    ;


// [58]
GraphGraphPattern
    : 'GRAPH' VarOrIri GroupGraphPattern -> extend($3, { type: 'graph', name: $2 })
    ;

// [59]
ServiceGraphPattern
    : 'SERVICE' 'SILENT'? VarOrIri GroupGraphPattern -> extend($4, { type: 'service', name: $3, silent: !!$2 })
    ;

// [60]
Bind
    : 'BIND' '(' Expression 'AS' Var ')' -> { type: 'bind', variable: $5, expression: $3 }
    ;

// [61]
// TODO: Handle conflict with the other inlineData
// TODO: See why this was named valuesClause rather than DataBlock
InlineData
    : 'VALUES' DataBlock -> { type: 'values', values: $2 }
    ;

// [62]
DataBlock
    : InlineDataOneVar
    | InlineDataFull
    ;

// [63]
InlineDataOneVar
    : VAR '{' DataBlockValue* '}' -> $3.map(v => ({ [$1]: v }))
    ;


// [64]
InlineDataFull
    : NIL '{' NIL* '}' -> $3.map(() => ({}))
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

// [65]
DataBlockValue
    : iri
    | Literal
    // @see https://w3c.github.io/rdf-star/cg-spec/editors_draft.html#sparql-star-grammar
    | QuotedTriple -> ensureSparqlStar($1)
    | 'UNDEF' -> undefined
    ;

// [66]
MinusGraphPattern
    : 'MINUS' GroupGraphPattern -> extend($2, { type: 'minus' })
    ;

// [67]
GroupOrUnionGraphPattern
    : ( GroupGraphPattern 'UNION' )* GroupGraphPattern -> $1.length ? { type: 'union', patterns: unionAll($1.map(degroupSingle), [degroupSingle($2)]) } : $2
    ;

// [68]
Filter
    : 'FILTER' Constraint -> { type: 'filter', expression: $2 }
    ;

// [69]
Constraint
    : BrackettedExpression
    | BuiltInCall
    | FunctionCall
    ;

// [70]
FunctionCall
    : iri ArgList -> { ...$2, function: $1 }
    ;

// [71]
ArgList
    : NIL -> { type: 'functionCall', args: [] }
    | '(' 'DISTINCT'? ( Expression ',' )* Expression ')' -> { type: 'functionCall', args: appendTo($3, $4), distinct: !!$2 }
    ;

// [72]
ExpressionList
    : NIL -> []
    | '(' ( Expression ',' )* Expression ')' -> appendTo($2, $3)
    ;

// [73]
ConstructTemplate
    : '{' ConstructTriples? '}' -> $2
    ;

// [74]
// TODO: See if there is a reason for using this
// representation rather than the grammar representation
ConstructTriples
    : (TriplesSameSubject '.')* TriplesSameSubject '.'? -> unionAll($1, [$2])
    ;

// [75]
TriplesSameSubject
    : VarOrTermOrQuotedTP PropertyListNotEmpty -> applyAnnotations($2.map(t => extend(triple($1), t)))
    | TriplesNode PropertyList -> applyAnnotations(appendAllTo($2.map(t => extend(triple($1.entity), t)), $1.triples)) /* the subject is a blank node, possibly with more triples */
    ;

// [76]
PropertyList
    : PropertyListNotEmpty?
    ;

// [77]
PropertyListNotEmpty
    : VerbObjectList ( SemiOptionalVerbObjectList )* -> unionAll([$1], $2)
    ;

SemiOptionalVerbObjectList
    : ';' VerbObjectList? -> unionAll($2)
    ;
VerbObjectList
    : Verb ObjectList -> objectListToTriples($1, $2)
    ;

// [78]
Verb
    : VarOrIri
    | 'a' -> Parser.factory.namedNode(RDF_TYPE)
    ;

// [79]
ObjectList
    : (Object ',')* Object -> appendTo($1, $2)
    ;

// [80]
Object
    // TODO: Work out what to *actually* do with the AnnotationPattern
    // TODO: Then add tests
    // TODO: Probably also ensureSParqlStar
    : GraphNode AnnotationPattern? -> $2 ? { annotation: $2, object: $1 } : $1
    ;

// [81]
TriplesSameSubjectPath
    // : (VarOrTerm | VarTriple) PropertyListPathNotEmpty -> $2.map(function (t) { return extend(triple($1), t); })
    // TODO!: Use this grammar instead
    : VarOrTermOrQuotedTP PropertyListPathNotEmpty -> applyAnnotations($2.map(t => extend(triple($1), t)))
    // TODO: See why this is optional since it is not in the grammar
    | TriplesNodePath PropertyListPathNotEmpty? -> !$2 ? $1.triples : applyAnnotations(appendAllTo($2.map(t => extend(triple($1.entity), t)), $1.triples)) /* the subject is a blank node, possibly with more triples */
    ;

// [82] Should be propertyListPath

// [83]
PropertyListPathNotEmpty
    : ( VerbPath | VerbSimple ) ObjectListPath PropertyListPathNotEmptyTail* -> objectListToTriples($1, $2, $3)
    ;

// TODO: Double check all of this
PropertyListPathNotEmptyTail
    // TODO: Double check this in particular
    : ';' -> []
    | ';' ( VerbPath | VerbSimple ) ObjectListPath -> objectListToTriples(toVar($2), $3)
    ;

// [84]
VerbPath
    : Path
    ;

// [85]
VerbSimple
    : Var
    ;

// [86]
ObjectListPath
    : (ObjectPath ',')* ObjectPath -> appendTo($1, $2)
    ;

// [87]
ObjectPath
    // TODO: Work out what to map this do
    : GraphNodePath AnnotationPatternPath? -> $2 ? { object: $1, annotation: $2 } : $1;
    ;

// [88]
Path
    : PathAlternative
    ;

// [89]
PathAlternative
    : ( PathSequence '|' )* PathSequence -> $1.length ? path('|',appendTo($1, $2)) : $2
    ;

// [90]
PathSequence
    : ( PathEltOrInverse '/' )* PathEltOrInverse -> $1.length ? path('/', appendTo($1, $2)) : $2
    ;

// [91]
PathElt
    : PathPrimary PathMod? -> $2 ? path($2, [$1]) : $1
    ;

// [92]
PathEltOrInverse
    : '^'? PathElt -> $1 ? path($1, [$2]) : $2;
    ;

// [93]
PathMod
    : '?'
    | '*'
    | '+'
    ;

// [94]
PathPrimary
    : IriOrA
    | '!' PathNegatedPropertySet -> path($1, [$2])
    | '(' Path ')' -> $2
    ;

// [95]
PathNegatedPropertySet
    : PathOneInPropertySet
    // TODO: See why nil is here (its not in the grammar)
    | NIL -> []
    | '(' ( PathOneInPropertySet '|' )* PathOneInPropertySet? ')' -> path('|', appendTo($2, $3))
    ;

// [96]
PathOneInPropertySet
    : IriOrA
    | '^' IriOrA -> path($1, [$2])
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

// [106]
VarOrTerm
    : Var
    // Was previously term
    | GraphTerm
    ;

// [107]
VarOrIri
    : Var
    | iri
    ;

// [108]
Var
    : VAR -> toVar($1)
    ;

// [109]
GraphTerm
    : iri
    | Literal
    | BlankNode
    // TODO: See if custom handling of NIL is needed here
    | NIL  -> Parser.factory.namedNode(RDF_NIL)
    ;

// [110]
Expression
    : ConditionalOrExpression
    ;

// [111]
ConditionalOrExpression
    : ConditionalAndExpression ConditionalOrExpressionTail* -> createOperationTree($1, $2)
    ;

ConditionalOrExpressionTail
    : '||' ConditionalAndExpression -> ['||', $2]
    ;

// [112]
ConditionalAndExpression
    : ValueLogical ConditionalAndExpressionTail* -> createOperationTree($1, $2)
    ;

ConditionalAndExpressionTail
    : '&&' ValueLogical -> ['&&', $2]
    ;

// [113]
ValueLogical
    : RelationalExpression
    ;

// [114]
RelationalExpression
    : NumericExpression
    // TODO: Fix missing pipe on sparql-star grammar page
    | NumericExpression ( '=' | '!=' | '<' | '>' | '<=' | '>=' ) AdditiveExpression -> operation($2, [$1, $3])
    | NumericExpression 'NOT'? 'IN' ExpressionList -> operation($2 ? 'notin' : 'in', [$1, $4])
    ;

// [115]
NumericExpression
    : AdditiveExpression
    ;

// [116]
// TODO: Properly check these
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

// [117]
// TODO: properly check
MultiplicativeExpression
    : UnaryExpression MultiplicativeExpressionTail* -> createOperationTree($1, $2)
    ;
MultiplicativeExpressionTail
    : ( '*' | '/' ) UnaryExpression -> [$1, $2]
    ;

// [118]
// TODO: Properly check
UnaryExpression
    : '+' PrimaryExpression -> operation('UPLUS', [$2])
    | '!'  PrimaryExpression -> operation($1, [$2])
    | '-'  PrimaryExpression -> operation('UMINUS', [$2])
    | PrimaryExpression -> $1
    ;

// [119]
PrimaryExpression
    : BrackettedExpression
    | BuiltInCall
    // TODO: See why this is not iriOrFunctionCall
    | iri
    | FunctionCall
    | Literal
    | Var
    | ExprQuotedTP
    ;

// [120]
BrackettedExpression
    : '(' Expression ')' -> $2
    ;

// [121]
// TODO: Double check this
BuiltInCall
    : Aggregate
    | FUNC_ARITY0 NIL -> operation(lowercase($1))
    | FUNC_ARITY1 '(' Expression ')' -> operation(lowercase($1), [$3])
    | FUNC_ARITY2 '(' Expression ',' Expression ')' -> operation(lowercase($1), [$3, $5])
    | FUNC_ARITY3 '(' Expression ',' Expression ',' Expression ')' -> operation(lowercase($1), [$3, $5, $7])
    // [122], [123], [124]
    // TODO: Fix this - it is technically incorrect as 'SUBSTR' | 'REGEX' | 'REPLACE' are only allowed 2-3 args
    // as opposed to an aribtrary number of args which this allows
    | ( 'CONCAT' | 'COALESCE' | 'SUBSTR' | 'REGEX' | 'REPLACE' ) ExpressionList -> operation(lowercase($1), $2)
    | 'BOUND' '(' VAR ')' -> operation('bound', [toVar($3)])
    | 'BNODE' NIL -> operation($1, [])
    | 'BNODE' '(' Expression ')' -> operation($1, [$3])
    // [125], [126]
    | 'NOT'? 'EXISTS' GroupGraphPattern -> operation($1 ? 'notexists' :'exists', [degroupSingle($3)])
    ;

// [127]
// TODO: Double check this
Aggregate
    : 'COUNT' '(' 'DISTINCT'? ( '*' | Expression ) ')' -> expression($4, { type: 'aggregate', aggregation: lowercase($1), distinct: !!$3 })
    | FUNC_AGGREGATE '(' 'DISTINCT'? Expression ')' -> expression($4, { type: 'aggregate', aggregation: lowercase($1), distinct: !!$3 })
    | 'GROUP_CONCAT' '(' 'DISTINCT'? Expression GroupConcatSeparator? ')'  -> expression($4, { type: 'aggregate', aggregation: lowercase($1), distinct: !!$3, separator: $5 || ' ' })
    ;

GroupConcatSeparator
    : ';' 'SEPARATOR' '=' String -> $4
    ;

// Summary of [129], [130] & [134]
Literal
    : RDFLiteral
    | NumericLiteral
    | BooleanLiteral
    ;

// [129]
RDFLiteral
    : String -> createTypedLiteral($1)
    | String LANGTAG  -> createLangLiteral($1, lowercase($2.substr(1)))
    | String '^^' iri -> createTypedLiteral($1, $3)
    ;

// [130]
NumericLiteral
    : NumericLiteralUnsigned
    | NumericLiteralPositive
    | NumericLiteralNegative
    ;

// [131]
NumericLiteralUnsigned
    : INTEGER -> createTypedLiteral($1, XSD_INTEGER)
    | DECIMAL -> createTypedLiteral($1, XSD_DECIMAL)
    | DOUBLE  -> createTypedLiteral(lowercase($1), XSD_DOUBLE)
    ;

// [132]
NumericLiteralPositive
    : INTEGER_POSITIVE -> createTypedLiteral($1.substr(1), XSD_INTEGER)
    | DECIMAL_POSITIVE -> createTypedLiteral($1.substr(1), XSD_DECIMAL)
    | DOUBLE_POSITIVE  -> createTypedLiteral($1.substr(1).toLowerCase(), XSD_DOUBLE)
    ;

// [133]
NumericLiteralNegative
    : INTEGER_NEGATIVE -> createTypedLiteral($1, XSD_INTEGER)
    | DECIMAL_NEGATIVE -> createTypedLiteral($1, XSD_DECIMAL)
    | DOUBLE_NEGATIVE  -> createTypedLiteral(lowercase($1), XSD_DOUBLE)
    ;

// [134]
BooleanLiteral
    : BOOLEAN -> createTypedLiteral($1.toLowerCase(), XSD_BOOLEAN)
    ;

// [135]
String
    : STRING_LITERAL1 -> unescapeString($1, 1)
    | STRING_LITERAL2 -> unescapeString($1, 1)
    | STRING_LITERAL_LONG1 -> unescapeString($1, 3)
    | STRING_LITERAL_LONG2 -> unescapeString($1, 3)
    ;

// [136]
iri
    : IRIREF -> Parser.factory.namedNode(resolveIRI($1))
    | PrefixedName
    ;

// [137]
PrefixedName
    : PNAME_LN
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

// [138]
BlankNode
    : BLANK_NODE_LABEL -> blank($1.replace(/^(_:)/,''));
    | ANON -> blank()
    ;

//
// Note [139] - [173] are grammar terms that are written above
//

// TODO: Make everthing here ensure sparqlStar

// [174]
QuotedTP
    : '<<' qtSubjectOrObject Verb qtSubjectOrObject '>>' -> ensureSparqlStar(nestedTriple($2, $3, $4))
    ;

// [175]
QuotedTriple
    : '<<'  DataValueTerm IriOrA DataValueTerm '>>' -> ensureSparqlStar(nestedTriple($2, $3, $4))
    ;

// [176]
qtSubjectOrObject
    : VarOrTerm
    | QuotedTP
    ;


// [177]
DataValueTerm
    : iri
    | Literal
    | QuotedTP
    ;

// [178]
VarOrTermOrQuotedTP
    : Var
    | GraphTerm
    | QuotedTP
    ;

// [179]
AnnotationPattern
    : '{|' PropertyListNotEmpty '|}' -> ensureSparqlStar($2)
    ;

// [180]
AnnotationPatternPath
    : '{|' PropertyListPathNotEmpty '|}' -> ensureSparqlStar($2)
    ;


// [181]
// TODO: Work out how nested graphs should be handled
ExprQuotedTP
    : '<<'  ExprVarOrTerm Verb ExprVarOrTerm '>>' -> ensureSparqlStar(nestedTriple($2, $3, $4))
    ;

// TODO: Re-enable
// [182]
// TODO: See if this should be overriding something else in the grammar
// ExprVarOrTerm
//     : Literal
//     | VarOrIri
// // TODO: See if this recursive reference is the cause of the compilation error.
//     | ExprQuotedTP
//     ;

// TODO: Remove these two to handle sparqlstar properly
VarTriple
    // TODO: Remove this - it is not valid SPARQLstar
    // : '<<' 'GRAPH' VarOrIri '{' (VarTriple | VarOrTerm) Verb (VarTriple | VarOrTerm) '}' '>>' -> ensureSparqlStar(Parser.factory.quad($5, $6, $7, $3))
    : '<<' (VarTriple | VarOrTerm) Verb (VarTriple | VarOrTerm) '>>' -> ensureSparqlStar(nestedTriple($2, $3, $4))
    ;



ConstTriple
    // TODO: Remove this - it is not valid sparql star
    // : '<<' 'GRAPH' VarOrIri '{' (ConstTriple | GraphTerm) Verb (ConstTriple | GraphTerm) '}' '>>' -> ensureSparqlStar(Parser.factory.quad($5, $6, $7, $3))
    : '<<' (ConstTriple | GraphTerm) Verb (ConstTriple | GraphTerm) '>>' -> ensureSparqlStar(nestedTriple($2, $3, $4))
    ;

// Utilities
IriOrA
    : iri -> $1
    | 'a' -> Parser.factory.namedNode(RDF_TYPE)
    ;

