import { describe, it, expect } from 'vitest';
import { resolveByKeyword } from './keywordRules';
import { TAXONOMY } from './taxonomy';

describe('resolveByKeyword', () => {
  it('matches hardware terms', () => {
    expect(resolveByKeyword('HEX BOLT M12')).toEqual({ category: 'Metals & Hardware', ok: true });
  });

  it('matches electrical terms case-insensitively', () => {
    expect(resolveByKeyword('3-phase motor 5hp')).toEqual({ category: 'Electrical & Electronics', ok: true });
  });

  it('returns ok:false when nothing matches', () => {
    expect(resolveByKeyword('xyzzy widget')).toEqual({ category: '', ok: false });
  });

  it('only ever returns categories that exist in the taxonomy', () => {
    const samples = ['bolt', 'yarn', 'grease', 'motor', 'carton', 'coal', 'glove', 'freight'];
    for (const s of samples) {
      const r = resolveByKeyword(s);
      if (r.ok) expect(TAXONOMY).toContain(r.category);
    }
  });
});
