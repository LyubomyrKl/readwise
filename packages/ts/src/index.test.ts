import { describe, it, expect } from 'vitest';
import { version, ajv } from './index';

describe('@summarizer/contracts', () => {
  it('exports version correctly', () => {
    expect(version).toBe('1.0.0');
  });

  it('exports ajv instance', () => {
    expect(ajv).toBeDefined();
    expect(typeof ajv.compile).toBe('function');
  });
});