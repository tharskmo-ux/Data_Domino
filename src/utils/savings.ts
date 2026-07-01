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
    ptKey?: string;
}

/** One savings lever — the number AND a plain-English explanation of how it was derived. */
export interface SavingsLever {
    key: string;
    label: string;
    tier: 'firm' | 'indicative';
    // Effort to realise: 'quickwin' = fast commercial term change (no re-sourcing);
    // 'strategic' = needs price negotiation, an RFQ, or a supplier programme.
    group: 'quickwin' | 'strategic';
    basisSpend: number;   // the spend the rate is applied to
    ratePct: number;      // e.g. 3 for 3% (0 for the computed rate-harmonisation gap)
    saving: number;
    how: string;          // plain-English, includes the arithmetic — shown identically in app + Excel
}

export interface SavingsModel {
    totalSpend: number;
    firmSaving: number;        // rate harmonisation + freight (defensible headline)
    indicativeSaving: number;  // sum of the indicative levers (mutually exclusive bases)
    levers: SavingsLever[];    // firm levers first, then indicative
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
        ptKey: resolveKey(sample, [m.payment_terms, m.terms, 'PAYMENT TERMS', 'Payment Terms', 'Terms'], ''),
    };
}

/** Compact Indian-format money for the plain-English explanations. */
export function inrShort(n: number): string {
    if (n >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/**
 * The FULL savings model — every lever with its number and a plain-English "how".
 * One source of truth for both the dashboard roadmap and the Excel savings sheet, so
 * they are always consistent and each figure explains itself.
 *
 * Firm levers (defensible now): rate harmonisation + freight.
 * Indicative levers (need validation) use mutually-exclusive row bases (each rupee counted
 * once, by priority) so the indicative total never double-counts:
 *   single-source item (5%) > frequent large supplier (3%) > tail supplier (6%) > risky terms (2%).
 */
export function computeSavingsModel(
    rows: Array<Record<string, any>>,
    mappings: Record<string, any> = {},
    freightRate = 0.15,
): SavingsModel {
    const cols = resolveSavingsColumns(rows[0], mappings);
    const cons = computeConservativeSavings(rows, cols, freightRate);

    // Pass 1 — item → supplier set, and supplier → {spend, orders}
    const itemSuppliers = new Map<string, Set<string>>();
    const supAgg = new Map<string, { spend: number; orders: number }>();
    let totalSpend = 0;
    for (const r of rows) {
        const amt = num(r[cols.amountKey]);
        totalSpend += amt;
        const it = txt(r[cols.itemKey], 'Unknown');
        const sup = txt(r[cols.vendorKey], 'Unknown');
        if (!itemSuppliers.has(it)) itemSuppliers.set(it, new Set());
        itemSuppliers.get(it)!.add(sup);
        const s = supAgg.get(sup) || { spend: 0, orders: 0 };
        s.spend += amt; s.orders += 1; supAgg.set(sup, s);
    }
    const singleSupplierItems = new Set([...itemSuppliers].filter(([, s]) => s.size === 1).map(([i]) => i));
    const frequentSuppliers = new Set([...supAgg].filter(([, s]) => s.spend >= 1_000_000 && s.orders >= 12).map(([n]) => n));
    const tailSuppliers = new Set([...supAgg].filter(([, s]) => s.spend > 0 && s.spend < 200_000).map(([n]) => n));

    const PT_RISKY = /\b(cash|advance|prepay|upfront|immediate|cod|on.?delivery)\b|\bnet\s*0?7\b|\bnet\s*1[04]\b/i;

    // Pass 2 — assign each row to ONE indicative lever by priority (no double-count)
    let altSpend = 0, volSpend = 0, tailSpend = 0, ptSpend = 0;
    for (const r of rows) {
        const amt = num(r[cols.amountKey]);
        if (amt <= 0) continue;
        const it = txt(r[cols.itemKey], 'Unknown');
        const sup = txt(r[cols.vendorKey], 'Unknown');
        if (singleSupplierItems.has(it)) altSpend += amt;
        else if (frequentSuppliers.has(sup)) volSpend += amt;
        else if (tailSuppliers.has(sup)) tailSpend += amt;
        else if (cols.ptKey && PT_RISKY.test(String(r[cols.ptKey] ?? ''))) ptSpend += amt;
    }

    const levers: SavingsLever[] = [
        {
            key: 'rateHarmonisation', label: 'Rate harmonisation', tier: 'firm', group: 'strategic',
            basisSpend: cons.rateHarmonisationSpend, ratePct: 0, saving: cons.rateHarmonisationSaving,
            how: `On ${inrShort(cons.rateHarmonisationSpend)} of items bought from 2+ vendors in the same unit (fuel & agri excluded), move volume to each item's lowest in-year rate: Σ (price paid − best rate) × qty = ${inrShort(cons.rateHarmonisationSaving)}.`,
        },
        {
            key: 'freight', label: 'Freight billed separately', tier: 'firm', group: 'quickwin',
            basisSpend: cons.totalFreight, ratePct: Math.round(freightRate * 100), saving: cons.freightSaving,
            how: `${inrShort(cons.totalFreight)} of freight is invoiced on separate lines; delivered (FOR) pricing absorbs about ${Math.round(freightRate * 100)}% → ${inrShort(cons.freightSaving)}.`,
        },
        {
            key: 'alternateVendor', label: 'Alternate vendor (RFQ)', tier: 'indicative', group: 'strategic',
            basisSpend: altSpend, ratePct: 5, saving: altSpend * 0.05,
            how: `5% competitive-tension benefit on ${inrShort(altSpend)} of spend on items that currently have only one supplier (qualify a 2nd source) = ${inrShort(altSpend * 0.05)}.`,
        },
        {
            key: 'volumeCommitment', label: 'Volume commitment', tier: 'indicative', group: 'strategic',
            basisSpend: volSpend, ratePct: 3, saving: volSpend * 0.03,
            how: `3% volume-commitment discount on ${inrShort(volSpend)} placed with suppliers you order from often and at scale (≥ ₹10 L and ≥ 12 orders) = ${inrShort(volSpend * 0.03)}.`,
        },
        {
            key: 'tailConsolidation', label: 'Tail consolidation', tier: 'indicative', group: 'strategic',
            basisSpend: tailSpend, ratePct: 6, saving: tailSpend * 0.06,
            how: `6% process + leverage saving on ${inrShort(tailSpend)} spread across many small suppliers (< ₹2 L/yr each) by consolidating onto preferred vendors = ${inrShort(tailSpend * 0.06)}.`,
        },
        {
            key: 'paymentTerms', label: 'Payment terms', tier: 'indicative', group: 'quickwin',
            basisSpend: ptSpend, ratePct: 2, saving: ptSpend * 0.02,
            how: `~2% cost-of-capital saving on ${inrShort(ptSpend)} paid on cash / advance / short-net terms by moving to net-30+ = ${inrShort(ptSpend * 0.02)}.`,
        },
    ];
    const firmSaving = cons.firmSaving;
    const indicativeSaving = levers.filter(l => l.tier === 'indicative').reduce((a, l) => a + l.saving, 0);
    return { totalSpend, firmSaving, indicativeSaving, levers };
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
