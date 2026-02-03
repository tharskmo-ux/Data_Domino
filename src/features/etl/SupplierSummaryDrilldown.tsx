import React, { useState, useMemo } from 'react';
import { X, Download, Search, ChevronUp, ChevronDown, Table, Database, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface SupplierSummaryDrilldownProps {
    isOpen: boolean;
    onClose: () => void;
    data: any[]; // supplierSummaryBySpend array
    totalSpend: number;
    title: string;
    mappings: Record<string, string>;
    color?: string;
}

const SupplierSummaryDrilldown: React.FC<SupplierSummaryDrilldownProps> = ({
    isOpen,
    onClose,
    data,
    totalSpend,
    title,
    mappings,
    color = 'teal'
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({
        key: mappings['amount'],
        direction: 'desc'
    });

    const supplierKey = mappings['supplier'];
    const amountKey = mappings['amount'];

    const processedData = useMemo(() => {
        return data.map(item => ({
            ...item,
            _percent: totalSpend > 0 ? (parseFloat(item[amountKey]) / totalSpend) * 100 : 0
        }));
    }, [data, totalSpend, amountKey]);

    const filteredData = useMemo(() => {
        let results = [...processedData];

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            results = results.filter(row => {
                const name = String(row[supplierKey] || '').toLowerCase();
                const category = String(row[mappings['category_l1'] || mappings['category'] || 'category'] || '').toLowerCase();
                return name.includes(query) || category.includes(query);
            });
        }

        // Sort
        if (sortConfig) {
            results.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === '_percent' || sortConfig.key === amountKey || sortConfig.key === '_transactions') {
                    aVal = parseFloat(String(aVal || '0'));
                    bVal = parseFloat(String(bVal || '0'));
                } else {
                    aVal = String(aVal || '').toLowerCase();
                    bVal = String(bVal || '').toLowerCase();
                }

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return results;
    }, [processedData, searchQuery, sortConfig, supplierKey, amountKey, mappings]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const formatCurrency = (val: any) => {
        const amount = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        if (isNaN(amount)) return val;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumSignificantDigits: 3,
            notation: 'compact'
        }).format(amount);
    };

    const handleExport = () => {
        if (filteredData.length === 0) return;

        const headers = ['Supplier', 'Category', 'Total Spend', '% of Total', 'Transactions'];
        const csvContent = [
            headers.join(','),
            ...filteredData.map(row => [
                `"${String(row[supplierKey] || '').replace(/"/g, '""')}"`,
                `"${String(row[mappings['category_l1'] || mappings['category'] || 'category'] || '').replace(/"/g, '""')}"`,
                row[amountKey],
                row._percent.toFixed(2),
                row._transactions || 0
            ].join(','))
        ].join('\n');

        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `supplier_summary_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 md:p-10">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-md"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 20 }}
                    className="relative w-full max-w-6xl h-[85vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-[2.5rem] shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-zinc-900 bg-zinc-900/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-2xl",
                                color === 'teal' ? "bg-teal-500/10 text-teal-500" : "bg-primary/10 text-primary"
                            )}>
                                <Users className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{title}</h2>
                                <p className="text-sm text-zinc-500 font-medium">Aggregated supplier spend and market share analysis</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search suppliers..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all text-white"
                                />
                            </div>
                            <button
                                onClick={handleExport}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border border-zinc-700 shadow-lg"
                            >
                                <Download className="h-4 w-4" /> Export CSV
                            </button>
                            <button
                                onClick={onClose}
                                className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Table Area */}
                    <div className="flex-1 overflow-auto p-1">
                        {filteredData.length > 0 ? (
                            <table className="w-full text-left border-collapse">
                                <thead className="sticky top-0 z-10">
                                    <tr className="bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900">
                                        <th onClick={() => handleSort(supplierKey)} className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-teal-500 transition-colors group">
                                            <div className="flex items-center gap-2">
                                                Supplier
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig.key === supplierKey && sortConfig.direction === 'asc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                    <ChevronDown className={cn("h-3 w-3", sortConfig.key === supplierKey && sortConfig.direction === 'desc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                </div>
                                            </div>
                                        </th>
                                        <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">
                                            Main Category
                                        </th>
                                        <th onClick={() => handleSort(amountKey)} className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-teal-500 transition-colors group">
                                            <div className="flex items-center gap-2">
                                                Total Spend
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig.key === amountKey && sortConfig.direction === 'asc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                    <ChevronDown className={cn("h-3 w-3", sortConfig.key === amountKey && sortConfig.direction === 'desc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                </div>
                                            </div>
                                        </th>
                                        <th onClick={() => handleSort('_percent')} className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-teal-500 transition-colors group">
                                            <div className="flex items-center gap-2">
                                                % of Total
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig.key === '_percent' && sortConfig.direction === 'asc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                    <ChevronDown className={cn("h-3 w-3", sortConfig.key === '_percent' && sortConfig.direction === 'desc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                </div>
                                            </div>
                                        </th>
                                        <th onClick={() => handleSort('_transactions')} className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-teal-500 transition-colors group text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                Orders
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig.key === '_transactions' && sortConfig.direction === 'asc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                    <ChevronDown className={cn("h-3 w-3", sortConfig.key === '_transactions' && sortConfig.direction === 'desc' ? "text-teal-500 opacity-100" : "opacity-30")} />
                                                </div>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {filteredData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-900/40 transition-colors group">
                                            <td className="p-6 text-sm font-bold text-white uppercase tracking-tight">
                                                {row[supplierKey]}
                                            </td>
                                            <td className="p-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">
                                                {row[mappings['category_l1'] || mappings['category'] || 'category']}
                                            </td>
                                            <td className="p-6 text-sm font-mono font-bold text-teal-500">
                                                {formatCurrency(row[amountKey])}
                                            </td>
                                            <td className="p-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden min-w-[100px]">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${row._percent}%` }}
                                                            className="h-full bg-teal-500/60 shadow-[0_0_10px_rgba(20,184,166,0.3)]"
                                                        />
                                                    </div>
                                                    <span className="text-xs font-bold text-zinc-400 w-12 text-right">
                                                        {row._percent.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-6 text-sm font-medium text-zinc-400 text-right">
                                                {row._transactions || 0}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
                                <div className="p-8 bg-zinc-900 rounded-[2.5rem] border border-zinc-800 shadow-inner">
                                    <Database className="h-16 w-16 text-zinc-700" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-white mb-2">No Suppliers Found</h3>
                                    <p className="text-zinc-500 max-w-sm">Try a different search query or check your data.</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-zinc-900 bg-zinc-950 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Table className="h-4 w-4 text-zinc-600" />
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{filteredData.length} Suppliers Listed</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-zinc-600" />
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Aggregate View Active</span>
                            </div>
                        </div>
                        <div className="text-[10px] text-zinc-700 font-bold uppercase tracking-[0.2em] italic">Data Domino Sourcing Intelligence Engine</div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default SupplierSummaryDrilldown;
