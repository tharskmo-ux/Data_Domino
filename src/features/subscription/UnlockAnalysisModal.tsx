import React from 'react';
import { X, Crown, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UnlockAnalysisModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const UnlockAnalysisModal: React.FC<UnlockAnalysisModalProps> = ({ isOpen, onClose }) => {
    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="relative w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-3xl shadow-2xl overflow-hidden"
                    >
                        {/* Gold Glow Effect */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-amber-500/20 rounded-full blur-[50px] pointer-events-none" />

                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors z-10"
                        >
                            <X className="h-5 w-5" />
                        </button>

                        <div className="p-8 flex flex-col items-center text-center relative z-0">
                            <div className="w-16 h-16 bg-zinc-900 rounded-2xl border border-zinc-800 flex items-center justify-center mb-6 shadow-xl shadow-amber-900/10">
                                <Crown className="h-8 w-8 text-amber-500" />
                            </div>

                            <h2 className="text-2xl font-bold text-white mb-3 tracking-tight">
                                Unlock Expert Analysis
                            </h2>

                            <p className="text-zinc-400 mb-8 leading-relaxed">
                                Unlock this analysis by scheduling a 15-min expert walkthrough. Our team will decrypt these savings for you.
                            </p>

                            <a
                                href="https://www.enalsys.com/contact"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="w-full block text-center py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-2xl shadow-lg shadow-amber-900/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                            >
                                Upgrade to Enterprise
                            </a>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default UnlockAnalysisModal;
