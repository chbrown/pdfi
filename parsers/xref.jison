%lex

%%

/* this is much less strict than the actual spec, but enough to parse what we need */

"xref"    return 'HEADER';

\r\n      return 'EOL';
\n        return 'EOL';
\r        return 'EOL';

[0-9]+    return 'DIGITS'

[fn]      return 'INUSE';

[ \t]+    { /* ignore horizontal whitespace */ }

<<EOF>>  return 'EOF';


/lex

%start SECTION

%%

SECTION
    : HEADER EOL subsections EOF {
        return Array.prototype.concat.apply([], $3);
      }
    ;

SUBSECTION
    : integer integer EOL references {
        // check that the specified number of objects were actually found
        $$ = $4;
        if ($2 != $$.length) {
          var message = 'Expected the specified number of objects to be followed by that many objects. ' +
            'Instead, the subsection header specified ' + $2 + ' but only contained ' +
            $$.length + ' objects.';
          throw new Error(message);
        }
        // object_number
        for (var object_offset = 0; object_offset < $$.length; object_offset++) {
          $$[object_offset].object_number = $1 + object_offset;
        }
      }
    ;

subsections
    : SUBSECTION { $$ = [$1] }
    | subsections SUBSECTION { $$ = $1; $1.push($2) }
    ;

REFERENCE
    : integer integer INUSE EOL {
        $$ = { offset: $1, generation_number: $2, in_use: $3 == 'n' }
      }
    ;

references
    : REFERENCE { $$ = [$1] }
    | references REFERENCE { $$ = $1; $1.push($2) }
    ;

integer
    : DIGITS { $$ = parseInt($1, 10); }
    ;

