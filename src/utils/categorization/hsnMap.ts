import { chapterToCategory, HSN_HEADING_OVERRIDES } from './taxonomy';

export function resolveByHsn(code: string): { category: string; ok: boolean } {
  let digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length === 0) return { category: '', ok: false };

  // HSN/SAC codes are 2/4/6/8 digits. Numeric storage (e.g. Excel) strips leading
  // zeros from chapters 01-09, leaving an ODD length — e.g. dairy "04012000" becomes
  // "4012000", which would misread as chapter 40 (Rubber). Restore the lost zero.
  if (digits.length >= 3 && digits.length % 2 === 1) digits = '0' + digits;
  if (digits.length < 2) return { category: '', ok: false };

  const heading = digits.slice(0, 4);
  if (heading.length === 4 && HSN_HEADING_OVERRIDES[heading]) {
    return { category: HSN_HEADING_OVERRIDES[heading], ok: true };
  }

  const chapter = parseInt(digits.slice(0, 2), 10);
  const cat = chapterToCategory(chapter);
  return cat ? { category: cat, ok: true } : { category: '', ok: false };
}
