import { chapterToCategory, HSN_HEADING_OVERRIDES } from './taxonomy';

export function resolveByHsn(code: string): { category: string; ok: boolean } {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length < 2) return { category: '', ok: false };

  const heading = digits.slice(0, 4);
  if (heading.length === 4 && HSN_HEADING_OVERRIDES[heading]) {
    return { category: HSN_HEADING_OVERRIDES[heading], ok: true };
  }

  const chapter = parseInt(digits.slice(0, 2), 10);
  const cat = chapterToCategory(chapter);
  return cat ? { category: cat, ok: true } : { category: '', ok: false };
}
