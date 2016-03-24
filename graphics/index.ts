import {Paper} from 'academia/types';
import {assign, flatMap, mean, median, quantile} from 'tarry';

import {logger} from '../logger';
import {Page, ContentStream, Resources} from '../models';
import {normalize} from '../encoding/index';
import {Multiset, unwrapLines} from '../util';

import {
  transformPoint,
  Rectangle, makeRectangle, distanceToRectangle, formatRectangle, boundingRectangle,
  Container, makeContainer, addElements, mergeContainer,
} from './geometry';
import {groupLines, groupColumns, partitionWords, splitParagraphs} from './layout';
import {TextAtom, TextAtomDrawingContext} from './stream';

export interface TextSpan extends Rectangle {
  fontName: string;
  fontSize: number;
  fontBold: boolean;
  fontItalic: boolean;
  buffer: Buffer;
  text: string;
}

export type Word = Container<TextSpan>;
export type Line = Container<Word>;
export type Column = Container<Line>;
export type Paragraph = Container<Line>;

/**
When we render a page, we specify a ContentStream as well as a Resources
dictionary. That Resources dictionary may contain XObject streams that are
embedded as `Do` operations in the main contents, as well as sub-Resources
in those XObjects.
*/
export function renderLayout(outerBounds: Rectangle,
                             contentStreamBuffer: Buffer,
                             resources: Resources,
                             skipMissingCharacters = true) {
  // prepare the array of TextSpans that we will render into
  const textAtoms: TextAtom[] = [];
  const context = new TextAtomDrawingContext(textAtoms, resources);
  // read the content stream and render it to the array of textAtoms via the context
  context.applyContentStream(contentStreamBuffer);
  const dY = outerBounds.maxY - outerBounds.minY;
  const textSpans: TextSpan[] = textAtoms.map(span => {
    // transform into origin at top left
    const {x: minX, y: minY} = transformPoint(span, 1, 0, 0, -1, 0, dY);
    const maxX = minX + span.width;
    const maxY = minY + span.height;
    const {fontName, buffer, text} = span;
    const {bold: fontBold, italic: fontItalic} = span.font;
    return {minX, minY, maxX, maxY, text, buffer, fontName, fontSize: span.height, fontBold, fontItalic};
  });
  const lines = groupLines(textSpans);
  const lineContainers: Container<Container<TextSpan>>[] = lines.map(({minX, minY, maxX, maxY, elements}) =>
    ({minX, minY, maxX, maxY, elements: partitionWords(elements)}));
  const columns = groupColumns(lineContainers);
  // columns -> paragraphs is a reconfiguration of containers, not a nesting as the others are
  const paragraphs = flatMap(columns, column => splitParagraphs(column));
  return paragraphs;
}

export function renderLayoutFromPage(page: Page, skipMissingCharacters = true) {
  // outerBounds is usually set by the Page's MediaBox rectangle. It does not depend
  // on the elements contained by the page.
  const outerBounds = makeRectangle(page.MediaBox[0], page.MediaBox[1], page.MediaBox[2], page.MediaBox[3]);
  return renderLayout(outerBounds, page.joinContents(new Buffer('\n')), page.Resources, skipMissingCharacters);
}

export function renderLayoutFromContentStream(contentStream: ContentStream, skipMissingCharacters = true) {
  const BBox = contentStream.dictionary['BBox'];
  const outerBounds = makeRectangle(BBox[0], BBox[1], BBox[2], BBox[3]);
  return renderLayout(outerBounds, contentStream.buffer, contentStream.Resources, skipMissingCharacters);
}

export interface SectionContainer {
  title: Paragraph[];
  paragraphs: Paragraph[];
}

/**
Group a list of lines into sections (title / paragraph sequences)
*/
export function groupSections<T extends Rectangle>(paragraphs: Paragraph[], header_fontSize: number): SectionContainer[] {
  const sections: SectionContainer[] = [];
  let currentSection: SectionContainer = {title: [], paragraphs: []};
  paragraphs.forEach(paragraph => {
    const textSpans = flatMap(paragraph.elements, line =>
      flatMap(line.elements, wordGroup => wordGroup.elements)
    );
    const isHeaderSized = textSpans.every(({fontSize}) => fontSize > header_fontSize);
    const fontBold = textSpans.every(({fontBold}) => fontBold);
    // new sections can be distinguished by larger sizes
    // or by leading boldface (boldface within other normal content does not
    // trigger a new section
    const isLeadingBold = fontBold && currentSection.paragraphs.length === 0;
    const isWhiteSpace = textSpans.every(({text}) => !/\S/.test(text));
    if (isWhiteSpace) {
      // whitespace never triggers a new section or a transition to content section
      // we just have to determine which it goes in: header or content
      if (currentSection.paragraphs.length > 0) {
        currentSection.paragraphs.push(paragraph);
      }
      else {
        currentSection.title.push(paragraph);
      }
    }
    else if (isHeaderSized || isLeadingBold) {
      // start a new section if the current section has any content
      if (currentSection.paragraphs.length > 0) {
        // flush the current section
        sections.push(currentSection);
        // initialize the new section
        currentSection = {title: [], paragraphs: []};
      }
      currentSection.title.push(paragraph);
    }
    else {
      currentSection.paragraphs.push(paragraph);
    }
  });
  // flush final section
  sections.push(currentSection);
  return sections;
}

function joinParagraph(paragraph: Paragraph, bag_of_words: Multiset): string {
  const lines = paragraph.elements.map(line => {
    return line.elements.map(wordGroup => wordGroup.elements.map(({text}) => text).join('')).join(' ');
  });
  return unwrapLines(lines, bag_of_words);
}

/**
Recombine an array of arbitrary TextSpan Containers into an array of Sections

  each paragraph contains lines
  each line contains word groups
  each word group contains TextSpans
*/
export function paperFromParagraphs(paragraphs: Container<Container<Container<TextSpan>>>[]): Paper {
  // paragraphs should be all paragraphs from the whole PDF / document
  // the easiest first step is to get the mean and median font size
  const textSpans = flatMap(paragraphs, paragraph =>
    flatMap(paragraph.elements, line =>
      flatMap(line.elements, wordGroup => wordGroup.elements)
    )
  );
  const fontSizes = textSpans.map(textSpan => textSpan.fontSize);
  // const mean_fontSize = mean(fontSizes);
  // use the 75% quartile (quantile() returns the endpoints, too) as the normal font size
  const content_fontSize = quantile(fontSizes, 4)[3];
  // jump up a half pixel/pt to set the section header font size threshold
  const header_fontSize = content_fontSize + 0.5;
  // Each section's `paragraphs` is now set to a list of lists of lines (string[][])
  // We now need to derive a bag of words for the entire document.
  const bag_of_words = new Multiset();
  paragraphs.forEach(paragraph => {
    paragraph.elements.forEach(line => {
      line.elements.forEach(wordGroup => {
        const word = wordGroup.elements.map(({text}) => text).join('');
        bag_of_words.add(word.toLowerCase());
      });
    });
  });
  // 2. the second step is to iterate through the sections and re-group them
  const sections = groupSections(paragraphs, header_fontSize);
  const paperSections = sections.map(section => {
    // TODO: handle multi-line section headers better
    const title = section.title.map(paragraph => joinParagraph(paragraph, bag_of_words)).join(' ');
    // finish up: convert each paragraph (list of strings) to a single string
    const paragraphs = section.paragraphs.map(paragraph => joinParagraph(paragraph, bag_of_words));
    return {title, paragraphs};
  });
  return {sections: paperSections};
}
