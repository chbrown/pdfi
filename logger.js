var __extends = (this && this.__extends) || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
};
var loge_1 = require('loge');
var util_1 = require('util');
var ConsoleLogger = (function (_super) {
    __extends(ConsoleLogger, _super);
    function ConsoleLogger() {
        _super.apply(this, arguments);
    }
    ConsoleLogger.prototype.log = function (level, args) {
        if (level >= this.level) {
            var text = util_1.format.apply(null, args);
            console.error("[" + loge_1.Level[level] + "] " + text);
        }
    };
    return ConsoleLogger;
})(loge_1.Logger);
exports.logger = new ConsoleLogger(null, loge_1.Level.info);
