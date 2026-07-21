"use strict";
/**
 * @summarizer/contracts - TypeScript package
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ajv = exports.version = void 0;
const ajv_1 = __importDefault(require("ajv"));
const ajv_formats_1 = __importDefault(require("ajv-formats"));
// Simple export for testing
exports.version = '1.0.0';
// Basic validator setup
const ajv = new ajv_1.default({ allErrors: true, verbose: true });
exports.ajv = ajv;
(0, ajv_formats_1.default)(ajv);
