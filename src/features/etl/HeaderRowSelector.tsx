import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Info, AlertCircle, ChevronRight, Table as TableIcon } from 'lucide-react';
import { cn } from '../../lib/utils';

interface HeaderRowSelectorProps {
    rawData: any[][]; // Array of rows, where each row is an array of cells
    merges?: any[]; // XLSX merges info
    onSelect: (rowIndex: number) => void;
}

const HeaderRowSelector: React.FC<HeaderRowSelectorProps> = ({ rawData, merges, onSelect }) => {
    const [selectedRow, setSelectedRow] = useState<number | null>(null);

    // Common keywords to highlight potential header rows
    const KEYWORDS = ['vendor', 'supplier', 'date', 'amount', 'currency', 'category', 'invoice', 'po', 'item', 'description'];

    const scoreRow = (row: any[]) => {
        if (!row || !Array.isArray(row)) return 0;
        return row.reduce((score, cell) => {
            const val = String(cell || '').toLowerCase().trim();
            if (KEYWORDS.some(k => val.includes(k))) return score + 1;
            return score;
        }, 0);
    };

    const hasMerges = (rowIndex: number) => {
        if (!merges) return false;
        // Simple check: if any merge starts on this row
        return merges.some(m => m.s.r === rowIndex);
    };

    // Calculate scores and find best candidate
    const topRows = rawData.slice(0, 15).map((row, idx) => ({
        idx,
        data: row,
        score: scoreRow(row),
        hasMerges: hasMerges(idx),
        isEmpty: row.every(c => !c || String(c).trim() === '')
    }));

    const bestCandidate = topRows.reduce((prev, current) => (current.score > prev.score ? current : prev), topRows[0]);

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-8"
        >
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold mb-3 tracking-tight">Select Header Row</h1>
                    <p className="text-lg text-zinc-400 max-w-2xl">
                        Identify which row contains your column names. We've highlighted our best guess.
                    </p>
                </div>
                <button
                    onClick={() => selectedRow !== null && onSelect(selectedRow)}
                    disabled={selectedRow === null}
                    className="bg-primary hover:bg-primary/90 text-white px-8 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all shadow-xl shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Confirm Header Row <ChevronRight className="h-5 w-5" />
                </button>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="p-6 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <TableIcon className="h-5 w-5 text-zinc-500" />
                        <h3 className="font-bold text-zinc-200">File Preview (First 15 Rows)</h3>
                    </div>
                    {bestCandidate.score > 0 && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 border border-primary/20 rounded-full">
                            <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Recommended: Row {bestCandidate.idx + 1}</span>
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-800 bg-zinc-950/50">
                                <th className="w-16 p-4 text-[10px] font-black text-zinc-600 uppercase tracking-tighter text-center">Row</th>
                                <th className="p-4 text-left text-[10px] font-black text-zinc-600 uppercase tracking-widest">Data Preview</th>
                                <th className="w-32 p-4 text-[10px] font-black text-zinc-600 uppercase tracking-widest text-right">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/50">
                            {topRows.map((row) => (
                                <tr
                                    key={row.idx}
                                    onClick={() => !row.isEmpty && setSelectedRow(row.idx)}
                                    className={cn(
                                        "group transition-all cursor-pointer",
                                        selectedRow === row.idx ? "bg-primary/10" : "hover:bg-zinc-800/30",
                                        row.isEmpty && "opacity-30 cursor-not-allowed bg-zinc-950/20"
                                    )}
                                >
                                    <td className="p-4 text-center">
                                        <span className={cn(
                                            "text-xs font-mono font-bold",
                                            selectedRow === row.idx ? "text-primary" : "text-zinc-500"
                                        )}>
                                            {row.idx + 1}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex gap-2 overflow-hidden max-w-xl">
                                            {row.data.slice(0, 6).map((cell, cIdx) => (
                                                <div
                                                    key={cIdx}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap min-w-[80px]",
                                                        selectedRow === row.idx
                                                            ? "bg-primary/5 border-primary/20 text-primary"
                                                            : "bg-zinc-950 border-zinc-800 text-zinc-400 group-hover:border-zinc-700"
                                                    )}
                                                >
                                                    {String(cell || '').trim() || <span className="text-zinc-800 italic">null</span>}
                                                </div>
                                            ))}
                                            {row.data.length > 6 && <span className="text-zinc-700 flex items-center">...</span>}
                                        </div>
                                    </td>
                                    <td className="p-4 text-right">
                                        <div className="flex justify-end gap-2 text-xs font-bold uppercase tracking-widest">
                                            {row.isEmpty ? (
                                                <span className="text-zinc-700">Empty</span>
                                            ) : row.hasMerges ? (
                                                <div className="flex items-center gap-1.5 text-amber-500 bg-amber-500/10 px-2 py-1 rounded-lg">
                                                    <AlertCircle className="h-3 w-3" />
                                                    Merged
                                                </div>
                                            ) : row.score > 2 ? (
                                                <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-lg">
                                                    <Check className="h-3 w-3" />
                                                    Headers?
                                                </div>
                                            ) : (
                                                <span className="text-zinc-600 group-hover:text-zinc-400 opacity-0 group-hover:opacity-100 transition-opacity">Data</span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl flex items-start gap-4">
                    <div className="mt-1 p-2 bg-primary/10 rounded-xl text-primary">
                        <Info className="h-5 w-5" />
                    </div>
                    <div>
                        <h4 className="font-bold mb-1 text-zinc-200">How we score rows</h4>
                        <p className="text-sm text-zinc-500 leading-relaxed">
                            We look for row transitions from empty or metadata fields to structured labels like "Vendor", "Currency", or "Amount". Selection of this row will determine how the entire file is parsed.
                        </p>
                    </div>
                </div>
                {selectedRow !== null && hasMerges(selectedRow) && (
                    <div className="bg-amber-500/5 border border-amber-500/20 p-6 rounded-3xl flex items-start gap-4">
                        <div className="mt-1 p-2 bg-amber-500/10 rounded-xl text-amber-500">
                            <AlertCircle className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="font-bold mb-1 text-amber-500 text-zinc-200">Merged Cells Detected</h4>
                            <p className="text-sm text-zinc-500 leading-relaxed">
                                This row contains merged cells. Data Domino will automatically unmerge these for you, but we recommend checking the mapping in the next step to ensure accuracy.
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </motion.div>
    );
};

export default HeaderRowSelector;
