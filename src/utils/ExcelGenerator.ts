/**
 * ExcelGenerator — Enterprise Procurement Spend Analysis Export
 *
 * Tab structure (star-schema layout):
 *   0_Documentation   — data dictionary, assumptions, refresh date
 *   1_Fact_Spend      — one row per transaction (the master fact table)
 *   2_Dim_Supplier    — one row per unique supplier with enriched attributes
 *   3_Dim_Category    — category hierarchy L1 → L2 → L3 with strategy tags
 *   4_Dim_Org         — organisational hierarchy (BU / plant / region / CC)
 *   5_Dim_Date        — calendar table (date / month / quarter / year / fiscal)
 *   6_KPI_Export      — pre-aggregated KPIs by period × category × BU
 *   7_Data_Quality    — field-level completeness audit
 *
 * Library: ExcelJS  (already a project dependency)
 */

import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DataRow {
    [key: string]: any;
}

/** Resolved column-name mappings coming out of the ETL column-mapper step */
interface Mappings {
    // financial
    amount?: string;
    invoice_amount?: string;
    currency?: string;
    quantity?: string;
    unit_price?: string;
    payment_terms?: string;

    // supplier
    supplier?: string;
    vendor?: string;

    // category
    category_l1?: string;
    category_l2?: string;
    category_l3?: string;
    category?: string;

    // org
    company_code?: string;
    business_unit?: string;
    plant?: string;
    location?: string;
    department?: string;
    cost_center?: string;
    region?: string;

    // date
    date?: string;
    invoice_date?: string;
    po_date?: string;
    posting_date?: string;

    // document IDs
    document_number?: string;
    po_number?: string;
    invoice_number?: string;
    contract_ref?: string;
    item_description?: string;

    [key: string]: string | undefined;
}

// ---------------------------------------------------------------------------
// Colour / font constants
// ---------------------------------------------------------------------------

const BRAND_BLUE    = '1E3A5F';   // deep navy — header backgrounds
const ACCENT_BLUE   = '2F80ED';   // mid blue — section titles
const LIGHT_BLUE    = 'D6E4F7';   // very light — alternating fact rows
const HEADER_WHITE  = 'FFFFFF';
// const DARK_TEXT  = '1A1A2E';  // reserved for future use
const MID_GRAY      = '6B7280';
const LIGHT_GRAY    = 'F3F4F6';
const GREEN_OK      = '00875A';
const AMBER_WARN    = 'F59E0B';
const RED_CRIT      = 'DC2626';
const GOLD_HIGH     = 'FEF3C7';   // high-concentration row highlight
const GREEN_TOP     = 'D1FAE5';   // top-10 vendor row highlight

// ---------------------------------------------------------------------------
// Helper: parse a raw cell value into a JS number (amount)
// ---------------------------------------------------------------------------
function parseAmount(val: any): number {
    if (val === null || val === undefined || val === '') return 0;
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    const s = String(val).replace(/[^0-9.-]+/g, '');
    return parseFloat(s) || 0;
}

// ---------------------------------------------------------------------------
// Helper: parse a raw cell into a JS Date (or null)
// ---------------------------------------------------------------------------
function parseDate(val: any): Date | null {
    if (!val) return null;
    // Excel serial number (days since 1899-12-30)
    if (typeof val === 'number' && val > 25569) {
        return new Date((val - 25569) * 86400 * 1000);
    }
    if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
}

// ---------------------------------------------------------------------------
// Helper: safe string
// ---------------------------------------------------------------------------
function str(val: any, fallback = ''): string {
    if (val === null || val === undefined) return fallback;
    return String(val).trim() || fallback;
}

// ---------------------------------------------------------------------------
// Helper: fiscal period (simple April-start fiscal year, customisable)
// ---------------------------------------------------------------------------
function fiscalPeriod(d: Date): { fiscalYear: string; fiscalPeriod: string } {
    const m = d.getMonth(); // 0-based
    const y = d.getFullYear();
    // April start: months 3-11 are FY+1; months 0-2 are FY
    const fy = m >= 3 ? y + 1 : y;
    const fp = ((m - 3 + 12) % 12) + 1; // period 1 = April
    return { fiscalYear: `FY${fy}`, fiscalPeriod: `P${String(fp).padStart(2, '0')}` };
}

// ---------------------------------------------------------------------------
// Helper: ABC classification (A = top 70%, B = next 20%, C = tail 10%)
// ---------------------------------------------------------------------------
function buildAbcMap(data: DataRow[], amountKey: string, supplierKey: string)
    : Map<string, 'A' | 'B' | 'C'> {
    const spendMap = new Map<string, number>();
    for (const row of data) {
        const s = str(row[supplierKey], 'Unknown');
        spendMap.set(s, (spendMap.get(s) ?? 0) + parseAmount(row[amountKey]));
    }
    const sorted = [...spendMap.entries()].sort((a, b) => b[1] - a[1]);
    const total  = sorted.reduce((acc, [, v]) => acc + v, 0);
    let cumul    = 0;
    const abc    = new Map<string, 'A' | 'B' | 'C'>();
    for (const [name, spend] of sorted) {
        cumul += spend;
        const pct = total > 0 ? cumul / total : 0;
        abc.set(name, pct <= 0.70 ? 'A' : pct <= 0.90 ? 'B' : 'C');
    }
    return abc;
}

// ---------------------------------------------------------------------------
// Helper: maverick/tail detection
// ---------------------------------------------------------------------------
function isMaverick(row: DataRow, contractKey: string | undefined): boolean {
    if (!contractKey) return false;
    const v = str(row[contractKey]);
    return v === '' || v.toLowerCase() === 'none' || v.toLowerCase() === 'n/a';
}

function isTailSpend(spend: number, avgSpend: number): boolean {
    return spend > 0 && spend < avgSpend * 0.05;
}

// ===========================================================================
// ExcelGenerator
// ===========================================================================

export class ExcelGenerator {
    private wb:   ExcelJS.Workbook;
    private data: DataRow[];
    private m:    Mappings;
    private cur:  string;   // currency code e.g. 'INR'
    private sym:  string;   // currency symbol e.g. '₹'

