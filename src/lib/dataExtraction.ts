import * as XLSX from 'xlsx';

/**
 * Normalizes a worksheet by populating all cells within merge ranges 
 * with the value from the top-left (start) cell of the merge.
 */
export const normalizeWorksheet = (worksheet: XLSX.WorkSheet) => {
    const merges = worksheet['!merges'];
    if (!merges) return worksheet;

    const newWorksheet = { ...worksheet };

    merges.forEach(merge => {
        const startCell = XLSX.utils.encode_cell(merge.s);
        const startValue = worksheet[startCell];

        if (!startValue) return;

        for (let r = merge.s.r; r <= merge.e.r; r++) {
            for (let c = merge.s.c; c <= merge.e.c; c++) {
                const currentCell = XLSX.utils.encode_cell({ r, c });
                // Only fill if empty to avoid overwriting (though merges should be empty anyway)
                if (!newWorksheet[currentCell]) {
                    newWorksheet[currentCell] = { ...startValue };
                }
            }
        }
    });

    return newWorksheet;
};

/**
 * Automatically propagates values down for key columns to "stitch" 
 * multi-line transactions together.
 * @param contextColumns Columns to "fill down" (e.g. Vendor, Date)
 * @param markerColumns Columns that MUST have data for a row to be considered a line item (e.g. Description, Amount)
 */
export const stitchTransactions = (data: any[], contextColumns: string[], markerColumns: string[] = []) => {
    if (!data || data.length === 0) return data;

    const lastValues: Record<string, any> = {};

    return data.map(row => {
        const newRow = { ...row };
        const hasMarker = markerColumns.length === 0 || markerColumns.some(col => {
            const val = row[col];
            return val !== null && val !== undefined && String(val).trim() !== '';
        });

        contextColumns.forEach(col => {
            const val = row[col];
            if (val !== null && val !== undefined && String(val).trim() !== '') {
                lastValues[col] = val;
            } else if (hasMarker && lastValues[col]) {
                // Only stitch if this row looks like a line item (has a marker)
                newRow[col] = lastValues[col];
            }
        });

        return newRow;
    });
};

/**
 * Removes subtotal, footer, and empty rows that contain "Total" or are mostly null.
 */
export const filterNoise = (data: any[]) => {
    return data.filter(row => {
        const values = Object.values(row).map(v => String(v || '').toLowerCase());

        // 1. Remove rows containing "total" or "subtotal" (case insensitive)
        const isNoise = values.some(v => v.includes('total') || v.includes('grand total') || v.includes('total amount'));
        if (isNoise) return false;

        // 2. Remove rows that are completely empty (all values are empty after trim)
        const hasData = values.some(v => v.trim() !== '');
        if (!hasData) return false;

        return true;
    });
};

/**
 * Normalizes all keys in an array of objects by trimming and 
 * removing hidden characters/newlines.
 */
export const normalizeDataKeys = (data: any[]) => {
    return data.map(row => {
        const newRow: any = {};
        Object.keys(row).forEach(key => {
            const cleanKey = String(key).trim().replace(/\s+/g, ' ');
            newRow[cleanKey] = row[key];
        });
        return newRow;
    });
};

/**
 * Exchange Rates relative to INR
 */
export const EXCHANGE_RATES: Record<string, number> = {
    'USD': 84,
    'EUR': 91,
    'GBP': 106,
    'INR': 1
};

/**
 * Currency Mapping for normalization
 */
const CURRENCY_MAP: Record<string, string> = {
    'inr': 'INR', 'rs': 'INR', '₹': 'INR', 'rupees': 'INR', 're': 'INR',
    'usd': 'USD', '$': 'USD',
    'eur': 'EUR', '€': 'EUR',
    'gbp': 'GBP', '£': 'GBP'
};

/**
 * Detects currency code from a string (code or symbol)
 */
export const detectCurrency = (val: any): string | null => {
    if (!val) return null;
    const s = String(val).toLowerCase().trim();

    // Check direct mapping
    if (CURRENCY_MAP[s]) return CURRENCY_MAP[s];

    // Check for symbols within string
    if (s.includes('$')) return 'USD';
    if (s.includes('€')) return 'EUR';
    if (s.includes('£')) return 'GBP';
    if (s.includes('₹')) return 'INR';
    if (s.includes('rs')) return 'INR';

    return null;
};

/**
 * Sanitizes currency, numbers, and dates to ensure they are numeric/valid.
 * Note: This version returns a cleaned number. 
 * Use detectCurrency + EXCHANGE_RATES for manual conversion pipelines.
 */
export const cleanValue = (val: any): any => {
    if (val === null || val === undefined) return '';

    // If it's already a number, return it (but handle NaN)
    if (typeof val === 'number') return isNaN(val) ? '' : val;

    const s = String(val).trim();
    if (s === '' || s.toLowerCase() === 'null' || s === '-') return '';

    // Remove common currency symbols and commas for numeric check
    const numericCandidate = s.replace(/[₹$€£,]/g, '').trim();

    // Check if it's a valid number after stripping symbols
    if (!isNaN(Number(numericCandidate)) && numericCandidate !== '') {
        return Number(numericCandidate);
    }

    return s;
};
