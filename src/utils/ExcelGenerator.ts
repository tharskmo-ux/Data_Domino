/**
 * ExcelGenerator — Procurement Spend Analysis Export
 *
 * Tab structure (analyst report layout — matches client deliverable template):
 *   00_README                — what the workbook contains + methodology notes
 *   01_Executive_Summary     — headline KPI tiles + savings headline
 *   02_Spend_by_Category     — category spend table (live SUMIF off 06_Cleaned_Data)
 *   03_Spend_by_Vendor       — ranked vendor spend with Pareto cumulative %
 *   04_MultiVendor_Benchmark — items bought from 2+ vendors, rate gap + saving
 *   05_Savings_Opportunities — quantified + structural levers (analyst-tunable)
 *   06_Cleaned_Data          — the normalised transaction grid (18-col layout)
 *
 * Library: ExcelJS (already a project dependency)
 *
 * Drop-in: same public surface as before —
 *   new ExcelGenerator(data, mappings, currency).generate(): Promise<Blob>
 */

import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataRow {
    [key: string]: any;
}

/** Resolved column-name mappings coming out of the ETL column-mapper step. */
interface Mappings {
    amount?: string;
    invoice_amount?: string;
    currency?: string;
    quantity?: string;
    unit_price?: string;
    net_rate?: string;

    supplier?: string;
    vendor?: string;

    category_l1?: string;
    category?: string;

    department?: string;
    state?: string;

    date?: string;
    invoice_date?: string;
    po_date?: string;
    mrn_date?: string;

    document_number?: string;
    po_number?: string;
    invoice_number?: string;
    mrn_number?: string;
    bill_number?: string;
    item_code?: string;
    item_description?: string;
    hsn_code?: string;
    uom?: string;
    freight?: string;
    gross_amount?: string;

