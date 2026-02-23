import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Clock,
    Download,
    CheckCircle2,
    Upload,
    Calendar,
    ChevronRight,
    Search
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useEffectiveUid } from '../../hooks/useEffectiveUid';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlatActivity {
    id: string;
    type: 'upload' | 'export';
    fileName: string;
    date: any; // Firestore Timestamp
    // upload-only
    rowCount?: number;
    totalSpend?: number;
    savingsPotentialMin?: number;
    savingsPotentialMax?: number;
    duplicateCount?: number;
    // both
    fileUrl?: string;
}

// ─── Helpers (unchanged from original) ────────────────────────────────────────

const getActivityIcon = (type: FlatActivity['type']) => {
    switch (type) {
        case 'export': return <Download className="h-4 w-4" />;
        case 'upload': return <Upload className="h-4 w-4" />;
        default: return <Clock className="h-4 w-4" />;
    }
};

const getActivityColor = (type: FlatActivity['type']) => {
    switch (type) {
        case 'export': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
        case 'upload': return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
        default: return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
    }
};

const fmtDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
};

const fmtTime = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const fmtCurrency = (v?: number) => {
    if (v == null) return null;
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumSignificantDigits: 4,
        notation: 'compact',
    }).format(v);
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SkeletonRow = () => (
    <div className="p-6 bg-zinc-900/40 border border-zinc-900 rounded-3xl flex items-center gap-6 animate-pulse">
        <div className="h-12 w-12 rounded-2xl bg-zinc-800 shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="h-4 bg-zinc-800 rounded w-2/5" />
            <div className="h-3 bg-zinc-800/70 rounded w-1/3" />
        </div>
        <div className="h-8 w-28 bg-zinc-800 rounded-xl" />
    </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

interface ActivityHistoryProps {
    projectId: string;
}

const ActivityHistory: React.FC<ActivityHistoryProps> = ({ projectId }) => {
    const effectiveUid = useEffectiveUid();
    const [activityHistory, setActivityHistory] = useState<FlatActivity[]>([]);
    const [uploads, setUploads] = useState<FlatActivity[]>([]);
    const [exports, setExports] = useState<FlatActivity[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!effectiveUid || !projectId) {
            setLoading(false);
            return;
        }

        const uploadsQuery = query(
            collection(db, 'uploads'),
            where('userId', '==', effectiveUid),
            where('projectId', '==', projectId)
        );

        const exportsQuery = query(
            collection(db, 'exports'),
            where('userId', '==', effectiveUid),
            where('projectId', '==', projectId)
        );

        const unsubUploads = onSnapshot(uploadsQuery, (snap) => {
            const raw = snap.docs.map(doc => {
                const d = doc.data();
                return {
                    id: doc.id,
                    type: 'upload',
                    fileName: d.fileName,
                    date: d.uploadedAt,
                    rowCount: d.rowCount,
                    totalSpend: d.analysis?.totalSpend || d.totalSpend,
                    savingsPotentialMin: d.analysis?.savingsPotentialMin || d.savingsPotentialMin,
                    savingsPotentialMax: d.analysis?.savingsPotentialMax || d.savingsPotentialMax,
                    duplicateCount: d.analysis?.duplicateCount || d.duplicateCount,
                    fileUrl: d.fileUrl,
                };
            });
            setUploads(raw as FlatActivity[]);
            setLoading(false);
        });

        const unsubExports = onSnapshot(exportsQuery, (snap) => {
            const raw = snap.docs.map(doc => ({
                id: doc.id,
                type: 'export',
                fileName: doc.data().fileName,
                date: doc.data().exportedAt,
                fileUrl: doc.data().fileUrl,
            }));
            setExports(raw as FlatActivity[]);
            setLoading(false);
        });

        return () => {
            unsubUploads();
            unsubExports();
        };
    }, [effectiveUid, projectId]);

    useEffect(() => {
        const combined = [...uploads, ...exports].sort((a, b) => {
            const da = a.date?.toMillis?.() || new Date(a.date).getTime() || 0;
            const db = b.date?.toMillis?.() || new Date(b.date).getTime() || 0;
            return db - da;
        });
        setActivityHistory(combined);
    }, [uploads, exports]);

    return (
        // ── Outer wrapper — UNCHANGED from original ──────────────────────────
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header row — UNCHANGED */}
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight mb-2">Activity Audit Trail</h2>
                    <p className="text-zinc-500">A comprehensive history of all processing milestones and exports for this project.</p>
                </div>
                <div className="flex items-center gap-3 bg-zinc-900/50 p-2 rounded-2xl border border-zinc-900 border-zinc-800">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-600" />
                        <input
                            type="text"
                            placeholder="Search activity..."
                            className="bg-transparent text-sm border-none focus:ring-0 pl-10 w-48"
                        />
                    </div>
                </div>
            </div>

            {/* List area */}
            <div className="grid grid-cols-1 gap-4">
                {/* Skeleton while loading */}
                {loading && (
                    <>
                        <SkeletonRow />
                        <SkeletonRow />
                        <SkeletonRow />
                    </>
                )}

                {/* Empty state — only shown when NOT loading */}
                {!loading && activityHistory.length === 0 && (
                    <div className="p-20 text-center bg-zinc-900/30 border border-zinc-900 rounded-[2.5rem] flex flex-col items-center">
                        <Clock className="h-12 w-12 text-zinc-800 mb-4" />
                        <h3 className="text-lg font-bold text-zinc-400">No activity yet</h3>
                        <p className="text-sm text-zinc-600 max-w-xs mt-2">Upload a file or export a report to see your history here.</p>
                    </div>
                )}

                {/* Activity items — structure UNCHANGED from original */}
                {!loading && activityHistory.map((activity, idx) => (
                    <motion.div
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.05 }}
                        key={activity.id}
                        className="p-6 bg-zinc-900/40 border border-zinc-900 hover:border-zinc-800 transition-all rounded-3xl flex items-center gap-6 group"
                    >
                        {/* Icon badge — UNCHANGED */}
                        <div className={cn(
                            "h-12 w-12 rounded-2xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-110",
                            getActivityColor(activity.type)
                        )}>
                            {getActivityIcon(activity.type)}
                        </div>

                        {/* Main text — UNCHANGED structure, new fields added below date */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-lg font-bold text-white group-hover:text-primary transition-colors truncate">
                                    {activity.fileName}
                                </span>
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                            </div>

                            {/* Date / time row — UNCHANGED layout */}
                            <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-widest text-zinc-500">
                                <span className="flex items-center gap-1.5">
                                    <Calendar className="h-3 w-3" />
                                    {fmtDate(activity.date)}
                                </span>
                                <span className="flex items-center gap-1.5 font-mono text-zinc-600">
                                    <Clock className="h-3 w-3" />
                                    {fmtTime(activity.date)}
                                </span>
                                <span className="text-zinc-600 uppercase">
                                    {activity.type === 'upload' ? 'Upload' : 'Export'}
                                </span>
                            </div>

                            {/* ── Upload-only: analysis fields ── */}
                            {activity.type === 'upload' && (
                                <div className="flex flex-wrap items-center gap-3 mt-2">
                                    {activity.rowCount != null && (
                                        <span className="text-xs font-semibold text-zinc-400 bg-zinc-800/60 px-2 py-0.5 rounded-lg">
                                            {activity.rowCount.toLocaleString()} rows
                                        </span>
                                    )}
                                    {activity.totalSpend != null && (
                                        <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-lg">
                                            Spend {fmtCurrency(activity.totalSpend)}
                                        </span>
                                    )}
                                    {activity.savingsPotentialMin != null && activity.savingsPotentialMax != null && (
                                        <span className="text-xs font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg">
                                            Savings {fmtCurrency(activity.savingsPotentialMin)}–{fmtCurrency(activity.savingsPotentialMax)}
                                        </span>
                                    )}
                                    {activity.duplicateCount != null && activity.duplicateCount > 0 && (
                                        <span className="text-xs font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-lg">
                                            {activity.duplicateCount} duplicates
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Right-side actions — UNCHANGED structure */}
                        <div className="flex items-center gap-4 shrink-0">
                            {/* Upload: Download Original */}
                            {activity.type === 'upload' && (
                                <button
                                    onClick={() => activity.fileUrl && window.open(activity.fileUrl, '_blank')}
                                    disabled={!activity.fileUrl}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-zinc-700 disabled:opacity-40"
                                >
                                    <Download className="h-3.5 w-3.5" /> Download Original
                                </button>
                            )}

                            {/* Export: Re-download */}
                            {activity.type === 'export' && (
                                <button
                                    onClick={() => activity.fileUrl && window.open(activity.fileUrl, '_blank')}
                                    disabled={!activity.fileUrl}
                                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-2 border border-zinc-700 disabled:opacity-40"
                                >
                                    <Download className="h-3.5 w-3.5" /> Re-download
                                </button>
                            )}

                            {/* Chevron — UNCHANGED */}
                            <div className="p-2 text-zinc-700 group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100">
                                <ChevronRight className="h-5 w-5" />
                            </div>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default ActivityHistory;
