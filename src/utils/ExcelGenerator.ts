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

// ---------------------------------------------------------------------------
// GST state codes → full state names. GSTIN and "State Code/Name" fields lead with
// the 2-digit GST state code (e.g. "03/PB", "24-GUJARAT", "27ABCDE...").
// ---------------------------------------------------------------------------
const GST_STATE: Record<string, string> = {
    '01': 'Jammu & Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh',
    '05': 'Uttarakhand', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh',
    '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur',
    '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal',
    '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat',
    '25': 'Daman & Diu', '26': 'Dadra & Nagar Haveli', '27': 'Maharashtra', '28': 'Andhra Pradesh (Old)',
    '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu',
    '34': 'Puducherry', '35': 'Andaman & Nicobar', '36': 'Telangana', '37': 'Andhra Pradesh',
    '38': 'Ladakh', '97': 'Other Territory',
};

/** Resolve a raw state / GSTIN / "03/PB" value to a full state name. */
function stateName(raw: any): string {
    const s = String(raw ?? '').trim();
    if (!s) return 'Unspecified';
    const code = s.slice(0, 2);
    if (GST_STATE[code]) return GST_STATE[code];
    const m = s.match(/\b(\d{2})\b/);
    if (m && GST_STATE[m[1]]) return GST_STATE[m[1]];
    // Already a name (possibly prefixed like "03-PUNJAB"): strip a leading code.
    return s.replace(/^\d{2}[\s/\-]*/, '').trim() || s;
}

/** Detect repeated header rows that some ERP exports leave inside the data. */
function looksLikeHeader(row: DataRow, amtKey: string, supKey: string, descKey: string): boolean {
    // A genuine amount is numeric; a header row carries text like "BASIC AMOUNT".
    if (/[A-Za-z]{2,}/.test(String(row[amtKey] ?? ''))) return true;
    const HEADERS = new Set(['PARTY NAME', 'VENDOR', 'SUPPLIER', 'ITEM DESC.', 'ITEM DESC', 'ITEM DESCRIPTION', 'BASIC AMOUNT']);
    if (HEADERS.has(String(row[supKey] ?? '').trim().toUpperCase())) return true;
    if (HEADERS.has(String(row[descKey] ?? '').trim().toUpperCase())) return true;
    return false;
}

// ---------------------------------------------------------------------------
// Sheet names — centralised so the order/numbering and the SUMIF cross-reference
// to the cleaned-data sheet can never drift apart.
// ---------------------------------------------------------------------------
const SHEETS = {
    readme: '00_README',
    exec: '01_Executive_Summary',
    abc: '02_ABC_Analysis',
    category: '03_Spend_by_Category',
    vendor: '04_Spend_by_Vendor',
    trend: '05_Spend_Trend',
    deptGeo: '06_Spend_by_Dept_Geo',
    concentration: '07_Supplier_Concentration',
    benchmark: '08_MultiVendor_Benchmark',
    savings: '09_Savings_Opportunities',
    cleaned: '10_Cleaned_Data',
} as const;

