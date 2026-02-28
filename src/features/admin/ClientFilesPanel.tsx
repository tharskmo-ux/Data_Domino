import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAdminView } from './AdminViewContext';
import { useAuth } from '../auth/AuthContext';
import { useEffectiveUid } from '../../hooks/useEffectiveUid';
import { Download, FileText, FolderOpen } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadRecord {
    id: string;
    fileName: string;
    uploadedAt: any; // Firestore Timestamp
    rowCount?: number;
    totalSpend?: number;
    savingsPotentialMin?: number;
    savingsPotentialMax?: number;
    duplicateCount?: number;
    fileUrl?: string;
    fileSizeMB?: number;
    categoryResultsUrl?: string;
}

interface ExportRecord {
    id: string;
    fileName: string;
    exportedAt: any; // Firestore Timestamp
    fileUrl?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (ts: any) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString();
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

// ─── Sub-components ───────────────────────────────────────────────────────────

const SkeletonRow = () => (
    <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 animate-pulse">
        <div className="flex items-center gap-3 flex-1">
            <div className="w-8 h-8 rounded-lg bg-zinc-800 shrink-0" />
            <div className="space-y-1.5 flex-1">
                <div className="h-3 bg-zinc-800 rounded w-2/5" />
                <div className="h-2.5 bg-zinc-800/70 rounded w-1/4" />
            </div>
        </div>
        <div className="h-7 w-24 bg-zinc-800 rounded-lg" />
    </div>
);

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
    <div className="p-8 text-center bg-zinc-900/30 border border-zinc-800 rounded-xl">
        <FolderOpen className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-500 text-sm font-medium">{label}</p>
    </div>
);

