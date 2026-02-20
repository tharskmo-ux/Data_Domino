import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../../lib/firebase';
import { useAdminView } from './AdminViewContext';
import { useAuth } from '../auth/AuthContext';
import { Download, FileText, FolderOpen, Loader2 } from 'lucide-react';

interface ClientFile {
    id: string;
    filename: string;
    date: string;
    size?: number;
    storagePath?: string;
}

const FileRow: React.FC<{ file: ClientFile }> = ({ file }) => {
    const [downloading, setDownloading] = useState(false);

    const handleDownload = async () => {
        if (!file.storagePath || !storage) return;
        try {
            setDownloading(true);
            const url = await getDownloadURL(ref(storage, file.storagePath));
            window.open(url, '_blank');
        } catch (e) {
            console.error('Download failed', e);
        } finally {
            setDownloading(false);
        }
    };

    return (
        <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-zinc-400" />
                </div>
                <div>
                    <p className="text-sm font-bold text-zinc-200 truncate max-w-xs">{file.filename}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-zinc-500 font-medium">{file.date}</span>
                        {file.size && (
                            <span className="text-[10px] text-zinc-600">{(file.size / 1024).toFixed(1)} KB</span>
                        )}
                    </div>
                </div>
            </div>
            {file.storagePath && (
                <button
                    onClick={handleDownload}
                    disabled={downloading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-bold transition-all border border-zinc-700 hover:border-zinc-600 disabled:opacity-50"
                >
                    {downloading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    Download
                </button>
            )}
        </div>
    );
};

const EmptyState: React.FC<{ label: string }> = ({ label }) => (
    <div className="p-8 text-center bg-zinc-900/30 border border-zinc-800 rounded-xl">
        <FolderOpen className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
        <p className="text-zinc-500 text-sm font-medium">{label}</p>
    </div>
);

const ClientFilesPanel: React.FC = () => {
    const { isAdmin } = useAuth();
    const { isViewingClient, viewingClient } = useAdminView();
    const [uploads, setUploads] = useState<ClientFile[]>([]);
    const [exports, setExports] = useState<ClientFile[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Safety: only load when admin is actively viewing a client
        if (!isAdmin || !isViewingClient || !viewingClient) return;

        const fetchFiles = async () => {
            setLoading(true);
            try {
                // Section A: Input files (uploads)
                const uploadsQuery = query(
                    collection(db, 'uploads'),
                    where('userId', '==', viewingClient.uid)
                );
                const uploadsSnap = await getDocs(uploadsQuery);
                setUploads(uploadsSnap.docs.map(d => ({
                    id: d.id,
                    filename: d.data().filename || d.data().name || 'Unnamed File',
                    date: d.data().uploadedAt?.toDate?.().toLocaleDateString() ||
                        d.data().createdAt?.toDate?.().toLocaleDateString() || '—',
                    size: d.data().size,
                    storagePath: d.data().storagePath,
                })));

                // Section B: Output files (exports)
                const exportsQuery = query(
                    collection(db, 'exports'),
                    where('userId', '==', viewingClient.uid)
                );
                const exportsSnap = await getDocs(exportsQuery);
                setExports(exportsSnap.docs.map(d => ({
                    id: d.id,
                    filename: d.data().filename || d.data().name || 'Exported File',
                    date: d.data().exportedAt?.toDate?.().toLocaleDateString() ||
                        d.data().createdAt?.toDate?.().toLocaleDateString() || '—',
                    storagePath: d.data().storagePath,
                })));
            } catch (e) {
                console.error('ClientFilesPanel: fetch error', e);
            } finally {
                setLoading(false);
            }
        };

        fetchFiles();
    }, [isAdmin, isViewingClient, viewingClient]);

    // Never render for non-admins or when not in client view
    if (!isAdmin || !isViewingClient) return null;

    return (
        <div className="mt-8 space-y-8">
            <div className="border-t border-zinc-800 pt-8">
                <h2 className="text-lg font-black text-zinc-200 mb-1">
                    Client Files — <span className="text-primary">{viewingClient?.displayName}</span>
                </h2>
                <p className="text-zinc-500 text-xs mb-6 font-medium">Read-only. No changes can be made in admin view mode.</p>

                {loading ? (
                    <div className="flex items-center gap-3 text-zinc-500 py-8">
                        <Loader2 className="h-5 w-5 animate-spin" />
                        <span className="text-sm font-medium">Fetching client files...</span>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Section A: Input Files */}
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">
                                Input Files (Uploads)
                            </h3>
                            <div className="space-y-2">
                                {uploads.length === 0
                                    ? <EmptyState label="No files uploaded yet." />
                                    : uploads.map(f => <FileRow key={f.id} file={f} />)
                                }
                            </div>
                        </div>

                        {/* Section B: Output Files */}
                        <div>
                            <h3 className="text-xs font-black uppercase tracking-widest text-zinc-500 mb-3">
                                Output Files (Exports)
                            </h3>
                            <div className="space-y-2">
                                {exports.length === 0
                                    ? <EmptyState label="No exported files yet." />
                                    : exports.map(f => <FileRow key={f.id} file={f} />)
                                }
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClientFilesPanel;
