%lex
%x parens
%x reference
%x indirect

%%

"<"[A-Fa-f0-9]+">" return 'HEXSTRING'

"("           { this.pushState('parens'); return 'OPENPARENS'; }
<parens>"("   { this.pushState('parens'); return 'CHAR'; }
<parens>")"   {
                this.popState();
                // if we just popped all the way out of a parens state stack,
                // return CLOSEPARENS; else return CHAR
                return (this.topState() == 'INITIAL') ? 'CLOSEPARENS' : 'CHAR';
              }
<parens>.     { return 'CHAR'; }

"/"[!-'*-.0-;=?-Z\\^-z|~]+ { return 'NAMESTRING'; }

/* not sure if there's a better way to avoid conflicts with plain integers */
[0-9]+\s+[0-9]+\s+"R"   { this.pushState('reference'); this.unput(yytext); return 'STARTREFERENCE'; }
<reference>[0-9]+       { return 'DIGITS'; }
<reference>\s+          { }
<reference>"R"          { this.popState(); return 'ENDREFERENCE'; }

[0-9]+\s+[0-9]+\s+"obj" { this.pushState('indirect'); this.unput(yytext); return 'START_INDIRECT_OBJECT_IDENTIFIER'; }
<indirect>[0-9]+        { return 'DIGITS'; }
<indirect>\s+           { }
<indirect>"obj"         { this.popState(); return 'START_INDIRECT_OBJECT'; }
"endobj"        return 'END_INDIRECT_OBJECT'

[0-9]+"."[0-9]+ return 'DECIMAL'
[0-9]+          return 'DIGITS'

"true"          return 'TRUE'
"false"         return 'FALSE'

"<<"            return '<<'
">>"            return '>>'
"["             return '['
"]"             return ']'

\s+             { /* ignore whitespace */ }

<*><<EOF>>      return 'EOF'

/lex

%start BODY

%%

BODY
    : OBJECT EOF { return $1 }
    ;

OBJECT
    : STRING { console.log('string') }
    | NUMBER { console.log('number') }
    | REFERENCE { console.log('reference') }
    | BOOLEAN { console.log('boolean') }
    | ARRAY { console.log('array') }
    | DICTIONARY { console.log('dictionary') }
    | NAME { console.log('name') }
    | INDIRECT_OBJECT { console.log('indirect_object') }
    ;

objects
    : OBJECT { $$ = [$1] }
    | objects OBJECT { $$ = $1; $1.push($2) }
    ;


ARRAY
    : "[" objects "]" { $$ = $2; }
    | "[" "]" { $$ = []; }
    ;


STRING
    : HEXSTRING {
        /* handle implied final 0 (PDF32000_2008.pdf:16)
           by adding 0 character to end of odd-length strings */
        $$ = ($1.length % 2 == 0) ? $1.slice(1, -1) : $1.slice(1, -1) + '0';
        $$ = $$.match(/.{2}/g).map(function(pair) { return parseInt(pair, 16); });
      }
    | OPENPARENS chars CLOSEPARENS { $$ = $2.join("") }
    ;

REFERENCE
    : STARTREFERENCE integer integer ENDREFERENCE {
        $$ = {
          object_number: $2,
          generation_number: $3,
        }
      }
    ;

INDIRECT_OBJECT
    : START_INDIRECT_OBJECT_IDENTIFIER integer integer START_INDIRECT_OBJECT OBJECT END_INDIRECT_OBJECT {
        $$ = {
          object_number: $2,
          generation_number: $3,
          value: $5,
        }
      }
    ;

NAME
    : NAMESTRING { $$ = $1.slice(1) }
    ;

DICTIONARY
    : "<<" keyvaluepairs ">>" { $$ = $2 }
    ;

keyvaluepairs
    : NAME OBJECT                { $$ = {}; $$[$1] = $2; }
    | keyvaluepairs NAME OBJECT  { $$ = $1; $1[$2] = $3; }
    ;

chars
    : CHAR { $$ = [$1] }
    | chars CHAR { $$ = $1; $1.push($2) }
    ;

NUMBER
    : float
    | integer
    ;

float
    : DECIMAL { $$ = parseFloat($1); }
    ;

integer
    : DIGITS { $$ = parseInt($1, 10); }
    ;

BOOLEAN
    : TRUE { $$ = true; }
    | FALSE { $$ = false; }
    ;
