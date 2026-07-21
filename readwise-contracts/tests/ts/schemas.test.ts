import { describe, it, expect } from 'vitest';
import { schemas } from '../../packages/ts/src/schemas.js';

describe('Schema Objects', () => {
  describe('schemas export', () => {
    it('should export all schemas', () => {
      expect(schemas).toBeDefined();
      expect(schemas.common).toBeDefined();
      expect(schemas.summarizeRequest).toBeDefined();
      expect(schemas.summaryCompleted).toBeDefined();
      expect(schemas.summaryFailed).toBeDefined();
    });

    it('should have proper schema structure', () => {
      expect(schemas.common.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schemas.common.$id).toBe('https://schemas.summarizer.com/$defs/common.v1.schema.json');
      expect(schemas.common.$defs).toBeDefined();
    });

    it('should have proper event schema IDs', () => {
      expect(schemas.summarizeRequest.$id).toBe('https://schemas.summarizer.com/events/summarize.request.v1.schema.json');
      expect(schemas.summaryCompleted.$id).toBe('https://schemas.summarizer.com/events/summary.completed.v1.schema.json');
      expect(schemas.summaryFailed.$id).toBe('https://schemas.summarizer.com/events/summary.failed.v1.schema.json');
    });

    it('should have additionalProperties: false', () => {
      expect(schemas.summarizeRequest.additionalProperties).toBe(false);
      expect(schemas.summaryCompleted.additionalProperties).toBe(false);
      expect(schemas.summaryFailed.additionalProperties).toBe(false);
    });

    it('should have examples arrays', () => {
      expect(Array.isArray(schemas.summarizeRequest.examples)).toBe(true);
      expect(schemas.summarizeRequest.examples!.length).toBeGreaterThan(0);
      
      expect(Array.isArray(schemas.summaryCompleted.examples)).toBe(true);
      expect(schemas.summaryCompleted.examples!.length).toBeGreaterThan(0);
      
      expect(Array.isArray(schemas.summaryFailed.examples)).toBe(true);
      expect(schemas.summaryFailed.examples!.length).toBeGreaterThan(0);
    });
  });

  describe('Common schema definitions', () => {
    const { $defs } = schemas.common;

    it('should define jobId pattern', () => {
      expect($defs.jobId.type).toBe('string');
      expect($defs.jobId.pattern).toBe('^[a-zA-Z0-9_-]+$');
      expect($defs.jobId.maxLength).toBe(128);
    });

    it('should define version as constant 1', () => {
      expect($defs.version.type).toBe('integer');
      expect($defs.version.const).toBe(1);
    });

    it('should define summaryType enum', () => {
      expect($defs.summaryType.type).toBe('string');
      expect($defs.summaryType.enum).toEqual(['extractive', 'abstractive', 'section']);
    });

    it('should define ratio range', () => {
      expect($defs.ratio.type).toBe('number');
      expect($defs.ratio.minimum).toBe(0.1);
      expect($defs.ratio.maximum).toBe(0.5);
    });

    it('should define errorCode pattern', () => {
      expect($defs.errorCode.type).toBe('string');
      expect($defs.errorCode.pattern).toBe('^[A-Z_]+$');
    });
  });

  describe('Schema references', () => {
    it('should use $ref to common definitions', () => {
      const request = schemas.summarizeRequest;
      expect(request.properties.v.$ref).toBe('https://schemas.summarizer.com/$defs/common.v1.schema.json#/$defs/version');
      expect(request.properties.jobId.$ref).toBe('https://schemas.summarizer.com/$defs/common.v1.schema.json#/$defs/jobId');
      expect(request.properties.params.properties.type.$ref).toBe('https://schemas.summarizer.com/$defs/common.v1.schema.json#/$defs/summaryType');
    });

    it('should have proper required fields', () => {
      expect(schemas.summarizeRequest.required).toEqual(['v', 'jobId', 'userId', 'input', 'params']);
      expect(schemas.summaryCompleted.required).toEqual(['v', 'jobId', 'outputKey']);
      expect(schemas.summaryFailed.required).toEqual(['v', 'jobId', 'error']);
    });
  });
});