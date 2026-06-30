/**
 * Content-based column profiling. Looks at the actual VALUES in a column to infer
 * its type, independent of the (infinitely variable) header name.
 */

export interface ColumnProfile {
  count: number;
  numericFraction: number;
  dateFraction: number;
  digitCodeFraction: number; // values that are pure 4-8 digit codes (HSN/SAC-like)
  intFraction: number;       // of the numeric values, how many are integers
  avgLen: number;
  distinctRatio: number;     // distinct / count (1 = all unique)
  sum: number;               // sum of numeric values
}

const EMPTY: ColumnProfile = {
  count: 0, numericFraction: 0, dateFraction: 0, digitCodeFraction: 0,
  intFraction: 0, avgLen: 0, distinctRatio: 0, sum: 0,
};

const cleanNum = (v: any): number => {
  const s = String(v).replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return NaN;
  return parseFloat(s);
};

const DMY = /^\s*\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/; // 01-04-2025, 2025/04/01, 1.4.25
const ISO = /^\d{4}-\d{2}-\d{2}/;

export const isDateLike = (v: any): boolean => {
  if (v instanceof Date) return !isNaN(v.getTime());
  const s = String(v).trim();
  if (!s) return false;
  return DMY.test(s) || ISO.test(s);
};

export const profileColumn = (values: any[]): ColumnProfile => {
  const vals = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
  const count = vals.length;
  if (count === 0) return { ...EMPTY };

  let numeric = 0, date = 0, code = 0, ints = 0, lenSum = 0, sum = 0;
  const distinct = new Set<string>();

  for (const v of vals) {
    const s = String(v).trim();
    lenSum += s.length;
    distinct.add(s);

    const dateLike = isDateLike(v);
    if (dateLike) date++;
    if (/^(\d{4}|\d{6}|\d{8})$/.test(s)) code++; // HSN/SAC are exactly 4, 6 or 8 digits

    // Count as numeric only if the WHOLE cell is a number (no letters). This stops
    // item descriptions like "Cotton Yarn 30s" being mistaken for numeric columns.
    const letters = (s.match(/[A-Za-z]/g) || []).length;
    const n = cleanNum(v);
    if (!isNaN(n) && /\d/.test(s) && !dateLike && letters === 0) {
      numeric++;
      sum += n;
      if (Number.isInteger(n)) ints++;
    }
  }

  return {
    count,
    numericFraction: numeric / count,
    dateFraction: date / count,
    digitCodeFraction: code / count,
    intFraction: numeric ? ints / numeric : 0,
    avgLen: lenSum / count,
    distinctRatio: distinct.size / count,
    sum,
  };
};
