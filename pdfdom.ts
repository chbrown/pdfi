/// <reference path="type_declarations/index.d.ts" />

export interface PDFObject {}

export interface BooleanObject extends PDFObject, Boolean {}

export interface NumberObject extends PDFObject, Number {}

export class NameObject implements PDFObject {
  constructor(public value: string) { }
}

export interface StringObject extends PDFObject, String {}

export interface ArrayObject extends PDFObject, Array<PDFObject> {
  [index: number]: PDFObject;
}

//interface KeyValue {
//  /** Not an actual PDF object, but maybe helpful when reading Dictionary
//   * objects. `key` is the value of a PDF Name Object. `value` is some kind
//   * of a PDFObject.
//   */
//  key: string;
//  value: PDFObject;
//}

export interface DictionaryObject extends PDFObject {
  [index: string]: PDFObject;
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
  offset: number;
  generation_number: number; // non-negative integer
  in_use: boolean;
}

export interface Stream extends PDFObject {
  dictionary: DictionaryObject;
  bytes: string;
}

export interface PDF {
  cross_references: CrossReference[];
  trailer: DictionaryObject;
  // some optional properties...
}