const UploadRow: React.FC<{ record: UploadRecord }> = ({ record }) => (
    <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all gap-4">
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-emerald-400" />
            </div>
            <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-200 truncate max-w-[200px]">{record.fileName}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] text-zinc-500 font-medium">{fmtDate(record.uploadedAt)}</span>
                    {record.rowCount != null && (
                        <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                            {record.rowCount.toLocaleString()} rows
                        </span>
                    )}
                    {record.totalSpend != null && (
                        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            {fmtCurrency(record.totalSpend)}
                        </span>
                    )}
                    {record.savingsPotentialMin != null && record.savingsPotentialMax != null && (
                        <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded">
                            Savings {fmtCurrency(record.savingsPotentialMin)}–{fmtCurrency(record.savingsPotentialMax)}
                        </span>
                    )}
                    {record.duplicateCount != null && record.duplicateCount > 0 && (
                        <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/10 px-1.5 py-0.5 rounded">
                            {record.duplicateCount} dupes
                        </span>
                    )}
                </div>
            </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
            <button
                onClick={() => record.fileUrl && window.open(record.fileUrl, '_blank')}
                disabled={!record.fileUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all border border-zinc-700 hover:border-zinc-600 disabled:opacity-40"
            >
                <Download className="h-3 w-3" /> Original File
            </button>
            {record.categoryResultsUrl && (
                <button
                    onClick={() => window.open(record.categoryResultsUrl, '_blank')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-bold transition-all border border-emerald-500/30"
                >
                    <Download className="h-3 w-3" /> Processed Data (JSON)
                </button>
            )}
        </div>
    </div>
);

const ExportRow: React.FC<{ record: ExportRecord }> = ({ record }) => (
    <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all gap-4">
        <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center shrink-0">
                <Download className="h-4 w-4 text-blue-400" />
            </div>
            <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-200 truncate max-w-[200px]">{record.fileName}</p>
                <span className="text-[10px] text-zinc-500 font-medium">{fmtDate(record.exportedAt)}</span>
            </div>
        </div>
        <button
            onClick={() => record.fileUrl && window.open(record.fileUrl, '_blank')}
            disabled={!record.fileUrl}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all border border-zinc-700 hover:border-zinc-600 disabled:opacity-40 shrink-0"
        >
            <Download className="h-3 w-3" /> Download Export
        </button>
    </div>
);

// ─── Main Component ───────────────────────────────────────────────────────────

const ClientFilesPanel: React.FC = () => {
    const { role } = useAuth();
    const { isViewingClient, viewingClient } = useAdminView();
    const uidToQuery = useEffectiveUid();

    const [uploads, setUploads] = useState<UploadRecord[]>([]);
    const [exports, setExports] = useState<ExportRecord[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!uidToQuery) return;

        const uploadsQuery = query(
            collection(db, 'uploads'),
            where('userId', '==', uidToQuery)
        );

        const exportsQuery = query(
            collection(db, 'exports'),
            where('userId', '==', uidToQuery)
        );

        const unsubUploads = onSnapshot(uploadsQuery, (snap) => {
            const uDocs = snap.docs.map(doc => ({
                id: doc.id,
                fileName: doc.data().fileName || 'Unnamed File',
                uploadedAt: doc.data().uploadedAt,
                rowCount: doc.data().rowCount,
                totalSpend: doc.data().totalSpend,
                savingsPotentialMin: doc.data().savingsPotentialMin,
                savingsPotentialMax: doc.data().savingsPotentialMax,
                duplicateCount: doc.data().duplicateCount,
                fileUrl: doc.data().fileUrl,
                fileSizeMB: doc.data().fileSizeMB,
                categoryResultsUrl: doc.data().analysis?.categoryResultsUrl,
            }));
            // Client-side sort safely avoids Firestore composite index missing crashes
            uDocs.sort((a, b) => {
                const tA = a.uploadedAt?.toMillis ? a.uploadedAt.toMillis() : new Date(a.uploadedAt || 0).getTime();
                const tB = b.uploadedAt?.toMillis ? b.uploadedAt.toMillis() : new Date(b.uploadedAt || 0).getTime();
                return tB - tA;
            });
            setUploads(uDocs);
            setLoading(false);
        }, (err) => {
            console.error('[ClientFilesPanel] uploads listener error:', err);
            setLoading(false);
        });

        const unsubExports = onSnapshot(exportsQuery, (snap) => {
            const eDocs = snap.docs.map(doc => ({
                id: doc.id,
                fileName: doc.data().fileName || 'Exported File',
                exportedAt: doc.data().exportedAt,
                fileUrl: doc.data().fileUrl,
            }));
            eDocs.sort((a, b) => {
                const tA = a.exportedAt?.toMillis ? a.exportedAt.toMillis() : new Date(a.exportedAt || 0).getTime();
                const tB = b.exportedAt?.toMillis ? b.exportedAt.toMillis() : new Date(b.exportedAt || 0).getTime();
                return tB - tA;
            });
            setExports(eDocs);
            setLoading(false);
        }, (err) => {
            console.error('[ClientFilesPanel] exports listener error:', err);
            setLoading(false);
        });

        return () => {
            unsubUploads();
            unsubExports();
        };
    }, [uidToQuery]);

    // Trial users are not permitted to see/download original raw inputs/outputs to prevent abuse
    if (role === 'trial') return null;

    // Safety check map
    if (!uidToQuery) return null;

    const SKELETON_COUNT = 3;
    const isImpersonating = isViewingClient && viewingClient;

    return (
        <div className="mt-8 space-y-8">
            <div className="border-t border-zinc-800 pt-8">
                <h2 className="text-lg font-black text-zinc-200 mb-1">
                    {isImpersonating ? (
                        <>Client Files — <span className="text-primary">{viewingClient.displayName}</span></>
                    ) : (
                        <>Your Uploaded Data & Exports</>
                    )}
                </h2>
                <p className="text-zinc-500 text-xs mb-6 font-medium">
                    {isImpersonating ? 'Read-only. No changes can be made in admin view mode.' : 'Access your historical raw data inputs and processed output files.'}
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Section A: Input Files (Uploads) */}
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">
                            Input Files (Uploads)
                        </h3>
                        <div className="space-y-2">
                            {loading
                                ? Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonRow key={i} />)
                                : uploads.length === 0
                                    ? <EmptyState label="No files uploaded yet." />
                                    : uploads.map(u => <UploadRow key={u.id} record={u} />)
                            }
                        </div>
                    </div>

                    {/* Section B: Output Files (Exports) */}
                    <div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">
                            Output Files (Exports)
                        </h3>
                        <div className="space-y-2">
                            {loading
                                ? Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonRow key={i} />)
                                : exports.length === 0
                                    ? <EmptyState label="No exported files yet." />
                                    : exports.map(e => <ExportRow key={e.id} record={e} />)
                            }
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ClientFilesPanel;
