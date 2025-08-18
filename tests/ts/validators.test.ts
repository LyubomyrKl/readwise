import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  validateSummarizeRequestV1,
  validateSummaryCompletedV1,
  validateSummaryFailedV1,
  isSummarizeRequestV1,
  isSummaryCompletedV1,
  isSummaryFailedV1,
  assertSummarizeRequestV1,
  assertSummaryCompletedV1,
  assertSummaryFailedV1,
  type SummarizeRequestV1,
  type SummaryCompletedV1,
  type SummaryFailedV1,
} from '../../packages/ts/src/index.js';

function loadFixture(path: string): unknown {
  const fixturePath = join(process.cwd(), 'tests/fixtures', path);
  return JSON.parse(readFileSync(fixturePath, 'utf-8'));
}

describe('SummarizeRequestV1 Validators', () => {
  describe('validateSummarizeRequestV1', () => {
    it('should validate valid basic request', () => {
      const request = loadFixture('valid/summarize-request-basic.json');
      expect(validateSummarizeRequestV1(request)).toBe(true);
      expect(validateSummarizeRequestV1.errors).toBeNull();
    });

    it('should validate abstractive request', () => {
      const request = loadFixture('valid/summarize-request-abstractive.json');
      expect(validateSummarizeRequestV1(request)).toBe(true);
    });

    it('should validate section request', () => {
      const request = loadFixture('valid/summarize-request-section.json');
      expect(validateSummarizeRequestV1(request)).toBe(true);
    });

    it('should reject request missing version', () => {
      const request = loadFixture('invalid/summarize-request-missing-v.json');
      expect(validateSummarizeRequestV1(request)).toBe(false);
      expect(validateSummarizeRequestV1.errors).toBeTruthy();
      expect(validateSummarizeRequestV1.errors![0].message).toContain('required');
    });

    it('should reject request with invalid ratio', () => {
      const request = loadFixture('invalid/summarize-request-invalid-ratio.json');
      expect(validateSummarizeRequestV1(request)).toBe(false);
      expect(validateSummarizeRequestV1.errors![0].message).toContain('maximum');
    });

    it('should reject request with invalid type', () => {
      const request = loadFixture('invalid/summarize-request-invalid-type.json');
      expect(validateSummarizeRequestV1(request)).toBe(false);
      expect(validateSummarizeRequestV1.errors![0].message).toContain('enum');
    });

    it('should reject additional properties', () => {
      const request = {
        ...loadFixture('valid/summarize-request-basic.json'),
        extraField: 'not allowed'
      };
      expect(validateSummarizeRequestV1(request)).toBe(false);
      expect(validateSummarizeRequestV1.errors![0].message).toContain('additionalProperties');
    });
  });

  describe('isSummarizeRequestV1', () => {
    it('should work as type guard', () => {
      const data: unknown = loadFixture('valid/summarize-request-basic.json');
      
      if (isSummarizeRequestV1(data)) {
        // TypeScript should know this is SummarizeRequestV1
        expect(data.v).toBe(1);
        expect(data.jobId).toBe('job-basic-001');
        expect(data.params.type).toBe('extractive');
      } else {
        throw new Error('Should have validated');
      }
    });

    it('should return false for invalid data', () => {
      const data = loadFixture('invalid/summarize-request-missing-v.json');
      expect(isSummarizeRequestV1(data)).toBe(false);
    });
  });

  describe('assertSummarizeRequestV1', () => {
    it('should not throw for valid data', () => {
      const data = loadFixture('valid/summarize-request-basic.json');
      expect(() => assertSummarizeRequestV1(data)).not.toThrow();
    });

    it('should throw for invalid data', () => {
      const data = loadFixture('invalid/summarize-request-missing-v.json');
      expect(() => assertSummarizeRequestV1(data)).toThrow('Invalid SummarizeRequestV1');
    });

    it('should provide detailed error messages', () => {
      const data = loadFixture('invalid/summarize-request-invalid-ratio.json');
      expect(() => assertSummarizeRequestV1(data)).toThrow(/ratio.*maximum/);
    });
  });
});

