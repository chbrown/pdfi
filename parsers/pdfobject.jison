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
<parens>.     { return 'CHAR'; }

"/"[!-'*-.0-;=?-Z\\^-z|~]+ { return 'NAMESTRING'; }

/*[0-9]+[ \t]+[0-9]+[ \t]+"R" return 'INDIRECT'; // not the best way */

[0-9]+"."[0-9]+ return 'DECIMAL'
[0-9]+          return 'DIGITS'

"true"          return 'BOOLEAN'
"false"         return 'BOOLEAN'

"<<"[ \t\n\r]*  return '<<'
[ \t\n\r]*">>"  return '>>'
"["[ \t\n\r]*   return '['
[ \t\n\r]*"]"   return ']'

[ \t\n\r]+      return 'SPACE'

"R"             return 'R'
"."             return '.'
"obj"           return 'obj'

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
    ;

objects
    : OBJECT { $$ = [$1] }
    | objects OBJECT { $$ = $1; $1.push($2) }
    | objects SPACE OBJECT { $$ = $1; $1.push($3) }
    ;


ARRAY
    : "[" objects "]" { $$ = $2; }
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

INDIRECTOBJECT
    : integer SPACE integer SPACE obj SPACE OBJECT {
        $$ = {
          object_number: $1,
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
    : NAME OBJECT       { $$ = {}; $$[$1] = $2; } }
    | NAME SPACE OBJECT { $$ = {}; $$[$1] = $3; } }
    | keyvaluepairs NAME OBJECT       { $$ = $1; $1[$2] = $3; }
    | keyvaluepairs NAME SPACE OBJECT { $$ = $1; $1[$2] = $4; }
    | keyvaluepairs SPACE NAME OBJECT       { $$ = $1; $1[$3] = $4; }
    | keyvaluepairs SPACE NAME SPACE OBJECT { $$ = $1; $1[$3] = $5; }
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
