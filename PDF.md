## The PDF file format

The primary free version of the PDF specification: [PDF32000_2008.pdf](http://wwwimages.adobe.com/content/dam/Adobe/en/devnet/pdf/pdfs/PDF32000_2008.pdf)

The [GnuPDF Wiki](http://www.gnupdf.org/) seems to be another good resource, too. (E.g., [CCITT_Fax_Filter](http://www.gnupdf.org/CCITT_Fax_Filter).)

### A summary of the basic stuff

PDF includes eight basic types of objects: Boolean values, Integer and Real numbers, Strings, Names, Arrays, Dictionaries, Streams, and the null object.

**Boolean literals** appear as `true` and `false`.

**Number literals** are the usual. No scientific notation, though.

**Strings literals** are denoted by `(` and `)` delimiters, or as hexadecimal data with `<` and `>` delimiters. You can escape literal parentheses with the `\` character, which you can literally express as `\\`.
Lines in a string literal ending with `\` should ignore the subsequent line break.

    var hexadecimal_string = '7e19ea68d47cd58418bb9001776e808b';
    var bytes = hexadecimal_string.match(/\w\w/g).map(function(point) { return parseInt(point, 16); });
    var string = new Buffer(bytes).toString('utf8');

Delimiters:

( | 40  | 28  | 50  | LEFT PARENTHESIS
) | 41  | 29  | 51  | RIGHT PARENTHESIS
< | 60  | 3C  | 60  | LESS-THAN SIGN
> | 62  | 3E  | 62  | GREATER-THAN SIGN
[ | 91  | 5B  | 133 | LEFT SQUARE BRACKET
] | 93  | 5D  | 135 | RIGHT SQUARE BRACKET
{ | 123 | 7B  | 173 | LEFT CURLY BRACKET
} | 125 | 7D  | 175 | RIGHT CURLY BRACKET
/ | 47  | 2F  | 57  | SOLIDUS
% | 37  | 25  | 45  | PERCENT SIGN

"Regular characters" are defined as the range [!-~], excluding the above delimiters (PDF32000_2008.pdf:17).

Thus we have
  !-'
  *-.
  0-;
  =
  ?-Z
  \
  ^-z
  |
  ~

Which, in a regex character class, looks like: [!-'*-.0-;=?-Z\\^-z|~]

A **Name** is delimited by the `/` character on the left, and any whitespace on the right. The Name itself not contain the initial slash. If you want funny characters in your Name, like a space or parentheses, you have to escape them with the `#` character. Express the `#` character as `#23`.

**Array** objects consist of other types (including arrays), delimited by `[` and `]` characters. The array's distinct children are potentially separated by whitespace, but not necessarily. Arrays can be empty.

**Dictionary** objects consist of a series of key-value pairs (where the keys are all **Names**) delimited by `<<` and `>>` strings. **Type** and **Subtype** names are metadata conventions used to describe the dictionary, but not required. The pairs may be separated by newlines, or maybe each item will simply be separated by a space.

**Stream** objects are delimited by `stream` and `endstream` keywords. Stream objects must be immediately preceded by a **Dictionary** object with the following key-value pairs:
- `/Length 5190                           % required`
- `/Filter /FlateDecode                   % optional` -- can also be an array of names, which are applied in order
- `/DecodeParms << /K -1 /Columns 2550 >> % optional` -- goes with the Filter; should specify parameters for each Filter in order
- `/DL 19283                              % optional` -- the length of the completely decoded, decompressed stream, perhaps an approximation
- `/F <file specification>                % optional` -- for reading external files?
- `/FFilter ... ` -- same as `/Filter`, but for `/F`
- `/FDecodeParms` -- same as `/DecodeParms`, but for `/F`

The **Null** object is a singleton, literally expressed as `null`, which has the type of "Null".

**Indirect** objects provide a way of referring to an object. E.g.,

    1 0 obj
      (Christopher Brown)
    endobj

Puts my name into object number "1" and sets the "generation number" to 0.
I can refer to this later as:

    1 0 R

Object numbers need not be given in sequence, or even consume all positive integers; the only requirement is that they be positive.

References to never-defined indirect objects are not errors; instead, they are references to **the Null object**.

## Headers

The "header line" refers to the very first line of a PDF, e.g., `%PDF-1.4`.

If a PDF contains binary data, the second line of the PDF must be a comment with at least four binary characters (characters with codes > 128).


## Cross-Reference Table

A cross-reference section gives byte offsets of where, in the PDF, to find specific indirect objects.

    xref
    100 3
    0000000016 00000 n
    0000000911 00000 n
    0000001006 00000 n
    end

* `100` is the index of the first of `3` consecutively numbered objects (100, 101, 102)
* `0000000016` is a 10-digit number denoting the byte offset of object 100
* `00000` is the 5-digit generation number of that object
* `n` means this is an in-use entry (object)
* `0000000911` is a 10-digit number denoting the byte offset of object 101
* and so on.

You can also have "free objects" in the cross-reference section, where the lines end with `f` instead of `n`, and the 10-digit number is the "object number" (?) of the next free object.

The byte offset is from the beginning of the PDF file, so you can call

    dd bs=1 skip=1006 count=9 <my.pdf 2>&-

And it will return

    103 0 obj

Which is the first part of the declaration of indirect object 103.


## Trailers

"Conforming readers should read a PDF file from its end."

When reading from the end, you'll first encounter a magic line `%%EOF`, which be immediately preceded (the lines coming above it in the file) by a trailer and two lines, like so:

    trailer << ... >>
    startxref
    173
    %%EOF

* `173` is the byte offset of the "last" xref section. If there's only one xref section, it'll immediately precede the trailer. If there are multiple, it'll probably be near the top of the document.

Table 15 describes the trailer dictionary in full, but in brief:

* `/Size`: The total number of entries throughout all the cross-reference tables "this value shall be 1 greater than the highest object number defined in the file."
* `/Prev`: The byte offset in the decoded stream from the beginning of the file to the beginning of the previous cross-reference section.
* `/Root`: Reference to a dictionary object describing the PDF document -- not every trailer will have this.
* `/Info`: Reference to a dictionary object with metadata about this document, like Author, Title, etc.


## Text

Chapter 5, PDFReference.pdf page 311, has the information on Text content in PDFs.

    BT                   % begin text element
      /F13 12 Tf         % Use font F13 (Helvetica) at size 12
      288 720 Td         % The origin is the lower-left, so this puts the cursor at
                         % 288/72 = 4 inches from the left, and 720/72 = 10 inches from the bottom
      (ABC) Tj           % draw the string "ABC"
    ET                   % end text element

F13 means Helvetica because, in one of the document meta dictionaries, we saw something like:

    /Resources
    <<
      /Font <<
        /F13 <<
          /Type /Font
          /Subtype /Type1
          /BaseFont /Helvetica
        >>
      >>
    >>

* _font-name_ _font_size_ `Tf`: set the text's font and size
* _charSpace_ `Tc`: set the text's character spacing (charSpace is expressed in unscaled text space units). Default is 0. E.g.:
  ```
     0 Tc %--> My Password
  0.25 Tc %--> M y P a s s w o r d
  ```
* _wordSpace_ `Tw`: set the text's word spacing (expressed in unscaled text space units). Default is 0. E.g.:
  ```
    0 Tw %--> My Password
  2.5 Tw %--> My   Password
  ```
  `Tw` only applies to character 32, "SP".
* _x_ _y_ `Td`: adjust the text's current position. Specifically, "Move to the start of the next line, offset from the start of the current line by (_x_, _y_). _x_ and _y_ are expressed in unscaled text space units.
    "When executed for the first time after BT, it establishes the text position in the current user coordinate system."
    Presumably, after that first time, it's a relative adjustment.
* _x_ _y_ `TD`: Same as _x_ _y_ `Td`, but sets the leading parameter to -_y_. In ACL pdfs, there are only `TD`s, no `Td`s. Equivalent to −_y_ `TL` _x_ _y_ `Td`. (Not exactly clear on different from `Td`; see TABLE 5.5 in PDFReference.pdf page 330)
* _mode_ `Tr`: set the text rendering mode;
  - _mode_ = `0`: fill (the default)
  - _mode_ = `1`: stroke (outline)
  - _mode_ = `2`: fill then stroke
  - _mode_ = `3`: none (invisible)
  - _mode_ = `4`: fill text and add to clipping path
  - _mode_ = `5`: stroke text and add to clipping path
  - _mode_ = `6`: fill, stroke, and add to clipping path
  - _mode_ = `7`: only add to clipping path
* _scale_ `Tz`: set the horizontal scale; _scale_ is a percentage. Default is 100.
* _leading_ `TL`: set the text leading (the vertical distance between the baselines of adjacent lines of text), in unscaled text space units. Default is 0.
* _rise_ `Ts`: set the text rise (move the baseline up or down from its default location), in unscaled text space units. Default is 0. E.g.,
  ```
  (This text is ) Tj  5 Ts (superscripted) Tj
  (This text is ) Tj –5 Ts (subscripted)   Tj
  ```
* `T*`: Move to the start of the next line. Same as `0` _Tl_ `Td` where _Tl_ is whatever the current `TL` value parameter is.
* _a_ _b_ _c_ _d_ _e_ _f_ `Tm`: Replace the text matrix to
  ```
  a b 0
  c d 0
  e f 1
  ```
* `(` _some string_ `)` `Tj`: paints the corresponding glyphs in the graphics state.
* `(` _string_ `)` `'`: Move to the next line and paint the given string. Equivalent to `T*` `(` _string_ `)` `Tj`
* _wordSpace_ _charSpace_ `(` _string_ `)` `"`: Equivalent to _wordSpace_ `Tw` _charSpace_ `Tc` `(` _string_ `)` `'`
* _array_ `TJ`: Show one or more text strings. "Each element of _array_ can be a string or a number. If the element is a string, this operator shows the string. If it is a number, the operator adjusts the text position by that amount."

## Drawing

* _lineWidth_ `w`: Set the current line width. The thinnest line that can be rendered is `0 w`.
* _red_ _green_ _blue_ `RG`: Set stroke color. _red_, _green_, and _blue_ should range between 0.0 and 1.0.
* _red_ _green_ _blue_ `rg`: Same as `RG`, but for non-stroking operations.
* _gray_ `G`: Set stroke coloring mode to grayscale; _gray_ should range between 0.0 and 1.0.
* _gray_ `g`: Same as `G`, but for non-stroking operations.
* _x_ _y_ `m`: move the cursor to _x_ _y_. I think this is a relative adjustment from the previous drawing operation, but overrides the previous `m` operation if nothing was drawn.
* _x_ _y_ `l`: draw a straight line from the cursor to _x_ _y_ (relative, I think), and set the cursor to that point.
* `h`: close current path.
* _x_ _y_ _width_ _height_ `re`: draw rectangle with lower-left at (_x_, _y_). Presumably leaves the cursor in the same place.
* Bezier curve ops: `c` `v` `y`. See PDFReference.pdf page 183.
* `S`: stroke current path
* `s`: close and stroke current path. Equivalent to `h S`.
* `f`: fill current path
* `B`: fill and stroke current path
* `W`: "Modify the current clipping path by intersecting it with the current path, using the nonzero winding number rule to determine which regions lie inside the clipping path."


### References:

- All drawing operators: PDFReference.pdf page 719 (Appendix A)
