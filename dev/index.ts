/**
Parse space-separated unicode character sequence as a native JavaScript string.
E.g.:

    'F766 F766 F76C' -> 'ffl'
    '2126' -> 'Ω'
*/
export function parseUnicodeCharCodes(unicodeCharCodes: string): string {
  const charCodes = unicodeCharCodes.split(' ').map(s => parseInt(s, 16));
  return String.fromCharCode.apply(null, charCodes);
}

/**
Parse comma-separated list of unicode character code sequences as a list of
native JavaScript strings.
*/
export function parseAlternatives(alternatives: string): string[] {
  return alternatives.split(',').map(parseUnicodeCharCodes);
}

/**
The provided {buffer} should have ;-separated lines like:

nine;0039

Where the first value is the glyphname, and the second value is the
corresponding unicode index (or in some cases, like TeX's glyphlist, is a
,-separated list of equivalent potentially multi-character replacement strings)

The {buffer} may also have #-prefixed lines, indicating comments, which are ignored.
*/
export function parseGlyphlist(input: string): [string, string][] {
  return input.split(/\r?\n/)
  // ignore #-prefixed lines
  .filter(line => line[0] !== '#')
  // ignore empty lines
  .filter(line => line.trim().length > 0)
  .map(line => {
    const [glyphname, replacements] = line.split(';');
    // TODO: remove type hint when TypeScript grows up and can actually infer
    // tuples properly
    return <[string, string]>[glyphname, replacements];
  });
}
