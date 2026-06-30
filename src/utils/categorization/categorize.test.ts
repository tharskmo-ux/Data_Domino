import { describe, it, expect, vi } from 'vitest';
import { categorize } from './categorize';

const keys = { hsnKey: 'HSN', descKey: 'DESC' };

describe('categorize cascade', () => {
  it('pass 1: clean HSN wins', async () => {
    const rows = [{ HSN: '52010010', DESC: 'whatever' }];
    const r = await categorize(rows, keys);
    expect(r[0]).toEqual({ category: 'Fibres & Yarn', source: 'hsn', confidence: 'high' });
  });

  it('pass 2: keyword used when HSN missing', async () => {
    const rows = [{ HSN: '', DESC: 'HEX BOLT M12' }];
    const r = await categorize(rows, keys);
    expect(r[0]).toEqual({ category: 'Metals & Hardware', source: 'keyword', confidence: 'high' });
  });

  it('unmapped when neither resolves and no classifier', async () => {
    const rows = [{ HSN: '', DESC: 'xyzzy widget' }];
    const r = await categorize(rows, keys);
    expect(r[0]).toEqual({ category: 'Other / Review', source: 'unmapped', confidence: 'low' });
  });

  it('pass 3: classifier fills only unknowns, deduped by description', async () => {
    const rows = [
      { HSN: '52010010', DESC: 'cotton' }, // hsn
      { HSN: '', DESC: 'mystery item' }, // -> ai
      { HSN: '', DESC: 'mystery item' }, // same desc, reuse ai
    ];
    const classify = vi.fn(async (descs: string[]) => descs.map(() => 'Chemicals & Dyes'));
    const r = await categorize(rows, keys, classify);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0][0]).toEqual(['mystery item']); // unique only
    expect(r[1]).toEqual({ category: 'Chemicals & Dyes', source: 'ai', confidence: 'medium' });
    expect(r[2]).toEqual({ category: 'Chemicals & Dyes', source: 'ai', confidence: 'medium' });
  });

  it('classifier failure leaves rows as unmapped', async () => {
    const rows = [{ HSN: '', DESC: 'mystery' }];
    const classify = vi.fn(async () => {
      throw new Error('llm down');
    });
    const r = await categorize(rows, keys, classify);
    expect(r[0].source).toBe('unmapped');
  });

  it('ignores classifier labels not in the taxonomy', async () => {
    const rows = [{ HSN: '', DESC: 'mystery' }];
    const classify = vi.fn(async () => ['Not A Real Bucket']);
    const r = await categorize(rows, keys, classify);
    expect(r[0].source).toBe('unmapped');
  });
});
