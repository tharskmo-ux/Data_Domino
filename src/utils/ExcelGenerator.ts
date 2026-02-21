import ExcelJS from 'exceljs';

interface DataRow {
    [key: string]: any;
}

export class ExcelGenerator {
    private workbook: ExcelJS.Workbook;
    private data: DataRow[];
    private mappings: any;
    private currencySymbol: string;

    constructor(data: DataRow[], mappings: any, currency: string = 'USD') {
        this.workbook = new ExcelJS.Workbook();
        this.data = data;
        this.mappings = mappings;

        // Map common codes to symbols
        const symbolMap: Record<string, string> = {
            'USD': '$', 'INR': '₹', 'EUR': '€', 'GBP': '£', 'JPY': '¥', 'AUD': '$', 'CAD': '$', 'SGD': '$'
        };
        this.currencySymbol = symbolMap[currency] || currency || '$';

        this.workbook.creator = 'Antigravity Data Domino';
        this.workbook.lastModifiedBy = 'Antigravity Data Domino';
        this.workbook.created = new Date();
        this.workbook.modified = new Date();
    }

    public async generate(): Promise<Blob> {
        // Calculate aggregations once
        const stats = this.calculateStats();

        // Generate Sheets
        this.createExecutiveSummary(stats);
        this.createVendorAnalysis(stats);
        this.createCategoryAnalysis(stats);
        this.createMonthlyTrends();
        this.createTopInsights(stats);
        this.createDetailedData();
        this.createDataQualityReport();

        const buffer = await this.workbook.xlsx.writeBuffer();
        return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    private calculateStats() {
        // Basic aggregations
        const amountKey = this.mappings['invoice_amount'] || this.mappings['amount'] || 'amount';
        const vendorKey = this.mappings['supplier'] || this.mappings['vendor'] || 'vendor';
        const categoryKey = this.mappings['category_l1'] || this.mappings['category'] || 'category';

        const totalSpend = this.data.reduce((sum, row) => sum + (Number(row[amountKey]) || 0), 0);
        const vendors = new Set(this.data.map(r => r[vendorKey])).size;
        const categories = new Set(this.data.map(r => r[categoryKey])).size;
        const txCount = this.data.length;
        const avgTx = txCount > 0 ? totalSpend / txCount : 0;

        // Group by Vendor
        const vendorStats: Record<string, any> = {};
        this.data.forEach(row => {
            const v = row[vendorKey] || 'Unknown';
            if (!vendorStats[v]) vendorStats[v] = { spend: 0, count: 0, name: v };
            vendorStats[v].spend += (Number(row[amountKey]) || 0);
            vendorStats[v].count++;
        });
        const topVendors = Object.values(vendorStats).sort((a, b) => b.spend - a.spend);

        // Group by Category
        const catStats: Record<string, any> = {};
        this.data.forEach(row => {
            const c = row[categoryKey] || 'Uncategorized';
            if (!catStats[c]) catStats[c] = { spend: 0, count: 0, name: c };
            catStats[c].spend += (Number(row[amountKey]) || 0);
            catStats[c].count++;
        });
        const topCategories = Object.values(catStats).sort((a, b) => b.spend - a.spend);

        return { totalSpend, vendors, categories, txCount, avgTx, topVendors, topCategories };
    }

    private applyHeaderStyleToCell(cell: ExcelJS.Cell) {
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '4472C4' } // Blue
        };
        cell.font = {
            bold: true,
            color: { argb: 'FFFFFF' },
            name: 'Calibri',
            size: 12
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
        cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'medium' },
            right: { style: 'thin' }
        };
    }

    // --- SHEET 1: Executive Summary ---
    private createExecutiveSummary(stats: any) {
        const sheet = this.workbook.addWorksheet('Executive Summary', {
            views: [{ showGridLines: false }]
        });

        // 1. Header Section
        sheet.mergeCells('A1:E2');
        const titleCell = sheet.getCell('A1');
        titleCell.value = 'EXECUTIVE SUMMARY\nProcurement Analysis Report';
        titleCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: '4472C4' } };
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E6E6E6' } }; // Light Gray bg

        const now = new Date();
        const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        sheet.getCell('A3').value = `Generated: ${dateStr}`;
        sheet.mergeCells('A3:E3');
        sheet.getCell('A3').alignment = { horizontal: 'center' };
        sheet.getCell('A3').font = { italic: true, size: 10, color: { argb: '666666' } };

        // 2. Key Metrics
        const metrics = [
            ['Total Spend', stats.totalSpend],
            ['Number of Transactions', stats.txCount],
            ['Number of Vendors', stats.vendors],
            ['Average Transaction', stats.avgTx],
            ['Number of Categories', stats.categories]
        ];

        let currentRow = 5;
        sheet.getCell(`B${currentRow}`).value = 'KEY METRICS';
        sheet.getCell(`B${currentRow}`).font = { bold: true, size: 12, underline: true };
        currentRow += 1;

        metrics.forEach(([label, value]) => {
            sheet.getCell(`B${currentRow}`).value = label;
            const valCell = sheet.getCell(`C${currentRow}`);
            valCell.value = value;
            if (typeof value === 'number' && label !== 'Number of Transactions' && label !== 'Number of Vendors' && label !== 'Number of Categories') {
                valCell.numFmt = `"${this.currencySymbol}"#,##0`;
            } else {
                valCell.numFmt = '#,##0';
            }
            currentRow++;
        });

        // 3. Top 5 Vendors Table
        currentRow += 2;
        sheet.getCell(`B${currentRow}`).value = 'TOP 5 VENDORS';
        sheet.getCell(`B${currentRow}`).font = { bold: true, size: 12 };
        currentRow += 1;

        // Manually set cells to avoid row conflicts
        const headers = ['', 'Rank', 'Vendor Name', 'Total Spend', '% of Total', 'Tx Count'];
        headers.forEach((h, i) => {
            if (i > 0) { // Skip empty col A
                const cell = sheet.getCell(currentRow, i + 1);
                cell.value = h;
                this.applyHeaderStyleToCell(cell);
            }
        });

        currentRow++;
        stats.topVendors.slice(0, 5).forEach((v: any, idx: number) => {
            // Manually set cells to avoid row conflicts
            sheet.getCell(currentRow, 2).value = idx + 1;
            sheet.getCell(currentRow, 3).value = v.name;
            sheet.getCell(currentRow, 4).value = v.spend;
            sheet.getCell(currentRow, 4).numFmt = `"${this.currencySymbol}"#,##0`;
            sheet.getCell(currentRow, 5).value = v.spend / stats.totalSpend;
            sheet.getCell(currentRow, 5).numFmt = '0.0%';
            sheet.getCell(currentRow, 6).value = v.count;

            // Zebra striping
            if (idx % 2 === 0) {
                ['B', 'C', 'D', 'E', 'F'].forEach(col => {
                    sheet.getCell(`${col}${currentRow}`).fill = {
                        type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' }
                    };
                });
            }
            currentRow++;
        });

        // Column widths
        sheet.getColumn(2).width = 10;
        sheet.getColumn(3).width = 35;
        sheet.getColumn(4).width = 20;
        sheet.getColumn(5).width = 15;
        sheet.getColumn(6).width = 15;
    }

    // --- SHEET 2: Spend by Vendor ---
    private createVendorAnalysis(stats: any) {
        const sheet = this.workbook.addWorksheet('Spend by Vendor');

        // Headers
        const headers = ['Rank', 'Vendor Name', 'Total Spend', '% of Total', 'Transaction Count', 'Avg Transaction'];
        headers.forEach((h, i) => {
            const cell = sheet.getCell(1, i + 1);
            cell.value = h;
            this.applyHeaderStyleToCell(cell);
        });

        let currentRow = 2;
        stats.topVendors.forEach((v: any, idx: number) => {
            // Set cells individually
            sheet.getCell(currentRow, 1).value = idx + 1;
            sheet.getCell(currentRow, 2).value = v.name;
            sheet.getCell(currentRow, 3).value = v.spend;
            sheet.getCell(currentRow, 4).value = v.spend / stats.totalSpend;
            sheet.getCell(currentRow, 5).value = v.count;
            sheet.getCell(currentRow, 6).value = v.spend / v.count;

            // Formatting
            sheet.getCell(currentRow, 3).numFmt = `"${this.currencySymbol}"#,##0.00`;
            sheet.getCell(currentRow, 4).numFmt = '0.0%';
            sheet.getCell(currentRow, 6).numFmt = `"${this.currencySymbol}"#,##0.00`;

            // Conditional formatting (Yellow for > 10%)
            if ((v.spend / stats.totalSpend) > 0.10) {
                for (let c = 1; c <= 6; c++) {
                    sheet.getCell(currentRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEB9C' } };
                }
            } else if (idx < 10) {
                // Top 10 Green
                for (let c = 1; c <= 6; c++) {
                    sheet.getCell(currentRow, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'C6EFCE' } };
                }
            }

            currentRow++;
        });

        sheet.columns.forEach(col => { col.width = 20; });
        sheet.getColumn(2).width = 40;
        sheet.autoFilter = { from: 'A1', to: `F1` };
    }

    // --- SHEET 3: Spend by Category ---
    private createCategoryAnalysis(stats: any) {
        const sheet = this.workbook.addWorksheet('Spend by Category');

        // Headers
        const headers = ['Rank', 'Category', 'Total Spend', '% of Total', 'Transaction Count', 'Avg Transaction'];
        headers.forEach((h, i) => {
            const cell = sheet.getCell(1, i + 1);
            cell.value = h;
            this.applyHeaderStyleToCell(cell);
        });

        let currentRow = 2;
        stats.topCategories.forEach((c: any, idx: number) => {
            sheet.getCell(currentRow, 1).value = idx + 1;
            sheet.getCell(currentRow, 2).value = c.name;
            sheet.getCell(currentRow, 3).value = c.spend;
            sheet.getCell(currentRow, 4).value = c.spend / stats.totalSpend;
            sheet.getCell(currentRow, 5).value = c.count;
            sheet.getCell(currentRow, 6).value = c.spend / c.count;

            // Formatting
            sheet.getCell(currentRow, 3).numFmt = `"${this.currencySymbol}"#,##0.00`;
            sheet.getCell(currentRow, 4).numFmt = '0.0%';
            sheet.getCell(currentRow, 6).numFmt = `"${this.currencySymbol}"#,##0.00`;

            currentRow++;
        });

        sheet.columns.forEach(col => { col.width = 20; });
        sheet.getColumn(2).width = 30;
        sheet.autoFilter = { from: 'A1', to: `F1` };
    }

    // --- SHEET 4: Monthly Trends ---
    private createMonthlyTrends() {
        const sheet = this.workbook.addWorksheet('Monthly Trends');

        const amountKey = this.mappings['invoice_amount'] || this.mappings['amount'] || 'amount';
        const dateKey = this.mappings['invoice_date'] || this.mappings['po_date'] || this.mappings['date'] || 'date';

        // Group by Month
        const monthStats: Record<string, number> = {};
        this.data.forEach(row => {
            const dateVal = row[dateKey];
            let date: Date | null = null;

            if (dateVal) {
                // 1. Handle Excel Serial Number (e.g., 44562)
                if (typeof dateVal === 'number' && dateVal > 25569) {
                    // Excel base date is 1899-12-30. JS is 1970-01-01.
                    // 25569 is days between them. 86400 is seconds in a day.
                    date = new Date((dateVal - 25569) * 86400 * 1000);
                }
                // 2. Handle standard string formats
                else {
                    const parsed = new Date(dateVal);
                    if (!isNaN(parsed.getTime())) {
                        date = parsed;
                    }
                }
            }

            if (date && !isNaN(date.getTime())) {
                const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // YYYY-MM
                monthStats[key] = (monthStats[key] || 0) + (Number(row[amountKey]) || 0);
            }
        });

        const sortedMonths = Object.keys(monthStats).sort();

        // Headers
        const headers = ['Month', 'Total Spend', 'MoM Change %'];
        headers.forEach((h, i) => {
            const cell = sheet.getCell(1, i + 1);
            cell.value = h;
            this.applyHeaderStyleToCell(cell);
        });

        let prevSpend = 0;
        let currentRow = 2;

        sortedMonths.forEach(month => {
            const spend = monthStats[month];
            let mom = 0;
            if (prevSpend > 0) {
                mom = (spend - prevSpend) / prevSpend;
            }

            const [year, monthNum] = month.split('-').map(Number);
            const dateObj = new Date(year, monthNum - 1, 1);

            const dateCell = sheet.getCell(currentRow, 1);
            dateCell.value = dateObj;
            dateCell.numFmt = 'dd/mm/yyyy'; // Enforce user requested format

            sheet.getCell(currentRow, 2).value = spend;
            sheet.getCell(currentRow, 3).value = mom;

            sheet.getCell(currentRow, 2).numFmt = `"${this.currencySymbol}"#,##0`;
            sheet.getCell(currentRow, 3).numFmt = '0.0%';

            // Visual indicator for MoM
            if (mom > 0) {
                sheet.getCell(currentRow, 3).font = { color: { argb: 'FF0000' } as any }; // Red for increased spend
            } else {
                sheet.getCell(currentRow, 3).font = { color: { argb: '00B050' } as any }; // Green for savings
            }

            prevSpend = spend;
            currentRow++;
        });

        sheet.getColumn(1).width = 15;
        sheet.getColumn(2).width = 20;
        sheet.getColumn(3).width = 15;
    }

    // --- SHEET 5: Top Insights ---
    private createTopInsights(stats: any) {
        const sheet = this.workbook.addWorksheet('Top Insights', { views: [{ showGridLines: false }] });

        sheet.getCell('B2').value = 'TOP INSIGHTS';
        sheet.getCell('B2').font = { bold: true, size: 16, color: { argb: '4472C4' } };

        // Simple Insights Generation Logic
        const insights = [];

        // 1. Supplier Consolidation
        const tailVendors = stats.topVendors.filter((v: any) => v.spend < 5000);
        const tailSpend = tailVendors.reduce((acc: number, v: any) => acc + v.spend, 0);
        if (tailSpend > 0) {
            insights.push({
                title: 'SUPPLIER CONSOLIDATION',
                finding: `${tailVendors.length} vendors have less than ${this.currencySymbol}5k spend.`,
                impact: `${this.currencySymbol}${Math.round(tailSpend).toLocaleString()}`,
                action: 'Consolidate tail spend to preferred suppliers.',
                savings: '15-20%',
                effort: 'Medium'
            });
        }

        // 2. High Concentration (Pareto)
        const top3Spend = stats.topVendors.slice(0, 3).reduce((acc: number, v: any) => acc + v.spend, 0);
        if (top3Spend > 0 && (top3Spend / stats.totalSpend > 0.4)) { // Lowered threshold to 40%
            insights.push({
                title: 'HIGH VENDOR CONCENTRATION',
                finding: `Top 3 vendors account for ${Math.round((top3Spend / stats.totalSpend) * 100)}% of total spend.`,
                impact: 'Supply Chain Risk',
                action: 'Diversify supply base for critical components.',
                savings: 'Risk Mitigation',
                effort: 'High'
            });
        }

        // 3. Fallback Insight (if no others)
        if (insights.length === 0) {
            insights.push({
                title: 'GENERATING SAVINGS',
                finding: `Spend analysis complete across ${stats.vendors} vendors.`,
                impact: 'Visibility Established',
                action: 'Review detailed category breakdown for opportunities.',
                savings: 'TBD',
                effort: 'Low'
            });
        }

        let currentRow = 4;

        insights.forEach((insight, idx) => {
            sheet.getCell(`B${currentRow}`).value = `INSIGHT #${idx + 1}: ${insight.title}`;
            sheet.getCell(`B${currentRow}`).font = { bold: true, size: 12, color: { argb: '2F2F2F' } };
            currentRow++;

            // Draw box
            const startRow = currentRow;

            [['Finding', insight.finding], ['Impact', insight.impact], ['Action', insight.action],
            ['Savings', insight.savings], ['Effort', insight.effort]].forEach(([label, val]) => {
                sheet.getCell(`B${currentRow}`).value = label;
                sheet.getCell(`B${currentRow}`).font = { bold: true, color: { argb: '666666' } };
                sheet.getCell(`C${currentRow}`).value = val;
                sheet.getCell(`C${currentRow}`).alignment = { wrapText: true };
                currentRow++;
            });

            // Border for the block
            for (let r = startRow; r < currentRow; r++) {
                sheet.getCell(`B${r}`).border = { left: { style: 'thin', color: { argb: 'E0E0E0' } } };
                sheet.getCell(`C${r}`).border = { right: { style: 'thin', color: { argb: 'E0E0E0' } } };
            }
            sheet.getCell(`B${startRow}`).border = { top: { style: 'thin', color: { argb: 'E0E0E0' } }, left: { style: 'thin', color: { argb: 'E0E0E0' } } };
            sheet.getCell(`C${startRow}`).border = { top: { style: 'thin', color: { argb: 'E0E0E0' } }, right: { style: 'thin', color: { argb: 'E0E0E0' } } };

            // Bottom border
            sheet.getCell(`B${currentRow - 1}`).border = { ...sheet.getCell(`B${currentRow - 1}`).border, bottom: { style: 'thin', color: { argb: 'E0E0E0' } } };
            sheet.getCell(`C${currentRow - 1}`).border = { ...sheet.getCell(`C${currentRow - 1}`).border, bottom: { style: 'thin', color: { argb: 'E0E0E0' } } };

            currentRow += 2; // Spacer
        });

        sheet.getColumn(2).width = 25;
        sheet.getColumn(3).width = 60;
    }

    // --- SHEET 6: Detailed Data ---
    private createDetailedData() {
        const sheet = this.workbook.addWorksheet('Detailed Data');

        if (this.data.length === 0) return;

        const headers = Object.keys(this.data[0]);
        const headerRow = sheet.getRow(1);
        headerRow.values = headers;
        headerRow.eachCell((cell) => this.applyHeaderStyleToCell(cell));

        const dateKey = this.mappings['invoice_date'] || this.mappings['po_date'] || this.mappings['date'] || 'date';
        const dateColIndex = headers.indexOf(dateKey); // 0-based index

        // Add rows
        this.data.forEach(row => {
            const rowValues = Object.values(row);

            // Intercept Date Column
            if (dateColIndex !== -1 && rowValues[dateColIndex]) {
                const dateVal = rowValues[dateColIndex];
                let dateObj: Date | null = null;

                if (typeof dateVal === 'number' && dateVal > 25569) {
                    dateObj = new Date((dateVal - 25569) * 86400 * 1000);
                } else {
                    const parsed = new Date(dateVal);
                    if (!isNaN(parsed.getTime())) dateObj = parsed;
                }

                if (dateObj) {
                    rowValues[dateColIndex] = dateObj;
                }
            }

            sheet.addRow(rowValues);
        });

        // Apply Date Format to the specific column
        if (dateColIndex !== -1) {
            sheet.getColumn(dateColIndex + 1).numFmt = 'dd/mm/yyyy';
        }

        sheet.autoFilter = { from: 'A1', to: { row: 1, column: headers.length } };
    }

    // --- SHEET 7: Data Quality Report ---
    private createDataQualityReport() {
        const sheet = this.workbook.addWorksheet('Data Quality Report');

        const headerRow = sheet.getRow(1);
        headerRow.values = ['Field Name', 'Completeness %', 'Status', 'Visual'];
        headerRow.eachCell((cell) => this.applyHeaderStyleToCell(cell));

        if (this.data.length === 0) return;

        const fields = Object.keys(this.data[0]);
        const totalRows = this.data.length;

        let currentRow = 2;
        fields.forEach(field => {
            const filledCount = this.data.filter(r => r[field] !== null && r[field] !== '' && r[field] !== undefined).length;
            const pct = filledCount / totalRows;

            const r = sheet.getRow(currentRow);
            r.values = [
                field,
                pct,
                pct > 0.9 ? 'OK' : pct > 0.5 ? 'WARNING' : 'CRITICAL',
                '|'.repeat(Math.round(pct * 20))
            ];

            r.getCell(2).numFmt = '0.0%';

            // Color coding status
            const statusCell = r.getCell(3);
            if (pct > 0.9) statusCell.font = { color: { argb: '00B050' } }; // Green
            else if (pct > 0.5) statusCell.font = { color: { argb: 'FFA500' } }; // Orange
            else statusCell.font = { color: { argb: 'FF0000' } }; // Red

            currentRow++;
        });

        sheet.getColumn(1).width = 25;
        sheet.getColumn(2).width = 15;
        sheet.getColumn(3).width = 15;
        sheet.getColumn(4).width = 30;
    }
}
