/**
 * Conservative, defensible savings — the single source of truth used by BOTH the
 * Excel report and the Analytics dashboard so the two can never disagree.
 *
 * Method (deliberately disciplined — an upper bound you can defend line-by-line):
 *   Rate harmonisation — for each item bought from >=2 vendors AND recorded in a
 *     SINGLE UOM (so unit prices are comparable), saving = (weighted-avg price paid
 *     − best vendor rate) x quantity. Fuel / biomass / agri items are EXCLUDED
 *     because those are timing plays, not vendor-rate plays.
 *   Freight — a flat, conservative % of separately-billed freight.
 *
 * Everything else (tail consolidation, single-source leverage, payment terms) is
 * intentionally NOT summed into the headline; it is reported as qualitative context.
 */

export interface SavingsColumns {
    itemKey: string;
    vendorKey: string;
    uomKey: string;
    qtyKey: string;
    amountKey: string;
    categoryKey: string;
    descKey?: string;
    freightKey?: string;
}

export interface BenchmarkItem {
    code: string;
    desc: string;
    cat: string;
    uom: string;
    nVendors: number;
    qty: number;
    spend: number;
    paidWavg: number;
    bestRate: number;
    bestVendor: string;
    saving: number;
    savingPct: number;
}

export interface ConservativeSavings {
    totalSpend: number;
    totalFreight: number;
    benchmark: BenchmarkItem[];
    multiVendorSpend: number;
    rateHarmonisationSaving: number; // ex-fuel, firm
    rateHarmonisationSpend: number;
    freightRate: number;
    freightSaving: number;
    firmSaving: number;              // rate harmonisation + freight — the defensible headline
    firmSavingPct: number;           // firmSaving / totalSpend
}

// Categories treated as timing/commodity plays rather than vendor-rate plays.
export const FUEL_RE = /fuel|biomass|husk|petroleum|lpg|agri/i;

/** Pick the first candidate key that exists on the sample row (mirrors ExcelGenerator). */
function resolveKey(sample: Record<string, any> | undefined, candidates: Array<string | undefined>, fallback: string): string {
    if (sample) for (const c of candidates) { if (c && Object.prototype.hasOwnProperty.call(sample, c)) return c; }
    return fallback;
}

/**
 * Resolve the savings columns from a mapping object + a sample row, using the SAME
 * fallback names the ExcelGenerator uses — so the dashboard and the report resolve
 * to identical columns and therefore identical numbers.
 */
export function resolveSavingsColumns(sample: Record<string, any> | undefined, m: Record<string, any> = {}): SavingsColumns {
    return {
        itemKey: resolveKey(sample, [m.item_code, 'ITEM CODE', 'Item Code'], 'Item Code'),
        vendorKey: resolveKey(sample, [m.supplier, m.vendor, 'PARTY NAME', 'Vendor'], 'Vendor'),
        uomKey: resolveKey(sample, [m.uom, 'UOM'], 'UOM'),
        qtyKey: resolveKey(sample, [m.quantity, 'QTY RCVD.', 'QTY RCVD', 'Qty'], 'Qty'),
        amountKey: resolveKey(sample, [m.amount, m.invoice_amount, 'BASIC AMOUNT', 'Basic Amount'], 'Amount'),
        categoryKey: resolveKey(sample, [m.category_l1, m.category, 'category_l1', 'category', 'Category', 'CATEGORY'], 'category'),
        descKey: resolveKey(sample, [m.item_description, 'ITEM DESC.', 'ITEM DESC', 'Item Description'], 'Item Description'),
        freightKey: resolveKey(sample, [m.freight, 'FREIGHT', 'Freight'], 'Freight'),
    };
}

/** Convenience: resolve columns from mappings, then compute. Used by the dashboard. */
export function computeConservativeSavingsFromMappings(
    rows: Array<Record<string, any>>,
    mappings: Record<string, any> = {},
    freightRate = 0.15,
): ConservativeSavings {
    return computeConservativeSavings(rows, resolveSavingsColumns(rows[0], mappings), freightRate);
}

const num = (v: any): number => {
    const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};
const txt = (v: any, fallback = ''): string => {
    const s = String(v ?? '').trim();
    return s === '' ? fallback : s;
};

/**
 * Compute conservative savings from raw rows and the resolved column keys.
 * The default freight rate (15%) matches the Excel report.
 */
export function computeConservativeSavings(
    rows: Array<Record<string, any>>,
    cols: SavingsColumns,
    freightRate = 0.15,
): ConservativeSavings {
    const itemMap = new Map<string, {
        desc: string; cat: string; uoms: Set<string>;
        qty: number; spend: number; vendors: Map<string, { qty: number; spend: number }>;
    }>();
    let totalSpend = 0;
    let totalFreight = 0;

    for (const row of rows) {
        const basic = num(row[cols.amountKey]);
        totalSpend += basic;
        if (cols.freightKey) totalFreight += num(row[cols.freightKey]);

        const item = txt(row[cols.itemKey], 'Unknown');
        const ven = txt(row[cols.vendorKey], 'Unknown');
        const uom = txt(row[cols.uomKey], '');
        const qty = num(row[cols.qtyKey]);
        const cat = txt(row[cols.categoryKey], 'Other / Uncategorized');

        let ie = itemMap.get(item);
        if (!ie) {
            ie = { desc: txt(cols.descKey ? row[cols.descKey] : ''), cat, uoms: new Set(), qty: 0, spend: 0, vendors: new Map() };
            itemMap.set(item, ie);
        }
        ie.qty += qty;
        ie.spend += basic;
        if (uom) ie.uoms.add(uom);
        let vv = ie.vendors.get(ven);
        if (!vv) { vv = { qty: 0, spend: 0 }; ie.vendors.set(ven, vv); }
        vv.qty += qty;
        vv.spend += basic;
    }

    const benchmark: BenchmarkItem[] = [];
    let multiVendorSpend = 0;
    for (const [code, d] of itemMap) {
        if (d.vendors.size >= 2) multiVendorSpend += d.spend;
        if (!(d.vendors.size >= 2 && d.uoms.size === 1 && d.qty > 0)) continue;
        const paidWavg = d.spend / d.qty;
        let bestRate = Infinity, bestVendor = '';
        for (const [vn, vd] of d.vendors) {
            if (vd.qty <= 0) continue;
            const r = vd.spend / vd.qty;
            if (r < bestRate) { bestRate = r; bestVendor = vn; }
        }
        const saving = Math.max(0, paidWavg - bestRate) * d.qty;
        benchmark.push({
            code, desc: d.desc, cat: d.cat, uom: [...d.uoms][0],
            nVendors: d.vendors.size, qty: d.qty, spend: d.spend,
            paidWavg, bestRate, bestVendor,
            saving, savingPct: d.spend > 0 ? saving / d.spend : 0,
        });
    }
    benchmark.sort((a, b) => b.saving - a.saving);

    const exFuel = benchmark.filter((b) => !FUEL_RE.test(b.cat));
    const rateHarmonisationSaving = exFuel.reduce((a, b) => a + b.saving, 0);
    const rateHarmonisationSpend = exFuel.reduce((a, b) => a + b.spend, 0);
    const freightSaving = totalFreight * freightRate;
    const firmSaving = rateHarmonisationSaving + freightSaving;

    return {
        totalSpend, totalFreight, benchmark, multiVendorSpend,
        rateHarmonisationSaving, rateHarmonisationSpend,
        freightRate, freightSaving, firmSaving,
        firmSavingPct: totalSpend > 0 ? firmSaving / totalSpend : 0,
    };
}