    // resolved column keys (set once in constructor)
    private amtKey:  string;
    private supKey:  string;
    private catL1Key: string;
    private catL2Key: string;
    private catL3Key: string;
    private dateKey: string;
    private curKey:  string;
    private qtyKey:  string;
    private upKey:   string;
    private ptKey:   string;
    private buKey:   string;
    private plantKey: string;
    private deptKey: string;
    private ccKey:   string;
    private regionKey: string;
    private coKey:   string;
    private docKey:  string;
    private poKey:   string;
    // private invKey:  string;  // invoice number — reserved, not yet mapped to a column
    private ctrKey:  string;
    private descKey: string;

    constructor(data: DataRow[], mappings: Mappings, currency = 'INR') {
        this.wb   = new ExcelJS.Workbook();
        this.data = data;
        this.m    = mappings ?? {};
        this.cur  = currency || 'INR';

        const symMap: Record<string, string> = {
            USD: '$', INR: '₹', EUR: '€', GBP: '£', JPY: '¥',
            AUD: 'A$', CAD: 'C$', SGD: 'S$', AED: 'د.إ', CHF: 'Fr'
        };
        this.sym = symMap[this.cur] ?? this.cur;

        // Resolve column keys once — avoids repeating fallback chains everywhere
        this.amtKey   = this.m.amount         ?? this.m.invoice_amount ?? 'Amount';
        this.supKey   = this.m.supplier        ?? this.m.vendor         ?? 'Supplier';
        this.catL1Key = this.m.category_l1     ?? this.m.category       ?? 'Category';
        this.catL2Key = this.m.category_l2     ?? this.catL1Key;
        this.catL3Key = this.m.category_l3     ?? this.catL2Key;
        this.dateKey  = this.m.date            ?? this.m.invoice_date   ?? this.m.po_date ?? 'Date';
        this.curKey   = this.m.currency        ?? '';
        this.qtyKey   = this.m.quantity        ?? '';
        this.upKey    = this.m.unit_price      ?? '';
        this.ptKey    = this.m.payment_terms   ?? '';
        this.buKey    = this.m.business_unit   ?? '';
        this.plantKey = this.m.plant           ?? this.m.location       ?? '';
        this.deptKey  = this.m.department      ?? '';
        this.ccKey    = this.m.cost_center     ?? '';
        this.regionKey = this.m.region         ?? '';
        this.coKey    = this.m.company_code    ?? '';
        this.docKey   = this.m.document_number ?? this.m.invoice_number ?? '';
        this.poKey    = this.m.po_number       ?? '';
        // this.invKey = this.m.invoice_number  ?? '';  // reserved
        this.ctrKey   = this.m.contract_ref    ?? '';
        this.descKey  = this.m.item_description ?? '';

        this.wb.creator          = 'Data Domino — Antigravity';
        this.wb.lastModifiedBy   = 'Data Domino — Antigravity';
        this.wb.created          = new Date();
        this.wb.modified         = new Date();
    }

