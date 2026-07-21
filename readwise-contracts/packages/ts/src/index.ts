/**
 * @summarizer/contracts - TypeScript package
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

// Simple export for testing
export const version = '1.0.0';

// Basic validator setup
const ajv = new Ajv({ allErrors: true, verbose: true });
addFormats(ajv);

export { ajv };