    [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// Colour constants (aligned to the client template)
// ---------------------------------------------------------------------------

const HEADER_FILL = '2E5496';   // dark blue — column-header backgrounds
const HEADER_TEXT = 'FFFFFF';
const TILE_FILL    = 'F2F2F2';  // light grey — KPI tiles
const TITLE_TEXT   = '1F3864';  // navy — sheet titles
const TOTAL_FILL   = 'D9E1F2';  // light blue — total rows
const SUBTLE_TEXT  = '666666';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAmount(val: any): number {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const s = String(val).replace(/[^0-9.-]+/g, '');
    return parseFloat(s) || 0;
}

function parseDate(val: any): Date | null {
    if (!val && val !== 0) return null;
    if (typeof val === 'number' && val > 25569) {
        return new Date((val - 25569) * 86400 * 1000);
    }
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

function str(val: any, fallback = ''): string {
    if (val === null || val === undefined) return fallback;
    return String(val).trim() || fallback;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Format a date as the template's dd-mmm-yy, e.g. 03-Apr-25. */
function fmtDate(d: Date | null): string {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    return `${dd}-${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
}

/** Pick the first key that actually exists on a sample row, else the supplied fallback. */
function resolveKey(sample: DataRow | undefined, candidates: (string | undefined)[], fallback: string): string {
    if (sample) {
        for (const c of candidates) {
            if (c && Object.prototype.hasOwnProperty.call(sample, c)) return c;
        }
    }
    return candidates.find(Boolean) ?? fallback;
}

// ===========================================================================
// ExcelGenerator
// ===========================================================================

export class ExcelGenerator {
    private wb: ExcelJS.Workbook;
    private data: DataRow[];
    private m: Mappings;

    // resolved column keys
    private amtKey: string;     // BASIC AMOUNT (pre-tax spend)
    private supKey: string;     // PARTY NAME / vendor
    private catKey: string;     // Category
    private dateKey: string;    // MRN DATE
    private qtyKey: string;     // QTY RCVD
    private rateKey: string;    // NET RATE
    private itemKey: string;    // ITEM CODE
    private descKey: string;    // ITEM DESC
    private hsnKey: string;     // HSN/SAC
    private uomKey: string;     // UOM
    private freightKey: string; // FREIGHT
    private grossKey: string;   // GROSS (incl tax)
    private stateKey: string;   // STATE CODE/NAME
    private deptKey: string;    // DEPARTMENT
    private mrnNoKey: string;   // MRN NO
    private billNoKey: string;  // BILL NO
    private poNoKey: string;    // PO NO

    constructor(data: DataRow[], mappings: Mappings, _currency = 'INR') {
        this.wb = new ExcelJS.Workbook();
        this.data = data ?? [];
        this.m = mappings ?? {};

        const s = this.data[0];
        // Resolve once, with fallbacks to the common raw ERP header names so the
        // generator still works even when the mapping step skipped a column.
        this.amtKey     = resolveKey(s, [this.m.amount, this.m.invoice_amount, 'BASIC AMOUNT', 'Basic Amount'], 'Amount');
        this.supKey     = resolveKey(s, [this.m.supplier, this.m.vendor, 'PARTY NAME', 'Vendor'], 'Vendor');
        this.catKey     = resolveKey(s, [this.m.category_l1, this.m.category, 'Category', 'CATEGORY'], 'Category');
        this.dateKey    = resolveKey(s, [this.m.date, this.m.mrn_date, this.m.invoice_date, this.m.po_date, 'MRN DATE'], 'Date');
        this.qtyKey     = resolveKey(s, [this.m.quantity, 'QTY RCVD.', 'QTY RCVD', 'Qty'], 'Qty');
        this.rateKey    = resolveKey(s, [this.m.net_rate, this.m.unit_price, 'NET RATE', 'Net Rate'], 'Net Rate');
        this.itemKey    = resolveKey(s, [this.m.item_code, 'ITEM CODE', 'Item Code'], 'Item Code');
        this.descKey    = resolveKey(s, [this.m.item_description, 'ITEM DESC.', 'ITEM DESC', 'Item Description'], 'Item Description');
        this.hsnKey     = resolveKey(s, [this.m.hsn_code, 'HSN/SAC CODE', 'HSN/SAC'], 'HSN/SAC');
        this.uomKey     = resolveKey(s, [this.m.uom, 'UOM'], 'UOM');
        this.freightKey = resolveKey(s, [this.m.freight, 'FREIGHT', 'Freight'], 'Freight');
        this.grossKey   = resolveKey(s, [this.m.gross_amount, 'GROSS', 'Gross'], 'Gross');
        this.stateKey   = resolveKey(s, [this.m.state, 'STATE CODE /NAME', 'STATE CODE/NAME', 'State'], 'State');
        this.deptKey    = resolveKey(s, [this.m.department, 'DEPARTMENT', 'Department'], 'Department');
        this.mrnNoKey   = resolveKey(s, [this.m.mrn_number, 'MRN NO.', 'MRN NO'], 'MRN No');
        this.billNoKey  = resolveKey(s, [this.m.bill_number, 'BILL NO.', 'BILL NO'], 'Bill No');
        this.poNoKey    = resolveKey(s, [this.m.po_number, 'PO NO.', 'PO NO'], 'PO No');

        this.wb.creator = 'Data Domino';
        this.wb.lastModifiedBy = 'Data Domino';
        this.wb.created = new Date();
        this.wb.modified = new Date();
    }

    // -----------------------------------------------------------------------
    // Public entry point
    // -----------------------------------------------------------------------
    public async generate(): Promise<Blob> {
        const stats = this.buildStats();

        this.createReadme(stats);
        this.createExecutiveSummary(stats);
        this.createSpendByCategory(stats);
        this.createSpendByVendor(stats);
        this.createMultiVendorBenchmark(stats);
        this.createSavings(stats);
        this.createCleanedData();   // last sheet, but report sheets above reference it by name

        const buf = await this.wb.xlsx.writeBuffer();
        return new Blob([buf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
    }

    // -----------------------------------------------------------------------
    // Aggregation (computed once, reused by every sheet)
    // -----------------------------------------------------------------------
    private buildStats() {
        const data = this.data;
        let totalBasic = 0;
        let totalGross = 0;
        let totalFreight = 0;
        const vendorSet = new Set<string>();
        const itemSet = new Set<string>();

        // Category L1 aggregation
        const catMap = new Map<string, { spend: number; lines: number }>();
        // Vendor aggregation
        const venMap = new Map<string, { spend: number; lines: number; items: Set<string> }>();
        // Per-item aggregation (for benchmark): item -> vendor -> {qty, spend}; plus uom set, desc, cat
        const itemMap = new Map<string, {
            desc: string; cat: string; uoms: Set<string>;
            qty: number; spend: number;
            vendors: Map<string, { qty: number; spend: number }>;
        }>();

        for (const row of data) {
            const basic = parseAmount(row[this.amtKey]);
            const ven = str(row[this.supKey], 'Unknown');
            const item = str(row[this.itemKey], 'Unknown');
            const cat = str(row[this.catKey], 'Other / Uncategorized');
            const qty = parseAmount(row[this.qtyKey]);
            const uom = str(row[this.uomKey], '');

            totalBasic += basic;
            totalGross += parseAmount(row[this.grossKey]);
            totalFreight += parseAmount(row[this.freightKey]);
            if (ven && ven !== 'Unknown') vendorSet.add(ven);
            if (item && item !== 'Unknown') itemSet.add(item);

            const ce = catMap.get(cat) ?? { spend: 0, lines: 0 };
            ce.spend += basic; ce.lines += 1; catMap.set(cat, ce);

            const ve = venMap.get(ven) ?? { spend: 0, lines: 0, items: new Set<string>() };
            ve.spend += basic; ve.lines += 1; ve.items.add(item); venMap.set(ven, ve);

            const ie = itemMap.get(item) ?? {
                desc: str(row[this.descKey]), cat, uoms: new Set<string>(),
                qty: 0, spend: 0, vendors: new Map<string, { qty: number; spend: number }>(),
            };
            ie.qty += qty; ie.spend += basic;
            if (uom) ie.uoms.add(uom);
            const vv = ie.vendors.get(ven) ?? { qty: 0, spend: 0 };
            vv.qty += qty; vv.spend += basic; ie.vendors.set(ven, vv);
            itemMap.set(item, ie);
        }

        const categories = [...catMap.entries()]
            .map(([name, d]) => ({ name, spend: d.spend, lines: d.lines }))
            .sort((a, b) => b.spend - a.spend);

        const vendors = [...venMap.entries()]
            .map(([name, d]) => ({ name, spend: d.spend, lines: d.lines, itemCount: d.items.size }))
            .sort((a, b) => b.spend - a.spend);

        // --- Multi-vendor benchmark ---
        // Comparable = item bought from >=2 distinct vendors AND a single clean UOM.
        const benchmark = [...itemMap.entries()]
            .filter(([, d]) => d.vendors.size >= 2 && d.uoms.size === 1 && d.qty > 0)
            .map(([code, d]) => {
                const paidWavg = d.spend / d.qty;
                let bestRate = Infinity, worstRate = 0, bestVendor = '';
                for (const [vn, vd] of d.vendors) {
                    if (vd.qty <= 0) continue;
                    const r = vd.spend / vd.qty;
                    if (r < bestRate) { bestRate = r; bestVendor = vn; }
                    if (r > worstRate) worstRate = r;
                }
                const saving = Math.max(0, paidWavg - bestRate) * d.qty; // capped at spend by construction
                return {
                    code, desc: d.desc, cat: d.cat, uom: [...d.uoms][0],
                    nVendors: d.vendors.size, qty: d.qty, spend: d.spend,
                    paidWavg, bestRate, bestVendor,
                    spread: bestRate > 0 ? worstRate / bestRate : 0,
                    saving, savingPct: d.spend > 0 ? saving / d.spend : 0,
                };
            })
            .sort((a, b) => b.saving - a.saving);

        const multiVendorSpend = [...itemMap.values()]
            .filter(d => d.vendors.size >= 2)
            .reduce((acc, d) => acc + d.spend, 0);

        // Fuel / biomass spend (rice husk + petroleum/LPG buckets, matched by category name)
        const fuelSpend = categories
            .filter(c => /fuel|biomass|husk|petroleum|lpg|agri/i.test(c.name))
            .reduce((acc, c) => acc + c.spend, 0);

        // Saving excluding biomass/fuel items (defensible recurring rate harmonisation)
        const rateHarmonisationSaving = benchmark
            .filter(b => !/fuel|biomass|husk|petroleum|lpg|agri/i.test(b.cat))
            .reduce((acc, b) => acc + b.saving, 0);
        const rateHarmonisationSpend = benchmark
            .filter(b => !/fuel|biomass|husk|petroleum|lpg|agri/i.test(b.cat))
            .reduce((acc, b) => acc + b.spend, 0);

        const top3Conc = totalBasic > 0
            ? vendors.slice(0, 3).reduce((acc, v) => acc + v.spend, 0) / totalBasic : 0;
        const tailVendors = vendors.filter(v => v.spend < 200000); // < Rs 2L/yr

        return {
            totalBasic, totalGross, totalFreight,
            uniqueVendors: vendorSet.size, uniqueItems: itemSet.size, lineItems: data.length,
            categories, vendors, benchmark,
            multiVendorSpend, fuelSpend,
            rateHarmonisationSaving, rateHarmonisationSpend,
            top3Conc, tailVendors,
        };
    }

    // -----------------------------------------------------------------------
    // Styling helpers
    // -----------------------------------------------------------------------
    private fmtCr(rs: number) { return `${(rs / 1e7).toFixed(2)} Rs Cr`; }

    private styleTitle(cell: ExcelJS.Cell, text: string, size = 16) {
        cell.value = text;
        cell.font = { bold: true, size, color: { argb: TITLE_TEXT }, name: 'Calibri' };
    }

    private styleHeaderRow(row: ExcelJS.Row) {
        row.eachCell({ includeEmpty: true }, cell => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
            cell.font = { bold: true, color: { argb: HEADER_TEXT }, name: 'Calibri', size: 11 };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        row.height = 26;
    }

    private tile(ws: ExcelJS.Worksheet, labelCell: string, valueCell: string, label: string, value: string) {
        const l = ws.getCell(labelCell);
        l.value = label;
        l.font = { size: 9, color: { argb: SUBTLE_TEXT }, name: 'Calibri' };
        l.alignment = { wrapText: true, vertical: 'top' };
        const v = ws.getCell(valueCell);
        v.value = value;
        v.font = { bold: true, size: 14, color: { argb: TITLE_TEXT }, name: 'Calibri' };
        v.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TILE_FILL } };
    }

    // -----------------------------------------------------------------------
    // SHEET 00 — README
    // -----------------------------------------------------------------------
    private createReadme(_stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('00_README', { views: [{ showGridLines: false }] });
        ws.getColumn(1).width = 2;
        ws.getColumn(2).width = 110;
        const lines: Array<[string, 'title' | 'h' | 'p']> = [
            ['Procurement Spend Analysis', 'title'],
            ['Generated by Data Domino', 'p'],
            ['', 'p'],
            ['WHAT THIS WORKBOOK CONTAINS', 'h'],
            ['01_Executive_Summary  – headline spend, vendor and savings KPIs.', 'p'],
            ['02_Spend_by_Category  – pre-tax spend grouped by category (live formulas off 06_Cleaned_Data).', 'p'],
            ['03_Spend_by_Vendor  – vendors ranked by spend with Pareto cumulative %.', 'p'],
            ['04_MultiVendor_Benchmark  – items bought from 2+ vendors, rate gap and potential saving.', 'p'],
            ['05_Savings_Opportunities  – quantified and structural cost levers.', 'p'],
            ['06_Cleaned_Data  – the normalised transaction grid all sheets are built from.', 'p'],
            ['', 'p'],
            ['HOW SPEND IS MEASURED', 'h'],
            ['"Spend" = BASIC AMOUNT (pre-tax). Tax-inclusive totals are shown separately on the summary.', 'p'],
            ['Pre-tax is used because GST is recoverable and not a true cost lever.', 'p'],
            ['', 'p'],
            ['READ THE SAVINGS NUMBERS AS AN UPPER BOUND', 'h'],
            ['Potential saving on a multi-vendor item = (weighted-avg rate paid − best in-year vendor rate) × annual qty.', 'p'],
            ['This is an UPPER BOUND. It does not adjust for grade/spec differences, intra-year price movement,', 'p'],
            ['freight terms or lot sizes. Treat each line as a question to validate, not a booked saving.', 'p'],
            ['Confidence ratings on 05_Savings_Opportunities flag where the benchmark is soft (e.g. seasonal fuel).', 'p'],
        ];
        let r = 2;
        for (const [text, kind] of lines) {
            const c = ws.getCell(`B${r}`);
            c.value = text;
            if (kind === 'title') c.font = { bold: true, size: 18, color: { argb: TITLE_TEXT } };
            else if (kind === 'h') c.font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
            else c.font = { size: 10, color: { argb: '333333' } };
            r++;
        }
    }

    // -----------------------------------------------------------------------
    // SHEET 01 — Executive Summary (KPI tiles)
    // -----------------------------------------------------------------------
    private createExecutiveSummary(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('01_Executive_Summary', { views: [{ showGridLines: false }] });
        ws.getColumn(1).width = 2;
        ws.getColumn(2).width = 26; ws.getColumn(3).width = 18;
        ws.getColumn(4).width = 3;
        ws.getColumn(5).width = 26; ws.getColumn(6).width = 18;

        this.styleTitle(ws.getCell('B2'), 'Executive Summary');
        const sub = ws.getCell('B3');
        sub.value = 'Procurement spend analysis';
        sub.font = { italic: true, color: { argb: SUBTLE_TEXT } };

        const topCat = stats.categories[0];
        this.tile(ws, 'B5', 'B6', 'Total pre-tax spend', this.fmtCr(stats.totalBasic));
        this.tile(ws, 'E5', 'E6', 'Total incl. tax', this.fmtCr(stats.totalGross));
        this.tile(ws, 'B8', 'B9', 'Vendors', stats.uniqueVendors.toLocaleString('en-IN'));
        this.tile(ws, 'E8', 'E9', 'Distinct items', stats.uniqueItems.toLocaleString('en-IN'));
        this.tile(ws, 'B11', 'B12', 'Line items', stats.lineItems.toLocaleString('en-IN'));
        this.tile(ws, 'E11', 'E12', 'Multi-vendor spend', this.fmtCr(stats.multiVendorSpend));
        this.tile(ws, 'B14', 'B15', topCat ? `Top category (${topCat.name})` : 'Top category', topCat ? this.fmtCr(topCat.spend) : '-');
        this.tile(ws, 'E14', 'E15', 'Fuel spend (rice husk + petroleum)', this.fmtCr(stats.fuelSpend));

        const h = ws.getCell('B17');
        h.value = 'SAVINGS HEADLINE';
        h.font = { bold: true, size: 12, color: { argb: HEADER_FILL } };

        const bullets = [
            `Firmer recurring lever — rate harmonisation across multi-vendor items: ~${this.fmtCr(stats.rateHarmonisationSaving)} (ex-fuel).`,
            `Timing lever — fuel/biomass at ${this.fmtCr(stats.fuelSpend)}; savings are seasonal, not vendor-driven (low confidence).`,
            `Structural — qualify a second source on high-spend single-vendor items.`,
            `Enabler — clean up generic/catch-all item codes so spend is attributable.`,
            `See 05_Savings_Opportunities for the lever-by-lever breakdown.`,
        ];
        let r = 18;
        for (const b of bullets) {
            const c = ws.getCell(`B${r}`);
            c.value = `•  ${b}`;
            c.font = { size: 10, color: { argb: '333333' } };
            ws.mergeCells(`B${r}:F${r}`);
            c.alignment = { wrapText: true };
            ws.getRow(r).height = 28;
            r++;
        }
    }

    // -----------------------------------------------------------------------
    // SHEET 02 — Spend by Category (live SUMIF off 06_Cleaned_Data)
    // -----------------------------------------------------------------------
    private createSpendByCategory(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('02_Spend_by_Category');
        ws.getColumn(1).width = 34; ws.getColumn(2).width = 20;
        ws.getColumn(3).width = 10; ws.getColumn(4).width = 11; ws.getColumn(5).width = 12;

        this.styleTitle(ws.getCell('A1'), 'Spend by Category');

        const hdr = ws.getRow(3);
        hdr.values = ['Category', 'Annual Spend (Rs)', 'Rs Cr', '% of Total', 'Line Items'];
        this.styleHeaderRow(hdr);

        const n = this.data.length;        // data rows in 06 start at row 2
        const lastRow = n + 1;             // 06 has header on row 1
        const totalRowNum = 4 + stats.categories.length;
        let r = 4;
        for (const cat of stats.categories) {
            ws.getCell(`A${r}`).value = cat.name;
            // Live formula so the workbook ties to 06_Cleaned_Data (Category=col K, Basic Amount=col O)
            ws.getCell(`B${r}`).value = { formula: `SUMIF('06_Cleaned_Data'!K2:K${lastRow},A${r},'06_Cleaned_Data'!O2:O${lastRow})` };
            ws.getCell(`B${r}`).numFmt = '#,##0';
            ws.getCell(`C${r}`).value = { formula: `B${r}/10000000` };
            ws.getCell(`C${r}`).numFmt = '#,##0.00';
            ws.getCell(`D${r}`).value = { formula: `B${r}/$B$${totalRowNum}` };
            ws.getCell(`D${r}`).numFmt = '0.0%';
            ws.getCell(`E${r}`).value = cat.lines;
            ws.getCell(`E${r}`).numFmt = '#,##0';
            r++;
        }
        // TOTAL row
        const totalRow = ws.getRow(r);
        totalRow.getCell(1).value = 'TOTAL';
        totalRow.getCell(2).value = { formula: `SUM(B4:B${r - 1})` };
        totalRow.getCell(2).numFmt = '#,##0';
        totalRow.getCell(3).value = { formula: `B${r}/10000000` };
        totalRow.getCell(3).numFmt = '#,##0.00';
        totalRow.getCell(4).value = { formula: `B${r}/$B$${r}` };
        totalRow.getCell(4).numFmt = '0.0%';
        totalRow.getCell(5).value = { formula: `SUM(E4:E${r - 1})` };
        totalRow.getCell(5).numFmt = '#,##0';
        totalRow.eachCell({ includeEmpty: true }, cell => {
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
        });
    }

    // -----------------------------------------------------------------------
    // SHEET 03 — Spend by Vendor (Pareto)
    // -----------------------------------------------------------------------
    private createSpendByVendor(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('03_Spend_by_Vendor');
        const widths = [6, 38, 20, 10, 11, 9, 8, 9];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'Spend by Vendor');
        const note = ws.getCell('A2');
        note.value = `${stats.uniqueVendors} vendors total. Top 3 = ${(stats.top3Conc * 100).toFixed(1)}% of spend.`;
        note.font = { italic: true, color: { argb: SUBTLE_TEXT } };

        const hdr = ws.getRow(4);
        hdr.values = ['Rank', 'Vendor', 'Annual Spend (Rs)', 'Rs Cr', '% of Total', 'Cum %', 'Lines', '# Items'];
        this.styleHeaderRow(hdr);

        let cum = 0;
        let r = 5;
        stats.vendors.forEach((v, i) => {
            cum += v.spend;
            const row = ws.getRow(r);
            row.values = [
                i + 1, v.name, v.spend, v.spend / 1e7,
                stats.totalBasic > 0 ? v.spend / stats.totalBasic : 0,
                stats.totalBasic > 0 ? cum / stats.totalBasic : 0,
                v.lines, v.itemCount,
            ];
            row.getCell(3).numFmt = '#,##0';
            row.getCell(4).numFmt = '#,##0.00';
            row.getCell(5).numFmt = '0.0%';
            row.getCell(6).numFmt = '0.0%';
            row.getCell(7).numFmt = '#,##0';
            row.getCell(8).numFmt = '#,##0';
            r++;
        });
        ws.views = [{ state: 'frozen', ySplit: 4 }];
    }

    // -----------------------------------------------------------------------
    // SHEET 04 — Multi-Vendor Benchmark
    // -----------------------------------------------------------------------
    private createMultiVendorBenchmark(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('04_MultiVendor_Benchmark');
        const widths = [14, 40, 24, 8, 10, 14, 18, 14, 14, 28, 9, 18, 10];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'Multi-Vendor Items — Rate Benchmark');
        const note = ws.getCell('A2');
        note.value = `${stats.benchmark.length} items bought from 2+ vendors at a single UOM. Saving = (rate paid − best in-year rate) × qty. Upper bound — validate spec/timing.`;
        note.font = { italic: true, color: { argb: SUBTLE_TEXT } };
        ws.mergeCells('A2:M2');
        note.alignment = { wrapText: true };

        const hdr = ws.getRow(5);
        hdr.values = ['Item Code', 'Item Description', 'Category', 'UOM', '# Vendors',
            'Annual Qty', 'Annual Spend (Rs)', 'Rate Paid (wavg)', 'Best Vendor Rate',
            'Best Vendor', 'Spread', 'Potential Saving (Rs)', 'Saving %'];
        this.styleHeaderRow(hdr);

        let r = 6;
        for (const b of stats.benchmark) {
            const row = ws.getRow(r);
            row.values = [b.code, b.desc, b.cat, b.uom, b.nVendors, b.qty, b.spend,
                b.paidWavg, b.bestRate, b.bestVendor, b.spread, b.saving, b.savingPct];
            row.getCell(6).numFmt = '#,##0';
            row.getCell(7).numFmt = '#,##0';
            row.getCell(8).numFmt = '#,##0.00';
            row.getCell(9).numFmt = '#,##0.00';
            row.getCell(11).numFmt = '0.0"x"';
            row.getCell(12).numFmt = '#,##0';
            row.getCell(13).numFmt = '0.0%';
            r++;
        }
        ws.views = [{ state: 'frozen', ySplit: 5 }];
    }

    // -----------------------------------------------------------------------
    // SHEET 05 — Savings Opportunities (quantified + structural)
    // -----------------------------------------------------------------------
    private createSavings(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('05_Savings_Opportunities');
        const widths = [4, 30, 44, 18, 18, 22, 44];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'Savings Opportunities — Lever Summary');

        const hdr = ws.getRow(3);
        hdr.values = ['#', 'Lever', 'What the data shows', 'Spend Touched (Rs)', 'Indicative Saving (Rs)', 'Confidence', 'Action'];
        this.styleHeaderRow(hdr);

        const fuelCat = stats.categories.find(c => /fuel|biomass|husk/i.test(c.name));
        const tailSpend = stats.tailVendors.reduce((acc, v) => acc + v.spend, 0);

        const rows: Array<[number | string, string, string, number | string, number | string, string, string]> = [
            [1, 'Rate harmonisation — multi-vendor',
                `${stats.benchmark.filter(b => !/fuel|biomass|husk/i.test(b.cat)).length} items bought from 2+ vendors at differing rates (ex-fuel).`,
                stats.rateHarmonisationSpend, stats.rateHarmonisationSaving, 'Medium',
                'Procurement to validate spec parity, then move volume to best in-year rate.'],
            [2, 'Fuel / biomass (timing)',
                fuelCat ? `Fuel/biomass = ${this.fmtCr(stats.fuelSpend)} (${(stats.fuelSpend / stats.totalBasic * 100).toFixed(1)}% of spend).` : 'No fuel category detected.',
                stats.fuelSpend, 'see note', 'Low (timing, not vendor)',
                'Forward/seasonal contracting; benchmark against index, not vendor spread.'],
            [3, 'Freight billed separately',
                `${this.fmtCr(stats.totalFreight)} freight invoiced as a separate line.`,
                stats.totalFreight, stats.totalFreight * 0.15, 'Medium',
                'Negotiate delivered (FOR) pricing to absorb freight.'],
            [4, 'Tail-vendor consolidation',
                `${stats.tailVendors.length} vendors are < Rs 2L/yr each (${this.fmtCr(tailSpend)} total).`,
                tailSpend, 'see note', 'Process saving',
                'Consolidate to preferred suppliers; cut PO/processing overhead.'],
            [5, 'Single-source leverage',
                'High-spend items sourced from one vendor carry no rate tension.',
                'see note', 'see note', 'Medium',
                'Qualify a second source on top single-vendor items to create competition.'],
            [6, 'Item-master data cleanup',
                'Generic/catch-all item codes blur attribution and block clean benchmarking.',
                'see note', 'see note', 'Enabler',
                'Replace catch-all codes with specific item masters.'],
        ];

        let r = 4;
        for (const row of rows) {
            const xr = ws.getRow(r);
            xr.values = row as unknown as ExcelJS.CellValue[];
            if (typeof row[3] === 'number') xr.getCell(4).numFmt = '#,##0';
            if (typeof row[4] === 'number') xr.getCell(5).numFmt = '#,##0';
            xr.alignment = { vertical: 'top', wrapText: true };
            r++;
        }
        // Quantified total (rate harmonisation lever 1 at row 4 + freight lever 3 at row 6)
        const totalRow = ws.getRow(r + 1);
        totalRow.getCell(2).value = 'Quantified saving range (levers 1 & 3)';
        totalRow.getCell(5).value = { formula: `E4+E6` };
        totalRow.getCell(5).numFmt = '#,##0';
        totalRow.getCell(2).font = { bold: true };
        totalRow.getCell(5).font = { bold: true };

        const noteRow = ws.getRow(r + 3);
        noteRow.getCell(2).value = 'Note: fuel/biomass (lever 2) is a timing play, not a vendor-rate play — excluded from the firm range above.';
        noteRow.getCell(2).font = { italic: true, color: { argb: SUBTLE_TEXT } };
    }

    // -----------------------------------------------------------------------
    // SHEET 06 — Cleaned Data (18-column normalised grid)
    // 02_Spend_by_Category SUMIF depends on this column order: K=Category, O=Basic Amount.
    // -----------------------------------------------------------------------
    private createCleanedData() {
        const ws = this.wb.addWorksheet('06_Cleaned_Data');
        const cols: Array<{ h: string; w: number; numFmt?: string }> = [
            { h: 'S.No', w: 7 },
            { h: 'MRN No', w: 11 },
            { h: 'MRN Date', w: 12 },
            { h: 'Bill No', w: 14 },
            { h: 'PO No', w: 14 },
            { h: 'Vendor', w: 30 },
            { h: 'State', w: 10 },
            { h: 'Item Code', w: 14 },
            { h: 'Item Description', w: 40 },
            { h: 'HSN/SAC', w: 12 },          // J
            { h: 'Category', w: 26 },          // K  ← SUMIF key
            { h: 'Qty Rcvd', w: 11, numFmt: '#,##0.00' },
            { h: 'UOM', w: 8 },
            { h: 'Net Rate', w: 12, numFmt: '#,##0.00' },
            { h: 'Basic Amount (Rs)', w: 16, numFmt: '#,##0.00' },  // O  ← SUMIF value
            { h: 'Freight (Rs)', w: 12, numFmt: '#,##0.00' },
            { h: 'Gross Amt (Rs)', w: 14, numFmt: '#,##0.00' },
            { h: 'Department', w: 16 },
        ];
        ws.columns = cols.map(c => ({ header: c.h, width: c.w }));
        this.styleHeaderRow(ws.getRow(1));
        cols.forEach((c, i) => { if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt; });

        let r = 2;
        this.data.forEach((row, i) => {
            const xr = ws.getRow(r);
            xr.values = [
                i + 1,
                str(row[this.mrnNoKey]),
                fmtDate(parseDate(row[this.dateKey])),
                str(row[this.billNoKey]),
                str(row[this.poNoKey]),
                str(row[this.supKey]),
                str(row[this.stateKey]),
                str(row[this.itemKey]),
                str(row[this.descKey]),
                str(row[this.hsnKey]),
                str(row[this.catKey], 'Other / Uncategorized'),
                parseAmount(row[this.qtyKey]),
                str(row[this.uomKey]),
                parseAmount(row[this.rateKey]),
                parseAmount(row[this.amtKey]),
                parseAmount(row[this.freightKey]),
                parseAmount(row[this.grossKey]),
                str(row[this.deptKey]),
            ];
            r++;
        });
        ws.views = [{ state: 'frozen', ySplit: 1 }];
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 18 } };
    }
}
