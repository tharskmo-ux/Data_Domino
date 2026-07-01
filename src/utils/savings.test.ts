import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { computeConservativeSavings, type SavingsColumns } from './savings';
import { ExcelGenerator } from './ExcelGenerator';

const COLS: SavingsColumns = {
    itemKey: 'item', vendorKey: 'vendor', uomKey: 'uom', qtyKey: 'qty',
    amountKey: 'amount', categoryKey: 'cat', descKey: 'desc', freightKey: 'freight',
};

const dataset = [
    // IT1: two vendors, single UOM -> qualifies. paidWavg = 37000/150 = 246.67, best = 240 -> saving 1000
    { item: 'IT1', vendor: 'V1', uom: 'KG', qty: 100, amount: 25000, cat: 'Metals & Hardware', desc: 'Bolt', freight: 0 },
    { item: 'IT1', vendor: 'V2', uom: 'KG', qty: 50, amount: 12000, cat: 'Metals & Hardware', desc: 'Bolt', freight: 0 },
    // IT2: two vendors but MIXED UOM -> excluded (no false arbitrage)
    { item: 'IT2', vendor: 'V1', uom: 'KG', qty: 10, amount: 1000, cat: 'Metals & Hardware', desc: 'Wire', freight: 0 },
    { item: 'IT2', vendor: 'V2', uom: 'MT', qty: 1, amount: 2000, cat: 'Metals & Hardware', desc: 'Wire', freight: 0 },
    // IT3: two vendors, single UOM, but FUEL -> excluded from firm rate harmonisation
    { item: 'IT3', vendor: 'V1', uom: 'MT', qty: 10, amount: 50000, cat: 'Fuel & Energy', desc: 'Coal', freight: 0 },
    { item: 'IT3', vendor: 'V2', uom: 'MT', qty: 10, amount: 45000, cat: 'Fuel & Energy', desc: 'Coal', freight: 0 },
    // IT4: single vendor -> not a benchmark item; carries freight
    { item: 'IT4', vendor: 'V3', uom: 'NOS', qty: 1, amount: 10000, cat: 'Metals & Hardware', desc: 'Valve', freight: 2000 },
];

describe('computeConservativeSavings', () => {
    it('rate harmonisation on clean multi-vendor items, excludes mixed-UOM and fuel', () => {
        const s = computeConservativeSavings(dataset, COLS);
        expect(Math.round(s.rateHarmonisationSaving)).toBe(1000); // only IT1
        expect(s.benchmark.map((b) => b.code).sort()).toEqual(['IT1', 'IT3']); // IT2 excluded (mixed UOM)
        expect(s.freightSaving).toBe(300); // 2000 * 0.15
        expect(Math.round(s.firmSaving)).toBe(1300); // 1000 + 300
        expect(s.totalSpend).toBe(145000);
    });

    it('agrees with the Excel report headline (single source of truth — no drift)', async () => {
        // Map the same dataset onto the ERP header names the ExcelGenerator resolves.
        const rows = dataset.map((r) => ({
            'ITEM CODE': r.item, 'PARTY NAME': r.vendor, 'UOM': r.uom, 'QTY RCVD.': r.qty,
            'BASIC AMOUNT': r.amount, category: r.cat, 'ITEM DESC.': r.desc, 'FREIGHT': r.freight,
        }));
        const util = computeConservativeSavings(rows, {
            itemKey: 'ITEM CODE', vendorKey: 'PARTY NAME', uomKey: 'UOM', qtyKey: 'QTY RCVD.',
            amountKey: 'BASIC AMOUNT', categoryKey: 'category', descKey: 'ITEM DESC.', freightKey: 'FREIGHT',
        });

        const blob = await new ExcelGenerator(rows, {}, 'INR').generate();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await blob.arrayBuffer());
        let text = '';
        wb.getWorksheet('09_Savings_Opportunities')!.eachRow((row) => row.eachCell((c) => { text += ' ' + String(c.value ?? ''); }));

        // The Excel headline shows the firm saving in Rs Cr to 2 dp.
        const cr = (util.firmSaving / 1e7).toFixed(2);
        expect(text).toContain(`${cr} Rs Cr`);
    });
});
