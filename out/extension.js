"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXTENSION_ID = exports.deactivate = exports.activate = void 0;
// Extension entry point
var lifecycle_1 = require("./runtime/lifecycle");
Object.defineProperty(exports, "activate", { enumerable: true, get: function () { return lifecycle_1.activate; } });
Object.defineProperty(exports, "deactivate", { enumerable: true, get: function () { return lifecycle_1.deactivate; } });
// Extension ID
exports.EXTENSION_ID = 'magpie-relay';
