import React, { useState, useMemo } from 'react';
import { X, Download, Search, ChevronUp, ChevronDown, Table, FileText, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn, formatDateValue } from '../../lib/utils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { useAdminView } from '../admin/AdminViewContext';

interface TransactionDrilldownProps {
    isOpen: boolean;
    onClose: () => void;
    data: any[];
    mappings: Record<string, string>;
    title: string;
    icon: any;
    color?: string;
    kpiId?: string;
    userId?: string;
    projectId?: string;
}

const TransactionDrilldown: React.FC<TransactionDrilldownProps> = ({
    isOpen,
    onClose,
    data,
    mappings,
    title,
    icon: Icon,
    color = 'primary',
    kpiId,
    userId,
    projectId,
}) => {
    const { isViewingClient } = useAdminView();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

    // Filter columns to only show mapped fields and relevant summary data
    const visibleColumns = useMemo(() => {
        const hasTransactions = data.length > 0 && '_transactions' in data[0];

        const baseColumns = [
            { id: 'date', name: 'Date', key: mappings['date'] },
            { id: 'supplier', name: 'Supplier', key: mappings['supplier'] },
            { id: 'amount', name: 'Amount', key: mappings['amount'] },
            { id: 'category', name: 'Category', key: mappings['category_l1'] || mappings['category'] },
            { id: 'po_number', name: 'PO #', key: mappings['po_number'] },
        ];

        if (hasTransactions) {
            baseColumns.push({ id: 'records', name: 'Records', key: '_transactions' });
        }

        return baseColumns.filter(col => {
            if (!col.key) return false;
            return data.some(row => row[col.key!] !== undefined && row[col.key!] !== null && row[col.key!] !== '');
        });
    }, [mappings, data, kpiId]);



    // Filter and Sort Data
    const filteredData = useMemo(() => {
        let results = [...data];

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            results = results.filter(row => {
                return visibleColumns.some(col => {
                    const val = String(row[col.key!] || '').toLowerCase();
                    return val.includes(query);
                });
            });
        }

        // Sort
        if (sortConfig) {
            results.sort((a, b) => {
                const aVal = a[sortConfig.key];
                const bVal = b[sortConfig.key];

                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return results;
    }, [data, searchQuery, sortConfig, visibleColumns]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleExport = async () => {
        if (filteredData.length === 0) return;

        // Header mapping
        const headers = visibleColumns.map(col => col.name);
        const keys = visibleColumns.map(col => col.key!);

        const csvContent = [
            headers.join(','),
            ...filteredData.map(row =>
                keys.map(key => {
                    const val = String(row[key] || '');
                    return `"${String(val).replace(/"/g, '""')}"`; // Escape quotes
                }).join(',')
            )
        ].join('\n');

        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
        const exportFileName = `data_domino_${title.toLowerCase().replace(/\s+/g, '_')}_export.csv`;

        // 1. Existing browser download — unchanged
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', exportFileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        // 2. Persist to Firebase Storage + Firestore (non-fatal, additive) — only if not in admin view mode
        if (userId && db && storage && !isViewingClient) {
            try {
                const exportRef = ref(storage, `exports/${userId}/${Date.now()}_${exportFileName}`);
                const exportSnapshot = await uploadBytes(exportRef, blob);
                const exportDownloadUrl = await getDownloadURL(exportSnapshot.ref);

                await addDoc(collection(db, 'exports'), {
                    userId,
                    projectId: projectId || '',
                    fileName: exportFileName,
                    fileUrl: exportDownloadUrl,
                    filePath: exportSnapshot.ref.fullPath,
                    exportedAt: serverTimestamp(),
                    rowCount: filteredData.length,
                });
            } catch (err) {
                console.error('[TransactionDrilldown Export Persist]', err);
            }
        }
    };

    const formatCurrency = (val: any) => {
        const amount = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]+/g, ""));
        if (isNaN(amount)) return val;
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumSignificantDigits: 3
        }).format(amount);
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
                    className="relative w-full max-w-7xl h-full flex flex-col bg-zinc-950 border border-zinc-800 rounded-[2.5rem] shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-zinc-900 bg-zinc-900/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-2xl",
                                color === 'rose' ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
                            )}>
                                <Icon className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{title}</h2>
                                <p className="text-sm text-zinc-500 font-medium">Transaction-level drill-down for deeper visibility</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search transactions..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-white"
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
                                        {visibleColumns.map(col => (
                                            <th
                                                key={col.id}
                                                onClick={() => handleSort(col.key!)}
                                                className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-primary transition-colors group"
                                            >
                                                <div className="flex items-center gap-2">
                                                    {col.name}
                                                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig?.key === col.key && sortConfig.direction === 'asc' ? "text-primary opacity-100" : "opacity-30")} />
                                                        <ChevronDown className={cn("h-3 w-3", sortConfig?.key === col.key && sortConfig.direction === 'desc' ? "text-primary opacity-100" : "opacity-30")} />
                                                    </div>
                                                </div>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {filteredData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-900/40 transition-colors group">
                                            {visibleColumns.map(col => {
                                                return (
                                                    <td key={col.id} className={cn(
                                                        "p-6 text-sm font-medium",
                                                        col.id === 'amount' ? "font-mono text-primary" : "text-zinc-300"
                                                    )}>
                                                        {col.id === 'amount'
                                                            ? formatCurrency(row[col.key!])
                                                            : col.id === 'date'
                                                                ? formatDateValue(row[col.key!])
                                                                : String(row[col.key!] || '-')}
                                                    </td>
                                                );
                                            })}
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
                                    <h3 className="text-xl font-bold text-white mb-2">No Transactions Found</h3>
                                    <p className="text-zinc-500 max-w-sm">No records match your search criteria. Try a different query or clear the filter.</p>
                                </div>
                                <button
                                    onClick={() => setSearchQuery('')}
                                    className="text-primary hover:underline font-bold text-sm"
                                >
                                    Clear Search
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Footer / Stats */}
                    <div className="p-6 border-t border-zinc-900 bg-zinc-950 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-2">
                                <Table className="h-4 w-4 text-zinc-600" />
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{filteredData.length} Records Shown</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-zinc-600" />
                                <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Global Mapping Active</span>
                            </div>
                        </div>
                        <div className="text-[10px] text-zinc-700 font-bold uppercase tracking-[0.2em]">Data Domino Intelligence Engine v1.0</div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default TransactionDrilldown;
