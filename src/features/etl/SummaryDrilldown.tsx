import React, { useState, useMemo } from 'react';
import { X, Download, Search, ChevronUp, ChevronDown, Table, Database, PieChart as PieIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { useAdminView } from '../admin/AdminViewContext';

interface SummaryDrilldownProps {
    isOpen: boolean;
    onClose: () => void;
    data: any[]; // Array of { name: string, value: number, share: number }
    title: string;
    label: string; // e.g. "Business Unit"
    color?: string;
    userId?: string;
    projectId?: string;
    currency?: string;
}

const SummaryDrilldown: React.FC<SummaryDrilldownProps> = ({
    isOpen,
    onClose,
    data,
    title,
    label,
    color = 'primary',
    userId,
    projectId,
    currency = 'INR'
}) => {
    const { isViewingClient } = useAdminView();
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({
        key: 'value',
        direction: 'desc'
    });

    const filteredData = useMemo(() => {
        let results = [...data];

        // Search
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            results = results.filter(row =>
                String(row.name || '').toLowerCase().includes(query)
            );
        }

        // Sort
        if (sortConfig) {
            results.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === 'value' || sortConfig.key === 'share') {
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
    }, [data, searchQuery, sortConfig]);

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
            maximumSignificantDigits: 3,
            notation: 'compact'
        }).format(val);
    };

    const handleExport = async () => {
        if (filteredData.length === 0) return;

        const headers = [label, 'Total Spend', '% Share'];
        const csvContent = [
            headers.join(','),
            ...filteredData.map(row => [
                `"${String(row.name || '').replace(/"/g, '""')}"`,
                row.value,
                row.share.toFixed(2)
            ].join(','))
        ].join('\n');

        const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8' });
        const exportFileName = `${label.toLowerCase().replace(/\s+/g, '_')}_summary_${new Date().toISOString().split('T')[0]}.csv`;

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
                console.error('[SummaryDrilldown Export Persist]', err);
            }
        }
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
                    className="relative w-full max-w-4xl h-[80vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-[2.5rem] shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-zinc-900 bg-zinc-900/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className={cn(
                                "p-3 rounded-2xl",
                                color === 'primary' ? "bg-primary/10 text-primary" :
                                    color === 'rose' ? "bg-rose-500/10 text-rose-500" :
                                        color === 'amber' ? "bg-amber-500/10 text-amber-500" :
                                            "bg-emerald-500/10 text-emerald-500"
                            )}>
                                <PieIcon className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{title}</h2>
                                <p className="text-sm text-zinc-500 font-medium">Aggregated {label.toLowerCase()} distribution</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="relative flex-1 md:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder={`Search ${label.toLowerCase()}...`}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className={cn(
                                        "w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 transition-all text-white",
                                        color === 'rose' ? "focus:ring-rose-500/50" :
                                            color === 'amber' ? "focus:ring-amber-500/50" : "focus:ring-primary/50"
                                    )}
                                />
                            </div>
                            <button
                                onClick={handleExport}
                                className="bg-zinc-800 hover:bg-zinc-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all border border-zinc-700"
                            >
                                <Download className="h-4 w-4" /> Export
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
                                        <th onClick={() => handleSort('name')} className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-primary transition-colors group">
                                            <div className="flex items-center gap-2">
                                                {label}
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig.key === 'name' && sortConfig.direction === 'asc' ? (color === 'rose' ? "text-rose-500 opacity-100" : color === 'amber' ? "text-amber-500 opacity-100" : "text-primary opacity-100") : "opacity-30")} />
                                                    <ChevronDown className={cn("h-3 w-3", sortConfig.key === 'name' && sortConfig.direction === 'desc' ? (color === 'rose' ? "text-rose-500 opacity-100" : color === 'amber' ? "text-amber-500 opacity-100" : "text-primary opacity-100") : "opacity-30")} />
                                                </div>
                                            </div>
                                        </th>
                                        <th onClick={() => handleSort('value')} className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-primary transition-colors group">
                                            <div className="flex items-center gap-2">
                                                Total Spend
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig.key === 'value' && sortConfig.direction === 'asc' ? (color === 'rose' ? "text-rose-500 opacity-100" : color === 'amber' ? "text-amber-500 opacity-100" : "text-primary opacity-100") : "opacity-30")} />
                                                    <ChevronDown className={cn("h-3 w-3", sortConfig.key === 'value' && sortConfig.direction === 'desc' ? (color === 'rose' ? "text-rose-500 opacity-100" : color === 'amber' ? "text-amber-500 opacity-100" : "text-primary opacity-100") : "opacity-30")} />
                                                </div>
                                            </div>
                                        </th>
                                        <th onClick={() => handleSort('share')} className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest cursor-pointer hover:text-primary transition-colors group">
                                            <div className="flex items-center gap-2">
                                                % Share
                                                <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <ChevronUp className={cn("h-3 w-3 -mb-1", sortConfig.key === 'share' && sortConfig.direction === 'asc' ? (color === 'rose' ? "text-rose-500 opacity-100" : color === 'amber' ? "text-amber-500 opacity-100" : "text-primary opacity-100") : "opacity-30")} />
                                                    <ChevronDown className={cn("h-3 w-3", sortConfig.key === 'share' && sortConfig.direction === 'desc' ? (color === 'rose' ? "text-rose-500 opacity-100" : color === 'amber' ? "text-amber-500 opacity-100" : "text-primary opacity-100") : "opacity-30")} />
                                                </div>
                                            </div>
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-900">
                                    {filteredData.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-900/40 transition-colors group">
                                            <td className="p-6 text-sm font-bold text-white uppercase tracking-tight">
                                                {row.name}
                                            </td>
                                            <td className={cn(
                                                "p-6 text-sm font-mono font-bold",
                                                color === 'rose' ? "text-rose-500" : color === 'amber' ? "text-amber-500" : "text-primary"
                                            )}>
                                                {formatCurrency(row.value)}
                                            </td>
                                            <td className="p-6">
                                                <div className="flex items-center gap-3">
                                                    <div className="flex-1 h-1.5 bg-zinc-900 rounded-full overflow-hidden min-w-[200px]">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${row.share}%` }}
                                                            className={cn(
                                                                "h-full shadow-[0_0_10px_rgba(20,184,166,0.3)]",
                                                                color === 'rose' ? "bg-rose-500/60" : color === 'amber' ? "bg-amber-500/60" : "bg-primary/60"
                                                            )}
                                                        />
                                                    </div>
                                                    <span className="text-xs font-bold text-zinc-400 w-12 text-right">
                                                        {row.share.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center p-20 text-center space-y-6">
                                <div className="p-8 bg-zinc-900 rounded-[2.5rem] border border-zinc-800">
                                    <Database className="h-16 w-16 text-zinc-700" />
                                </div>
                                <h3 className="text-xl font-bold text-white">No matches found</h3>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-zinc-900 bg-zinc-950 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-2">
                            <Table className="h-4 w-4 text-zinc-600" />
                            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{filteredData.length} Items Listed</span>
                        </div>
                        <div className="text-[10px] text-zinc-700 font-bold uppercase tracking-[0.2em] italic">Data Domino Sourcing Intelligence Engine</div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default SummaryDrilldown;
