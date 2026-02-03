import React, { useState } from 'react';
import { X, Share2, Package, Users, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface SourcingDrilldownProps {
    isOpen: boolean;
    onClose: () => void;
    data: {
        singleItems: any[];
        multiItems: any[];
        singlePercent: number;
        multiPercent: number;
    };
    title: string;
}

const SourcingDrilldown: React.FC<SourcingDrilldownProps> = ({
    isOpen,
    onClose,
    data,
    title
}) => {
    const [activeTab, setActiveTab] = useState<'multi' | 'single'>('multi');
    const [searchQuery, setSearchQuery] = useState('');

    if (!data) return null;

    const items = activeTab === 'multi' ? (data.multiItems || []) : (data.singleItems || []);
    const filteredItems = items.filter(item => {
        if (!item) return false;
        const nameMatch = String(item.name || '').toLowerCase().includes(searchQuery.toLowerCase());
        const supplierMatch = String(item.supplier || '').toLowerCase().includes(searchQuery.toLowerCase());
        return nameMatch || supplierMatch;
    });

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumSignificantDigits: 3
        }).format(val);
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
                    className="relative w-full max-w-5xl h-[80vh] flex flex-col bg-zinc-950 border border-zinc-800 rounded-[2.5rem] shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="p-8 border-b border-zinc-900 bg-zinc-900/20 flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-emerald-500/10 text-emerald-500">
                                <Share2 className="h-6 w-6" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white">{title}</h2>
                                <p className="text-sm text-zinc-500 font-medium">Sourcing strategy analysis by item fragmentation</p>
                            </div>
                        </div>

                        <button
                            onClick={onClose}
                            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors absolute right-8 top-8"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-zinc-900 px-8 bg-zinc-900/10">
                        <button
                            onClick={() => setActiveTab('multi')}
                            className={cn(
                                "px-6 py-4 text-sm font-bold transition-all border-b-2 relative",
                                activeTab === 'multi' ? "text-white border-primary" : "text-zinc-500 border-transparent hover:text-zinc-300"
                            )}
                        >
                            Multi Source ({data.multiItems.length})
                        </button>
                        <button
                            onClick={() => setActiveTab('single')}
                            className={cn(
                                "px-6 py-4 text-sm font-bold transition-all border-b-2 relative",
                                activeTab === 'single' ? "text-white border-primary" : "text-zinc-500 border-transparent hover:text-zinc-300"
                            )}
                        >
                            Single Source ({data.singleItems.length})
                        </button>

                        <div className="ml-auto py-3">
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                                <input
                                    type="text"
                                    placeholder="Search items..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl py-1.5 pl-9 pr-4 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-auto p-8 space-y-4">
                        {filteredItems.map((item, idx) => (
                            <motion.div
                                key={idx}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.02 }}
                                className="bg-zinc-900/30 border border-zinc-900 rounded-2xl p-5 hover:border-zinc-800 transition-all group"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-zinc-950 rounded-lg border border-zinc-800">
                                            <Package className="h-4 w-4 text-zinc-500" />
                                        </div>
                                        <div>
                                            <h4 className="text-white font-bold text-sm tracking-tight">{item.name}</h4>
                                            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                                                {activeTab === 'multi' ? `${Object.keys(item.vendors).length} Vendors` : `Supplier: ${item.supplier}`}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-sm font-bold text-emerald-500 font-mono italic">
                                            {formatCurrency(item.spend)}
                                        </div>
                                        <div className="text-[9px] text-zinc-600 font-bold uppercase tracking-tighter">Total Spend</div>
                                    </div>
                                </div>

                                {activeTab === 'multi' && (
                                    <div className="space-y-2 mt-4 pt-4 border-t border-zinc-800/50">
                                        {Object.entries(item.vendors as Record<string, number>)
                                            .sort((a, b) => b[1] - a[1])
                                            .map(([vendor, spend], vIdx) => {
                                                const share = Math.round((spend / item.spend) * 100);
                                                return (
                                                    <div key={vIdx} className="flex items-center justify-between text-[11px]">
                                                        <div className="flex items-center gap-2">
                                                            <Users className="h-3 w-3 text-zinc-600" />
                                                            <span className="text-zinc-400 truncate max-w-[200px]">{vendor}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 shrink-0">
                                                            <div className="w-32 h-1 bg-zinc-950 rounded-full overflow-hidden">
                                                                <div
                                                                    className="h-full bg-primary"
                                                                    style={{ width: `${share}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-white font-bold w-8 text-right font-mono">{share}%</span>
                                                            <span className="text-zinc-600 w-20 text-right">{formatCurrency(spend)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </motion.div>
                        ))}

                        {filteredItems.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                                <Package className="h-12 w-12 text-zinc-800 mb-4" />
                                <h3 className="text-lg font-bold text-white">No Items Found</h3>
                                <p className="text-sm text-zinc-500">Try adjusting your search query.</p>
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-zinc-900 bg-zinc-950 flex justify-between items-center text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                        <span>{filteredItems.length} items analyzed</span>
                        <span>Sourcing Strategy Engine v1.0</span>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default SourcingDrilldown;
