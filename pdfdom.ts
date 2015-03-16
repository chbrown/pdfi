/// <reference path="type_declarations/index.d.ts" />

export interface PDFObject {}

export interface BooleanObject extends PDFObject, Boolean {}

export interface NumberObject extends PDFObject, Number {}

export interface StringObject extends PDFObject, String {}

export interface ArrayObject extends PDFObject, Array<PDFObject> {
  [index: number]: PDFObject;
}

export type Rectangle = [number, number, number, number]

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
  offset: number;
  generation_number: number; // non-negative integer
  in_use: boolean;
}

export interface StreamDictionary extends DictionaryObject {
  Length: number;
  Filter?: string | string[];
}

export interface Stream extends PDFObject {
  dictionary: StreamDictionary;
  buffer: Buffer;
}

/**
The PDF points to its catalog object with its trailer's `Root` reference.
*/
export interface Catalog extends DictionaryObject {
  Type: string; // "Catalog"
  Pages: IndirectReference; // reference to a pdfdom.Pages object
  Names?: IndirectReference;
  PageMode?: string;
  OpenAction?: IndirectReference;
}

export interface Pages extends DictionaryObject {
  Type: string; // "Pages"
  Kids: IndirectReference[]; // -> Array<Pages | Page>
}

export interface Page extends DictionaryObject {
  // required:
  Type: string; // 'Page'
  Parent: IndirectReference;
  Resources: IndirectReference;
  MediaBox: Rectangle;
  //
  LastModified?: string; // actually Date
  Annots?: IndirectReference;
  CropBox?: Rectangle;
  BleedBox?: Rectangle;
  TrimBox?: Rectangle;
  ArtBox?: Rectangle;
  BoxColorInfo?: DictionaryObject;
  /**
  Contents: stream or array. The value shall be either a single stream or an array of streams. If the value is an array, the effect shall be as if all of the streams in the array were concatenated, in order, to form a single stream. Conforming writers can create image objects and other resources as they occur, even though they interrupt the content stream. The division between streams may occur only at the boundaries between lexical tokens (see 7.2, "Lexical Conventions") but shall be unrelated to the page’s logical content or organization. Applications that consume or produce PDF files need not preserve the existing structure of the Contents array. Conforming writers shall not create a Contents array containing no elements.
  */
  Contents?: IndirectReference | IndirectReference[];
  Rotate?: number;
  Group?: DictionaryObject;
  Thumb?: Stream;
  // ...
}

export interface XObject {
  [index: string]: Stream;
}

// Rendering mode: see PDF32000_2008.pdf:9.3.6, Table 106
export enum RenderingMode {
  Fill = 0,
  Stroke = 1,
  FillThenStroke = 2,
  None = 3,
  FillClipping = 4,
  StrokeClipping = 5,
  FillThenStrokeClipping = 6,
  NoneClipping = 7,
}

// Line Cap Style: see PDF32000_2008.pdf:8.4.3.3, Table 54
export enum LineCapStyle {
  Butt = 0,
  Round = 1,
  ProjectingSquare = 2,
}

// Line Join Style: see PDF32000_2008.pdf:8.4.3.4, Table 55
export enum LineJoinStyle {
  Miter = 0,
  Round = 1,
  Bevel = 2,
}

export interface Encoding extends PDFObject {
  Type: string; // 'Encoding'
  BaseEncoding: string;
  Differences: Array<number | string>;
}
