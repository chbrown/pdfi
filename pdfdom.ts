export interface PDFObject {}

export interface BooleanObject extends PDFObject, Boolean {}

export interface NumberObject extends PDFObject, Number {}

export interface StringObject extends PDFObject, String {}

export interface ArrayObject extends PDFObject, Array<PDFObject> {
  [index: number]: PDFObject;
}

export interface DictionaryObject extends PDFObject {
  [index: string]: any; // really, it could be so much
}

/** An object declaration. For example, the following snippet would evaluate
 * to {object_number: 11, generation: 0, value: "Hello World!"}
 *
 *     1 0 obj
 *       (Hello World!)
 *     endobj
 *
 * See 7.3.10, PDF32000_2008.pdf:29
 */
export interface IndirectObject extends PDFObject {
  object_number: number; // positive integer
  generation_number: number; // non-negative integer, usually 0
  value: PDFObject;
}

/** A reference to an object declaration. The object may not already be read,
 * so we can't immediately resolve it to the IndirectObject instance that is
 * pointed to. For example, the following snippet would evaluate to
 * {object_number: 339, generation: 0}
 *
 *     339 0 R
 *
 * See 7.3.10, PDF32000_2008.pdf:29
 */
export interface IndirectReference extends PDFObject {
  object_number: number;
  generation_number: number;
}

/** CrossReference objects are derived from xref declarations. The object_number
 * depends on the header of the xref subsection, but supposing the following
 * string is the second line in an xref subsection starting with "0 2":
 *
 *     0000000198 00000 n
 *
 * It evaluates to:
 *
 *     {
 *       object_number: 2,
 *       offset: 198,
 *       generation_number: 0,
 *       in_use: true,
 *     }
 */
export interface CrossReference {
  object_number: number; // non-negative integer
  generation_number: number; // non-negative integer
  in_use: boolean;
  // cross references are most often references to a specific X Y obj ... endobj position in the PDF
  offset?: number;
  // but cross references can also be references to objects in an object stream
  object_stream_object_number?: number;
  object_stream_index?: number;
}

/**
A PDF Rectangle is a 4-tuple [x1, y1, x2, y2], where [x1, y1] and [x2, y2] are
points in any two diagonally opposite corners, usually lower-left to
upper-right.

From the spec:

> **rectangle**
> a specific array object used to describe locations on a page and bounding
> boxes for a variety of objects and written as an array of four numbers giving
> the coordinates of a pair of diagonally opposite corners, typically in the
> form `[ llx lly urx ury ]` specifying the lower-left x, lower-left y,
> upper-right x, and upper-right y coordinates of the rectangle, in that order
*/
export type Rectangle = [number, number, number, number]
