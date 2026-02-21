import React, { useState, useMemo } from 'react';
import { X, Search, ArrowUp, ArrowDown, Users } from 'lucide-react';
import { motion } from 'framer-motion';

interface SupplierListModalProps {
    isOpen: boolean;
    onClose: () => void;
    data: any[];
    totalSpend: number;
    currency: string;
}

const SupplierListModal: React.FC<SupplierListModalProps> = ({ isOpen, onClose, data, totalSpend, currency }) => {
    const [search, setSearch] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'amount', direction: 'desc' });

    const filteredData = useMemo(() => {
        let sorted = [...data];

        // Search Filter
        if (search) {
            sorted = sorted.filter(item =>
                String(item.name || item.Supplier || Object.values(item)[0]).toLowerCase().includes(search.toLowerCase())
            );
        }

        // Sorting
        sorted.sort((a, b) => {
            // normalizing keys for flexibility since data structure might vary slightly
            const valA = a[sortConfig.key] ?? (sortConfig.key === 'amount' ? (Object.values(a)[2] as number) : Object.values(a)[0]);
            const valB = b[sortConfig.key] ?? (sortConfig.key === 'amount' ? (Object.values(b)[2] as number) : Object.values(b)[0]);

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortConfig.direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
            }
            return sortConfig.direction === 'asc' ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
        });

        return sorted;
    }, [data, search, sortConfig]);

    if (!isOpen) return null;

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(val);
    };

    const handleSort = (key: string) => {
        setSortConfig(current => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-4xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
            >
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800 bg-zinc-900 z-10">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-teal-500/10 rounded-xl flex items-center justify-center text-teal-500 border border-teal-500/20">
                            <Users className="h-6 w-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Supplier Spend Analysis</h2>
                            <p className="text-sm text-zinc-500">Detailed breakdown of spend across {data.length} suppliers</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors"
                    >
                        <X className="h-6 w-6" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center gap-4 sticky top-0">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Search suppliers..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-teal-500 transition-all"
                        />
                    </div>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-900/80 border-b border-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-widest sticky top-0 z-10">
                    <div className="col-span-5 flex items-center gap-2 cursor-pointer hover:text-white" onClick={() => handleSort('name')}>
                        Supplier Name
                        {sortConfig.key === 'name' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </div>
                    <div className="col-span-3 text-right flex items-center justify-end gap-2 cursor-pointer hover:text-white" onClick={() => handleSort('amount')}>
                        Total Spend
                        {sortConfig.key === 'amount' && (sortConfig.direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
                    </div>
                    <div className="col-span-2 text-right">Share</div>
                    <div className="col-span-2 text-right">Trans.</div>
                </div>

                {/* List */}
                <div className="overflow-y-auto flex-1 p-2 space-y-1">
                    {filteredData.map((item, i) => {
                        // Safe access to properties assuming standard mapping structure relative to AnalyticsDashboard logic
                        const name = Object.values(item)[0] as string;
                        const category = Object.values(item)[1] as string;
                        // Use known keys if they exist, else position based fallback (risky but consistent with dashboard export)
                        const amount = (item['amount'] || Object.values(item)[2]) as number;
                        const count = (item['_transactions'] || Object.values(item)[3]) as number;

                        const share = (amount / totalSpend) * 100;

                        return (
                            <div key={i} className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-zinc-800/30 rounded-lg items-center transition-colors group">
                                <div className="col-span-5">
                                    <div className="font-bold text-zinc-200 text-sm truncate" title={name}>{name}</div>
                                    <div className="text-[10px] text-zinc-500 truncate">{category}</div>
                                </div>
                                <div className="col-span-3 text-right font-mono text-zinc-300 font-medium">
                                    {formatCurrency(amount)}
                                </div>
                                <div className="col-span-2 px-2">
                                    <div className="flex items-center gap-2 justify-end">
                                        <span className="text-xs font-bold text-zinc-500 w-8 text-right">{share.toFixed(1)}%</span>
                                        <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-teal-500 rounded-full"
                                                style={{ width: `${Math.min(share, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="col-span-2 text-right text-xs text-zinc-600">
                                    {count}
                                </div>
                            </div>
                        );
                    })}

                    {filteredData.length === 0 && (
                        <div className="p-12 text-center text-zinc-500">
                            No suppliers found matching "{search}"
                        </div>
                    )}
                </div>

                {/* Footer Summary */}
                <div className="p-4 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500 flex justify-between">
                    <span>Showing {filteredData.length} suppliers</span>
                    <span>Total Spend: {formatCurrency(filteredData.reduce((acc, item) => acc + ((item['amount'] || Object.values(item)[2]) as number), 0))}</span>
                </div>
            </motion.div>
        </div>
    );
};

export default SupplierListModal;
