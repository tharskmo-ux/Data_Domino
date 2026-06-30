// Usage: npx tsx scripts/validate-categorization.mjs "C:/Users/Harshad/Downloads/PURCHASE 2025-26.xls"
import XLSX from 'xlsx';
import { resolveByHsn } from '../src/utils/categorization/hsnMap.ts';
import { resolveByKeyword } from '../src/utils/categorization/keywordRules.ts';

const file = process.argv[2];
if (!file) {
  console.error('Pass the .xls path');
  process.exit(1);
}

const wb = XLSX.readFile(file, { cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
let h = 0;
for (let i = 0; i < 20; i++)
  if (rows[i].filter((c) => String(c).trim() !== '').length >= 5) {
    h = i;
    break;
  }
const headers = rows[h].map((x) => String(x).trim());
const idx = (re) => headers.findIndex((x) => re.test(x));
const hsnCol = idx(/hsn/i);
const descCol = idx(/item\s*desc|description/i);
const amtCol = idx(/basic\s*amount/i);

const counts = { hsn: 0, keyword: 0, unmapped: 0 };
const spend = { hsn: 0, keyword: 0, unmapped: 0 };
let total = 0;
for (let r = h + 1; r < rows.length; r++) {
  const row = rows[r];
  if (!row || row.every((c) => String(c).trim() === '')) continue;
  const amt = parseFloat(String(row[amtCol]).replace(/[^0-9.-]+/g, '')) || 0;
  total += amt;
  const byHsn = resolveByHsn(String(row[hsnCol]));
  if (byHsn.ok) {
    counts.hsn++;
    spend.hsn += amt;
    continue;
  }
  const byKw = resolveByKeyword(String(row[descCol]));
  if (byKw.ok) {
    counts.keyword++;
    spend.keyword += amt;
    continue;
  }
  counts.unmapped++;
  spend.unmapped += amt;
}
const n = counts.hsn + counts.keyword + counts.unmapped;
const pct = (x) => ((x / n) * 100).toFixed(1) + '%';
const pctSpend = (x) => ((x / total) * 100).toFixed(1) + '%';
console.log('Header cols -> HSN:', hsnCol, 'DESC:', descCol, 'AMOUNT:', amtCol);
console.log('Rows:', n);
console.log('By HSN:    ', counts.hsn, pct(counts.hsn), '| spend', pctSpend(spend.hsn));
console.log('By keyword:', counts.keyword, pct(counts.keyword), '| spend', pctSpend(spend.keyword));
console.log('Unmapped:  ', counts.unmapped, pct(counts.unmapped), '| spend', pctSpend(spend.unmapped));
console.log('Auto-covered (hsn+keyword) by rows:', pct(counts.hsn + counts.keyword));
console.log('Auto-covered by spend:', pctSpend(spend.hsn + spend.keyword));
const recon = spend.hsn + spend.keyword + spend.unmapped;
console.log('Total spend:', total.toLocaleString('en-IN'));
console.log('Reconciles:', Math.abs(recon - total) < 1 ? 'YES' : 'NO (diff ' + (recon - total) + ')');
