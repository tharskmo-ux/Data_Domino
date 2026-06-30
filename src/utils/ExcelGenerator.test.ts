import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { ExcelGenerator } from './ExcelGenerator';

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
      const v = Number(row.getCell(15).value); // column O = Basic Amount (Rs)
      if (!Number.isNaN(v)) colTotal += v;
    });
    expect(colTotal).toBe(inputTotal);
  });
});