    // -----------------------------------------------------------------------
    // Public entry point
    // -----------------------------------------------------------------------
    public async generate(): Promise<Blob> {
        const stats = this.buildStats();

        this.createDocumentation(stats);
        this.createFactSpend(stats);
        this.createDimSupplier(stats);
        this.createDimCategory(stats);
        this.createDimOrg(stats);
        this.createDimDate();
        this.createKpiExport(stats);
        this.createDataQuality();

        const buf = await this.wb.xlsx.writeBuffer();
        return new Blob([buf], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
    }

    // -----------------------------------------------------------------------
    // Pre-compute all aggregations once so every sheet can reuse them
    // -----------------------------------------------------------------------
    private buildStats() {
        const totalSpend   = this.data.reduce((s, r) => s + parseAmount(r[this.amtKey]), 0);
        const txCount      = this.data.length;
        const avgTx        = txCount > 0 ? totalSpend / txCount : 0;
        const abcMap       = buildAbcMap(this.data, this.amtKey, this.supKey);

        // --- Supplier aggregation ---
        const supMap = new Map<string, { spend: number; count: number; l1Set: Set<string>; mavCount: number }>();
        for (const row of this.data) {
            const s  = str(row[this.supKey], 'Unknown');
            const amt = parseAmount(row[this.amtKey]);
            if (!supMap.has(s)) supMap.set(s, { spend: 0, count: 0, l1Set: new Set(), mavCount: 0 });
            const e = supMap.get(s)!;
            e.spend += amt;
            e.count++;
            if (this.catL1Key) e.l1Set.add(str(row[this.catL1Key], 'Uncategorized'));
            if (isMaverick(row, this.ctrKey || undefined)) e.mavCount++;
        }
        const suppliers = [...supMap.entries()]
            .map(([name, d]) => ({ name, ...d, abc: abcMap.get(name) ?? 'C', avgTx: d.count > 0 ? d.spend / d.count : 0 }))
            .sort((a, b) => b.spend - a.spend);

        // --- Category L1/L2 aggregation ---
        const catMap = new Map<string, { spend: number; count: number; l2Map: Map<string, { spend: number; count: number }> }>();
        for (const row of this.data) {
            const l1  = str(row[this.catL1Key], 'Uncategorized');
            const l2  = str(row[this.catL2Key], l1);
            const amt = parseAmount(row[this.amtKey]);
            if (!catMap.has(l1)) catMap.set(l1, { spend: 0, count: 0, l2Map: new Map() });
            const ce = catMap.get(l1)!;
            ce.spend += amt; ce.count++;
            if (!ce.l2Map.has(l2)) ce.l2Map.set(l2, { spend: 0, count: 0 });
            const l2e = ce.l2Map.get(l2)!;
            l2e.spend += amt; l2e.count++;
        }
        const categories = [...catMap.entries()]
            .map(([l1, d]) => ({ l1, ...d, l2List: [...d.l2Map.entries()].map(([l2, dd]) => ({ l2, ...dd })).sort((a, b) => b.spend - a.spend) }))
            .sort((a, b) => b.spend - a.spend);

        // --- Org (BU) aggregation ---
        const buMap = new Map<string, number>();
        if (this.buKey) {
            for (const row of this.data) {
                const bu = str(row[this.buKey], 'Unknown');
                buMap.set(bu, (buMap.get(bu) ?? 0) + parseAmount(row[this.amtKey]));
            }
        }

        // --- Monthly aggregation ---
        const monthMap = new Map<string, { spend: number; count: number; mav: number }>();
        for (const row of this.data) {
            const d = parseDate(row[this.dateKey]);
            if (!d) continue;
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            if (!monthMap.has(key)) monthMap.set(key, { spend: 0, count: 0, mav: 0 });
            const me = monthMap.get(key)!;
            me.spend += parseAmount(row[this.amtKey]);
            me.count++;
            if (isMaverick(row, this.ctrKey || undefined)) me.mav++;
        }
        const months = [...monthMap.entries()].sort(([a], [b]) => a.localeCompare(b))
            .map(([ym, d]) => ({ ym, ...d }));

        // Tail-spend detection: suppliers whose total spend < 5% of avg tx * total rows
        const tailThreshold = avgTx;   // 1× avg transaction as tail boundary
        const tailCount = suppliers.filter(s => isTailSpend(s.spend, tailThreshold)).length;
        const tailSpend = suppliers.filter(s => isTailSpend(s.spend, tailThreshold))
            .reduce((s, v) => s + v.spend, 0);
        const top3Conc  = totalSpend > 0
            ? suppliers.slice(0, 3).reduce((s, v) => s + v.spend, 0) / totalSpend
            : 0;

        return {
            totalSpend, txCount, avgTx,
            suppliers, categories, months,
            buMap, abcMap,
            tailCount, tailSpend, top3Conc,
            uniqueSuppliers: suppliers.length,
            uniqueCategories: categories.length,
        };
    }

    // -----------------------------------------------------------------------
    // Styling helpers
    // -----------------------------------------------------------------------

    /** Bold white text on BRAND_BLUE — used for column headers */
    private styleHeader(cell: ExcelJS.Cell, small = false) {
        cell.fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND_BLUE } };
        cell.font   = { bold: true, color: { argb: HEADER_WHITE }, name: 'Calibri', size: small ? 10 : 11 };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        cell.border = {
            top:    { style: 'thin', color: { argb: '2C4A7C' } },
            left:   { style: 'thin', color: { argb: '2C4A7C' } },
            bottom: { style: 'medium', color: { argb: '2C4A7C' } },
            right:  { style: 'thin', color: { argb: '2C4A7C' } },
        };
    }

    /** Section title inside a sheet */
    private styleSection(cell: ExcelJS.Cell, text: string) {
        cell.value = text;
        cell.font  = { bold: true, size: 14, color: { argb: ACCENT_BLUE }, name: 'Calibri' };
    }

    /** Subtle alternating row fill for fact rows */
    private shadeRow(row: ExcelJS.Row, idx: number) {
        if (idx % 2 === 0) {
            row.eachCell({ includeEmpty: true }, cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_BLUE } };
            });
        }
    }

    /** Apply header styling to an entire row */
    private styleHeaderRow(row: ExcelJS.Row, small = false) {
        row.eachCell({ includeEmpty: true }, cell => this.styleHeader(cell, small));
        row.height = small ? 22 : 28;
    }

    /** Currency format string */
    private get curFmt() { return `"${this.sym}"#,##0.00`; }
    // private get curFmt0() { return `"${this.sym}"#,##0`; }  // zero-decimal currency — reserved
    private get pctFmt() { return '0.0%'; }

    // -----------------------------------------------------------------------
    // TAB 0: 0_Documentation
    // -----------------------------------------------------------------------
    private createDocumentation(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('0_Documentation', { views: [{ showGridLines: false }] });

        ws.getColumn(1).width = 28;
        ws.getColumn(2).width = 70;

        // ── Title block ───────────────────────────────────────────────────
        ws.mergeCells('A1:B1');
        const title = ws.getCell('A1');
        title.value     = 'Data Domino — Procurement Spend Analysis Export';
        title.font      = { bold: true, size: 18, color: { argb: BRAND_BLUE }, name: 'Calibri' };
        title.alignment = { vertical: 'middle', horizontal: 'left' };
        title.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT_GRAY } };
        ws.getRow(1).height = 40;

        ws.mergeCells('A2:B2');
        ws.getCell('A2').value = `Generated: ${new Date().toLocaleString('en-GB')}   |   Rows analysed: ${stats.txCount.toLocaleString()}   |   Currency: ${this.cur}`;
        ws.getCell('A2').font  = { italic: true, size: 10, color: { argb: MID_GRAY } };

        // ── Workbook purpose ─────────────────────────────────────────────
        let r = 4;
        this.styleSection(ws.getCell(`A${r}`), 'PURPOSE');
        r++;
        const purpose = [
            'This workbook is a star-schema ETL export from Data Domino.',
            'The central fact table (1_Fact_Spend) contains one row per transaction.',
            'Dimension tabs (Supplier, Category, Org, Date) can be joined on their key columns.',
            '6_KPI_Export provides pre-aggregated KPIs ready for charting or BI ingestion.',
            '7_Data_Quality audits field completeness so you know where data gaps exist.',
        ];
        for (const line of purpose) {
            ws.getCell(`B${r}`).value = line;
            ws.getCell(`B${r}`).font  = { size: 10, name: 'Calibri' };
            r++;
        }

        // ── Tab directory ─────────────────────────────────────────────────
        r += 2;
        this.styleSection(ws.getCell(`A${r}`), 'WORKBOOK STRUCTURE');
        r++;
        const tabs: [string, string][] = [
            ['0_Documentation', 'This tab — data dictionary, assumptions, refresh info'],
            ['1_Fact_Spend',    'Master transaction fact table — one row per invoice/PO line'],
            ['2_Dim_Supplier',  'Supplier master — one row per unique supplier'],
            ['3_Dim_Category',  'Category hierarchy — L1 / L2 / L3 + strategic tags'],
            ['4_Dim_Org',       'Organisational hierarchy — BU / plant / region / cost centre'],
            ['5_Dim_Date',      'Date dimension — calendar, quarter, fiscal period'],
            ['6_KPI_Export',    'Pre-aggregated KPI table — period × category × BU'],
            ['7_Data_Quality',  'Field-level completeness audit across all columns'],
        ];
        for (const [tab, desc] of tabs) {
            ws.getCell(`A${r}`).value = tab;
            ws.getCell(`A${r}`).font  = { bold: true, size: 10, color: { argb: ACCENT_BLUE } };
            ws.getCell(`B${r}`).value = desc;
            ws.getCell(`B${r}`).font  = { size: 10 };
            r++;
        }

        // ── Column dictionary for 1_Fact_Spend ───────────────────────────
        r += 2;
        this.styleSection(ws.getCell(`A${r}`), 'COLUMN DICTIONARY — 1_Fact_Spend');
        r++;
        ws.getCell(`A${r}`).value = 'Column';
        ws.getCell(`B${r}`).value = 'Description';
        this.styleHeader(ws.getCell(`A${r}`));
        this.styleHeader(ws.getCell(`B${r}`));
        r++;

        const dict: [string, string][] = [
            ['Transaction_Date',        'Invoice / PO date parsed from source data'],
            ['Fiscal_Year',             'Fiscal year derived from transaction date (April start)'],
            ['Fiscal_Period',           'Fiscal period P01–P12 (P01 = April)'],
            ['Year_Month',              'Calendar YYYY-MM for time-series analysis'],
            ['Quarter',                 'Q1–Q4 calendar quarter'],
            ['Document_Number',         'Invoice / document reference from source'],
            ['PO_Number',               'Purchase order number from source'],
            ['Supplier_ID',             'Normalised supplier key (uppercase, trimmed)'],
            ['Supplier_Name',           'Original supplier name from source'],
            ['Category_L1',             'Top-level spend category (e.g. Direct / Indirect)'],
            ['Category_L2',             'Mid-level category (e.g. MRO, IT, Marketing)'],
            ['Category_L3',             'Granular category from source data'],
            ['Business_Unit',           'Business unit or cost centre from source'],
            ['Plant_Location',          'Plant or physical location from source'],
            ['Region',                  'Geographic region from source'],
            ['Currency',                'Transaction currency from source (or assumed if blank)'],
            ['Amount_Doc_Currency',     'Raw transaction amount in document currency'],
            [`Amount_${this.cur}`,      `Amount converted to reporting currency (${this.cur})`],
            ['Quantity',                'Transaction quantity (if mapped)'],
            ['Unit_Price',              'Unit price (if mapped)'],
            ['Payment_Terms',           'Payment terms (if mapped)'],
            ['Contract_ID',             'Contract reference (blank = off-contract / maverick)'],
            ['Item_Description',        'Cleaned item or service description (if mapped)'],
            ['ABC_Class',               'Supplier ABC classification — A (top 70%), B (80-90%), C (tail)'],
            ['Maverick_Spend_Flag',     'Y = transaction has no contract reference; N = on-contract'],
            ['Tail_Spend_Flag',         'Y = supplier total spend < 5% of avg transaction value'],
            ['Spend_Under_Management',  'Y = transaction is on-contract; N = off-contract'],
        ];

        for (const [col, desc] of dict) {
            ws.getCell(`A${r}`).value = col;
            ws.getCell(`A${r}`).font  = { size: 10, bold: true };
            ws.getCell(`B${r}`).value = desc;
            ws.getCell(`B${r}`).font  = { size: 10 };
            r++;
        }

        // ── Key assumptions ────────────────────────────────────────────────
        r += 2;
        this.styleSection(ws.getCell(`A${r}`), 'KEY ASSUMPTIONS');
        r++;
        const assumptions: [string, string][] = [
            ['Fiscal year start',   'April (P01 = April, P12 = March). Adjust in source code if different.'],
            ['Currency conversion', `All amounts are in source currency. If multiple currencies exist, conversion to ${this.cur} used ETL-time exchange rates.`],
            ['Maverick spend',      'Flagged where Contract_ID is blank, "None", or "N/A" in source data.'],
            ['Tail spend',          'Flagged where supplier total spend < 5% of the average transaction value across the dataset.'],
            ['ABC classification',  'A = suppliers making up cumulative 70% of spend; B = next 20%; C = remaining 10%.'],
            ['Data completeness',   'See 7_Data_Quality for field-level fill rates. Blank = unmapped or absent in source.'],
        ];
        for (const [key, val] of assumptions) {
            ws.getCell(`A${r}`).value = key;
            ws.getCell(`A${r}`).font  = { bold: true, size: 10 };
            ws.getCell(`B${r}`).value = val;
            ws.getCell(`B${r}`).font  = { size: 10, italic: true, color: { argb: MID_GRAY } };
            ws.getCell(`B${r}`).alignment = { wrapText: true };
            ws.getRow(r).height = 30;
            r++;
        }
    }

    // -----------------------------------------------------------------------
    // TAB 1: 1_Fact_Spend
    // -----------------------------------------------------------------------
    private createFactSpend(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('1_Fact_Spend');

        const columns: { header: string; key: string; width: number; numFmt?: string }[] = [
            // Date
            { header: 'Transaction_Date',       key: 'tx_date',     width: 16, numFmt: 'dd/mm/yyyy' },
            { header: 'Fiscal_Year',             key: 'fy',          width: 10 },
            { header: 'Fiscal_Period',           key: 'fp',          width: 12 },
            { header: 'Year_Month',              key: 'ym',          width: 12 },
            { header: 'Quarter',                 key: 'qtr',         width: 9 },
            // Document
            { header: 'Document_Number',         key: 'doc_no',      width: 20 },
            { header: 'PO_Number',               key: 'po_no',       width: 18 },
            { header: 'Contract_ID',             key: 'ctr_id',      width: 18 },
            // Supplier
            { header: 'Supplier_ID',             key: 'sup_id',      width: 22 },
            { header: 'Supplier_Name',           key: 'sup_name',    width: 32 },
            // Category
            { header: 'Category_L1',             key: 'cat_l1',      width: 20 },
            { header: 'Category_L2',             key: 'cat_l2',      width: 22 },
            { header: 'Category_L3',             key: 'cat_l3',      width: 22 },
            // Org
            { header: 'Company_Code',            key: 'co_code',     width: 14 },
            { header: 'Business_Unit',           key: 'bu',          width: 20 },
            { header: 'Plant_Location',          key: 'plant',       width: 18 },
            { header: 'Department',              key: 'dept',        width: 18 },
            { header: 'Cost_Center',             key: 'cc',          width: 16 },
            { header: 'Region',                  key: 'region',      width: 14 },
            // Finance
            { header: 'Currency',               key: 'cur',          width: 10 },
            { header: 'Amount_Doc_Currency',    key: 'amt_doc',      width: 22, numFmt: '#,##0.00' },
            { header: `Amount_${this.cur}`,     key: 'amt_rpt',      width: 22, numFmt: this.curFmt },
            { header: 'Quantity',               key: 'qty',          width: 12, numFmt: '#,##0.00' },
            { header: 'Unit_Price',             key: 'up',           width: 14, numFmt: '#,##0.00' },
            { header: 'Payment_Terms',          key: 'pt',           width: 16 },
            { header: 'Item_Description',       key: 'item_desc',    width: 34 },
            // Analytics flags
            { header: 'ABC_Class',              key: 'abc',          width: 11 },
            { header: 'Maverick_Spend_Flag',    key: 'mav',          width: 20 },
            { header: 'Tail_Spend_Flag',        key: 'tail',         width: 16 },
            { header: 'Spend_Under_Management', key: 'sum',          width: 24 },
        ];

        ws.columns = columns.map(c => ({ header: c.header, key: c.key, width: c.width }));
        this.styleHeaderRow(ws.getRow(1));
        ws.getRow(1).height = 32;

        // Apply number formats per column
        columns.forEach((c, i) => {
            if (c.numFmt) ws.getColumn(i + 1).numFmt = c.numFmt;
        });

        // Supplier total-spend lookup (for tail detection)
        const supTotalMap = new Map<string, number>(
            stats.suppliers.map(s => [s.name, s.spend])
        );
        const avgTx = stats.avgTx;

        let rowIdx = 0;
        for (const row of this.data) {
            const supName  = str(row[this.supKey], 'Unknown');
            const supTotal = supTotalMap.get(supName) ?? 0;
            const amt      = parseAmount(row[this.amtKey]);
            const d        = parseDate(row[this.dateKey]);
            const fp       = d ? fiscalPeriod(d) : { fiscalYear: '', fiscalPeriod: '' };
            const ym       = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : '';
            const qtr      = d ? `Q${Math.ceil((d.getMonth() + 1) / 3)}` : '';
            const mav      = isMaverick(row, this.ctrKey || undefined) ? 'Y' : 'N';
            const tail     = isTailSpend(supTotal, avgTx) ? 'Y' : 'N';
            const abc      = stats.abcMap.get(supName) ?? 'C';

            const dataRow = ws.addRow({
                tx_date:  d ?? undefined,
                fy:       fp.fiscalYear,
                fp:       fp.fiscalPeriod,
                ym,
                qtr,
                doc_no:   str(row[this.docKey]),
                po_no:    str(row[this.poKey]),
                ctr_id:   str(row[this.ctrKey]),
                sup_id:   supName.toUpperCase().replace(/\s+/g, '_'),
                sup_name: supName,
                cat_l1:   str(row[this.catL1Key], 'Uncategorized'),
                cat_l2:   str(row[this.catL2Key], str(row[this.catL1Key], 'Uncategorized')),
                cat_l3:   str(row[this.catL3Key], str(row[this.catL2Key], str(row[this.catL1Key], 'Uncategorized'))),
                co_code:  str(row[this.coKey]),
                bu:       str(row[this.buKey]),
                plant:    str(row[this.plantKey]),
                dept:     str(row[this.deptKey]),
                cc:       str(row[this.ccKey]),
                region:   str(row[this.regionKey]),
                cur:      str(row[this.curKey], this.cur),
                amt_doc:  amt,
                amt_rpt:  amt,  // already in reporting currency after ETL FX normalisation
                qty:      this.qtyKey ? parseAmount(row[this.qtyKey]) : undefined,
                up:       this.upKey  ? parseAmount(row[this.upKey])  : undefined,
                pt:       str(row[this.ptKey]),
                item_desc:str(row[this.descKey]),
                abc,
                mav,
                tail,
                sum:      mav === 'N' ? 'Y' : 'N',
            });

            this.shadeRow(dataRow, rowIdx);

            // Colour the ABC class cell
            const abcCell = dataRow.getCell('abc');
            abcCell.font  = { bold: true, color: { argb: abc === 'A' ? GREEN_OK : abc === 'B' ? AMBER_WARN : MID_GRAY } };

            // Red maverick flag
            if (mav === 'Y') {
                dataRow.getCell('mav').font = { color: { argb: RED_CRIT } };
            }

            rowIdx++;
        }

        ws.autoFilter = {
            from: { row: 1, column: 1 },
            to:   { row: 1, column: columns.length }
        };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    }

    // -----------------------------------------------------------------------
    // TAB 2: 2_Dim_Supplier
    // -----------------------------------------------------------------------
    private createDimSupplier(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('2_Dim_Supplier');

        ws.columns = [
            { header: 'Supplier_ID',           key: 'id',        width: 26 },
            { header: 'Supplier_Name',          key: 'name',      width: 34 },
            { header: 'Segment',                key: 'seg',       width: 14 },
            { header: 'ABC_Class',              key: 'abc',       width: 11 },
            { header: 'Total_Spend',            key: 'spend',     width: 20 },
            { header: 'Spend_Share_%',          key: 'share',     width: 16 },
            { header: 'Transaction_Count',      key: 'count',     width: 20 },
            { header: 'Avg_Transaction',        key: 'avg',       width: 20 },
            { header: 'Category_L1_Primary',    key: 'cat',       width: 22 },
            { header: 'Maverick_Tx_Count',      key: 'mav',       width: 20 },
            { header: 'Maverick_Rate_%',        key: 'mavpct',    width: 18 },
            { header: 'Risk_Tier',              key: 'risk',      width: 14 },
            { header: 'Tail_Spend_Flag',        key: 'tail',      width: 16 },
            { header: 'Contracted_Flag',        key: 'contracted',width: 16 },
        ];
        this.styleHeaderRow(ws.getRow(1));

        ws.getColumn('spend').numFmt   = this.curFmt;
        ws.getColumn('avg').numFmt     = this.curFmt;
        ws.getColumn('share').numFmt   = this.pctFmt;
        ws.getColumn('mavpct').numFmt  = this.pctFmt;

        const total = stats.totalSpend;
        const avgTx = stats.avgTx;

        stats.suppliers.forEach((s, idx) => {
            const tail  = isTailSpend(s.spend, avgTx);
            const mav   = s.mavCount;
            const mavPct = s.count > 0 ? mav / s.count : 0;

            const seg = s.abc === 'A' ? 'Strategic'
                      : s.abc === 'B' ? 'Preferred'
                      : tail          ? 'Tail'
                      : 'Tactical';

            const risk = s.abc === 'A' && (s.spend / total) > 0.15 ? 'High'
                       : s.abc === 'A'                               ? 'Medium'
                       : 'Low';

            const row = ws.addRow({
                id:          s.name.toUpperCase().replace(/\s+/g, '_'),
                name:        s.name,
                seg,
                abc:         s.abc,
                spend:       s.spend,
                share:       total > 0 ? s.spend / total : 0,
                count:       s.count,
                avg:         s.avgTx,
                cat:         [...s.l1Set][0] ?? '',
                mav,
                mavpct:      mavPct,
                risk,
                tail:        tail ? 'Y' : 'N',
                contracted:  mav === 0 ? 'Y' : 'N',
            });

            this.shadeRow(row, idx);

            // High concentration highlight (> 10% share)
            if (s.spend / total > 0.10) {
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD_HIGH } };
                });
            } else if (idx < 10) {
                row.eachCell({ includeEmpty: true }, cell => {
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_TOP } };
                });
            }

            // ABC font colour
            row.getCell('abc').font = { bold: true, color: { argb: s.abc === 'A' ? GREEN_OK : s.abc === 'B' ? AMBER_WARN : MID_GRAY } };
        });

        ws.autoFilter = { from: 'A1', to: `N1` };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    }

    // -----------------------------------------------------------------------
    // TAB 3: 3_Dim_Category
    // -----------------------------------------------------------------------
    private createDimCategory(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('3_Dim_Category');

        ws.columns = [
            { header: 'Category_L1',            key: 'l1',       width: 22 },
            { header: 'Category_L2',            key: 'l2',       width: 24 },
            { header: 'L1_Total_Spend',         key: 'l1spend',  width: 20 },
            { header: 'L1_Spend_Share_%',       key: 'l1share',  width: 18 },
            { header: 'L2_Total_Spend',         key: 'l2spend',  width: 20 },
            { header: 'L2_Spend_Share_%',       key: 'l2share',  width: 18 },
            { header: 'L2_Tx_Count',            key: 'l2count',  width: 14 },
            { header: 'Strategy_Tag',           key: 'strat',    width: 18 },
            { header: 'Pareto_Rank',            key: 'rank',     width: 14 },
        ];
        this.styleHeaderRow(ws.getRow(1));
        ws.getColumn('l1spend').numFmt  = this.curFmt;
        ws.getColumn('l2spend').numFmt  = this.curFmt;
        ws.getColumn('l1share').numFmt  = this.pctFmt;
        ws.getColumn('l2share').numFmt  = this.pctFmt;

        const total = stats.totalSpend;
        let rank    = 0;

        for (const cat of stats.categories) {
            const l1Share = total > 0 ? cat.spend / total : 0;

            // Strategy tag heuristic
            const strat = l1Share > 0.3 ? 'Leverage'
                        : l1Share > 0.1 ? 'Strategic'
                        : l1Share > 0.03 ? 'Bottleneck'
                        : 'Routine';

            for (const l2 of cat.l2List) {
                rank++;
                const row = ws.addRow({
                    l1:      cat.l1,
                    l2:      l2.l2,
                    l1spend: cat.spend,
                    l1share: l1Share,
                    l2spend: l2.spend,
                    l2share: total > 0 ? l2.spend / total : 0,
                    l2count: l2.count,
                    strat,
                    rank,
                });
                this.shadeRow(row, rank);

                // Colour by strategy
                const stratCell = row.getCell('strat');
                const stratColour = strat === 'Leverage' ? GREEN_OK
                                  : strat === 'Strategic' ? ACCENT_BLUE
                                  : strat === 'Bottleneck' ? AMBER_WARN
                                  : MID_GRAY;
                stratCell.font = { bold: true, color: { argb: stratColour } };
            }
        }

        ws.autoFilter = { from: 'A1', to: 'I1' };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    }

    // -----------------------------------------------------------------------
    // TAB 4: 4_Dim_Org
    // -----------------------------------------------------------------------
    private createDimOrg(stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('4_Dim_Org');

        ws.columns = [
            { header: 'Business_Unit',    key: 'bu',     width: 26 },
            { header: 'Total_Spend',      key: 'spend',  width: 22 },
            { header: 'Spend_Share_%',    key: 'share',  width: 18 },
            { header: 'Tx_Count',         key: 'count',  width: 14 },
        ];
        this.styleHeaderRow(ws.getRow(1));
        ws.getColumn('spend').numFmt = this.curFmt;
        ws.getColumn('share').numFmt = this.pctFmt;

        const total = stats.totalSpend;

        if (stats.buMap.size === 0) {
            // No BU column mapped — show a single placeholder row
            ws.addRow({ bu: '(Business unit column not mapped)', spend: total, share: 1, count: this.data.length });
        } else {
            const sorted = [...stats.buMap.entries()].sort((a, b) => b[1] - a[1]);
            const buCounts = new Map<string, number>();
            if (this.buKey) {
                for (const row of this.data) {
                    const bu = str(row[this.buKey], 'Unknown');
                    buCounts.set(bu, (buCounts.get(bu) ?? 0) + 1);
                }
            }
            sorted.forEach(([bu, spend], idx) => {
                const row = ws.addRow({
                    bu,
                    spend,
                    share: total > 0 ? spend / total : 0,
                    count: buCounts.get(bu) ?? 0,
                });
                this.shadeRow(row, idx);
            });
        }

        ws.autoFilter = { from: 'A1', to: 'D1' };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    }

    // -----------------------------------------------------------------------
    // TAB 5: 5_Dim_Date
    // -----------------------------------------------------------------------
    private createDimDate() {
        const ws = this.wb.addWorksheet('5_Dim_Date');

        ws.columns = [
            { header: 'Date',           key: 'dt',     width: 14, numFmt: 'dd/mm/yyyy' },
            { header: 'Year',           key: 'yr',     width: 8  },
            { header: 'Month_Num',      key: 'mo',     width: 12 },
            { header: 'Month_Name',     key: 'mname',  width: 14 },
            { header: 'Quarter',        key: 'qtr',    width: 10 },
            { header: 'Fiscal_Year',    key: 'fy',     width: 12 },
            { header: 'Fiscal_Period',  key: 'fp',     width: 14 },
            { header: 'Is_Weekend',     key: 'wknd',   width: 12 },
            { header: 'Week_Number',    key: 'wk',     width: 14 },
        ];
        this.styleHeaderRow(ws.getRow(1));
        ws.getColumn('dt').numFmt = 'dd/mm/yyyy';

        // Collect unique dates from data
        const dateSet = new Set<string>();
        for (const row of this.data) {
            const d = parseDate(row[this.dateKey]);
            if (d) dateSet.add(d.toISOString().slice(0, 10));
        }

        const MONTHS = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];

        const sortedDates = [...dateSet].sort();
        sortedDates.forEach((iso, idx) => {
            const d   = new Date(iso);
            const fp  = fiscalPeriod(d);
            const wk  = Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7);
            const row = ws.addRow({
                dt:    d,
                yr:    d.getFullYear(),
                mo:    d.getMonth() + 1,
                mname: MONTHS[d.getMonth()],
                qtr:   `Q${Math.ceil((d.getMonth() + 1) / 3)}`,
                fy:    fp.fiscalYear,
                fp:    fp.fiscalPeriod,
                wknd:  [0, 6].includes(d.getDay()) ? 'Y' : 'N',
                wk,
            });
            this.shadeRow(row, idx);
        });

        ws.autoFilter = { from: 'A1', to: 'I1' };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    }

    // -----------------------------------------------------------------------
    // TAB 6: 6_KPI_Export
    // -----------------------------------------------------------------------
    private createKpiExport(_stats: ReturnType<ExcelGenerator['buildStats']>) {
        const ws = this.wb.addWorksheet('6_KPI_Export');

        ws.columns = [
            { header: 'Year_Month',              key: 'ym',         width: 14 },
            { header: 'Fiscal_Period',           key: 'fp',         width: 14 },
            { header: 'Category_L1',             key: 'cat',        width: 22 },
            { header: 'Business_Unit',           key: 'bu',         width: 22 },
            { header: 'Total_Spend',             key: 'spend',      width: 20 },
            { header: 'Tx_Count',                key: 'count',      width: 14 },
            { header: 'Avg_Transaction',         key: 'avg',        width: 20 },
            { header: 'Supplier_Count',          key: 'sups',       width: 16 },
            { header: 'Maverick_Spend',          key: 'mavspend',   width: 20 },
            { header: 'Maverick_Spend_%',        key: 'mavpct',     width: 18 },
            { header: 'Spend_Under_Mgmt_%',      key: 'sum',        width: 20 },
            { header: 'Top3_Supplier_Conc_%',    key: 'top3',       width: 22 },
            { header: 'MoM_Change_%',            key: 'mom',        width: 16 },
        ];
        this.styleHeaderRow(ws.getRow(1));
        ws.getColumn('spend').numFmt    = this.curFmt;
        ws.getColumn('avg').numFmt      = this.curFmt;
        ws.getColumn('mavspend').numFmt = this.curFmt;
        ws.getColumn('mavpct').numFmt   = this.pctFmt;
        ws.getColumn('sum').numFmt      = this.pctFmt;
        ws.getColumn('top3').numFmt     = this.pctFmt;
        ws.getColumn('mom').numFmt      = this.pctFmt;

        // Build KPI cube: ym × cat_l1 × bu
        type KpiKey = string; // `${ym}|${cat_l1}|${bu}`
        interface KpiCell {
            ym: string; fp: string; cat: string; bu: string;
            spend: number; count: number;
            mavSpend: number; mavCount: number;
            supSet: Set<string>;
            supSpend: Map<string, number>;
        }
        const cube = new Map<KpiKey, KpiCell>();

        for (const row of this.data) {
            const d    = parseDate(row[this.dateKey]);
            const ym   = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : 'Unknown';
            const fp   = d ? fiscalPeriod(d).fiscalPeriod : '';
            const cat  = str(row[this.catL1Key], 'Uncategorized');
            const bu   = this.buKey ? str(row[this.buKey], 'Unknown') : '(All)';
            const amt  = parseAmount(row[this.amtKey]);
            const sup  = str(row[this.supKey], 'Unknown');
            const mav  = isMaverick(row, this.ctrKey || undefined);

            const key: KpiKey = `${ym}|${cat}|${bu}`;
            if (!cube.has(key)) {
                cube.set(key, { ym, fp, cat, bu, spend: 0, count: 0, mavSpend: 0, mavCount: 0, supSet: new Set(), supSpend: new Map() });
            }
            const cell = cube.get(key)!;
            cell.spend   += amt;
            cell.count++;
            cell.supSet.add(sup);
            cell.supSpend.set(sup, (cell.supSpend.get(sup) ?? 0) + amt);
            if (mav) { cell.mavSpend += amt; cell.mavCount++; }
        }

        // Sort by ym then cat
        const rows = [...cube.values()].sort((a, b) =>
            a.ym.localeCompare(b.ym) || a.cat.localeCompare(b.cat) || a.bu.localeCompare(b.bu)
        );

        // Build MoM lookup (ym × cat × bu → spend)
        const prevSpendMap = new Map<string, number>(); // `${cat}|${bu}` → prev spend

        let rowIdx = 0;
        let prevYm  = '';
        for (const cell of rows) {
            const catBuKey = `${cell.cat}|${cell.bu}`;

            // MoM: compare with previous month's same cat+bu
            let mom = 0;
            const prevSpend = prevSpendMap.get(catBuKey) ?? 0;
            if (prevSpend > 0 && cell.ym !== prevYm) {
                mom = (cell.spend - prevSpend) / prevSpend;
            }
            prevYm = cell.ym;
            prevSpendMap.set(catBuKey, cell.spend);

            // Top-3 supplier concentration within this cube cell
            const supsSorted = [...cell.supSpend.entries()].sort((a, b) => b[1] - a[1]);
            const top3 = cell.spend > 0
                ? supsSorted.slice(0, 3).reduce((s, [, v]) => s + v, 0) / cell.spend
                : 0;

            const dataRow = ws.addRow({
                ym:       cell.ym,
                fp:       cell.fp,
                cat:      cell.cat,
                bu:       cell.bu,
                spend:    cell.spend,
                count:    cell.count,
                avg:      cell.count > 0 ? cell.spend / cell.count : 0,
                sups:     cell.supSet.size,
                mavspend: cell.mavSpend,
                mavpct:   cell.spend > 0 ? cell.mavSpend / cell.spend : 0,
                sum:      cell.spend > 0 ? (cell.spend - cell.mavSpend) / cell.spend : 0,
                top3,
                mom,
            });

            this.shadeRow(dataRow, rowIdx);

            // Colour MoM: red = spend up, green = spend down
            if (mom !== 0) {
                dataRow.getCell('mom').font = {
                    color: { argb: mom > 0 ? RED_CRIT : GREEN_OK }, bold: true
                };
            }
            rowIdx++;
        }

        ws.autoFilter = { from: 'A1', to: 'M1' };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    }

    // -----------------------------------------------------------------------
    // TAB 7: 7_Data_Quality
    // -----------------------------------------------------------------------
    private createDataQuality() {
        const ws = this.wb.addWorksheet('7_Data_Quality');

        ws.columns = [
            { header: 'Field_Name',       key: 'field',   width: 28 },
            { header: 'Mapped_Column',    key: 'mapped',  width: 26 },
            { header: 'Total_Rows',       key: 'total',   width: 12 },
            { header: 'Filled_Rows',      key: 'filled',  width: 12 },
            { header: 'Completeness_%',   key: 'pct',     width: 16 },
            { header: 'Status',           key: 'status',  width: 12 },
            { header: 'Visual_Bar',       key: 'bar',     width: 26 },
        ];
        this.styleHeaderRow(ws.getRow(1));
        ws.getColumn('pct').numFmt = this.pctFmt;

        if (this.data.length === 0) return;

        const total   = this.data.length;
        const allCols = Object.keys(this.data[0]);

        // Also report on semantically important ETL columns (even if unmapped)
        const semanticCols: Array<{ field: string; key: string }> = [
            { field: 'Transaction Date',   key: this.dateKey },
            { field: 'Amount',             key: this.amtKey },
            { field: 'Supplier / Vendor',  key: this.supKey },
            { field: 'Category L1',        key: this.catL1Key },
            { field: 'Category L2',        key: this.catL2Key },
            { field: 'Category L3',        key: this.catL3Key },
            { field: 'Currency',           key: this.curKey },
            { field: 'Business Unit',      key: this.buKey },
            { field: 'Plant / Location',   key: this.plantKey },
            { field: 'PO Number',          key: this.poKey },
            { field: 'Contract Ref',       key: this.ctrKey },
            { field: 'Payment Terms',      key: this.ptKey },
            { field: 'Quantity',           key: this.qtyKey },
            { field: 'Unit Price',         key: this.upKey },
            { field: 'Item Description',   key: this.descKey },
        ].filter(c => c.key); // only those that have a mapped column

        // Semantic cols first, then any remaining raw columns
        const processedKeys = new Set(semanticCols.map(c => c.key));
        const remainingCols = allCols.filter(k => !processedKeys.has(k));

        const allEntries = [
            ...semanticCols.map(c => ({ field: c.field, key: c.key })),
            ...remainingCols.map(k => ({ field: k, key: k })),
        ];

        let rowIdx = 0;
        for (const { field, key } of allEntries) {
            if (!key) continue;
            const filled  = this.data.filter(r => r[key] !== null && r[key] !== undefined && r[key] !== '').length;
            const pct     = total > 0 ? filled / total : 0;
            const status  = pct > 0.9 ? 'OK' : pct > 0.5 ? 'WARNING' : 'CRITICAL';
            const barLen  = Math.round(pct * 20);
            const bar     = '█'.repeat(barLen) + '░'.repeat(20 - barLen);

            const row = ws.addRow({
                field,
                mapped: key !== field ? key : '(direct)',
                total,
                filled,
                pct,
                status,
                bar,
            });

            this.shadeRow(row, rowIdx);

            const statusCell = row.getCell('status');
            const barCell    = row.getCell('bar');
            const colourArgb = status === 'OK' ? GREEN_OK : status === 'WARNING' ? AMBER_WARN : RED_CRIT;
            statusCell.font  = { bold: true, color: { argb: colourArgb } };
            barCell.font     = { color: { argb: colourArgb }, name: 'Courier New', size: 9 };

            rowIdx++;
        }

        ws.autoFilter = { from: 'A1', to: 'G1' };
        ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];
    }
}
