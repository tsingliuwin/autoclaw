import { describe, expect, it } from 'vitest';
import { truncateOutput } from './truncate.js';

describe('truncateOutput', () => {
  it('returns content unchanged when within both limits', () => {
    const content = 'line1\nline2\nline3';
    const result = truncateOutput(content);

    expect(result.truncated).toBe(false);
    expect(result.content).toBe(content);
    expect(result.totalLines).toBe(3);
  });

  it('truncates by line count and appends a notice', () => {
    const content = Array.from({ length: 3000 }, (_, i) => `line-${i}`).join('\n');
    const result = truncateOutput(content);

    expect(result.truncated).toBe(true);
    expect(result.emittedLines).toBe(2000);
    expect(result.totalLines).toBe(3000);
    expect(result.content).toContain('[Truncated: showing 2000 of 3000 lines');
    expect(result.content).toContain('line-1999');
    expect(result.content).not.toContain('line-2000');
  });

  it('truncates by byte count across multiple lines', () => {
    const content = Array.from({ length: 100 }, () => 'x'.repeat(1024)).join('\n');
    const result = truncateOutput(content);

    expect(result.truncated).toBe(true);
    expect(result.emittedBytes).toBeLessThanOrEqual(50 * 1024);
    expect(result.emittedLines).toBeGreaterThan(40);
    expect(result.emittedLines).toBeLessThan(100);
  });

  it('counts UTF-8 bytes for multi-byte characters', () => {
    const content = '中'.repeat(20 * 1024); // 20k chars = 60KB in UTF-8
    const result = truncateOutput(content);

    expect(result.truncated).toBe(true);
    expect(result.emittedBytes).toBeLessThanOrEqual(50 * 1024);
  });

  it('respects custom limits', () => {
    const content = 'a\nb\nc\nd';
    const result = truncateOutput(content, { maxLines: 2 });

    expect(result.truncated).toBe(true);
    expect(result.emittedLines).toBe(2);
  });

  it('emits only the notice when the first line alone exceeds the byte limit', () => {
    const result = truncateOutput('y'.repeat(60 * 1024), { maxBytes: 1024 });

    expect(result.truncated).toBe(true);
    expect(result.emittedLines).toBe(0);
    expect(result.content).toContain('[Truncated: showing 0 of 1 lines');
  });
});
