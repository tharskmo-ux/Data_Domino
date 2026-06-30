import { describe, it, expect, vi, afterEach } from 'vitest';
import { ollamaClassify } from './ollama';

afterEach(() => vi.restoreAllMocks());

describe('ollamaClassify', () => {
  it('posts a prompt and parses a JSON array response', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ response: JSON.stringify(['Metals & Hardware', 'Fibres & Yarn']) }),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    const out = await ollamaClassify(['bolt', 'yarn'], ['Metals & Hardware', 'Fibres & Yarn']);
    expect(out).toEqual(['Metals & Hardware', 'Fibres & Yarn']);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws on non-ok response so the cascade can fall back', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })) as unknown as typeof fetch);
    await expect(ollamaClassify(['x'], ['Other / Review'])).rejects.toThrow();
  });
});
