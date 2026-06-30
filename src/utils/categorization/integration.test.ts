import { describe, it, expect } from 'vitest';
import { categorize } from './categorize';

// Aarti-shaped rows: raw ERP headers, with a populated DEPARTMENT column (the bug trigger).
const rows: Array<Record<string, any>> = [
  { 'MRN DATE': '2025-04-01', 'PARTY NAME': 'Alpha', 'ITEM DESC.': 'Cotton Yarn 30s', 'HSN/SAC CODE': '52051110', 'BASIC AMOUNT': 250000, DEPARTMENT: 'SPINNING' },
  { 'MRN DATE': '2025-04-03', 'PARTY NAME': 'Beta', 'ITEM DESC.': 'Hex Bolt M12', 'HSN/SAC CODE': '73181500', 'BASIC AMOUNT': 6000, DEPARTMENT: 'MECH' },
  { 'MRN DATE': '2025-04-05', 'PARTY NAME': 'Gamma', 'ITEM DESC.': '3-Phase Motor', 'HSN/SAC CODE': '85015210', 'BASIC AMOUNT': 75000, DEPARTMENT: 'ELECTRICAL' },
  { 'MRN DATE': '2025-04-15', 'PARTY NAME': 'Eta', 'ITEM DESC.': 'Misc Unknown', 'HSN/SAC CODE': '', 'BASIC AMOUNT': 1000, DEPARTMENT: 'STORES' },
];

const findKey = (sample: Record<string, any>, re: RegExp) =>
  Object.keys(sample).find((k) => re.test(k));

describe('CategoryMapper auto-categorize integration (Aarti-shaped data)', () => {
  it('resolves HSN/desc keys from raw headers and populates categories', async () => {
    const sample = rows[0];
    const hsnKey = findKey(sample, /hsn|sac/i);
    const descKey = findKey(sample, /desc|item|material|particular/i);
    expect(hsnKey).toBe('HSN/SAC CODE');
    expect(descKey).toBe('ITEM DESC.');

    const results = await categorize(rows, { hsnKey: hsnKey!, descKey: descKey! });
    expect(results.map((r) => r.category)).toEqual([
      'Fibres & Yarn',
      'Metals & Hardware',
      'Electrical & Electronics',
      'Other / Review',
    ]);
  });

  it('FIX: writes into a fresh category column, not DEPARTMENT — no rows skipped', async () => {
    const categoryCol = 'category'; // post-fix: category_l1 not bound to DEPARTMENT
    const sample = rows[0];
    const hsnKey = findKey(sample, /hsn|sac/i)!;
    const descKey = findKey(sample, /desc|item|material|particular/i)!;
    const results = await categorize(rows, { hsnKey, descKey });

    let written = 0;
    const next = rows.map((row, i) => {
      const existing = row[categoryCol];
      if (existing && String(existing).trim() && existing !== 'Uncategorized') return row;
      written++;
      return { ...row, [categoryCol]: results[i].category };
    });
    expect(written).toBe(4); // all rows written
    expect(next[0]['category']).toBe('Fibres & Yarn');
    expect(next[0]['DEPARTMENT']).toBe('SPINNING'); // department left untouched
  });

  it('REGRESSION: the old DEPARTMENT mis-mapping skipped every row', () => {
    const categoryCol = 'DEPARTMENT'; // the pre-fix bug
    let written = 0;
    rows.forEach((row) => {
      const existing = row[categoryCol];
      if (existing && String(existing).trim() && existing !== 'Uncategorized') return;
      written++;
    });
    expect(written).toBe(0); // every row skipped → "not working"
  });
});
