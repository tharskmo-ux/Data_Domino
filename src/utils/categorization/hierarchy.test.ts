import { describe, it, expect } from 'vitest';
import { resolveByHsn } from './hsnMap';
import { resolveSubLevels } from './hierarchy';

const full = (hsn: string, desc: string) => {
  const l1 = resolveByHsn(hsn).category || 'Other / Review';
  const { l2, l3 } = resolveSubLevels(l1, hsn, desc);
  return { l1, l2, l3 };
};

describe('3-level hierarchy (user examples)', () => {
  it('Milk → Food & Agri / Milk Products / Milk', () => {
    expect(full('4012000', 'MILK 1/2 LTR PACK')).toEqual({ l1: 'Food & Agri Products', l2: 'Milk Products', l3: 'Milk' });
  });
  it('Paneer → Food & Agri / Milk Products / Paneer', () => {
    expect(full('4061000', 'PANEER')).toEqual({ l1: 'Food & Agri Products', l2: 'Milk Products', l3: 'Paneer' });
  });
  it('Vegetable Oil → Food & Agri / Edible Oils / Vegetable Oil', () => {
    expect(full('15121000', 'VEGETABLE OIL REFINED')).toEqual({ l1: 'Food & Agri Products', l2: 'Edible Oils', l3: 'Vegetable Oil' });
  });
  it('Paper Tube → Paper & Packaging / Packaging / Paper Tube', () => {
    expect(full('48221000', 'PAPER TUBE 68 DIA 40MM')).toEqual({ l1: 'Paper & Packaging', l2: 'Packaging', l3: 'Paper Tube' });
  });
  it('Bar Code Sticker → Paper & Packaging / Packaging / Stickers', () => {
    expect(full('48211000', 'BAR CODE STICKER ROLL')).toEqual({ l1: 'Paper & Packaging', l2: 'Packaging', l3: 'Stickers' });
  });

  it('graceful fallback with no HSN: L2 falls back to L1, L3 from keyword', () => {
    const r = resolveSubLevels('Metals & Hardware', '', 'HEX BOLT M12 STAINLESS');
    expect(r.l2).toBe('Metals & Hardware');
    expect(r.l3).toBe('Fasteners');
  });

  it('L3 falls back to a cleaned description when no keyword matches', () => {
    const r = resolveSubLevels('Other / Review', '', 'xyzzy special widget model-7');
    expect(r.l3).toBe('Xyzzy Special Widget');
  });
});
