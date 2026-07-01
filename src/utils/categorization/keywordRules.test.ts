import { describe, it, expect } from 'vitest';
import { resolveByKeyword, KEYWORD_RULES } from './keywordRules';
import { TAXONOMY } from './taxonomy';

const cat = (desc: string) => resolveByKeyword(desc).category;

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

  it('every rule maps to a valid taxonomy category', () => {
    for (const r of KEYWORD_RULES) expect(TAXONOMY).toContain(r.category);
  });

  it('covers the common procurement vocabulary', () => {
    expect(cat('SS 304 PIPE 25NB')).toBe('Metals & Hardware');
    expect(cat('BALL BEARING 6205')).toBe('Machinery & Spares');
    expect(cat('S.S. BALL VALVE 25MM')).toBe('Machinery & Spares');
    expect(cat('POWER CABLE 4 CORE')).toBe('Electrical & Electronics');
    expect(cat('CARTON BOX 5 PLY')).toBe('Paper & Packaging');
    expect(cat('BAR CODE STICKER ROLL')).toBe('Paper & Packaging');
    expect(cat('SODA ASH LIGHT')).toBe('Chemicals & Dyes');
    expect(cat('MILK 1/2 LTR PACK')).toBe('Food & Agri Products');
    expect(cat('COTTON YARN 30s')).toBe('Fibres & Yarn');
    expect(cat('HAND GLOVES LEATHER')).toBe('Safety & PPE / Apparel');
    expect(cat('FREIGHT CHARGES')).toBe('Freight & Services');
    expect(cat('CEMENT OPC 53 GRADE')).toBe('Building Materials');
  });

  it('resolves order/overlap cases correctly (first-match-wins)', () => {
    expect(cat('FURNACE OIL')).toBe('Fuel & Energy');          // fuel, not lubricant
    expect(cat('HYDRAULIC OIL 68')).toBe('Lubricants & Oils'); // lubricant, not fuel
    expect(cat('RICE HUSK')).toBe('Agri & Biomass Fuel');      // biomass, not food 'rice'
    expect(cat('PVC PIPE 1 INCH')).toBe('Plastics & Rubber');  // plastic, not metal 'pipe'
    expect(cat('VEGETABLE OIL REFINED')).toBe('Food & Agri Products'); // edible, not lube/fuel
  });
});
