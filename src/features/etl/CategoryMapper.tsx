import React, { useState, useMemo } from 'react';
import { Check, AlertTriangle, ArrowRight, Search, Tag, Upload, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';

interface CategoryMapperProps {
    data: any[];
    mappings: Record<string, string>;
    onComplete: (updatedData: any[]) => void;
    currency?: string;
}

const CategoryMapper: React.FC<CategoryMapperProps> = ({ data, mappings, onComplete, currency = 'INR' }) => {
    const [localData, setLocalData] = useState(data);
    const [filterMode, setFilterMode] = useState<'all' | 'uncategorized'>('uncategorized');
    const [searchTerm, setSearchTerm] = useState('');
    const [activeLevel, setActiveLevel] = useState<'l1' | 'l2' | 'l3'>('l1');
    const [applyToSimilar, setApplyToSimilar] = useState(true);
    const [customTaxonomy, setCustomTaxonomy] = useState<any[] | null>(null);

    // Dynamic Column Selection based on Active Level
    // If specific level mapping exists, use it.
    // For L1, fallback to generic 'category'.
    // For L2/L3, fallback to a NEW column name (e.g. 'category_l2') to avoid overwriting L1.
    const categoryCol = mappings[`category_${activeLevel}`] || (activeLevel === 'l1' ? mappings['category'] : `category_${activeLevel}`) || 'category';

    // Restore parent column logic for context
    const parentCol = activeLevel === 'l2' ? mappings['category_l1'] :
        activeLevel === 'l3' ? mappings['category_l2'] : undefined;

    const descriptionCol = mappings['description'] || mappings['item'] || mappings['material']; // Fallback for context

    // Statistics
    const stats = useMemo(() => {
        const total = localData.length;
        let uncategorized = 0;
        let categorizedSpend = 0;

        // Use the mapped amount column if available
        const mappedAmountCol = mappings['amount'];

        localData.forEach(row => {
            const cat = row[categoryCol];
            if (!cat || cat.trim() === '' || cat === 'Uncategorized') {
                uncategorized++;
            } else {
                let amount = 0;
                if (mappedAmountCol && row[mappedAmountCol]) {
                    const val = String(row[mappedAmountCol]).replace(/[^0-9.-]+/g, "");
                    amount = parseFloat(val) || 0;
                }
                categorizedSpend += amount;
            }
        });

        const categorized = total - uncategorized;
        return {
            total,
            uncategorized,
            categorized,
            coverage: total > 0 ? Math.round((categorized / total) * 100) : 0,
            categorizedSpend
        };
    }, [localData, categoryCol, mappings]);

    // Unique uncategorized descriptions to group by (Auto-clustering for efficiency)
    const pendingItems = useMemo(() => {
        if (!categoryCol) return [];

        // Identify columns for all levels for display purposes
        const colL1 = mappings['category_l1'] || mappings['category'] || 'category';
        const colL2 = mappings['category_l2'];
        const colL3 = mappings['category_l3'];

        // Group by description to allow bulk updates
        const groups: Record<string, { count: number, ids: number[], parent?: string, l1?: string, l2?: string, l3?: string }> = {};

        localData.forEach((row, idx) => {
            const cat = row[categoryCol];
            const desc = row[descriptionCol] || 'Unknown Item';
            const isUncategorized = !cat || cat.trim() === '' || cat === 'Uncategorized';

            // Only show items that HAVE a parent assigned (if a parent level exists)
            const parentVal = parentCol ? row[parentCol] : undefined;
            const parentReady = !parentCol || (parentVal && parentVal.trim() !== '');

            if (parentReady && (filterMode === 'all' || isUncategorized)) {
                // Group by Description AND Parent (context matters)
                const key = parentVal ? `${desc} [${parentVal}]` : desc;

                if (!groups[key]) {
                    groups[key] = {
                        count: 0,
                        ids: [],
                        parent: parentVal,
                        l1: row[colL1],
                        l2: colL2 ? row[colL2] : undefined,
                        l3: colL3 ? row[colL3] : undefined
                    };
                }
                groups[key].count++;
                groups[key].ids.push(idx);
            }
        });

        return Object.entries(groups)
            .map(([key, meta]) => ({ desc: key, ...meta })) // Key includes parent context if applicable
            .sort((a, b) => b.count - a.count)
            .filter(item => item.desc.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [localData, categoryCol, descriptionCol, filterMode, searchTerm, parentCol, mappings]);

    const handleAssignCategory = (ids: number[], newCategory: string, itemDesc?: string) => {
        if (!newCategory) return;
        const updated = [...localData];

        const idsToUpdate = new Set(ids);

        // Feature 4: Apply to All Similar
        if (applyToSimilar && itemDesc) {
            const cleanDesc = itemDesc.split('[')[0].trim().toLowerCase();
            localData.forEach((row, idx) => {
                const rowDesc = (row[descriptionCol] || '').toLowerCase();
                if (rowDesc.includes(cleanDesc) || cleanDesc.includes(rowDesc)) {
                    idsToUpdate.add(idx);
                }
            });
        }

        idsToUpdate.forEach(id => {
            updated[id] = { ...updated[id], [categoryCol]: newCategory };
        });
        setLocalData(updated);
    };

    const handleTaxonomyUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            const lines = content.split('\n');
            const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

            const taxonomy = lines.slice(1).map(line => {
                const values = line.split(',').map(v => v.trim());
                const entry: any = {};
                headers.forEach((h, i) => entry[h] = values[i]);
                return entry;
            });
            setCustomTaxonomy(taxonomy);
            alert(`Custom taxonomy loaded! ${taxonomy.length} entries found.`);
        };
        reader.readAsText(file);
    };

    const [showReview, setShowReview] = useState(false);

    // Calculate review data
    const reviewData = useMemo(() => {
        const categories: Record<string, { count: number, spend: number }> = {};
        let totalSpend = 0;

        // Use the mapped amount column if available, otherwise fallback to guessing
        const mappedAmountCol = mappings['amount'];

        localData.forEach(row => {
            const cat = row[categoryCol] || 'Uncategorized';

            let amount = 0;
            if (mappedAmountCol && row[mappedAmountCol]) {
                // Clean currency symbols if necessary
                const val = String(row[mappedAmountCol]).replace(/[^0-9.-]+/g, "");
                amount = parseFloat(val) || 0;
            } else {
                // Fallback guess
                const amountCol = Object.keys(row).find(k => k.toLowerCase().includes('amount') || k.toLowerCase().includes('spend') || k.toLowerCase().includes('cost')) || '';
                const val = String(row[amountCol] || '0').replace(/[^0-9.-]+/g, "");
                amount = parseFloat(val) || 0;
            }

            if (!categories[cat]) categories[cat] = { count: 0, spend: 0 };
            categories[cat].count++;
            categories[cat].spend += amount;
            totalSpend += amount;
        });

        return {
            categories: Object.entries(categories).sort((a, b) => b[1].spend - a[1].spend),
            totalSpend
        };
    }, [localData, categoryCol, mappings]); // Added mappings to dependency

    const handleResetLevel = () => {
        if (!confirm(`Are you sure you want to clear all ${activeLevel.toUpperCase()} assignments? This cannot be undone.`)) return;

        const updated = localData.map(row => ({
            ...row,
            [categoryCol]: '' // Clear the current level's category
        }));
        setLocalData(updated);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6 pb-20 max-w-7xl mx-auto relative"
        >
            {/* Header */}
            <div className="flex justify-between items-end">
                <div>
                    <div className="flex items-center gap-4 mb-3">
                        <h1 className="text-4xl font-bold tracking-tight">Step 4: Category Classification</h1>
                    </div>

                    <div className="flex items-center gap-2 mb-2">
                        {['l1', 'l2', 'l3'].map((level) => (
                            <button
                                key={level}
                                onClick={() => setActiveLevel(level as any)}
                                className={cn(
                                    "px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                                    activeLevel === level
                                        ? "bg-white text-black"
                                        : "bg-zinc-800 text-zinc-500 hover:text-zinc-300"
                                )}
                            >
                                Level {level.replace('l', '')}
                            </button>
                        ))}

                        <div className="h-4 w-px bg-zinc-800 mx-2" />

                        <button
                            onClick={handleResetLevel}
                            className="px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-colors"
                        >
                            Reset {activeLevel}
                        </button>
                    </div>
                    <p className="text-lg text-zinc-500 max-w-2xl">
                        Classifying <span className="text-white font-bold uppercase">{activeLevel}</span>. Identified {stats.uncategorized} items pending at this level.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="px-4 py-2 bg-zinc-900 rounded-xl border border-zinc-800 flex items-center gap-6">
                        <div className="flex flex-col">
                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-0.5">Categorized Spend</div>
                            <div className="text-xl font-black text-white">
                                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumSignificantDigits: 3 }).format(stats.categorizedSpend)}
                            </div>
                        </div>

                        <div className="w-px h-8 bg-zinc-800" />

                        <div className="flex items-center gap-3">
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Progress</span>
                                <span className={`text-lg font-bold ${stats.coverage === 100 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                    {stats.coverage}%
                                </span>
                            </div>
                            <div className="w-10 h-10 relative">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent" className="text-zinc-800" />
                                    <circle cx="20" cy="20" r="16" stroke="currentColor" strokeWidth="3" fill="transparent"
                                        className={stats.coverage === 100 ? 'text-emerald-500' : 'text-amber-500'}
                                        strokeDasharray={100.5}
                                        strokeDashoffset={100.5 - (100.5 * stats.coverage) / 100}
                                    />
                                </svg>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowReview(true)}
                        className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-primary/20"
                    >
                        Review & Finish <ArrowRight className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Filter & Search */}
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4 flex justify-between items-center backdrop-blur-sm">
                <div className="flex items-center gap-2 bg-zinc-950/50 border border-zinc-800 rounded-xl px-4 py-2 w-96">
                    <Search className="h-4 w-4 text-zinc-500" />
                    <input
                        type="text"
                        placeholder="Search by item description..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="bg-transparent border-none focus:ring-0 text-white w-full text-sm"
                    />
                </div>
                <div className="flex bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                    <button
                        onClick={() => setFilterMode('uncategorized')}
                        className={cn("px-4 py-1.5 rounded-md text-xs font-bold transition-all", filterMode === 'uncategorized' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300')}
                    >
                        Pending ({stats.uncategorized})
                    </button>
                    <button
                        onClick={() => setFilterMode('all')}
                        className={cn("px-4 py-1.5 rounded-md text-xs font-bold transition-all", filterMode === 'all' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-zinc-300')}
                    >
                        All Items ({stats.total})
                    </button>
                </div>

                <div className="flex items-center gap-4 border-l border-zinc-800 pl-4 ml-4">
                    <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={cn(
                            "w-4 h-4 rounded border flex items-center justify-center transition-all",
                            applyToSimilar ? "bg-primary border-primary" : "border-zinc-700 bg-zinc-950 group-hover:border-zinc-500"
                        )} onClick={() => setApplyToSimilar(!applyToSimilar)}>
                            {applyToSimilar && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Apply to Similar</span>
                    </label>

                    <label className="flex items-center gap-2 px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg cursor-pointer hover:border-primary/50 transition-all text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                        <Upload className="h-3.5 w-3.5" />
                        Taxonomy
                        <input type="file" className="hidden" accept=".csv" onChange={handleTaxonomyUpload} />
                    </label>
                </div>
            </div>

            {/* Classification Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                    {pendingItems.map((group, idx) => (
                        <motion.div
                            key={group.desc + idx}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            layout
                            className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-all group"
                        >
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-2 bg-zinc-800 rounded-lg">
                                    <Tag className="h-5 w-5 text-zinc-500" />
                                </div>
                                <span className="bg-zinc-800 text-zinc-400 px-2 py-1 rounded-md text-xs font-bold">
                                    {group.count} records
                                </span>
                            </div>

                            <h3 className="font-bold text-lg text-white mb-1 line-clamp-1" title={group.desc}>
                                {group.desc.split('[')[0]} {/* Clean description for display */}
                            </h3>

                            {/* Multi-level Context Display */}
                            <div className="flex flex-wrap gap-2 mb-4 mt-2">
                                <span className={cn("text-[10px] px-2 py-1 rounded bg-zinc-950 border border-zinc-800", activeLevel === 'l1' && "border-primary/50 text-white")}>
                                    <span className="text-zinc-500 mr-1">L1:</span> {group.l1 || '—'}
                                </span>
                                {(mappings['category_l2'] || activeLevel !== 'l1') && (
                                    <span className={cn("text-[10px] px-2 py-1 rounded bg-zinc-950 border border-zinc-800", activeLevel === 'l2' && "border-primary/50 text-white")}>
                                        <span className="text-zinc-500 mr-1">L2:</span> {group.l2 || '—'}
                                    </span>
                                )}
                                {(mappings['category_l3'] || activeLevel === 'l3') && (
                                    <span className={cn("text-[10px] px-2 py-1 rounded bg-zinc-950 border border-zinc-800", activeLevel === 'l3' && "border-primary/50 text-white")}>
                                        <span className="text-zinc-500 mr-1">L3:</span> {group.l3 || '—'}
                                    </span>
                                )}
                            </div>

                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder={`Assign ${activeLevel.toUpperCase()}...`}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleAssignCategory(group.ids, e.currentTarget.value, group.desc);
                                        }
                                    }}
                                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary focus:border-primary transition-all"
                                />
                                {customTaxonomy && (
                                    <div className="absolute right-3 top-2.5 flex items-center gap-1 text-[10px] text-primary font-bold uppercase pointer-events-none">
                                        <Sparkles className="h-3 w-3" /> Taxonomy Smart
                                    </div>
                                )}
                                {!customTaxonomy && (
                                    <div className="absolute right-3 top-2.5 text-[10px] text-zinc-600 font-bold uppercase pointer-events-none">
                                        Press Enter
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {pendingItems.length === 0 && (
                    <div className="col-span-full py-20 text-center text-zinc-500">
                        <Check className="h-16 w-16 mx-auto mb-4 text-emerald-500/20" />
                        <h3 className="text-xl font-bold text-white mb-2">All Caught Up!</h3>
                        <p>No uncategorized items found matching your filter.</p>
                    </div>
                )}
            </div>

            {/* Review Modal Overlay */}
            <AnimatePresence>
                {showReview && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-4xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl shadow-primary/10"
                        >
                            <div className="flex justify-between items-center mb-6 shrink-0">
                                <div>
                                    <h2 className="text-2xl font-bold text-white">Review Material Categories</h2>
                                    <p className="text-zinc-400">Please confirm your category assignments before generating the dashboard.</p>
                                </div>
                                <button
                                    onClick={() => setShowReview(false)}
                                    className="text-zinc-500 hover:text-white transition-colors"
                                >
                                    Close
                                </button>
                            </div>

                            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-4 pr-2">
                                {/* Summary Cards */}
                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
                                        <div className="text-zinc-500 text-xs font-bold uppercase mb-1">Total Categories</div>
                                        <div className="text-2xl font-bold text-white">{reviewData.categories.length}</div>
                                    </div>
                                    <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800">
                                        <div className="text-zinc-500 text-xs font-bold uppercase mb-1">Categorized Spend</div>
                                        <div className="text-2xl font-bold text-emerald-500">
                                            {new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency, maximumSignificantDigits: 3 }).format(reviewData.totalSpend)}
                                        </div>
                                    </div>
                                    <div className={`bg-zinc-950/50 p-4 rounded-xl border ${stats.uncategorized > 0 ? 'border-amber-500/50 bg-amber-500/10' : 'border-zinc-800'}`}>
                                        <div className="text-zinc-500 text-xs font-bold uppercase mb-1">Uncategorized Items</div>
                                        <div className={`text-2xl font-bold ${stats.uncategorized > 0 ? 'text-amber-500' : 'text-zinc-500'}`}>{stats.uncategorized}</div>
                                    </div>
                                </div>

                                {/* Category Table */}
                                <div className="border border-zinc-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-zinc-950 text-zinc-400 font-bold uppercase text-[10px]">
                                            <tr>
                                                <th className="p-4">Category Name</th>
                                                <th className="p-4 text-right">Line Items</th>
                                                <th className="p-4 text-right">Total Spend</th>
                                                <th className="p-4 text-right">% of Spend</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-800">
                                            {reviewData.categories.map(([cat, data]) => (
                                                <tr key={cat} className="hover:bg-zinc-800/50 transition-colors">
                                                    <td className="p-4 font-bold text-white flex items-center gap-2">
                                                        {cat === 'Uncategorized' && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                                                        {cat}
                                                    </td>
                                                    <td className="p-4 text-right text-zinc-400">{data.count}</td>
                                                    <td className="p-4 text-right text-zinc-300 font-mono">
                                                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency }).format(data.spend)}
                                                    </td>
                                                    <td className="p-4 text-right text-zinc-500">
                                                        {((data.spend / reviewData.totalSpend) * 100).toFixed(1)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-zinc-800 shrink-0">
                                <button
                                    onClick={() => setShowReview(false)}
                                    className="px-6 py-3 rounded-xl font-bold text-zinc-400 hover:text-white hover:bg-zinc-800 transition-all"
                                >
                                    Back to Editing
                                </button>
                                <button
                                    onClick={() => onComplete(localData)}
                                    className="px-8 py-3 bg-gradient-to-br from-primary to-emerald-600 hover:to-emerald-500 text-white rounded-xl font-bold shadow-lg shadow-primary/25 flex items-center gap-2 transition-all transform hover:scale-[1.02]"
                                >
                                    <Check className="h-5 w-5" /> Confirm & Generate Dashboard
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default CategoryMapper;
