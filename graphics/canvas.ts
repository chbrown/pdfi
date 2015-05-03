import {TextSpan} from './models';
import {Point, Size, Rectangle} from './geometry';

/**
Canvas is used as the target of a series of content stream drawing operations.
The origin (0, 0) is located at the top left.
*/
export class Canvas {
  public spans: TextSpan[] = [];
  constructor(public outerBounds: Rectangle) { }

  addSpan(string: string, origin: Point, size: Size, fontSize: number, fontName: string) {
    // transform into origin at top left
    var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.outerBounds.dY)
    var span = new TextSpan(string,
                                   canvas_origin.x,
                                   canvas_origin.y,
                                   canvas_origin.x + size.width,
                                   canvas_origin.y + size.height,
                                   fontSize);
    // var rectangle_string = [span.minX, span.minY, span.maxX, span.maxY].map(x => x.toFixed(3)).join(',');
    span.details = `${span.toString(2)} fontSize=${fontSize} fontName=${fontName}`;
    this.spans.push(span);
  }
}
