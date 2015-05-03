var models_1 = require('./models');
/**
Canvas is used as the target of a series of content stream drawing operations.
The origin (0, 0) is located at the top left.
*/
var Canvas = (function () {
    function Canvas(outerBounds) {
        this.outerBounds = outerBounds;
        this.spans = [];
    }
    Canvas.prototype.addSpan = function (string, origin, size, fontSize, fontBold, fontItalic, fontName) {
        // transform into origin at top left
        var canvas_origin = origin.transform(1, 0, 0, -1, 0, this.outerBounds.dY);
        var span = new models_1.TextSpan(string, canvas_origin.x, canvas_origin.y, canvas_origin.x + size.width, canvas_origin.y + size.height, fontSize, fontBold, fontItalic);
        span.details = span.toString(0) + " fontName=" + fontName;
        this.spans.push(span);
    };
    return Canvas;
})();
exports.Canvas = Canvas;
