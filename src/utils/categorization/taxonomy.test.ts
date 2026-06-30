import { describe, it, expect } from 'vitest';
import { TAXONOMY, OTHER, chapterToCategory } from './taxonomy';

describe('taxonomy', () => {
  it('includes the catch-all bucket', () => {
    expect(TAXONOMY).toContain(OTHER);
  });

  it('maps every HSN chapter 1..99 to a defined taxonomy bucket', () => {
    for (let ch = 1; ch <= 99; ch++) {
      const cat = chapterToCategory(ch);
      expect(cat, `chapter ${ch}`).toBeDefined();
      expect(TAXONOMY, `chapter ${ch} -> ${cat}`).toContain(cat);
    }
  });

  it('maps known chapters correctly', () => {
    expect(chapterToCategory(52)).toBe('Fibres & Yarn'); // cotton
    expect(chapterToCategory(84)).toBe('Machinery & Spares');
    expect(chapterToCategory(85)).toBe('Electrical & Electronics');
    expect(chapterToCategory(27)).toBe('Fuel & Energy');
    expect(chapterToCategory(99)).toBe('Freight & Services');
  });
});
