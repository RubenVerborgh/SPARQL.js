%{
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

  var prefixes, base = '', basePath = '', baseRoot = '';

  function appendTo(array, item) {
    return array.push(item), array;
  }

  function appendAllTo(array, items) {
    return array.push.apply(array, items), array;
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

  function extend(base) {
    if (!base) base = {};
    for (var i = 1, l = arguments.length, arg; i < l && (arg = arguments[i] || {}); i++)
      for (var name in arg)
        base[name] = arg[name];
    return base;
  }

  function unionAll() {
    var union = [];
    for (var i = 0, l = arguments.length; i < l; i++)
      union = union.concat.apply(union, arguments[i]);
    return union;
  }

  function operation(operatorName, args) {
    return { type: 'operation', operator: operatorName, args: args || [] };
  }

  function expression(expr, attr) {
    var expression = { expression: expr };
    if (attr)
      for (var a in attr)
        expression[a] = attr[a];
    return expression;
  }

  function flattenOperationList(initialExpression, operationList) {
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

  function toInt(string) {
    return parseInt(string, 10);
  }

  function degroupSingle(group) {
    return group.type === 'group' && group.patterns.length === 1 ? group.patterns[0] : group;
  }

  function createLiteral(value, type) {
    return '"' + value + '"^^' + type;
  }

  function triple(subject, predicate, object) {
    var triple = {};
    if (typeof subject   === 'string') triple.subject   = subject;
    if (typeof predicate === 'string') triple.predicate = predicate;
    if (typeof object    === 'string') triple.object    = object;
    return triple;
  }

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
%}

%lex

IRIREF                "<"([^<>\"\{\}\|\^`\\\u0000-\u0020])*">"
PNAME_NS              {PN_PREFIX}?":"
PNAME_LN              {PNAME_NS}{PN_LOCAL}
BLANK_NODE_LABEL      "_:"({PN_CHARS_U}|[0-9])(({PN_CHARS}|".")*{PN_CHARS})?
VAR                   [\?\$]{VARNAME}
LANGTAG               "@"[a-zA-Z]+("-"[a-zA-Z0-9]+)*
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
STRING_LITERAL1       "'"(([^\u0027\u005C\u000A\u000D])|{ECHAR})*"'"
STRING_LITERAL2       "\""(([^\u0022\u005C\u000A\u000D])|{ECHAR})*'"'
STRING_LITERAL_LONG1  "'''"(("'"|"''")?([^'\\]|{ECHAR}))*"'''"
STRING_LITERAL_LONG2  "\"\"\""(("\""|'""')?([^\"\\]|{ECHAR}))*'"""'
ECHAR                 "\\"[tbnrf\\\"']|"\\u"{HEX}{HEX}{HEX}{HEX}|"\\U"{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}
NIL                   "("{WS}*")"
WS                    \u0020|\u0009|\u000D|\u000A
ANON                  "["{WS}*"]"
PN_CHARS_BASE         [A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF]
PN_CHARS_U            (?:{PN_CHARS_BASE}|"_")
VARNAME               ({PN_CHARS_U}|[0-9])({PN_CHARS_U}|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040])*
PN_CHARS              {PN_CHARS_U}|"-"|[0-9]|\u00B7|[\u0300-\u036F]|[\u203F-\u2040]
PN_PREFIX             {PN_CHARS_BASE}(({PN_CHARS}|".")*{PN_CHARS})?
PN_LOCAL              ({PN_CHARS_U}|":"|[0-9]|{PLX})(({PN_CHARS}|"."|":"|{PLX})*({PN_CHARS}|":"|{PLX}))?
PLX                   {PERCENT}|{PN_LOCAL_ESC}
PERCENT               "%"{HEX}{HEX}
HEX                   [0-9]|[A-F]|[a-f]
PN_LOCAL_ESC          "\\"("_"|"~"|"."|"-"|"!"|"$"|"&"|"'"|"("|")"|"*"|"+"|","|";"|"="|"/"|"?"|"#"|"@"|"%")

%options flex case-insensitive

%%

\s+                      /* ignore */
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
"INSERT"\s+"DATA"        return 'INSERTDATA'
"DELETE"\s+"DATA"        return 'DELETEDATA'
"DELETE"\s+"WHERE"       return 'DELETEWHERE'
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
("RAND"|"NOW"|"UUID"|"STUUID") return 'FUNC_ARITY0'
("STR"|"LANG"|"DATATYPE"|"IRI"|"URI"|"ABS"|"CEIL"|"FLOOR"|"ROUND"|"STRLEN"|"UCASE"|"LCASE"|"ENCODE_FOR_URI"|"YEAR"|"MONTH"|"DAY"|"HOURS"|"MINUTES"|"SECONDS"|"TIMEZONE"|"TZ"|"MD5"|"SHA1"|"SHA256"|"SHA384"|"SHA512"|"isIRI"|"isURI"|"isBLANK"|"isLITERAL"|"isNUMERIC") return 'FUNC_ARITY1'
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
"true"                   return 'true'
"false"                  return 'false'
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

%start QueryUnit

%%

QueryUnit
    : Query EOF
    {
      prefixes = null;
      base = basePath = baseRoot = '';
      return $1;
    }
    ;
Query
    : Prologue ( SelectQuery | ConstructQuery | DescribeQuery | AskQuery ) ValuesClause? -> extend({ type: 'query', prefixes: prefixes || {} }, $2)
    ;
UpdateUnit
    : Update
    ;
Prologue
    : ( BaseDecl | PrefixDecl )*
    ;
BaseDecl
    : 'BASE' IRIREF
    {
      base = resolveIRI($2)
      basePath = base.replace(/[^\/]*$/, '');
      baseRoot = base.match(/^(?:[a-z]+:\/*)?[^\/]*/)[0];
    }
    ;
PrefixDecl
    : 'PREFIX' PNAME_NS IRIREF
    {
      if (!prefixes) prefixes = {};
      $2 = $2.substr(0, $2.length - 1);
      $3 = resolveIRI($3);
      prefixes[$2] = $3;
    }
    ;
SelectQuery
    : SelectClause DatasetClause* WhereClause SolutionModifier -> extend($1, groupDatasets($2), $3, $4)
    ;
SubSelect
    : SelectClause WhereClause SolutionModifier ValuesClause?
    ;
SelectClause
    : 'SELECT' ( 'DISTINCT' | 'REDUCED' )? ( SelectClauseItem+ | '*' ) -> extend({ queryType: 'SELECT', variables: $3 === '*' ? ['*'] : $3 }, $2 && ($1 = $2.toLowerCase(), $2 = {}, $2[$1] = true, $2))
    ;
SelectClauseItem
    : VAR -> toVar($1)
    | '(' Expression 'AS' VAR ')'
    ;
ConstructQuery
    : 'CONSTRUCT' ConstructTemplate DatasetClause* WhereClause SolutionModifier -> extend({ queryType: 'CONSTRUCT', template: $2 }, groupDatasets($3), $4, $5)
    | 'CONSTRUCT' DatasetClause* 'WHERE' '{' TriplesTemplate? '}' SolutionModifier -> extend({ queryType: 'CONSTRUCT', template: $5 || [] }, groupDatasets($2), { where: { type: 'bgp', triples: appendAllTo([], $5 || []) } }, $7)
    ;
DescribeQuery
    : 'DESCRIBE' ( (VAR | iri)+ | '*' ) DatasetClause* WhereClause? SolutionModifier -> extend({ queryType: 'DESCRIBE', variables: $2 === '*' ? ['*'] : $2.map(toVar) }, groupDatasets($3), $4, $5)
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
    : GroupClause? HavingClause? OrderClause? LimitOffsetClauses? -> extend($1, $2, $3, $4)
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
Update
    : Prologue ( Update1 ( ';' Update )? )?
    ;
Update1
    : 'LOAD' 'SILENT'? iri ( 'INTO' 'GRAPH' iri )?
    | 'CLEAR' 'SILENT'? GraphRefAll
    | 'DROP' 'SILENT'? GraphRefAll
    | 'ADD' 'SILENT'? GraphOrDefault 'TO' GraphOrDefault
    | 'MOVE' 'SILENT'? GraphOrDefault 'TO' GraphOrDefault
    | 'COPY' 'SILENT'? GraphOrDefault 'TO' GraphOrDefault
    | 'CREATE' 'SILENT'? 'GRAPH' iri
    | 'INSERT DATA' QuadPattern
    | 'DELETE DATA' QuadPattern
    | 'DELETE WHERE' QuadPattern
    | ( 'WITH' iri )? ( DeleteClause InsertClause? | InsertClause ) UsingClause* 'WHERE' GroupGraphPattern
    ;
DeleteClause
    : 'DELETE' QuadPattern
    ;
InsertClause
    : 'INSERT' QuadPattern
    ;
UsingClause
    : 'USING' 'NAMED'? iri
    ;
GraphOrDefault
    : 'DEFAULT'
    | 'GRAPH'? iri
    ;
GraphRefAll
    : 'GRAPH' iri
    | 'DEFAULT'
    | 'NAMED'
    | 'ALL'
    ;
QuadPattern
    : '{' TriplesTemplate? ( QuadsNotTriples '.'? TriplesTemplate? )* '}'
    ;
QuadsNotTriples
    : 'GRAPH' (VAR | iri) '{' TriplesTemplate? '}'
    ;
TriplesTemplate
    : (TriplesSameSubject '.')* TriplesSameSubject '.'? -> unionAll($1, [$2])
    ;
GroupGraphPattern
    : '{' ( SubSelect | GroupGraphPatternSub ) '}' -> { type: 'group', patterns: $2 }
    ;
GroupGraphPatternSub
    : TriplesBlock? GroupGraphPatternSubTail* -> $1 ? unionAll([$1], $2) : $2
    ;
GroupGraphPatternSubTail
    : GraphPatternNotTriples '.'? TriplesBlock? -> $3 ? [$1, $3] : $1
    ;
TriplesBlock
    : (TriplesSameSubjectPath '.')* TriplesSameSubjectPath '.'? -> { type: 'bgp', triples: unionAll($1, [$2]) }
    ;
GraphPatternNotTriples
    : ( GroupGraphPattern 'UNION' )* GroupGraphPattern -> $1.length ? { type: 'union', patterns: unionAll($1.map(degroupSingle), [degroupSingle($2)]) } : degroupSingle($2)
    | 'OPTIONAL' GroupGraphPattern -> extend($2, { type: 'optional' })
    | 'MINUS' GroupGraphPattern    -> extend($2, { type: 'minus' })
    | 'GRAPH' (VAR | iri) GroupGraphPattern -> extend($3, { type: 'graph', name: toVar($2) })
    | 'SERVICE' 'SILENT'? (VAR | iri) GroupGraphPattern -> extend($4, { type: 'service', silent: !!$2, name: toVar($3) })
    | 'FILTER' Constraint -> { type: 'filter', expression: $2 }
    | 'BIND' '(' Expression 'AS' VAR ')' -> { type: 'bind', variable: toVar($5), expression: $3 }
    | ValuesClause
    ;
InlineData
    : VAR '{' DataBlockValue* '}' -> { variable: toVar($1), values: $3 }
    | ( NIL | '(' VAR* ')' ) '{' ( '(' DataBlockValue* ')' | NIL )* '}'
    ;
DataBlockValue
    : iri
    | Literal
    | 'UNDEF'
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
    : VarOrTerm PropertyListNotEmpty -> $2.map(function (t) { return extend(triple($1), t); })
    | TriplesNode PropertyList -> appendAllTo($2.map(function (t) { return extend(triple($1.entity), t); }), $1.triples) /* the subject is a blank node, possibly with more triples */
    ;
PropertyList
    : PropertyListNotEmpty?
    ;
PropertyListNotEmpty
    : ( VerbObjectList ';'+ )* VerbObjectList -> unionAll($1, [$2])
    ;
VerbObjectList
    : Verb ObjectList -> objectListToTriples($1, $2)
    ;
Verb
    : VAR -> toVar($1)
    | iri
    | 'a' -> RDF_TYPE
    ;
ObjectList
    : (GraphNode ',')* GraphNode -> appendTo($1, $2)
    ;
TriplesSameSubjectPath
    : VarOrTerm PropertyListPathNotEmpty -> $2.map(function (t) { return extend(triple($1), t); })
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
    : ( PathSequence '|' )* PathSequence -> $2
    ;
PathSequence
    : ( PathEltOrInverse '/' )* PathEltOrInverse -> $2
    ;
PathElt
    : PathPrimary ( '?' | '*' | '+' )?
    ;
PathEltOrInverse
    : PathElt
    | '^' PathElt
    ;
PathPrimary
    : iri
    | 'a' -> RDF_TYPE
    | '!' PathNegatedPropertySet
    | '(' Path ')'
    ;
PathNegatedPropertySet
    : PathOneInPropertySet
    | '(' ( PathOneInPropertySet ( '|' PathOneInPropertySet )* )? ')'
    ;
PathOneInPropertySet
    : iri
    | 'a' -> RDF_type
    | '^' ( iri | 'a' )
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
    : VarOrTerm -> { entity: $1, triples: [] } /* for consistency with TriplesNode */
    | TriplesNode
    ;
GraphNodePath
    : VarOrTerm -> { entity: $1, triples: [] } /* for consistency with TriplesNodePath */
    | TriplesNodePath
    ;
VarOrTerm
    : VAR -> toVar($1)
    | iri
    | Literal
    | BLANK_NODE_LABEL
    | ANON -> blank()
    | NIL  -> RDF_NIL
    ;
Expression
    : ( ConditionalAndExpression '||' )* ConditionalAndExpression -> $1.length ? operation('||', appendTo($1, $2)) : $2
    ;
ConditionalAndExpression
    : ( RelationalExpression '&&' )* RelationalExpression -> $1.length ? operation('&&', appendTo($1, $2)) : $2
    ;
RelationalExpression
    : AdditiveExpression
    | AdditiveExpression ( '=' | '!=' | '<' | '>' | '<=' | '>=' ) AdditiveExpression -> operation($2, [$1, $3])
    | AdditiveExpression 'NOT'? 'IN' ExpressionList
    ;
AdditiveExpression
    : MultiplicativeExpression AdditiveExpressionTail* -> flattenOperationList($1, $2)
    ;
AdditiveExpressionTail
    : ( '+' | '-' ) MultiplicativeExpression -> [$1, $2]
    | NumericLiteralPositive MultiplicativeExpressionTail* -> ['+', flattenOperationList($1, $2)]
    | NumericLiteralNegative MultiplicativeExpressionTail* -> ['-', flattenOperationList($1.replace('-', ''), $2)]
    ;
MultiplicativeExpression
    : UnaryExpression MultiplicativeExpressionTail* -> flattenOperationList($1, $2)
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
    | FUNC_ARITY0 NIL -> operation($1.toLowerCase())
    | FUNC_ARITY1 '(' Expression ')' -> operation($1.toLowerCase(), [$3])
    | FUNC_ARITY2 '(' Expression ',' Expression ')' -> operation($1.toLowerCase(), [$3, $5])
    | 'IF' '(' Expression ',' Expression ',' Expression ')' -> operation($1.toLowerCase(), [$3, $5, $7])
    | ( 'CONCAT' | 'COALESCE' | 'SUBSTR' | 'REGEX' | 'REPLACE' ) ExpressionList -> operation($1.toLowerCase(), $2)
    | 'BOUND' '(' VAR ')' -> operation('bound', [toVar($3)])
    | 'BNODE' ( '(' Expression ')' | NIL )
    | 'NOT'? 'EXISTS' GroupGraphPattern
    ;
Aggregate
    : 'COUNT' '(' 'DISTINCT'? ( '*' | Expression ) ')'
    | FUNC_AGGREGATE '(' 'DISTINCT'? Expression ')'
    | 'GROUP_CONCAT' '(' 'DISTINCT'? Expression ( ';' 'SEPARATOR' '=' String )? ')'
    ;
Literal
    : String
    | String LANGTAG  -> $1 + $2.toLowerCase()
    | String '^^' iri -> $1 + '^^' + $3
    | INTEGER -> createLiteral($1, XSD_INTEGER)
    | DECIMAL -> createLiteral($1, XSD_DECIMAL)
    | DOUBLE  -> createLiteral($1.toLowerCase(), XSD_DOUBLE)
    | NumericLiteralPositive
    | NumericLiteralNegative
    | 'true'  -> XSD_TRUE
    | 'false' -> XSD_FALSE
    ;
String
    : STRING_LITERAL1 -> unescapeString($1, 1)
    | STRING_LITERAL2 -> unescapeString($1, 1)
    | STRING_LITERAL_LONG1 -> unescapeString($1, 3)
    | STRING_LITERAL_LONG2 -> unescapeString($1, 3)
    ;
NumericLiteralPositive
    : INTEGER_POSITIVE -> createLiteral($1.substr(1), XSD_INTEGER)
    | DECIMAL_POSITIVE -> createLiteral($1.substr(1), XSD_DECIMAL)
    | DOUBLE_POSITIVE  -> createLiteral($1.substr(1).toLowerCase(), XSD_DOUBLE)
    ;
NumericLiteralNegative
    : INTEGER_NEGATIVE -> createLiteral($1, XSD_INTEGER)
    | DECIMAL_NEGATIVE -> createLiteral($1, XSD_DECIMAL)
    | DOUBLE_NEGATIVE  -> createLiteral($1.toLowerCase(), XSD_DOUBLE)
    ;
iri
    : IRIREF -> resolveIRI($1)
    | PNAME_LN
    {
      var namePos = $1.indexOf(':'),
          prefix = $1.substr(0, namePos),
          expansion = prefixes[prefix];
      if (!expansion) throw new Error('Unknown prefix: ' + prefix);
      $$ = resolveIRI(expansion + $1.substr(namePos + 1));
    }
    | PNAME_NS
    {
      $1 = $1.substr(0, $1.length - 1);
      if (!($1 in prefixes)) throw new Error('Unknown prefix: ' + $1);
      $$ = resolveIRI(prefixes[$1]);
    }
    ;
