import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, TOKEN_KEY, api, tokenStore } from './api';

describe('tokenStore', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists through localStorage when it is available', () => {
    tokenStore.set(TOKEN_KEY, 'abc');
    expect(window.localStorage.getItem(TOKEN_KEY)).toBe('abc');
    expect(tokenStore.get(TOKEN_KEY)).toBe('abc');

    tokenStore.remove(TOKEN_KEY);
    expect(tokenStore.get(TOKEN_KEY)).toBeNull();
  });

  it('falls back to memory when localStorage throws (sandboxed iframe)', () => {
    const hostile = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      removeItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
    } as unknown as Storage;

    const original = Object.getOwnPropertyDescriptor(window, 'localStorage');
    Object.defineProperty(window, 'localStorage', { configurable: true, value: hostile });

    // Must not throw — the app has to stay usable inside the preview iframe.
    expect(() => tokenStore.set(TOKEN_KEY, 'in-memory')).not.toThrow();
    expect(tokenStore.get(TOKEN_KEY)).toBe('in-memory');

    tokenStore.remove(TOKEN_KEY);
    expect(tokenStore.get(TOKEN_KEY)).toBeNull();

    if (original) Object.defineProperty(window, 'localStorage', original);
  });
});

describe('api request handling', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    tokenStore.set(TOKEN_KEY, 'test-token');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    tokenStore.remove(TOKEN_KEY);
  });

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });

  it('calls the same-origin backend prefix and unwraps the envelope', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { id: 'job_1', title: 'SDE Intern' } }));

    const job = await api.job('job_1');

    expect(job).toEqual({ id: 'job_1', title: 'SDE Intern' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/backend/v1/jobs/job_1');
    expect(init.headers.authorization).toBe('Bearer test-token');
  });

  it('turns an error envelope into a typed ApiError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: { code: 'CONFLICT', message: 'Already applied' } }, 409),
    );

    const error = await api.apply('job_1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409, code: 'CONFLICT', message: 'Already applied' });
  });

  it('surfaces a network failure as an ApiError instead of an unhandled rejection', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await api.job('job_1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('NETWORK_ERROR');
  });
});
