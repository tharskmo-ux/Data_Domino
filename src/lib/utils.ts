import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function parseDateValue(val: any): Date | null {
    if (val === undefined || val === null || val === '') return null;

    let date: Date | null = null;
    const numVal = typeof val === 'number' ? val : parseFloat(String(val));

    // Handle Excel Serial Date (approx 1955-2064)
    if (!isNaN(numVal) && numVal > 20000 && numVal < 60000) {
        date = new Date((numVal - 25569) * 86400 * 1000);
    } else if (typeof val === 'string') {
        // Try parsing DD/MM/YYYY or DD-MM-YYYY
        const ddmmyyyy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/;
        const match = val.match(ddmmyyyy);
        if (match) {
            date = new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
        } else {
            const d = new Date(val);
            if (!isNaN(d.getTime())) date = d;
        }
    } else if (val instanceof Date) {
        date = val;
    }

    return (date && !isNaN(date.getTime())) ? date : null;
}

export function formatDateValue(val: any): string {
    const date = parseDateValue(val);
    if (!date) return String(val || '-');

    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();

    return `${dd}-${mm}-${yyyy}`;
}
