/**
 * Shared utility for auto-detecting column names in procurement datasets
 * when explicit mappings are missing.
 */

export const COLUMN_PATTERNS = {
    amount: /^amount$|^total.?amount$|^net.?amount$|^invoice.?amount$|^value$/i,
    supplier: /^supplier$|^vendor$|^vendor.?name$|^supplier.?name$|^creaditor$/i,
    category_l1: /^category.?l1$|^category$|^dept$|^spend.?area$/i,
    date: /^date$|invoice.?date|txn.?date|transaction.?date|posting.?date|\bdate\b/i,
    payment_terms: /payment.?term|pay.?term|terms.?of.?payment|credit.?term|net.?day/i,
    contract_ref: /contract|po.?ref|po.?number|purchase.?order|contract.?ref|contract.?id|agreement/i,
    business_unit: /business.?unit|dept|department|division|bu\b|cost.?center/i,
    location: /location|plant|site|branch|region|warehouse|office/i,
    unit_price: /unit.?price|rate|price|unit.?cost|rate.?per.?unit/i,
    quantity: /quantity|qty|units|volume|count\b/i
};

/**
 * Priority-based column auto-detector for the ColumnMapper step.
 *
 * For each system field we list patterns most-specific first. We then pick the
 * header that matches the highest-priority pattern, and claim it so it cannot be
 * stolen by a later, weaker field. This fixes the old "last substring wins" bugs
 * (e.g. "STATE CODE /NAME" overwriting "PARTY NAME" for supplier, or several
 * date columns clobbering each other).
 *
 * Field order matters: list the more important / more specific fields first.
 */
const FIELD_PRIORITY: Array<[string, RegExp[]]> = [
    ['date', [/invoice\s*date/i, /\b(grn|mrn)\s*date/i, /bill\s*date/i, /posting\s*date|txn\s*date|transaction\s*date/i, /po\s*date/i, /\bdate\b/i]],
    ['amount', [/basic\s*amount/i, /taxable\s*(value|amount)/i, /net\s*amount/i, /total\s*amount/i, /^amount$/i, /\bamount\b/i, /\bvalue\b/i]],
    ['supplier', [/party\s*name/i, /vendor\s*name/i, /supplier\s*name/i, /\bvendor\b/i, /\bsupplier\b/i, /\bparty\b/i, /creditor/i]],
    ['hsn_code', [/hsn\s*\/?\s*sac/i, /\bhsn\b/i, /\bsac\b/i]],
    ['item_description', [/item\s*desc/i, /material\s*desc/i, /\bdescription\b/i, /particular/i, /item\s*name/i]],
    ['quantity', [/qty\s*rcvd/i, /\bqty\b/i, /quantity/i, /\bunits\b/i]],
    ['unit_price', [/net\s*rate/i, /unit\s*price/i, /unit\s*cost/i, /\brate\b/i, /\bprice\b/i]],
    ['po_number', [/po\s*no\b/i, /po\s*number/i, /purchase\s*order\s*no/i]],
    ['currency', [/currency/i, /\bcurr\b/i]],
    ['category_l1', [/category\s*l?1?/i, /spend\s*area/i, /commodity/i]],
    ['business_unit', [/business\s*unit/i, /\bdepartment\b/i, /\bdept\b/i, /division/i, /cost\s*cent/i, /\bbu\b/i]],
    ['location', [/\bstate\b/i, /\blocation\b/i, /\bregion\b/i, /\bcity\b/i, /\bbranch\b/i, /\bsite\b/i]],
    ['plant', [/\bplant\b/i, /facility/i]],
    ['buyer', [/\bbuyer\b/i, /requester/i, /indent/i]],
    ['gl_account', [/gl\s*(account|code)/i, /ledger/i]],
    ['contract_ref', [/contract/i, /agreement/i]],
];

export const detectMappings = (headers: string[]): Record<string, string> => {
    const result: Record<string, string> = {};
    const used = new Set<string>();

    for (const [field, patterns] of FIELD_PRIORITY) {
        let best: { header: string; rank: number } | null = null;
        for (const header of headers) {
            if (used.has(header)) continue;
            const rank = patterns.findIndex((p) => p.test(header));
            if (rank === -1) continue;
            if (!best || rank < best.rank) best = { header, rank };
        }
        if (best) {
            result[field] = best.header;
            used.add(best.header);
        }
    }
    return result;
};

export const autoDetectColumn = (
    key: string,
    data: any[],
    mappings: Record<string, string>,
    patternOverride?: RegExp,
    exclude?: RegExp
): string => {
    // 1. Try explicit mapping
    if (mappings[key]) return mappings[key];

    // 2. Return if no data to inspect
    if (!data || data.length === 0) return '';

    // 3. Scan available headers
    const cols = Object.keys(data[0]);
    const pattern = patternOverride || (COLUMN_PATTERNS as any)[key];

    if (!pattern) return '';

    return cols.find(c =>
        pattern.test(c) && (!exclude || !exclude.test(c))
    ) || '';
};

/**
 * Returns a complete mapping object with auto-detected fallbacks
 */
export const getAutoMappings = (data: any[], currentMappings: Record<string, string>): Record<string, string> => {
    const autoMappings: Record<string, string> = { ...currentMappings };

    Object.keys(COLUMN_PATTERNS).forEach(key => {
        if (!autoMappings[key]) {
            const detected = autoDetectColumn(key, data, currentMappings);
            if (detected) {
                autoMappings[key] = detected;
            }
        }
    });

    return autoMappings;
};
