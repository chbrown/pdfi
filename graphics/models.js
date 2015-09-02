var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var geometry_1 = require('./geometry');
var Container = (function (_super) {
    __extends(Container, _super);
    function Container(elements) {
        if (elements === void 0) { elements = []; }
        _super.call(this, Infinity, Infinity, -Infinity, -Infinity);
        this.elements = [];
        this.pushElements(elements);
    }
    Object.defineProperty(Container.prototype, "length", {
        get: function () {
            return this.elements.length;
        },
        enumerable: true,
        configurable: true
    });
    Container.prototype.getElements = function () {
        return this.elements;
    };
    /**
    Add the given `element`, and extend to contain its Rectangle (if needed).
  
    This is a mutating method.
    */
    Container.prototype.push = function (element) {
        this.elements.push(element);
        this.expandToContain(element);
    };
    /**
    TODO: optimize this by using PointArray (plain `push()` incurs a lot of function calls).
  
    This is a mutating method.
    */
    Container.prototype.pushElements = function (elements) {
        var _this = this;
        elements.forEach(function (element) { return _this.push(element); });
    };
    /**
    Add all elements from `other` and expand the current bounds to contain `other`.
  
    This is a mutating method.
    */
    Container.prototype.merge = function (other) {
        var _this = this;
        other.elements.forEach(function (element) { return _this.elements.push(element); });
        this.expandToContain(other);
    };
    return Container;
})(geometry_1.Rectangle);
exports.Container = Container;
var TextSpan = (function (_super) {
    __extends(TextSpan, _super);
    function TextSpan(string, minX, minY, maxX, maxY, fontSize, fontBold, fontItalic, details) {
        _super.call(this, minX, minY, maxX, maxY);
        this.string = string;
        this.fontSize = fontSize;
        this.fontBold = fontBold;
        this.fontItalic = fontItalic;
        this.details = details;
    }
    TextSpan.prototype.toJSON = function () {
        return {
            string: this.string,
            minX: this.minX,
            minY: this.minY,
            maxX: this.maxX,
            maxY: this.maxY,
            fontSize: this.fontSize,
            fontBold: this.fontBold,
            fontItalic: this.fontItalic,
            details: this.details,
        };
    };
    return TextSpan;
})(geometry_1.Rectangle);
exports.TextSpan = TextSpan;
/**
Canvas is used as the target of a series of content stream drawing operations.
The origin (0, 0) is located at the top left.

outerBounds is usually set by the Page's MediaBox rectangle. It does not depend
on the elements contained by the page.
*/
var Canvas = (function (_super) {
    __extends(Canvas, _super);
    function Canvas(outerBounds) {
        _super.call(this);
        this.outerBounds = outerBounds;
    }
    Canvas.prototype.drawText = function (string, origin, size, fontSize, fontBold, fontItalic, fontName) {
        // transform into origin at top left
        var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.outerBounds.dY);
        var span = new TextSpan(string, canvas_origin.x, canvas_origin.y, canvas_origin.x + size.width, canvas_origin.y + size.height, fontSize, fontBold, fontItalic);
        // span.details is an option for debugging
        span.details = span.toString(0) + " fontName=" + fontName;
        this.push(span);
    };
    Canvas.prototype.toJSON = function () {
        return {
            textSpans: this.elements,
            outerBounds: this.outerBounds,
        };
    };
    return Canvas;
})(Container);
exports.Canvas = Canvas;
