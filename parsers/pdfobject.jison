%lex
%x parens
%x stream
%x reference

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
[0-9]+\s+[0-9]+\s+"R" { this.pushState('reference'); this.unput(yytext); return 'STARTREFERENCE'; }
<reference>[0-9]+      { return 'DIGITS'; }
<reference>\s          { }
<reference>"R"         { this.popState(); return 'ENDREFERENCE'; }

[0-9]+"."[0-9]+ return 'DECIMAL'
[0-9]+          return 'DIGITS'

"true"          return 'BOOLEAN'
"false"         return 'BOOLEAN'

"<<"            return '<<'
">>"            return '>>'
"["             return '['
"]"             return ']'

[ \t\n\r]      { /* ignore whitespace */ }

"."             return '.'
"obj"           return 'obj'

"stream"(\r\n|\n)   { this.pushState('stream'); return 'STARTSTREAM'; }
<stream>"endstream" { this.popState(); return 'ENDSTREAM'; }
<stream>.+          { return 'BYTES'; }

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
    | ARRAY { console.log('array') }
    | DICTIONARY { console.log('dictionary') }
    | NAME { console.log('name') }
    | STREAM { console.log('stream') }
    ;

STREAM
    : DICTIONARY STARTSTREAM BYTES ENDSTREAM {
        $$ = { dictionary: $1, bytes: $3 }
      }
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
    : STARTREFERENCE integer integer ENDREFERENCE { $$ = { object_number: $2, generation_number: $3 } }
    ;

INDIRECTOBJECT
    : integer integer obj OBJECT {
        $$ = {
          object_number: $1,
          generation_number: $2,
          value: $4,
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
