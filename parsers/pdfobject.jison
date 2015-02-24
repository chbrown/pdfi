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
    : START_REFERENCE integer integer END_REFERENCE {
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

integer
    : DIGITS { $$ = parseInt($1, 10); }
    ;

BOOLEAN
    : TRUE { $$ = true; }
    | FALSE { $$ = false; }
    ;
