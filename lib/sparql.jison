%{
  var RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';

  var prefixes;

  function toIRI(iri) {
    return iri.substring(1, iri.length - 1);
  }

  function extend(base) {
    if (!base) base = {};
    for (var i = 1, l = arguments.length; arg = arguments[i] || {}, i < l; i++)
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
    return { type: 'operation', operator: operatorName, args: args };
  }

  function expression(expr, attr) {
    var expression = { expression: expr };
    if (attr)
      for (var a in attr)
        expression[a] = attr[a];
    return expression;
  }

  function toInt(string) {
    return parseInt(string, 10);
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
ECHAR                 "\\"[tbnrf\\\"']
NIL                   "("{WS}*")"
WS                    \u0020|\u0009|\u000D|\u000A
ANON                  "["{WS}*"]"
PN_CHARS_BASE         [A-Z]|[a-z]|[\u00C0-\u00D6]|[\u00D8-\u00F6]|[\u00F8-\u02FF]|[\u0370-\u037D]|[\u037F-\u1FFF]|[\u200C-\u200D]|[\u2070-\u218F]|[\u2C00-\u2FEF]|[\u3001-\uD7FF]|[\uF900-\uFDCF]|[\uFDF0-\uFFFD]|[\uD800-\uDB7F][\uDC00-\uDFFF]
PN_CHARS_U            {PN_CHARS_BASE}|"_"
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
      return $1;
    }
    ;
Query
    : Prologue ( SelectQuery | ConstructQuery | DescribeQuery | AskQuery ) ValuesClause -> extend({ type: 'query', prefixes: prefixes || {} }, $2)
    ;
UpdateUnit
    : Update
    ;
Prologue
    : ( BaseDecl | PrefixDecl )*
    ;
BaseDecl
    : 'BASE' IRIREF -> { type: 'base', iri: toIRI($2) }
    ;
PrefixDecl
    : 'PREFIX' PNAME_NS IRIREF
    {
      if (!prefixes) prefixes = {};
      $2 = $2.substr(0, $2.length - 1);
      $3 = toIRI($3);
      prefixes[$2] = $3;
    }
    ;
SelectQuery
    : SelectClause DatasetClause* WhereClause SolutionModifier -> extend($1, $3, $4)
    ;
SubSelect
    : SelectClause WhereClause SolutionModifier ValuesClause
    ;
SelectClause
    : 'SELECT' ( 'DISTINCT' | 'REDUCED' )? ( SelectClauseItem+ | '*' ) -> { queryType: 'SELECT', variables: $3 === '*' ? ['*'] : $3 }
    ;
SelectClauseItem
    : VAR
    | '(' Expression 'AS' VAR ')'
    ;
ConstructQuery
    : 'CONSTRUCT' ConstructTemplate DatasetClause* WhereClause SolutionModifier -> extend({ queryType: 'CONSTRUCT', template: $2 }, $4, $5)
    | 'CONSTRUCT' DatasetClause* 'WHERE' '{' TriplesTemplate? '}' SolutionModifier
    ;
DescribeQuery
    : 'DESCRIBE' ( VarOrIri+ | '*' ) DatasetClause* WhereClause? SolutionModifier
    ;
AskQuery
    : 'ASK' DatasetClause* WhereClause SolutionModifier
    ;
DatasetClause
    : 'FROM' 'NAMED'? iri
    ;
WhereClause
    : 'WHERE'? GroupGraphPattern -> { where: $2 }
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
    | '(' Expression 'AS' VAR ')' -> expression($2, { variable: $4 })
    | VAR -> expression($1)
    ;
HavingClause
    : 'HAVING' Constraint+ -> { having: $2 }
    ;
OrderClause
    : 'ORDER' 'BY' OrderCondition+ -> { order: $3 }
    ;
OrderCondition
    : 'ASC'  BrackettedExpression -> expression($1)
    | 'DESC' BrackettedExpression -> expression($1, { descending: true })
    | Constraint -> expression($1)
    | VAR -> expression($1)
    ;
LimitOffsetClauses
    : 'LIMIT'  INTEGER -> { limit:  toInt($2) }
    | 'OFFSET' INTEGER -> { offset: toInt($2) }
    | 'LIMIT'  INTEGER 'OFFSET' INTEGER -> { limit: toInt($2), offset: toInt($4) }
    | 'OFFSET' INTEGER 'LIMIT'  INTEGER -> { limit: toInt($4), offset: toInt($2) }
    ;
ValuesClause
    : ( 'VALUES' DataBlock )?
    ;
Update
    : Prologue ( Update1 ( ';' Update )? )?
    ;
Update1
    : Load
    | Clear
    | Drop
    | Add
    | Move
    | Copy
    | Create
    | InsertData
    | DeleteData
    | DeleteWhere
    | Modify
    ;
Load
    : 'LOAD' 'SILENT'? iri ( 'INTO' GraphRef )?
    ;
Clear
    : 'CLEAR' 'SILENT'? GraphRefAll
    ;
Drop
    : 'DROP' 'SILENT'? GraphRefAll
    ;
Create
    : 'CREATE' 'SILENT'? GraphRef
    ;
Add
    : 'ADD' 'SILENT'? GraphOrDefault 'TO' GraphOrDefault
    ;
Move
    : 'MOVE' 'SILENT'? GraphOrDefault 'TO' GraphOrDefault
    ;
Copy
    : 'COPY' 'SILENT'? GraphOrDefault 'TO' GraphOrDefault
    ;
InsertData
    : 'INSERT DATA' QuadData
    ;
DeleteData
    : 'DELETE DATA' QuadData
    ;
DeleteWhere
    : 'DELETE WHERE' QuadPattern
    ;
Modify
    : ( 'WITH' iri )? ( DeleteClause InsertClause? | InsertClause ) UsingClause* 'WHERE' GroupGraphPattern
    ;
DeleteClause
    : 'DELETE' QuadPattern
    ;
InsertClause
    : 'INSERT' QuadPattern
    ;
UsingClause
    : 'USING' ( iri
    | 'NAMED' iri )
    ;
GraphOrDefault
    : 'DEFAULT'
    | 'GRAPH'? iri
    ;
GraphRef
    : 'GRAPH' iri
    ;
GraphRefAll
    : GraphRef
    | 'DEFAULT'
    | 'NAMED'
    | 'ALL'
    ;
QuadPattern
    : '{' Quads '}'
    ;
QuadData
    : '{' Quads '}'
    ;
Quads
    : TriplesTemplate? ( QuadsNotTriples '.'? TriplesTemplate? )*
    ;
QuadsNotTriples
    : 'GRAPH' VarOrIri '{' TriplesTemplate? '}'
    ;
TriplesTemplate
    : TriplesSameSubject ( '.' TriplesTemplate? )?
    ;
GroupGraphPattern
    : '{' ( SubSelect | GroupGraphPatternSub ) '}' -> $2
    ;
GroupGraphPatternSub
    : TriplesBlock? GroupGraphPatternSubTail* -> $1 ? [{ type: 'bgp', triples: $1 }].concat($2) : $2
    ;
GroupGraphPatternSubTail
    : GraphPatternNotTriples '.'? TriplesBlock?
    ;
TriplesBlock
    : (TriplesSameSubjectPath '.')* TriplesSameSubjectPath '.'? -> unionAll($1, [$2])
    ;
GraphPatternNotTriples
    : GroupOrUnionGraphPattern
    | OptionalGraphPattern
    | MinusGraphPattern
    | GraphGraphPattern
    | ServiceGraphPattern
    | Filter
    | Bind
    | InlineData
    ;
OptionalGraphPattern
    : 'OPTIONAL' GroupGraphPattern
    ;
GraphGraphPattern
    : 'GRAPH' VarOrIri GroupGraphPattern
    ;
ServiceGraphPattern
    : 'SERVICE' 'SILENT'? VarOrIri GroupGraphPattern
    ;
Bind
    : 'BIND' '(' Expression 'AS' VAR ')'
    ;
InlineData
    : 'VALUES' DataBlock
    ;
DataBlock
    : InlineDataOneVar
    | InlineDataFull
    ;
InlineDataOneVar
    : VAR '{' DataBlockValue* '}'
    ;
InlineDataFull
    : ( NIL | '(' VAR* ')' ) '{' ( '(' DataBlockValue* ')' | NIL )* '}'
    ;
DataBlockValue
    : iri
    | RDFLiteral
    | NumericLiteral
    | BooleanLiteral
    | 'UNDEF'
    ;
MinusGraphPattern
    : 'MINUS' GroupGraphPattern
    ;
GroupOrUnionGraphPattern
    : GroupGraphPattern ( 'UNION' GroupGraphPattern )*
    ;
Filter
    : 'FILTER' Constraint -> { type: 'filter', expression: $2 }
    ;
Constraint
    : BrackettedExpression
    | BuiltInCall
    | FunctionCall
    ;
FunctionCall
    : iri ArgList
    ;
ArgList
    : NIL | '(' 'DISTINCT'? Expression ( ',' Expression )* ')'
    ;
ExpressionList
    : NIL
    | '(' Expression ( ',' Expression )* ')'
    ;
ConstructTemplate
    : '{' ConstructTriples? '}' -> $2
    ;
ConstructTriples
    : TriplesSameSubject
    | TriplesSameSubject '.' ConstructTriples? -> $3 ? $1.join.apply($1, $3) : $1
    ;
TriplesSameSubject
    : VarOrTerm PropertyListNotEmpty -> $2.map(function (t) { return extend({ subject: $1 }, t); })
    | TriplesNode PropertyList
    ;
PropertyList
    : PropertyListNotEmpty?
    ;
PropertyListNotEmpty
    : ( VerbObjectList ';'+ )* VerbObjectList -> unionAll($1, [$2])
    ;
VerbObjectList
    : Verb ObjectList -> $2.map(function (object) { return { predicate: $1, object: object }; })
    ;
Verb
    : VarOrIri
    | 'a' -> RDF_TYPE
    ;
ObjectList
    : (GraphNode ',')* GraphNode -> $1.concat($2)
    ;
TriplesSameSubjectPath
    : VarOrTerm PropertyListPathNotEmpty -> $2.map(function (t) { return extend({ subject: $1 }, t); })
    | TriplesNodePath PropertyListPath
    ;
PropertyListPath
    : PropertyListPathNotEmpty?
    ;
PropertyListPathNotEmpty
    : ( Path | VAR ) ObjectListPath PropertyListPathNotEmptyTail* -> unionAll([{ predicate: $1, object: $2}], $3)
    ;
PropertyListPathNotEmptyTail
    : ';' -> []
    | ';' ( Path | VAR ) ObjectList -> $3.map(function (object) { return { predicate: $2, object: object }; })
    ;
ObjectListPath
    : ( GraphNodePath ',' )* GraphNodePath -> $2
    ;
Path
    : ( PathSequence '|' )* PathSequence -> $2
    ;
PathSequence
    : ( PathEltOrInverse '/' )* PathEltOrInverse -> $2
    ;
PathElt
    : PathPrimary PathMod?
    ;
PathEltOrInverse
    : PathElt
    | '^' PathElt
    ;
PathMod
    : '?'
    | '*'
    | '+'
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
    : Collection
    | BlankNodePropertyList
    ;
BlankNodePropertyList
    : '[' PropertyListNotEmpty ']'
    ;
TriplesNodePath
    : CollectionPath
    | BlankNodePropertyListPath
    ;
BlankNodePropertyListPath
    : '[' PropertyListPathNotEmpty ']'
    ;
Collection
    : '(' GraphNode+ ')'
    ;
CollectionPath
    : '(' GraphNodePath+ ')'
    ;
GraphNode
    : VarOrTerm
    | TriplesNode
    ;
GraphNodePath
    : VarOrTerm
    | TriplesNodePath
    ;
VarOrTerm
    : VAR
    | iri
    | RDFLiteral
    | NumericLiteral
    | BooleanLiteral
    | BlankNode
    | NIL
    ;
VarOrIri
    : VAR
    | iri
    ;
Expression
    : ( ConditionalAndExpression '||' )* ConditionalAndExpression -> $1.length ? operation('OR', $1.concat([$2])) : $2
    ;
ConditionalAndExpression
    : ( RelationalExpression '&&' )* RelationalExpression -> $1.length ? operation('AND', $1.concat([$2])) : $2
    ;
RelationalExpression
    : AdditiveExpression
    | AdditiveExpression ( '=' | '!=' | '<' | '>' | '<=' | '>=' ) AdditiveExpression -> operation($2, [$1, $3])
    | AdditiveExpression 'NOT'? 'IN' ExpressionList
    ;
AdditiveExpression
    : MultiplicativeExpression AdditiveExpressionTail*
    ;
AdditiveExpressionTail
    : '+' MultiplicativeExpression
    | '-' MultiplicativeExpression
    | ( NumericLiteralPositive | NumericLiteralNegative ) ( ( '*' UnaryExpression ) | ( '/' UnaryExpression ) )*
    ;
MultiplicativeExpression
    : UnaryExpression MultiplicativeExpressionTail*
    ;
MultiplicativeExpressionTail
    : ( '*' | '/' ) UnaryExpression
    ;
UnaryExpression
    : '+'? PrimaryExpression -> $2
    | ( '!' | '-' ) PrimaryExpression -> operation($1 === '!' ? 'NOT' : 'NEGATE', [$2])
    ;
PrimaryExpression
    : BrackettedExpression
    | BuiltInCall
    | iriOrFunction
    | RDFLiteral
    | NumericLiteral
    | BooleanLiteral
    | VAR
    ;
BrackettedExpression
    : '(' Expression ')' -> $2
    ;
BuiltInCall
    : Aggregate
    | FUNC_ARITY0 NIL
    | FUNC_ARITY1 '(' Expression ')'
    | FUNC_ARITY2 '(' Expression ',' Expression ')'
    | 'IF' '(' Expression ',' Expression ',' Expression ')'
    | ( 'CONCAT' | 'COALESCE' ) ExpressionList
    | 'BOUND' '(' VAR ')'
    | 'BNODE' ( '(' Expression ')' | NIL )
    | ('SUBSTR'|'REGEX') '(' Expression ',' Expression ( ',' Expression )? ')'
    | 'REPLACE' '(' Expression ',' Expression ',' Expression ( ',' Expression )? ')'
    | 'NOT'? 'EXISTS' GroupGraphPattern
    ;
Aggregate
    : 'COUNT' '(' 'DISTINCT'? ( '*' | Expression ) ')'
    | FUNC_AGGREGATE '(' 'DISTINCT'? Expression ')'
    | 'GROUP_CONCAT' '(' 'DISTINCT'? Expression ( ';' 'SEPARATOR' '=' String )? ')'
    ;
iriOrFunction
    : iri ArgList?
    ;
RDFLiteral
    : String
    | String LANGTAG -> $1 + $2
    | String '^^' iri -> $1 + '^^' + $3
    ;
NumericLiteral
    : INTEGER
    | DECIMAL
    | DOUBLE
    | NumericLiteralPositive
    | NumericLiteralNegative
    ;
NumericLiteralPositive
    : INTEGER_POSITIVE
    | DECIMAL_POSITIVE
    | DOUBLE_POSITIVE
    ;
NumericLiteralNegative
    : INTEGER_NEGATIVE
    | DECIMAL_NEGATIVE
    | DOUBLE_NEGATIVE
    ;
BooleanLiteral
    : 'true'
    | 'false'
    ;
String
    : STRING_LITERAL1
    | STRING_LITERAL2
    | STRING_LITERAL_LONG1
    | STRING_LITERAL_LONG2
    ;
iri
    : IRIREF
    | PNAME_LN
    {
      var namePos = $1.indexOf(':'),
          prefix = $1.substr(0, namePos),
          expansion = prefixes[prefix];
      if (!expansion) throw new Error('Unknown prefix: ' + prefix);
      $$ = expansion + $1.substr(namePos + 1);
    }
    | PNAME_NS
    {
      $1 = $1.substr(0, $1.length - 1);
      $$ = prefixes[$1];
      if (!$$) throw new Error('Unknown prefix: ' + $1);
    }
    ;
BlankNode
    : BLANK_NODE_LABEL
    | ANON
    ;