describe('SummaryCompletedV1 Validators', () => {
  describe('validateSummaryCompletedV1', () => {
    it('should validate basic completion without stats', () => {
      const event = loadFixture('valid/summary-completed-basic.json');
      expect(validateSummaryCompletedV1(event)).toBe(true);
    });

    it('should validate completion with stats', () => {
      const event = loadFixture('valid/summary-completed-with-stats.json');
      expect(validateSummaryCompletedV1(event)).toBe(true);
    });

    it('should reject completion missing outputKey', () => {
      const event = loadFixture('invalid/summary-completed-missing-outputkey.json');
      expect(validateSummaryCompletedV1(event)).toBe(false);
      expect(validateSummaryCompletedV1.errors![0].message).toContain('required');
    });
  });

  describe('isSummaryCompletedV1', () => {
    it('should work as type guard', () => {
      const data: unknown = loadFixture('valid/summary-completed-with-stats.json');
      
      if (isSummaryCompletedV1(data)) {
        expect(data.jobId).toBe('job-stats-003');
        expect(data.stats?.pages).toBe(42);
        expect(data.stats?.durationMs).toBe(156780);
      } else {
        throw new Error('Should have validated');
      }
    });
  });

  describe('assertSummaryCompletedV1', () => {
    it('should not throw for valid data', () => {
      const data = loadFixture('valid/summary-completed-basic.json');
      expect(() => assertSummaryCompletedV1(data)).not.toThrow();
    });

    it('should throw for invalid data', () => {
      const data = loadFixture('invalid/summary-completed-missing-outputkey.json');
      expect(() => assertSummaryCompletedV1(data)).toThrow('Invalid SummaryCompletedV1');
    });
  });
});

describe('SummaryFailedV1 Validators', () => {
  describe('validateSummaryFailedV1', () => {
    it('should validate basic failure', () => {
      const event = loadFixture('valid/summary-failed-basic.json');
      expect(validateSummaryFailedV1(event)).toBe(true);
    });

    it('should validate failure with details', () => {
      const event = loadFixture('valid/summary-failed-with-details.json');
      expect(validateSummaryFailedV1(event)).toBe(true);
    });

    it('should reject failure with invalid error code', () => {
      const event = loadFixture('invalid/summary-failed-invalid-error-code.json');
      expect(validateSummaryFailedV1(event)).toBe(false);
      expect(validateSummaryFailedV1.errors![0].message).toContain('pattern');
    });

    it('should reject failure missing message', () => {
      const event = loadFixture('invalid/summary-failed-missing-message.json');
      expect(validateSummaryFailedV1(event)).toBe(false);
      expect(validateSummaryFailedV1.errors![0].message).toContain('required');
    });
  });

  describe('isSummaryFailedV1', () => {
    it('should work as type guard', () => {
      const data: unknown = loadFixture('valid/summary-failed-with-details.json');
      
      if (isSummaryFailedV1(data)) {
        expect(data.error.code).toBe('DOCUMENT_TOO_LARGE');
        expect(data.error.details?.actualSize).toBe(67108864);
      } else {
        throw new Error('Should have validated');
      }
    });
  });

  describe('assertSummaryFailedV1', () => {
    it('should not throw for valid data', () => {
      const data = loadFixture('valid/summary-failed-basic.json');
      expect(() => assertSummaryFailedV1(data)).not.toThrow();
    });

    it('should throw for invalid data', () => {
      const data = loadFixture('invalid/summary-failed-invalid-error-code.json');
      expect(() => assertSummaryFailedV1(data)).toThrow('Invalid SummaryFailedV1');
    });
  });
});

describe('Type Inference', () => {
  it('should properly type valid requests', () => {
    const request: SummarizeRequestV1 = {
      v: 1,
      jobId: 'test-job',
      userId: 'test-user',
      input: {
        url: 'https://example.com/doc.pdf',
        key: 'docs/test.pdf',
        mime: 'application/pdf'
      },
      params: {
        type: 'extractive',
        ratio: 0.3
      }
    };

    expect(validateSummarizeRequestV1(request)).toBe(true);
  });

  it('should properly type completed events', () => {
    const completed: SummaryCompletedV1 = {
      v: 1,
      jobId: 'test-job',
      outputKey: 'summaries/test-job/output.txt',
      stats: {
        pages: 10,
        durationMs: 5000
      }
    };

    expect(validateSummaryCompletedV1(completed)).toBe(true);
  });

  it('should properly type failed events', () => {
    const failed: SummaryFailedV1 = {
      v: 1,
      jobId: 'test-job',
      error: {
        code: 'TEST_ERROR',
        message: 'This is a test error',
        details: { testDetail: 'value' }
      }
    };

    expect(validateSummaryFailedV1(failed)).toBe(true);
  });
});