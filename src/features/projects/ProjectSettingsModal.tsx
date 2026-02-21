import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import type { Project } from './ProjectContext';

interface ProjectSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project;
    onUpdate: (id: string, updates: Partial<Project>) => void;
    onDelete: (id: string) => void;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = ({ isOpen, onClose, project, onUpdate, onDelete }) => {
    const [name, setName] = useState(project.name);
    const [currency, setCurrency] = useState(project.currency || 'INR');
    const [loading, setLoading] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setName(project.name);
            setCurrency(project.currency || 'INR');
            setShowDeleteConfirm(false);
        }
    }, [isOpen, project]);

    if (!isOpen) return null;

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        // Simulate API
        await new Promise(r => setTimeout(r, 500));
        onUpdate(project.id, { name, currency });
        setLoading(false);
        onClose();
    };

    const handleDelete = () => {
        onDelete(project.id);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-zinc-800">
                    <h2 className="text-xl font-bold text-white">Project Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <form onSubmit={handleSave}>
                    <div className="p-8 space-y-6">
                        {/* Project Name */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-400">Project Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                                required
                            />
                        </div>

                        {/* Currency Selector */}
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-zinc-400">Currency</label>
                            <select
                                value={currency}
                                onChange={(e) => setCurrency(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all appearance-none"
                            >
                                <option value="USD">USD ($)</option>
                                <option value="INR">INR (₹)</option>
                                <option value="EUR">EUR (€)</option>
                                <option value="GBP">GBP (£)</option>
                                <option value="JPY">JPY (¥)</option>
                                <option value="AUD">AUD ($)</option>
                                <option value="CAD">CAD ($)</option>
                                <option value="SGD">SGD ($)</option>
                            </select>
                        </div>

                        {/* Danger Zone */}
                        <div className="pt-6 border-t border-zinc-800">
                            <h3 className="text-red-500 font-bold text-sm mb-2">Danger Zone</h3>
                            {!showDeleteConfirm ? (
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="w-full flex items-center justify-center gap-2 p-3 border border-red-900/50 bg-red-900/10 text-red-500 rounded-xl hover:bg-red-900/20 transition-all font-medium"
                                >
                                    <Trash2 className="h-4 w-4" />
                                    Delete Project
                                </button>
                            ) : (
                                <div className="space-y-3 bg-red-900/10 p-4 rounded-xl border border-red-900/30">
                                    <div className="flex items-center gap-2 text-red-500">
                                        <AlertTriangle className="h-5 w-5" />
                                        <span className="font-bold text-sm">Are you sure?</span>
                                    </div>
                                    <p className="text-xs text-red-400">This action cannot be undone. All data and analysis will be lost.</p>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowDeleteConfirm(false)}
                                            className="flex-1 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleDelete}
                                            className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold"
                                        >
                                            Confirm Delete
                                        </button>
                                    </div>
                                </div>
                            )}
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
                            disabled={loading}
                            className="px-8 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                        >
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Save Changes</>}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ProjectSettingsModal;
