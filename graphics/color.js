var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var Color = (function () {
    function Color() {
    }
    Color.prototype.clone = function () { return new Color(); };
    Color.prototype.toString = function () {
        return 'none';
    };
    return Color;
})();
exports.Color = Color;
var RGBColor = (function (_super) {
    __extends(RGBColor, _super);
    function RGBColor(r, g, b) {
        _super.call(this);
        this.r = r;
        this.g = g;
        this.b = b;
    }
    RGBColor.prototype.clone = function () { return new RGBColor(this.r, this.g, this.b); };
    RGBColor.prototype.toString = function () {
        return "rgb(" + this.r + ", " + this.g + ", " + this.b + ")";
    };
    return RGBColor;
})(Color);
exports.RGBColor = RGBColor;
var GrayColor = (function (_super) {
    __extends(GrayColor, _super);
    function GrayColor(alpha) {
        _super.call(this);
        this.alpha = alpha;
    }
    GrayColor.prototype.clone = function () { return new GrayColor(this.alpha); };
    GrayColor.prototype.toString = function () {
        return "rgb(" + this.alpha + ", " + this.alpha + ", " + this.alpha + ")";
    };
    return GrayColor;
})(Color);
exports.GrayColor = GrayColor;
var CMYKColor = (function (_super) {
    __extends(CMYKColor, _super);
    function CMYKColor(c, m, y, k) {
        _super.call(this);
        this.c = c;
        this.m = m;
        this.y = y;
        this.k = k;
    }
    CMYKColor.prototype.clone = function () { return new CMYKColor(this.c, this.m, this.y, this.k); };
    CMYKColor.prototype.toString = function () {
        return "cmyk(" + this.c + ", " + this.m + ", " + this.y + ", " + this.k + ")";
    };
    return CMYKColor;
})(Color);
exports.CMYKColor = CMYKColor;
