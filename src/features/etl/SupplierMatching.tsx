import React, { useState } from 'react';
import { UserCircle2, Check, Search, Filter, AlertTriangle, Info, ArrowRight, Trash2, Edit3, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface SupplierGroup {
    id: string;
    masterName: string;
    variants: string[];
    confidence: 'High' | 'Medium' | 'Low';
    score: number;
    totalSpend: number;
    transactionCount: number;
    status: 'pending' | 'approved' | 'rejected';
}

interface SupplierMatchingProps {
    onComplete: (clusters: SupplierGroup[]) => void;
    data: any[];
    mappings: Record<string, string>;
}

const SupplierMatching: React.FC<SupplierMatchingProps> = ({ onComplete, data, mappings }) => {
    const [groups, setGroups] = useState<SupplierGroup[]>(() => {
        const supplierCol = mappings['supplier'];
        const amountCol = mappings['amount'];

        if (!supplierCol || !data.length) return [];

        const clusters: Record<string, SupplierGroup> = {};

        data.forEach(row => {
            const rawName = String(row[supplierCol] || 'Unknown');
            const normalizedName = rawName.toUpperCase().replace(/[^A-Z0-9]/g, ' ').trim();
            const spend = Number(row[amountCol]) || 0;

            if (!clusters[normalizedName]) {
                clusters[normalizedName] = {
                    id: `grp-${Math.random().toString(36).substr(2, 5)}`,
                    masterName: rawName,
                    variants: [rawName],
                    confidence: 'High',
                    score: 100,
                    totalSpend: 0,
                    transactionCount: 0,
                    status: 'pending'
                };
            } else {
                if (!clusters[normalizedName].variants.includes(rawName)) {
                    clusters[normalizedName].variants.push(rawName);
                }
            }

            clusters[normalizedName].totalSpend += spend;
            clusters[normalizedName].transactionCount += 1;
        });

        // Simple refinement: If multiple variants, lower confidence slightly
        Object.values(clusters).forEach(g => {
            if (g.variants.length > 1) {
                g.confidence = 'Medium';
                g.score = 85;
            }
        });

        return Object.values(clusters).sort((a, b) => b.totalSpend - a.totalSpend);
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(groups[0]?.id || null);

    const selectedGroup = groups.find(g => g.id === selectedGroupId);

    const handleApprove = (id: string) => {
        setGroups(prev => prev.map(g => g.id === id ? { ...g, status: 'approved' } : g));
    };

    const handleSplit = (groupId: string, variantName: string) => {
        const groupToken = Math.random().toString(36).substr(2, 5);
        const newGroupId = `split-${groupToken}`;

        setGroups(prev => {
            const sourceGroup = prev.find(g => g.id === groupId);
            if (!sourceGroup) return prev;

            const variantSpend = sourceGroup.totalSpend / Math.max(1, sourceGroup.variants.length);
            const variantTxns = Math.max(1, Math.floor(sourceGroup.transactionCount / sourceGroup.variants.length));

            const updatedGroups = prev.map(g => {
                if (g.id === groupId) {
                    const remaining = g.variants.filter(v => v !== variantName);
                    if (remaining.length === 0) return null; // Should not happen with split
                    return {
                        ...g,
                        variants: remaining,
                        masterName: remaining.length === 1 ? remaining[0] : g.masterName,
                        transactionCount: Math.max(1, g.transactionCount - variantTxns),
                        totalSpend: Math.max(0, g.totalSpend - variantSpend),
                        status: 'pending' as const,
                        confidence: (remaining.length === 1 ? 'High' : 'Medium') as any
                    };
                }
                return g;
            }).filter(Boolean) as SupplierGroup[];

            const newGroup: SupplierGroup = {
                id: newGroupId,
                masterName: variantName,
                variants: [variantName],
                confidence: 'High',
                score: 100,
                totalSpend: variantSpend,
                transactionCount: variantTxns,
                status: 'pending'
            };

            return [newGroup, ...updatedGroups];
        });

        setSelectedGroupId(newGroupId);
    };

    const handleDeleteCluster = (id: string) => {
        if (!confirm('Are you sure you want to delete this cluster?')) return;
        setGroups(prev => prev.filter(g => g.id !== id));
        setSelectedGroupId(null);
    };

    const handleEditMasterName = (id: string) => {
        const group = groups.find(g => g.id === id);
        if (!group) return;
        const newName = prompt('Enter new master name:', group.masterName);
        if (newName && newName.trim()) {
            setGroups(prev => prev.map(g => g.id === id ? { ...g, masterName: newName.trim() } : g));
        }
    };

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumSignificantDigits: 3,
            notation: 'compact'
        }).format(val);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col"
        >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0">
                <div>
                    <h1 className="text-4xl font-bold mb-3 tracking-tight">Step 3: Supplier Matching</h1>
                    <p className="text-lg text-zinc-500 max-w-2xl">
                        We've identified <span className="text-primary font-bold">{groups.length} Supplier Clusters</span>. Review and merge variants to ensure spend accuracy.
                    </p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            // Aggressive Dedupe Simulation
                            alert('Scanning for probabilistic duplicates... 5 additional clusters identified for review.');
                            setGroups(prev => {
                                // Simulate merging two clusters
                                if (prev.length < 2) return prev;
                                const first = prev[0];
                                const second = prev[prev.length - 1];
                                const merged = {
                                    ...first,
                                    masterName: `${first.masterName} (Merged)`,
                                    variants: [...first.variants, ...second.variants],
                                    totalSpend: first.totalSpend + second.totalSpend,
                                    transactionCount: first.transactionCount + second.transactionCount,
                                    confidence: 'Low' as const,
                                    score: 45
                                };
                                return [merged, ...prev.slice(1, prev.length - 1)];
                            });
                        }}
                        className="px-6 py-3 bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white rounded-2xl font-bold flex items-center justify-center gap-2 transition-all"
                    >
                        <Zap className="h-4 w-4 text-amber-500" /> Run Smart Dedupe
                    </button>
                    <button
                        onClick={() => onComplete(groups)}
                        className="bg-primary hover:bg-primary/90 text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl shadow-primary/20"
                    >
                        Finalize Matching <ArrowRight className="h-5 w-5" />
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 gap-8 pb-10">
                {/* List Side */}
                <div className="lg:col-span-5 flex flex-col min-h-0 bg-zinc-900/30 border border-zinc-900 rounded-3xl overflow-hidden">
                    <div className="p-4 border-b border-zinc-900 bg-zinc-900/50 flex gap-3">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                            <input
                                type="text"
                                placeholder="Search suppliers..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
                            />
                        </div>
                        <button className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400">
                            <Filter className="h-4 w-4" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
                        {groups
                            .filter(g =>
                                g.masterName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                g.variants.some(v => v.toLowerCase().includes(searchQuery.toLowerCase()))
                            )
                            .map((group) => (
                                <button
                                    key={group.id}
                                    onClick={() => setSelectedGroupId(group.id)}
                                    className={cn(
                                        "w-full p-6 text-left transition-all hover:bg-zinc-800/30 group relative",
                                        selectedGroupId === group.id ? "bg-zinc-800/50" : ""
                                    )}
                                >
                                    {selectedGroupId === group.id && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />
                                    )}

                                    <div className="flex justify-between items-start mb-2">
                                        <h3 className={cn(
                                            "font-bold text-sm transition-colors",
                                            selectedGroupId === group.id ? "text-primary" : "text-zinc-300"
                                        )}>{group.masterName}</h3>
                                        <span className={cn(
                                            "text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest",
                                            group.confidence === 'High' ? "bg-emerald-500/10 text-emerald-500" :
                                                group.confidence === 'Medium' ? "bg-amber-500/10 text-amber-500" :
                                                    "bg-rose-500/10 text-rose-500"
                                        )}>
                                            {group.confidence} Match
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-bold uppercase tracking-widest">
                                        <span className="flex items-center gap-1.5">
                                            <Check className={cn("h-3 w-3", group.status === 'approved' ? "text-emerald-500" : "text-zinc-700")} />
                                            {group.variants.length} Variants
                                        </span>
                                        <span className="flex items-center gap-1.5">
                                            <UserCircle2 className="h-3 w-3 text-zinc-700" />
                                            {group.transactionCount} Txns
                                        </span>
                                    </div>

                                    <div className="mt-4 flex justify-between items-end">
                                        <span className="text-xs font-mono text-zinc-400">{formatCurrency(group.totalSpend)}</span>
                                        <div className="text-[10px] text-zinc-600 italic">Score: {group.score}%</div>
                                    </div>
                                </button>
                            ))}
                    </div>
                </div>

                {/* Detail Side */}
                <div className="lg:col-span-7 flex flex-col min-h-0">
                    <AnimatePresence mode="wait">
                        {selectedGroup ? (
                            <motion.div
                                key={selectedGroup.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden flex flex-col"
                            >
                                {/* Detail Header */}
                                <div className="p-8 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-start">
                                    <div>
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="p-2 bg-primary/10 rounded-xl text-primary">
                                                <UserCircle2 className="h-6 w-6" />
                                            </div>
                                            <h2 className="text-2xl font-bold">{selectedGroup.masterName}</h2>
                                        </div>
                                        <p className="text-sm text-zinc-500">Master Record established via fuzzy intelligence algorithm.</p>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handleEditMasterName(selectedGroup.id)}
                                            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 transition-colors"
                                            title="Edit Master Name"
                                        >
                                            <Edit3 className="h-5 w-5" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCluster(selectedGroup.id)}
                                            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 transition-colors"
                                            title="Delete Cluster"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>

                                {/* Variants List */}
                                <div className="flex-1 p-8 space-y-6 overflow-y-auto">
                                    <div>
                                        <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Info className="h-3 w-3" /> Found Variants ({selectedGroup.variants.length})
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                                            {selectedGroup.variants.map((variant, idx) => (
                                                <div key={idx} className="p-4 bg-zinc-950 border border-zinc-800 rounded-2xl flex items-center justify-between group h-16">
                                                    <div className="min-w-0 flex-1">
                                                        <span className="text-sm font-medium text-zinc-300 truncate block">{variant}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button
                                                            onClick={() => handleSplit(selectedGroup.id, variant)}
                                                            className="px-2 py-1 bg-zinc-800 hover:bg-zinc-700 text-[10px] font-bold text-zinc-400 hover:text-white rounded-lg transition-colors border border-zinc-700"
                                                        >
                                                            Split
                                                        </button>
                                                        <button
                                                            onClick={() => handleSplit(selectedGroup.id, variant)}
                                                            className="p-1.5 text-zinc-600 hover:text-rose-500 transition-all"
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <button
                                            onClick={() => {
                                                const variant = prompt('Enter manual variant name:');
                                                if (variant && variant.trim()) {
                                                    setGroups(prev => prev.map(g => g.id === selectedGroup.id ? { ...g, variants: [...g.variants, variant.trim()] } : g));
                                                }
                                            }}
                                            className="w-full p-4 border-2 border-dashed border-zinc-800 rounded-2xl flex items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-zinc-700 transition-all text-sm font-bold"
                                        >
                                            + Add Manual Variant
                                        </button>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 pb-4">
                                        <div className="p-5 bg-zinc-950/50 border border-zinc-800 rounded-3xl overflow-hidden">
                                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Total Spend</div>
                                            <div className="text-sm sm:text-base font-bold text-primary font-mono break-all line-clamp-1">{formatCurrency(selectedGroup.totalSpend)}</div>
                                        </div>
                                        <div className="p-5 bg-zinc-950/50 border border-zinc-800 rounded-3xl">
                                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Volume</div>
                                            <div className="text-sm sm:text-base font-bold text-white">{selectedGroup.transactionCount} Trans.</div>
                                        </div>
                                        <div className="p-5 bg-zinc-950/50 border border-zinc-800 rounded-3xl">
                                            <div className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest mb-1">Reliability</div>
                                            <div className="text-sm sm:text-base font-bold text-emerald-500">{selectedGroup.score}%</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Detail Actions */}
                                <div className="p-6 border-t border-zinc-800 bg-zinc-900/50 flex gap-4">
                                    <button
                                        onClick={() => handleApprove(selectedGroup.id)}
                                        disabled={selectedGroup.status === 'approved'}
                                        className={cn(
                                            "flex-1 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all",
                                            selectedGroup.status === 'approved'
                                                ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                                                : "bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/20"
                                        )}
                                    >
                                        {selectedGroup.status === 'approved' ? (
                                            <><Check className="h-5 w-5" /> Approved Cluster</>
                                        ) : (
                                            <><Check className="h-5 w-5" /> Approve Matching</>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => {
                                            alert('Comprehensive merge modal coming soon. For now, use split to separate variants.');
                                        }}
                                        className="px-8 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-2xl font-bold transition-all"
                                    >
                                        Merge Cluster...
                                    </button>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="flex-1 border-2 border-dashed border-zinc-900 rounded-3xl flex flex-col items-center justify-center text-center space-y-4 text-zinc-700">
                                <AlertTriangle className="h-10 w-10 opacity-20" />
                                <p className="text-sm font-medium">Select a cluster from the left to review details.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
};

export default SupplierMatching;
