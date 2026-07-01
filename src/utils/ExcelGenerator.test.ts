import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ExcelGenerator, stateName } from './ExcelGenerator';

describe('stateName', () => {
  it('maps GST codes and abbreviations to full names', () => {
    expect(stateName('03/ PB')).toBe('Punjab');   // real Aarti format (with space)
    expect(stateName('27/ MH')).toBe('Maharashtra');
    expect(stateName('24-GUJARAT')).toBe('Gujarat');
    expect(stateName('27ABCDE1234F1Z5')).toBe('Maharashtra'); // GSTIN
    expect(stateName('/ PB')).toBe('Punjab');     // code lost, abbreviation only
    expect(stateName('0/ PB')).toBe('Punjab');
    expect(stateName('IM/ FRANCE')).toBe('Import');
    expect(stateName('IM/ NC')).toBe('Import');
    expect(stateName('PA/ NEW TAIPEI')).toBe('Import'); // foreign origin
    expect(stateName('TE/')).toBe('Import');
    expect(stateName('')).toBe('Unspecified');
  });
});

// Aarti-shaped rows with the lowercase `category` the CategoryMapper writes.
const rows: Array<Record<string, any>> = [
  { 'MRN DATE': '2025-04-01', 'PARTY NAME': 'Alpha Textiles', 'ITEM CODE': 'IT1', 'ITEM DESC.': 'Cotton Yarn 30s', 'HSN/SAC CODE': '52051110', 'QTY RCVD.': 100, 'UOM': 'KG', 'NET RATE': 250, 'BASIC AMOUNT': 250000, 'DEPARTMENT': 'SPINNING', 'STATE CODE /NAME': 'GUJARAT', category: 'Fibres & Yarn' },
  { 'MRN DATE': '2025-04-15', 'PARTY NAME': 'Beta Hardware', 'ITEM CODE': 'IT2', 'ITEM DESC.': 'Hex Bolt M12', 'HSN/SAC CODE': '73181500', 'QTY RCVD.': 500, 'UOM': 'NOS', 'NET RATE': 12, 'BASIC AMOUNT': 6000, 'DEPARTMENT': 'MECH', 'STATE CODE /NAME': 'GUJARAT', category: 'Metals & Hardware' },
  { 'MRN DATE': '2025-05-10', 'PARTY NAME': 'Gamma Electric', 'ITEM CODE': 'IT3', 'ITEM DESC.': '3-Phase Motor', 'HSN/SAC CODE': '85015210', 'QTY RCVD.': 5, 'UOM': 'NOS', 'NET RATE': 15000, 'BASIC AMOUNT': 75000, 'DEPARTMENT': 'ELECTRICAL', 'STATE CODE /NAME': 'MAHARASHTRA', category: 'Electrical & Electronics' },
  { 'MRN DATE': '2025-05-20', 'PARTY NAME': 'Alpha Textiles', 'ITEM CODE': 'IT1', 'ITEM DESC.': 'Cotton Yarn 30s', 'HSN/SAC CODE': '52051110', 'QTY RCVD.': 50, 'UOM': 'KG', 'NET RATE': 240, 'BASIC AMOUNT': 120000, 'DEPARTMENT': 'SPINNING', 'STATE CODE /NAME': 'GUJARAT', category: 'Fibres & Yarn' },
  { 'MRN DATE': '2025-06-01', 'PARTY NAME': 'Delta Energy', 'ITEM CODE': 'IT4', 'ITEM DESC.': 'Furnace Oil', 'HSN/SAC CODE': '27101950', 'QTY RCVD.': 2000, 'UOM': 'LTR', 'NET RATE': 55, 'BASIC AMOUNT': 110000, 'DEPARTMENT': 'BOILER', 'STATE CODE /NAME': 'GUJARAT', category: 'Fuel & Energy' },
];

const EXPECTED_SHEETS = [
  '00_README', '01_Executive_Summary', '02_ABC_Analysis', '03_Spend_by_Category',
  '04_Spend_by_Vendor', '05_Spend_Trend', '06_Spend_by_Dept_Geo',
  '07_Supplier_Concentration', '08_MultiVendor_Benchmark', '09_Savings_Opportunities',
  '10_Cleaned_Data',
];

