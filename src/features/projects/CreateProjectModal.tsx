import React, { useState } from 'react';
import { X, Layout, FileText, Settings2, Sparkles, Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface CreateProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    // FIX 4: onCreate now returns Promise<void> so handleSubmit can await it before closing
    onCreate: (project: { name: string, description: string, template: string }) => Promise<void>;
    // FIX 8: Parent passes the resolved gate flag so we don't call checkTrialLimit inside the modal
    canCreate?: boolean;
}

import { useSubscription } from '../subscription/SubscriptionContext';
import { Lock } from 'lucide-react';
import { ENALSYS_EMAIL } from '../../lib/constants';

const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose, onCreate, canCreate }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [template, setTemplate] = useState('custom');
    const [loading, setLoading] = useState(false);

    // FIX 8: If the parent did not supply canCreate (backwards compat), fall back to
    // the subscription gate. This keeps old call-sites working without changes.
    const { checkAccess } = useSubscription();
    const canCreateProject = canCreate !== undefined ? canCreate : checkAccess('unlimited_projects');

    if (!isOpen) return null;

    // FIX 4: async handleSubmit — awaits the Firestore write + setCurrentProject before closing
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onCreate({ name, description, template });
        } finally {
            setLoading(false);
            onClose();
            // Reset form
            setName('');
            setDescription('');
            setTemplate('custom');
        }
    };

    if (!canCreateProject) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
                <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 text-center animate-in fade-in zoom-in duration-200">
                    <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                        <Lock className="h-8 w-8 text-amber-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Upgrade to Enterprise</h2>
                    <p className="text-zinc-400 mb-8">
                        You have reached the limit of 1 project on the Free tier. Upgrade to create unlimited projects and unlock advanced exports.
                    </p>
                    <div className="flex gap-4 justify-center">
                        <button onClick={onClose} className="px-6 py-2.5 rounded-xl font-bold text-zinc-400 hover:text-white transition-colors">
                            Cancel
                        </button>
                        <button onClick={() => alert(`Please contact sales at ${ENALSYS_EMAIL} to upgrade.`)} className="px-8 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20">
                            Contact to Upgrade
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                            <Sparkles className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-white">Create New Project</h2>
                            <p className="text-sm text-zinc-500">Set up a new workspace for your procurement data.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="p-8 space-y-6">
                        {/* Project Name */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-400">Project Name</label>
                            <input
                                autoFocus
                                type="text"
                                placeholder="e.g., Q1 Manufacturing Spend Analysis"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all text-lg"
                                required
                            />
                        </div>

                        {/* Project Description */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-400">Description (Optional)</label>
                            <textarea
                                placeholder="Briefly describe the objective of this project..."
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all min-h-[100px] resize-none"
                            />
                        </div>

                        {/* Template Selector */}
                        <div className="space-y-3">
                            <label className="text-sm font-medium text-zinc-400">System Template</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {[
                                    { id: 'sap', name: 'SAP ERP Export', icon: Layout },
                                    { id: 'tally', name: 'Tally / ERP 9', icon: FileText },
                                    { id: 'zoho', name: 'Zoho Books', icon: Settings2 },
                                    { id: 'custom', name: 'Custom CSV/Excel', icon: Sparkles },
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setTemplate(t.id)}
                                        className={cn(
                                            "flex items-center gap-3 p-4 rounded-xl border text-left transition-all",
                                            template === t.id
                                                ? "bg-primary/10 border-primary text-white"
                                                : "bg-zinc-950 border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
                                        )}
                                    >
                                        <t.icon className={cn("h-5 w-5", template === t.id ? "text-primary" : "text-zinc-600")} />
                                        <span className="font-medium">{t.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 bg-zinc-900/50 border-t border-zinc-800 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-2.5 rounded-xl font-bold text-zinc-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !name}
                            className="px-8 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                <>Create Project</>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateProjectModal;
