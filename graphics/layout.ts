import {median} from 'tarry';

import {
  Rectangle, distanceToRectangle,
  Container, makeContainer, addElements,
} from './geometry';

/**
Group horizontally contiguous elements into containers. Usually this is called
with an array of all text spans on a single page. It traverses through the
elements in their natural order, and starts putting elements into a new
container when there appears to be a sizable vertical jump, which usually
indicates a line break. The large number of resulting containers should roughly
correspond to each line.

containers = empty list of containers
currentContainer = uninitialized empty container
for each span in spans:
  if container is uninitialized
    initialize new currentContainer with span
  else
    if span is within (dx, dy) of currentContainer
      add it to the currentContainer
    else
      add currentContainer to containers
      initialize new currentContainer with span

5 is approximately half the mean font size.
*/
export function groupLines<T extends Rectangle>(elements: T[],
                                                dy_threshold: number = 5): Container<T>[] {
  const containers: Container<T>[] = [];
  let currentContainer: Container<T>;
  elements.forEach(element => {
    const dy = currentContainer ? (element.minY - currentContainer.minY) : Infinity;
    const new_container = Math.abs(dy) > dy_threshold;
    if (new_container) {
      // flush current container
      if (currentContainer) {
        containers.push(currentContainer);
      }
      currentContainer = makeContainer<T>();
    }
    currentContainer = addElements(currentContainer, element);
  });
  // flush final container if it exists --- if `elements` is empty,
  // currentContainer will still be undefined
  if (currentContainer) {
    containers.push(currentContainer);
  }
  return containers;
}

/**
Group a list of lines into columns (groups of vertically close/overlapping elements)
*/
export function groupColumns<T extends Rectangle>(elements: T[],
                                                  threshold_dx: number = 0,
                                                  threshold_dy: number = 5): Container<T>[] {
  const containers: Container<T>[] = [];
  let currentContainer: Container<T>;
  let previousElement: T;
  elements.forEach(element => {
    const [dx, dy] = previousElement ? distanceToRectangle(previousElement, element) : [Infinity, Infinity];
    const new_container = dx > threshold_dx || dy > threshold_dy;
    if (new_container) {
      // flush current container
      if (currentContainer) {
        containers.push(currentContainer);
      }
      currentContainer = makeContainer<T>();
    }
    currentContainer = addElements(currentContainer, element);
    previousElement = element;
  });
  if (currentContainer) {
    containers.push(currentContainer);
  }
  return containers;
}

/**
The given elements should all have approximately the same Y value. This takes
all the TextAtoms (or whatever) that comprise a line, and puts them into a list
of containers, each of which corresponds to a word.
*/
export function partitionWords<T extends Rectangle>(elements: T[], spaceWidth = 1): Container<T>[] {
  const containers: Container<T>[] = [];
  let currentContainer: Container<T>;
  let previousElement: T;
  elements.forEach(element => {
    const dx = previousElement ? (element.minX - previousElement.maxX) : 0;
    // if it's far enough away (horizontally) from the last box, start a new container
    if (dx > spaceWidth || currentContainer === undefined) {
      // flush current container
      if (currentContainer) {
        containers.push(currentContainer);
      }
      currentContainer = makeContainer<T>();
    }
    currentContainer = addElements(currentContainer, element);
    previousElement = element;
  });
  if (currentContainer) {
    containers.push(currentContainer);
  }
  return containers;
}

/**
Returns the median distance between this container's left (inner) bound and
the left bound of its elements.

This is useful when we want to determine whether a given line is atypical
within its specific container.
*/
function medianLeftOffset(container: Rectangle, elements: Rectangle[]): number {
  const leftOffsets = elements.map(element => element.minX - container.minX);
  // special handling to avoid taking the mean of two elements:
  if (elements.length == 2) {
    // consider the first of the two (or the single line) to be the "atypical"
    // one, so that it signals a paragraph change
    return leftOffsets[1];
  }
  return median(leftOffsets);
}

/**
Paragraphs are distinguished by an unusual first line. This initial line is
unusual compared to preceding lines, as well as subsequent lines.

If paragraphs are very short, it can be hard to distinguish which are the start
lines and which are the end lines simply by shape, since paragraphs may have
normal positive indentation, or have hanging indentation.

The given lines will come from a variety of different layout components, but in
determining the oddity of the left offset of any given line, we only want to
compare its left offset to the left offsets of other lines in the same layout component.

@param column - A column whose elements are containers of lines of text.
*/
export function splitParagraphs<T extends Rectangle>(column: Container<T>, indent_threshold = 5): Container<T>[] {
  const typicalLeftOffset = medianLeftOffset(column, column.elements);
  const paragraphs: Container<T>[] = [];
  let currentParagraph: Container<T>;
  column.elements.forEach(element => {
    // `element` represents a single line of text
    // typicalLineLeftOffset measures the typical (like, median) left offset of
    // each line relative to the lines' layoutContainer
    // TODO: implement caching somehow
    const leftOffset = element.minX - column.minX;
    const diff_leftOffset = Math.abs(typicalLeftOffset - leftOffset);
    // a large diff_leftOffset (set to infinity if the current paragraph has
    // not been initialized) indicates that we should start a new paragraph
    if (diff_leftOffset > indent_threshold || currentParagraph === undefined) {
      if (currentParagraph) {
        paragraphs.push(currentParagraph);
      }
      currentParagraph = makeContainer<T>();
    }
    // tend to the element we're processing
    currentParagraph = addElements(currentParagraph, element);
  });
  // flush the current paragraph
  if (currentParagraph) {
    paragraphs.push(currentParagraph);
  }
  return paragraphs;
}