async function loadWorkbook() {
  const blob = await new ExcelGenerator(rows, {}, 'INR').generate();
  const buf = await blob.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

const sheetText = (ws: ExcelJS.Worksheet) => {
  let s = '';
  ws.eachRow((row) => row.eachCell((c) => { s += ' ' + String(c.value ?? ''); }));
  return s;
};

describe('ExcelGenerator — 11-sheet report', () => {
  it('produces all 11 sheets in order', async () => {
    const wb = await loadWorkbook();
    expect(wb.worksheets.map((w) => w.name)).toEqual(EXPECTED_SHEETS);
  });

  it('ABC sheet has item and vendor tables', async () => {
    const wb = await loadWorkbook();
    const t = sheetText(wb.getWorksheet('02_ABC_Analysis')!);
    expect(t).toContain('BY ITEM');
    expect(t).toContain('BY VENDOR');
  });

  it('Dept/Geo sheet breaks down by department and state', async () => {
    const wb = await loadWorkbook();
    const t = sheetText(wb.getWorksheet('06_Spend_by_Dept_Geo')!);
    expect(t).toContain('BY DEPARTMENT');
    expect(t).toContain('SPINNING');
    expect(t).toContain('GUJARAT');
  });

  it('Concentration sheet reports HHI and single-source items', async () => {
    const wb = await loadWorkbook();
    const t = sheetText(wb.getWorksheet('07_Supplier_Concentration')!);
    expect(t).toContain('HHI');
  });

  it('Savings sheet is two clear sections with no dangling "see note"', async () => {
    const wb = await loadWorkbook();
    const t = sheetText(wb.getWorksheet('09_Savings_Opportunities')!);
    expect(t).toContain('QUANTIFIED SAVINGS');
    expect(t).toContain('ADDITIONAL OPPORTUNITIES');
    expect(t).toContain('Why not a firm number yet');
    expect(t).not.toMatch(/see note/i);
  });

  it('Trend sheet buckets by month', async () => {
    const wb = await loadWorkbook();
    const t = sheetText(wb.getWorksheet('05_Spend_Trend')!);
    expect(t).toContain('2025-04');
    expect(t).toContain('2025-05');
  });

  it('reconciles: cleaned-data Basic Amount column sums to the input total', async () => {
    const wb = await loadWorkbook();
    const ws = wb.getWorksheet('10_Cleaned_Data')!;
    const inputTotal = rows.reduce((a, r) => a + Number(r['BASIC AMOUNT']), 0);
    let colTotal = 0;
    ws.eachRow((row, n) => {
      if (n === 1) return; // header
      const v = Number(row.getCell(17).value); // column Q = Basic Amount (after adding L2/L3) (Rs)
      if (!Number.isNaN(v)) colTotal += v;
    });
    expect(colTotal).toBe(inputTotal);
  });
});

describe('ExcelGenerator — dashboard savings override', () => {
  it('mirrors the dashboard savings numbers when provided', async () => {
    const savings = {
      total: 84_300_000, // 8.43 Cr — the dashboard headline
      levers: [
        { label: 'Multi-Vendor Price Arbitrage', spend: 200_000_000, savings: 50_000_000, recommendation: 'Shift volume to cheapest vendor' },
        { label: 'Tail Spend Consolidation', spend: 30_000_000, savings: 34_300_000, recommendation: 'Consolidate long-tail suppliers' },
      ],
    };
    const blob = await new ExcelGenerator(rows, {}, 'INR', savings).generate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const t = sheetText(wb.getWorksheet('09_Savings_Opportunities')!);
    expect(t).toContain('Total identified savings');
    expect(t).toMatch(/8\.43/); // headline matches the dashboard (Cr)
    expect(t).toContain('Multi-Vendor Price Arbitrage');
    expect(t).toContain('Tail Spend Consolidation');
    expect(t).not.toContain('QUANTIFIED SAVINGS'); // the fallback design is NOT used
  });

  it('falls back to the built-in Savings design when no dashboard savings given', async () => {
    const wb = await loadWorkbook();
    const t = sheetText(wb.getWorksheet('09_Savings_Opportunities')!);
    expect(t).toContain('QUANTIFIED SAVINGS'); // fallback two-section design
  });
});

describe('ExcelGenerator — data hygiene', () => {
  const headerRow: Record<string, any> = {
    'MRN DATE': 'MRN DATE', 'PARTY NAME': 'PARTY NAME', 'ITEM CODE': 'ITEM CODE',
    'ITEM DESC.': 'ITEM DESC.', 'HSN/SAC CODE': 'HSN/SAC CODE', 'QTY RCVD.': 'QTY RCVD.',
    'NET RATE': 'NET RATE', 'BASIC AMOUNT': 'BASIC AMOUNT', 'DEPARTMENT': 'DEPARTMENT',
    'STATE CODE /NAME': 'STATE CODE /NAME', category: '', category_l2: '', category_l3: '',
  };
  const dirty: Array<Record<string, any>> = [
    headerRow, // a repeated header row that must be dropped
    { 'MRN DATE': '2025-04-01', 'PARTY NAME': 'Alpha', 'ITEM CODE': 'IT1', 'ITEM DESC.': 'Cotton Yarn', 'HSN/SAC CODE': '52051110', 'QTY RCVD.': 10, 'NET RATE': 250, 'BASIC AMOUNT': 250000, 'DEPARTMENT': 'SPIN', 'STATE CODE /NAME': '03/PB', category: 'Fibres & Yarn', category_l2: 'Cotton', category_l3: 'Cotton Yarn' },
    { 'MRN DATE': '2025-04-02', 'PARTY NAME': 'Beta', 'ITEM CODE': 'IT2', 'ITEM DESC.': 'Bolt', 'HSN/SAC CODE': '73181500', 'QTY RCVD.': 5, 'NET RATE': 12, 'BASIC AMOUNT': 6000, 'DEPARTMENT': 'MECH', 'STATE CODE /NAME': '24-GUJARAT', category: 'Metals & Hardware', category_l2: 'Fasteners', category_l3: 'Bolt' },
  ];

  it('drops repeated header rows, converts state codes, shows L1/L2/L3', async () => {
    const blob = await new ExcelGenerator(dirty, {}, 'INR').generate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet('10_Cleaned_Data')!;

    // header row filtered -> only 2 data rows
    let dataRows = 0;
    ws.eachRow((row, n) => { if (n > 1 && row.getCell(6).value) dataRows++; });
    expect(dataRows).toBe(2);

    const hdr = (ws.getRow(1).values as any[]).map((v) => String(v));
    expect(hdr).toContain('Category L1');
    expect(hdr).toContain('Category L2');
    expect(hdr).toContain('Category L3');

    const t = sheetText(ws);
    expect(t).toContain('Punjab');   // 03/PB -> Punjab
    expect(t).toContain('Gujarat');  // 24-GUJARAT -> Gujarat
    expect(t).not.toContain('03/PB');
    expect(t).toContain('Cotton Yarn'); // L3 value present
  });
});