/** Assign A/B/C Pareto tiers over rows already sorted by spend desc. A<=80%, B<=95%, else C. */
function classifyABC<T extends { spend: number }>(rows: T[], total: number): Array<T & { cum: number; cls: 'A' | 'B' | 'C' }> {
    let running = 0;
    return rows.map((r) => {
        running += r.spend;
        const cum = total > 0 ? running / total : 0;
        const cls = cum <= 0.8 ? 'A' : cum <= 0.95 ? 'B' : 'C';
        return { ...r, cum, cls };
    });
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
    private catKey: string;     // Category L1
    private l2Key: string;      // Category L2
    private l3Key: string;      // Category L3
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
        // Include the lowercase 'category' key the CategoryMapper writes its auto-
        // categorization results into (falls here when no category column was mapped).
        this.catKey     = resolveKey(s, [this.m.category_l1, this.m.category, 'category_l1', 'category', 'Category', 'CATEGORY', 'Category_L1'], 'category');
        this.l2Key      = resolveKey(s, [this.m.category_l2, 'category_l2', 'Category_L2'], 'category_l2');
        this.l3Key      = resolveKey(s, [this.m.category_l3, 'category_l3', 'Category_L3'], 'category_l3');
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

        // Drop repeated header rows some ERP exports leave inside the data (they would
        // otherwise show up as a "PARTY NAME" vendor / header rows in every sheet).
        this.data = this.data.filter(r => !looksLikeHeader(r, this.amtKey, this.supKey, this.descKey));

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
        this.createABC(stats);
        this.createSpendByCategory(stats);
        this.createSpendByVendor(stats);
        this.createSpendTrend(stats);
        this.createSpendByDeptGeo(stats);
        this.createConcentration(stats);
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
        // Department, geography (state) and monthly aggregations
        const deptMap = new Map<string, { spend: number; lines: number }>();
        const stateMap = new Map<string, { spend: number; lines: number; vendors: Set<string> }>();
        const monthMap = new Map<string, { spend: number; lines: number }>();

        for (const row of data) {
            const basic = parseAmount(row[this.amtKey]);
            const ven = str(row[this.supKey], 'Unknown');
            const item = str(row[this.itemKey], 'Unknown');
            const cat = str(row[this.catKey], 'Other / Uncategorized');
            const qty = parseAmount(row[this.qtyKey]);
            const uom = str(row[this.uomKey], '');
            const dept = str(row[this.deptKey], 'Unspecified');
            const state = stateName(row[this.stateKey]);
            const dt = parseDate(row[this.dateKey]);
            const ym = dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : 'Undated';

            totalBasic += basic;
            totalGross += parseAmount(row[this.grossKey]);
            totalFreight += parseAmount(row[this.freightKey]);
            if (ven && ven !== 'Unknown') vendorSet.add(ven);
            if (item && item !== 'Unknown') itemSet.add(item);

            const de = deptMap.get(dept) ?? { spend: 0, lines: 0 };
            de.spend += basic; de.lines += 1; deptMap.set(dept, de);

            const ste = stateMap.get(state) ?? { spend: 0, lines: 0, vendors: new Set<string>() };
            ste.spend += basic; ste.lines += 1; ste.vendors.add(ven); stateMap.set(state, ste);

            const moe = monthMap.get(ym) ?? { spend: 0, lines: 0 };
            moe.spend += basic; moe.lines += 1; monthMap.set(ym, moe);

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
        const top10Conc = totalBasic > 0
            ? vendors.slice(0, 10).reduce((acc, v) => acc + v.spend, 0) / totalBasic : 0;
        const tailVendors = vendors.filter(v => v.spend < 200000); // < Rs 2L/yr

        // Herfindahl-Hirschman Index over vendor market shares (0..10000)
        const hhi = totalBasic > 0
            ? vendors.reduce((acc, v) => { const sh = (v.spend / totalBasic) * 100; return acc + sh * sh; }, 0) : 0;

        // Items ranked by spend (for ABC + single-source detection)
        const items = [...itemMap.entries()]
            .map(([code, d]) => ({ code, desc: d.desc, spend: d.spend, qty: d.qty, vendorCount: d.vendors.size }))
            .sort((a, b) => b.spend - a.spend);
        // Single-source items (exactly one vendor), highest spend first
        const singleSource = items.filter(it => it.vendorCount === 1 && it.spend > 0);

        // Department + geography breakdowns
        const departments = [...deptMap.entries()]
            .map(([name, d]) => ({ name, spend: d.spend, lines: d.lines }))
            .sort((a, b) => b.spend - a.spend);
        const states = [...stateMap.entries()]
            .map(([name, d]) => ({ name, spend: d.spend, lines: d.lines, vendorCount: d.vendors.size }))
            .sort((a, b) => b.spend - a.spend);

        // Monthly trend, chronological, with the "Undated" bucket pushed to the end
        const months = [...monthMap.entries()]
            .map(([name, d]) => ({ name, spend: d.spend, lines: d.lines }))
            .sort((a, b) =>
                a.name === 'Undated' ? 1 : b.name === 'Undated' ? -1 : a.name.localeCompare(b.name));

        return {
            totalBasic, totalGross, totalFreight,
            uniqueVendors: vendorSet.size, uniqueItems: itemSet.size, lineItems: data.length,
            categories, vendors, benchmark, items, singleSource,
            departments, states, months,
            multiVendorSpend, fuelSpend,
            rateHarmonisationSaving, rateHarmonisationSpend,
            top3Conc, top10Conc, tailVendors, hhi,
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
        const ws = this.wb.addWorksheet(SHEETS.readme, { views: [{ showGridLines: false }] });
        ws.getColumn(1).width = 2;
        ws.getColumn(2).width = 110;
        const lines: Array<[string, 'title' | 'h' | 'p']> = [
            ['Procurement Spend Analysis', 'title'],
            ['Generated by Data Domino', 'p'],
            ['', 'p'],
            ['WHAT THIS WORKBOOK CONTAINS', 'h'],
            ['01_Executive_Summary  – headline spend, vendor and savings KPIs.', 'p'],
            ['02_ABC_Analysis  – items & vendors classified into A/B/C Pareto tiers (80/15/5).', 'p'],
            ['03_Spend_by_Category  – pre-tax spend grouped by category (live formulas off 10_Cleaned_Data).', 'p'],
            ['04_Spend_by_Vendor  – vendors ranked by spend with Pareto cumulative %.', 'p'],
            ['05_Spend_Trend  – spend by month and quarter, with seasonality footnotes.', 'p'],
            ['06_Spend_by_Dept_Geo  – spend broken down by department and by state.', 'p'],
            ['07_Supplier_Concentration  – HHI, top-N concentration and single-source dependency risk.', 'p'],
            ['08_MultiVendor_Benchmark  – items bought from 2+ vendors, rate gap and potential saving.', 'p'],
            ['09_Savings_Opportunities  – quantified and structural cost levers.', 'p'],
            ['10_Cleaned_Data  – the normalised transaction grid all sheets are built from.', 'p'],
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
        const ws = this.wb.addWorksheet(SHEETS.exec, { views: [{ showGridLines: false }] });
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
        const ws = this.wb.addWorksheet(SHEETS.category);
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
            ws.getCell(`B${r}`).value = { formula: `SUMIF('${SHEETS.cleaned}'!K2:K${lastRow},A${r},'${SHEETS.cleaned}'!Q2:Q${lastRow})` };
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
        const ws = this.wb.addWorksheet(SHEETS.vendor);
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
        const ws = this.wb.addWorksheet(SHEETS.benchmark);
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
        const ws = this.wb.addWorksheet(SHEETS.savings);
        const widths = [4, 30, 44, 18, 18, 22, 44];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'Savings Opportunities — Lever Summary');

        const hdr = ws.getRow(3);
        hdr.values = ['#', 'Lever', 'What the data shows', 'Spend Touched (Rs)', 'Indicative Saving (Rs)', 'Confidence', 'Action'];
        this.styleHeaderRow(hdr);

        const fuelCat = stats.categories.find(c => /fuel|biomass|husk/i.test(c.name));
        const tailSpend = stats.tailVendors.reduce((acc, v) => acc + v.spend, 0);
        const singleSourceSpend = stats.singleSource.reduce((acc, it) => acc + it.spend, 0);

        // Each lever's "Indicative Saving" is either a rupee number (firm, negotiable)
        // or a short qualitative label with a [n] pointer to the NOTES block below —
        // so there are no dangling "see note" cells.
        const rows: Array<[number | string, string, string, number | string, number | string, string, string]> = [
            [1, 'Rate harmonisation — multi-vendor',
                `${stats.benchmark.filter(b => !/fuel|biomass|husk/i.test(b.cat)).length} items bought from 2+ vendors at differing rates (ex-fuel).`,
                stats.rateHarmonisationSpend, stats.rateHarmonisationSaving, 'Medium',
                'Procurement to validate spec parity, then move volume to best in-year rate.'],
            [2, 'Fuel / biomass (timing)',
                fuelCat ? `Fuel/biomass = ${this.fmtCr(stats.fuelSpend)} (${(stats.fuelSpend / stats.totalBasic * 100).toFixed(1)}% of spend).` : 'No fuel category detected.',
                stats.fuelSpend, 'Timing play — note [1]', 'Low (timing, not vendor)',
                'Forward/seasonal contracting; benchmark against index, not vendor spread.'],
            [3, 'Freight billed separately',
                `${this.fmtCr(stats.totalFreight)} freight invoiced as a separate line.`,
                stats.totalFreight, stats.totalFreight * 0.15, 'Medium',
                'Negotiate delivered (FOR) pricing to absorb freight.'],
            [4, 'Tail-vendor consolidation',
                `${stats.tailVendors.length} vendors are < Rs 2L/yr each (${this.fmtCr(tailSpend)} total).`,
                tailSpend, 'Process saving — note [2]', 'Process',
                'Consolidate to preferred suppliers; cut PO/processing overhead.'],
            [5, 'Single-source leverage',
                `${stats.singleSource.length.toLocaleString('en-IN')} items sourced from a single vendor carry no rate tension.`,
                singleSourceSpend, 'Risk reduction — note [3]', 'Medium',
                'Qualify a second source on top single-vendor items to create competition.'],
            [6, 'Item-master data cleanup',
                'Generic/catch-all item codes blur attribution and block clean benchmarking.',
                '—', 'Enabler — note [4]', 'Enabler',
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
        // Quantified total = firm, negotiable levers only (rate harmonisation + freight).
        const totalRow = ws.getRow(r + 1);
        totalRow.getCell(2).value = 'Quantified saving range (firm levers 1 & 3 only)';
        totalRow.getCell(5).value = { formula: `E4+E6` };
        totalRow.getCell(5).numFmt = '#,##0';
        totalRow.getCell(2).font = { bold: true };
        totalRow.getCell(5).font = { bold: true };

        // NOTES / METHOD — explains every qualitative lever referenced above.
        r += 3;
        ws.getCell(`B${r}`).value = 'NOTES / METHOD';
        ws.getCell(`B${r}`).font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
        r++;
        const notes = [
            '[1] Fuel/biomass saving is a timing play (forward or index-linked contracting), not a vendor-rate play. It is real but not quantified here because it depends on market timing, not negotiation.',
            '[2] Tail-vendor consolidation saves PO/processing and admin overhead, not unit price — a process saving rather than a rupee figure on spend.',
            '[3] Single-source leverage reduces dependency risk. Savings materialise only after a second source is qualified and used to negotiate — hence "risk reduction", not a booked number.',
            '[4] Item-master cleanup is an enabler: clean codes make future benchmarking possible. No direct saving, but it unlocks levers 1 and 5.',
            'The "Quantified saving range" above deliberately sums only the firm, negotiable levers (rate harmonisation + freight).',
        ];
        for (const n of notes) {
            const c = ws.getCell(`B${r}`);
            c.value = n;
            c.font = { size: 10, color: { argb: SUBTLE_TEXT } };
            c.alignment = { wrapText: true, vertical: 'top' };
            ws.getRow(r).height = 26;
            r++;
        }
    }

    // -----------------------------------------------------------------------
    // SHEET 02 — ABC Analysis (Pareto tiers by item and by vendor)
    // -----------------------------------------------------------------------
    private createABC(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet(SHEETS.abc, { views: [{ showGridLines: false }] });
        const widths = [7, 18, 40, 18, 11, 10, 8];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'ABC Analysis (Pareto 80 / 15 / 5)');
        const note = ws.getCell('A2');
        note.value = 'A = the items/vendors making up the first 80% of spend, B = next 15%, C = last 5%. Concentrate effort on A.';
        note.font = { italic: true, color: { argb: SUBTLE_TEXT } };

        const summarize = (rows: Array<{ cls: 'A' | 'B' | 'C'; spend: number }>) => {
            const by = { A: { n: 0, spend: 0 }, B: { n: 0, spend: 0 }, C: { n: 0, spend: 0 } };
            rows.forEach((x) => { by[x.cls].n++; by[x.cls].spend += x.spend; });
            return by;
        };
        const pct = (v: number) => (stats.totalBasic ? (v / stats.totalBasic) * 100 : 0).toFixed(0);

        // ---- BY ITEM (list A+B fully, summarise the long C tail) ----
        const itemRows = classifyABC(stats.items, stats.totalBasic);
        const iSum = summarize(itemRows);
        let r = 4;
        ws.getCell(`A${r}`).value = 'BY ITEM';
        ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
        r++;
        ws.getCell(`A${r}`).value = `A: ${iSum.A.n} items = ${pct(iSum.A.spend)}% of spend  ·  B: ${iSum.B.n}  ·  C: ${iSum.C.n}`;
        ws.getCell(`A${r}`).font = { size: 10, color: { argb: SUBTLE_TEXT } };
        r++;
        const ihdr = ws.getRow(r);
        ihdr.values = ['Rank', 'Item Code', 'Description', 'Spend (Rs)', '% of Total', 'Cum %', 'Class'];
        this.styleHeaderRow(ihdr); r++;
        let rank = 0;
        for (const it of itemRows) {
            rank++;
            if (it.cls === 'C') break;
            const row = ws.getRow(r);
            row.values = [rank, it.code, it.desc, it.spend, stats.totalBasic ? it.spend / stats.totalBasic : 0, it.cum, it.cls];
            row.getCell(4).numFmt = '#,##0'; row.getCell(5).numFmt = '0.0%'; row.getCell(6).numFmt = '0.0%';
            r++;
        }
        if (iSum.C.n > 0) {
            const row = ws.getRow(r);
            row.values = ['', `C class (${iSum.C.n} items)`, 'long tail — small individual spend', iSum.C.spend, stats.totalBasic ? iSum.C.spend / stats.totalBasic : 0, 1, 'C'];
            row.getCell(4).numFmt = '#,##0'; row.getCell(5).numFmt = '0.0%';
            row.eachCell({ includeEmpty: true }, (c) => { c.font = { italic: true, color: { argb: SUBTLE_TEXT } }; });
            r++;
        }

        // ---- BY VENDOR ----
        r += 2;
        const venRows = classifyABC(stats.vendors, stats.totalBasic);
        const vSum = summarize(venRows);
        ws.getCell(`A${r}`).value = 'BY VENDOR';
        ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
        r++;
        ws.getCell(`A${r}`).value = `A: ${vSum.A.n} vendors = ${pct(vSum.A.spend)}% of spend  ·  B: ${vSum.B.n}  ·  C: ${vSum.C.n}`;
        ws.getCell(`A${r}`).font = { size: 10, color: { argb: SUBTLE_TEXT } };
        r++;
        const vhdr = ws.getRow(r);
        vhdr.values = ['Rank', 'Vendor', '', 'Spend (Rs)', '% of Total', 'Cum %', 'Class'];
        this.styleHeaderRow(vhdr); r++;
        let vrank = 0;
        for (const v of venRows) {
            vrank++;
            const row = ws.getRow(r);
            row.values = [vrank, v.name, '', v.spend, stats.totalBasic ? v.spend / stats.totalBasic : 0, v.cum, v.cls];
            row.getCell(4).numFmt = '#,##0'; row.getCell(5).numFmt = '0.0%'; row.getCell(6).numFmt = '0.0%';
            r++;
        }
    }

    // -----------------------------------------------------------------------
    // SHEET 05 — Spend Trend (monthly + quarterly)
    // -----------------------------------------------------------------------
    private createSpendTrend(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet(SHEETS.trend, { views: [{ showGridLines: false }] });
        const widths = [14, 20, 10, 11, 12];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'Spend Trend');
        const hdr = ws.getRow(3);
        hdr.values = ['Period', 'Spend (Rs)', 'Rs Cr', 'Line Items', 'MoM %'];
        this.styleHeaderRow(hdr);

        let r = 4;
        let prev = 0;
        const dated = stats.months.filter((m) => m.name !== 'Undated');
        const undated = stats.months.find((m) => m.name === 'Undated');
        let peak = { name: '-', spend: -1 };
        let trough = { name: '-', spend: Infinity };
        for (const m of stats.months) {
            const row = ws.getRow(r);
            const mom: number | string = (m.name !== 'Undated' && prev > 0) ? (m.spend - prev) / prev : '';
            row.values = [m.name, m.spend, m.spend / 1e7, m.lines, mom];
            row.getCell(2).numFmt = '#,##0'; row.getCell(3).numFmt = '#,##0.00';
            if (typeof mom === 'number') row.getCell(5).numFmt = '0.0%';
            if (m.name !== 'Undated') {
                if (m.spend > peak.spend) peak = { name: m.name, spend: m.spend };
                if (m.spend < trough.spend) trough = { name: m.name, spend: m.spend };
                prev = m.spend;
            }
            r++;
        }

        // Quarterly roll-up
        r += 2;
        ws.getCell(`A${r}`).value = 'QUARTERLY';
        ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
        r++;
        const qmap = new Map<string, number>();
        for (const m of dated) {
            const [y, mo] = m.name.split('-').map(Number);
            const q = `${y}-Q${Math.floor((mo - 1) / 3) + 1}`;
            qmap.set(q, (qmap.get(q) || 0) + m.spend);
        }
        const qhdr = ws.getRow(r); qhdr.values = ['Quarter', 'Spend (Rs)', 'Rs Cr']; this.styleHeaderRow(qhdr); r++;
        for (const [q, sp] of [...qmap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
            const row = ws.getRow(r);
            row.values = [q, sp, sp / 1e7];
            row.getCell(2).numFmt = '#,##0'; row.getCell(3).numFmt = '#,##0.00';
            r++;
        }

        r += 1;
        const foot = ws.getCell(`A${r}`);
        foot.value = `Peak: ${peak.name} (${this.fmtCr(Math.max(0, peak.spend))})  ·  Trough: ${trough.name} (${this.fmtCr(trough.spend === Infinity ? 0 : trough.spend)})  ·  Undated rows: ${undated ? undated.lines : 0}`;
        foot.font = { italic: true, color: { argb: SUBTLE_TEXT } };
    }

    // -----------------------------------------------------------------------
    // SHEET 06 — Spend by Department & Geography
    // -----------------------------------------------------------------------
    private createSpendByDeptGeo(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet(SHEETS.deptGeo, { views: [{ showGridLines: false }] });
        const widths = [34, 20, 12, 12, 11];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'Spend by Department & Geography');

        let r = 3;
        const table = (
            title: string,
            rows: Array<{ name: string; spend: number; lines: number; vendorCount?: number }>,
            withVendors: boolean,
        ) => {
            ws.getCell(`A${r}`).value = title;
            ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
            r++;
            const hdr = ws.getRow(r);
            hdr.values = withVendors
                ? ['Name', 'Spend (Rs)', '% of Total', 'Line Items', 'Vendors']
                : ['Name', 'Spend (Rs)', '% of Total', 'Line Items'];
            this.styleHeaderRow(hdr); r++;
            let tot = 0;
            for (const x of rows) {
                tot += x.spend;
                const row = ws.getRow(r);
                const base = [x.name, x.spend, stats.totalBasic ? x.spend / stats.totalBasic : 0, x.lines];
                row.values = withVendors ? [...base, x.vendorCount ?? 0] : base;
                row.getCell(2).numFmt = '#,##0'; row.getCell(3).numFmt = '0.0%';
                r++;
            }
            const trow = ws.getRow(r);
            trow.getCell(1).value = 'TOTAL'; trow.getCell(2).value = tot; trow.getCell(2).numFmt = '#,##0';
            trow.eachCell({ includeEmpty: true }, (c) => {
                c.font = { bold: true };
                c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_FILL } };
            });
            r += 3;
        };

        table('BY DEPARTMENT', stats.departments, false);
        table('BY STATE / GEOGRAPHY', stats.states, true);
    }

    // -----------------------------------------------------------------------
    // SHEET 07 — Supplier Concentration & Risk (HHI, top-N, single-source)
    // -----------------------------------------------------------------------
    private createConcentration(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet(SHEETS.concentration, { views: [{ showGridLines: false }] });
        const widths = [16, 44, 18, 12];
        widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));

        this.styleTitle(ws.getCell('A1'), 'Supplier Concentration & Risk');
        const band = stats.hhi < 1500 ? 'competitive' : stats.hhi <= 2500 ? 'moderately concentrated' : 'highly concentrated';

        let r = 3;
        const kv = (label: string, value: string) => {
            ws.getCell(`A${r}`).value = label;
            ws.getCell(`A${r}`).font = { size: 10, color: { argb: SUBTLE_TEXT } };
            const v = ws.getCell(`C${r}`);
            v.value = value;
            v.font = { bold: true, size: 12, color: { argb: TITLE_TEXT } };
            r++;
        };
        kv('HHI (vendor concentration)', `${stats.hhi.toFixed(0)} — ${band}`);
        kv('Top 3 vendor concentration', `${(stats.top3Conc * 100).toFixed(1)}%`);
        kv('Top 10 vendor concentration', `${(stats.top10Conc * 100).toFixed(1)}%`);
        kv('Single-source items', `${stats.singleSource.length.toLocaleString('en-IN')}`);

        r += 1;
        ws.getCell(`A${r}`).value = 'TOP SINGLE-SOURCE ITEMS BY SPEND (dependency risk)';
        ws.getCell(`A${r}`).font = { bold: true, size: 12, color: { argb: HEADER_FILL } };
        r++;
        const hdr = ws.getRow(r);
        hdr.values = ['Item Code', 'Description', 'Spend (Rs)', '% of Total'];
        this.styleHeaderRow(hdr); r++;
        for (const it of stats.singleSource.slice(0, 50)) {
            const row = ws.getRow(r);
            row.values = [it.code, it.desc, it.spend, stats.totalBasic ? it.spend / stats.totalBasic : 0];
            row.getCell(3).numFmt = '#,##0'; row.getCell(4).numFmt = '0.0%';
            r++;
        }
    }

    // -----------------------------------------------------------------------
    // SHEET 10 — Cleaned Data (20-column normalised grid)
    // 03_Spend_by_Category SUMIF depends on this column order: K=Category L1, Q=Basic Amount.
    // -----------------------------------------------------------------------
    private createCleanedData() {
        const ws = this.wb.addWorksheet(SHEETS.cleaned);
        const cols: Array<{ h: string; w: number; numFmt?: string }> = [
            { h: 'S.No', w: 7 },
            { h: 'MRN No', w: 11 },
            { h: 'MRN Date', w: 12 },
            { h: 'Bill No', w: 14 },
            { h: 'PO No', w: 14 },
            { h: 'Vendor', w: 30 },
            { h: 'State', w: 18 },
            { h: 'Item Code', w: 14 },
            { h: 'Item Description', w: 40 },
            { h: 'HSN/SAC', w: 12 },          // J
            { h: 'Category L1', w: 24 },      // K  ← SUMIF key
            { h: 'Category L2', w: 22 },      // L
            { h: 'Category L3', w: 22 },      // M
            { h: 'Qty Rcvd', w: 11, numFmt: '#,##0.00' },
            { h: 'UOM', w: 8 },
            { h: 'Net Rate', w: 12, numFmt: '#,##0.00' },
            { h: 'Basic Amount (Rs)', w: 16, numFmt: '#,##0.00' },  // Q  ← SUMIF value
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
                stateName(row[this.stateKey]),
                str(row[this.itemKey]),
                str(row[this.descKey]),
                str(row[this.hsnKey]),
                str(row[this.catKey], 'Other / Uncategorized'),
                str(row[this.l2Key]),
                str(row[this.l3Key]),
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
        ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 20 } };
    }
}
