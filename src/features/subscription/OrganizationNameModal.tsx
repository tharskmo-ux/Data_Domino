import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Building2, ArrowRight, Loader2 } from 'lucide-react';
import { useSubscription } from './SubscriptionContext';

interface OrganizationNameModalProps {
    isOpen: boolean;
}

const OrganizationNameModal: React.FC<OrganizationNameModalProps> = ({ isOpen }) => {
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);
    const { updateCompanyName } = useSubscription();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);
        try {
            await updateCompanyName(name.trim());
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="absolute inset-0 bg-black/90 backdrop-blur-md"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="relative w-full max-w-lg bg-zinc-950 border border-zinc-900 rounded-[2.5rem] shadow-2xl overflow-hidden p-10"
                    >
                        {/* Accent Glow */}
                        <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2" />

                        <div className="relative z-10">
                            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-8 border border-primary/20">
                                <Building2 className="h-8 w-8 text-primary" />
                            </div>

                            <h2 className="text-3xl font-black text-white mb-3 tracking-tight">
                                Welcome to Data Domino
                            </h2>
                            <p className="text-zinc-400 mb-10 text-lg leading-relaxed">
                                To personalise your experience, please enter your organisation name.
                            </p>

                            <form onSubmit={handleSubmit} className="space-y-6">
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em] ml-1">
                                        Organisation Name
                                    </label>
                                    <input
                                        autoFocus
                                        type="text"
                                        placeholder="e.g. Tata Motors, Reliance Industries"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl py-4 px-6 text-white text-lg focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all placeholder:text-zinc-700"
                                        required
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || !name.trim()}
                                    className="w-full bg-primary hover:bg-teal-400 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed shadow-2xl shadow-primary/20 group"
                                >
                                    {loading ? (
                                        <Loader2 className="h-6 w-6 animate-spin text-white" />
                                    ) : (
                                        <>
                                            Continue <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                                        </>
                                    )}
                                </button>
                            </form>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default OrganizationNameModal;
