%lex
%x parens

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
<parens>.     { return 'CHAR' }

[0-9]+          return 'DIGITS'

"true"          return 'BOOLEAN'
"false"         return 'BOOLEAN'

"<<"            return '<<'
">>"            return '>>'

[ \t\n\r]+      return 'SPACE'

"R"             return 'R'
"."             return '.'

<*><<EOF>>      return 'EOF'

/lex

%start OBJECT

%%

OBJECT
    : STRING { console.log('string'); return $1 }
    | NUMBER { console.log('number'); return $1 }
    | REFERENCE { console.log('reference'); return $1 }
    ;

STRING
    : HEXSTRING {
      /* handle implied final 0 (PDF32000_2008.pdf:16) */
      $$ = ($1.length % 2 == 0) ? $1.slice(1, -1) : $1.slice(1, -1) + '0' }
    | OPENPARENS chars CLOSEPARENS { $$ = $2.join("") }
    ;

REFERENCE
    : integer SPACE integer SPACE R { $$ = { object_number: $1, generation_number: $3 } }
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
    : DIGITS "." DIGITS { $$ = parseFloat($1 + $2 + $3); }
    ;

integer
    : DIGITS { $$ = parseInt($1, 10); }
    ;
