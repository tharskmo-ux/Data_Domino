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
