import { chapterToCategory, HSN_HEADING_OVERRIDES } from './taxonomy';

/**
 * Normalise an HSN/SAC code to its digit string, restoring a leading zero that
 * numeric storage (e.g. Excel) strips from chapters 01-09 — "4012000" -> "04012000".
 */
export function normalizeHsn(code: string): string {
  let digits = String(code ?? '').replace(/\D/g, '');
  if (digits.length >= 3 && digits.length % 2 === 1) digits = '0' + digits;
  return digits;
}

export function resolveByHsn(code: string): { category: string; ok: boolean } {
  const digits = normalizeHsn(code);
  if (digits.length < 2) return { category: '', ok: false };

  const heading = digits.slice(0, 4);
  if (heading.length === 4 && HSN_HEADING_OVERRIDES[heading]) {
    return { category: HSN_HEADING_OVERRIDES[heading], ok: true };
  }

  const chapter = parseInt(digits.slice(0, 2), 10);
  const cat = chapterToCategory(chapter);
  return cat ? { category: cat, ok: true } : { category: '', ok: false };
}
