/**
 * Conservative, defensible savings — the single source of truth so the Excel report
 * and the Analytics dashboard show the SAME number.
 *
 * Method (an upper bound you can defend line-by-line):
 *   Rate harmonisation — for each item bought from >=2 vendors AND recorded in a
 *     SINGLE UOM (so unit prices are comparable), saving = (weighted-avg price paid
 *     − best vendor rate) x quantity. Fuel / biomass / agri excluded (timing plays).
 *   Freight — a flat, conservative % of separately-billed freight.
 * Everything else (tail, single-source, payment terms) is NOT summed into the headline.
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

export interface ConservativeSavings {
    totalSpend: number;
    totalFreight: number;
    rateHarmonisationSaving: number; // ex-fuel, firm
    rateHarmonisationSpend: number;
    freightRate: number;
    freightSaving: number;
    firmSaving: number;              // rate harmonisation + freight — the defensible headline
    firmSavingPct: number;
    multiVendorSpend: number;
}

export const FUEL_RE = /fuel|biomass|husk|petroleum|lpg|agri/i;

const num = (v: any): number => {
    const n = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(n) ? n : 0;
};
const txt = (v: any, fallback = ''): string => {
    const s = String(v ?? '').trim();
    return s === '' ? fallback : s;
};

function resolveKey(sample: Record<string, any> | undefined, candidates: Array<string | undefined>, fallback: string): string {
    if (sample) for (const c of candidates) { if (c && Object.prototype.hasOwnProperty.call(sample, c)) return c; }
    return fallback;
}

/** Resolve columns from a mappings object + sample row, matching ExcelGenerator's fallbacks. */
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

export function computeConservativeSavings(
    rows: Array<Record<string, any>>,
    cols: SavingsColumns,
    freightRate = 0.15,
): ConservativeSavings {
    const itemMap = new Map<string, {
        uoms: Set<string>; qty: number; spend: number; cat: string;
        vendors: Map<string, { qty: number; spend: number }>;
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
        if (!ie) { ie = { uoms: new Set(), qty: 0, spend: 0, cat, vendors: new Map() }; itemMap.set(item, ie); }
        ie.qty += qty; ie.spend += basic; if (uom) ie.uoms.add(uom);
        let vv = ie.vendors.get(ven);
        if (!vv) { vv = { qty: 0, spend: 0 }; ie.vendors.set(ven, vv); }
        vv.qty += qty; vv.spend += basic;
    }

    let rateHarmonisationSaving = 0;
    let rateHarmonisationSpend = 0;
    let multiVendorSpend = 0;
    for (const d of itemMap.values()) {
        if (d.vendors.size >= 2) multiVendorSpend += d.spend;
        if (!(d.vendors.size >= 2 && d.uoms.size === 1 && d.qty > 0)) continue;
        if (FUEL_RE.test(d.cat)) continue;
        const paidWavg = d.spend / d.qty;
        let bestRate = Infinity;
        for (const vd of d.vendors.values()) { if (vd.qty <= 0) continue; const r = vd.spend / vd.qty; if (r < bestRate) bestRate = r; }
        const saving = Math.max(0, paidWavg - bestRate) * d.qty;
        rateHarmonisationSaving += saving;
        rateHarmonisationSpend += d.spend;
    }

    const freightSaving = totalFreight * freightRate;
    const firmSaving = rateHarmonisationSaving + freightSaving;
    return {
        totalSpend, totalFreight,
        rateHarmonisationSaving, rateHarmonisationSpend,
        freightRate, freightSaving, firmSaving,
        firmSavingPct: totalSpend > 0 ? firmSaving / totalSpend : 0,
        multiVendorSpend,
    };
}

/** Resolve columns from mappings, then compute. Used by the dashboard. */
export function computeConservativeSavingsFromMappings(
    rows: Array<Record<string, any>>,
    mappings: Record<string, any> = {},
    freightRate = 0.15,
): ConservativeSavings {
    return computeConservativeSavings(rows, resolveSavingsColumns(rows[0], mappings), freightRate);
}
