import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { computeConservativeSavings, computeConservativeSavingsFromMappings, computeSavingsModel, type SavingsColumns } from './savings';
import { ExcelGenerator } from './ExcelGenerator';

const COLS: SavingsColumns = {
    itemKey: 'item', vendorKey: 'vendor', uomKey: 'uom', qtyKey: 'qty',
    amountKey: 'amount', categoryKey: 'cat', descKey: 'desc', freightKey: 'freight',
};

const dataset = [
    { item: 'IT1', vendor: 'V1', uom: 'KG', qty: 100, amount: 25000, cat: 'Metals & Hardware', desc: 'Bolt', freight: 0 },
    { item: 'IT1', vendor: 'V2', uom: 'KG', qty: 50, amount: 12000, cat: 'Metals & Hardware', desc: 'Bolt', freight: 0 },
    { item: 'IT2', vendor: 'V1', uom: 'KG', qty: 10, amount: 1000, cat: 'Metals & Hardware', desc: 'Wire', freight: 0 },
    { item: 'IT2', vendor: 'V2', uom: 'MT', qty: 1, amount: 2000, cat: 'Metals & Hardware', desc: 'Wire', freight: 0 },
    { item: 'IT3', vendor: 'V1', uom: 'MT', qty: 10, amount: 50000, cat: 'Fuel & Energy', desc: 'Coal', freight: 0 },
    { item: 'IT3', vendor: 'V2', uom: 'MT', qty: 10, amount: 45000, cat: 'Fuel & Energy', desc: 'Coal', freight: 0 },
    { item: 'IT4', vendor: 'V3', uom: 'NOS', qty: 1, amount: 10000, cat: 'Metals & Hardware', desc: 'Valve', freight: 2000 },
];

describe('computeConservativeSavings', () => {
    it('rate harmonisation on clean multi-vendor items; excludes mixed-UOM and fuel', () => {
        const s = computeConservativeSavings(dataset, COLS);
        expect(Math.round(s.rateHarmonisationSaving)).toBe(1000); // only IT1
        expect(s.freightSaving).toBe(300);
        expect(Math.round(s.firmSaving)).toBe(1300);
    });

    it('agrees with the Excel report headline (no drift)', async () => {
        const rows = dataset.map((r) => ({
            'ITEM CODE': r.item, 'PARTY NAME': r.vendor, 'UOM': r.uom, 'QTY RCVD.': r.qty,
            'BASIC AMOUNT': r.amount, category: r.cat, 'ITEM DESC.': r.desc, 'FREIGHT': r.freight,
        }));
        const util = computeConservativeSavingsFromMappings(rows, {});
        const blob = await new ExcelGenerator(rows, {}, 'INR').generate();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await blob.arrayBuffer());
        let text = '';
        wb.getWorksheet('09_Savings_Opportunities')!.eachRow((row) => row.eachCell((c) => { text += ' ' + String(c.value ?? ''); }));
        expect(text).toContain(`${(util.firmSaving / 1e7).toFixed(2)} Rs Cr`);
    });
});

describe('computeSavingsModel (shared by dashboard + Excel)', () => {
    const rows = dataset.map((r) => ({
        'ITEM CODE': r.item, 'PARTY NAME': r.vendor, 'UOM': r.uom, 'QTY RCVD.': r.qty,
        'BASIC AMOUNT': r.amount, category: r.cat, 'ITEM DESC.': r.desc, 'FREIGHT': r.freight,
    }));

    it('produces firm + indicative levers, each with a plain-English "how"', () => {
        const m = computeSavingsModel(rows, {});
        const byKey = Object.fromEntries(m.levers.map((l) => [l.key, l]));
        expect(Math.round(m.firmSaving)).toBe(1300);              // rate harmonisation 1000 + freight 300
        expect(Math.round(byKey.rateHarmonisation.saving)).toBe(1000);
        expect(Math.round(byKey.freight.saving)).toBe(300);
        expect(Math.round(byKey.alternateVendor.saving)).toBe(500);   // IT4 single-source: 5% of 10,000
        // every lever explains itself
        m.levers.forEach((l) => expect(l.how.length).toBeGreaterThan(15));
        // firm levers are listed before indicative
        const firstIndicative = m.levers.findIndex((l) => l.tier === 'indicative');
        const lastFirm = m.levers.map((l) => l.tier).lastIndexOf('firm');
        expect(lastFirm).toBeLessThan(firstIndicative);
    });

    it('the Excel report shows the SAME indicative lever numbers (dashboard == report)', async () => {
        const m = computeSavingsModel(rows, {});
        const blob = await new ExcelGenerator(rows, {}, 'INR').generate();
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await blob.arrayBuffer());
        let text = '';
        wb.getWorksheet('09_Savings_Opportunities')!.eachRow((row) => row.eachCell((c) => { text += ' ' + String(c.value ?? ''); }));
        for (const lever of m.levers.filter((l) => l.saving > 0)) {
            expect(text).toContain(String(Math.round(lever.basisSpend)));  // basis spend cell present
        }
    });
});
