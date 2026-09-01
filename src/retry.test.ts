import { describe, expect, it, vi } from 'vitest';
import { isRetryableError, withRetry } from './retry.js';

const noSleep = async () => {};

describe('isRetryableError', () => {
  it('retries 429/408/5xx status errors', () => {
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 408 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError(new Error('Request failed with status code 502'))).toBe(true);
  });

  it('does not retry client errors or unknown failures', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError(new Error('Something odd happened'))).toBe(false);
    expect(isRetryableError(null)).toBe(false);
  });

  it('retries transient network errors', () => {
    expect(isRetryableError({ code: 'ECONNRESET' })).toBe(true);
    expect(isRetryableError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
  });
});

describe('withRetry', () => {
  it('retries retryable failures and eventually succeeds', async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('upstream down'), { status: 503 });
      return 'ok';
    });
    const onRetry = vi.fn();

    const result = await withRetry(fn, { sleepFn: noSleep, onRetry });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('throws immediately for non-retryable failures', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('bad key'), { status: 401 });
    });

    await expect(withRetry(fn, { sleepFn: noSleep })).rejects.toMatchObject({ status: 401 });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('throws after exhausting all attempts', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('still down'), { status: 500 });
    });

    await expect(withRetry(fn, { attempts: 2, sleepFn: noSleep })).rejects.toMatchObject({ status: 500 });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
