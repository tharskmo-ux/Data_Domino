import React from 'react';
import { X, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ENALSYS_BOOKING_URL, ENALSYS_EMAIL } from '../../lib/constants';

interface UpgradeModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    description?: React.ReactNode;
}

const UpgradeModal: React.FC<UpgradeModalProps> = ({
    isOpen,
    onClose,
    title = "Premium Feature",
    description = "Exporting detailed reports and executive summaries is available exclusively on the Enterprise Plan."
}) => {
    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    onClick={onClose}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className="relative w-full max-w-md bg-zinc-950 border border-zinc-800 rounded-3xl p-8 overflow-hidden"
                >
                    {/* Background Glow */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] -translate-y-1/2 translate-x-1/2" />

                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors z-10"
                    >
                        <X className="h-5 w-5" />
                    </button>

                    <div className="relative z-10 flex flex-col items-center text-center">
                        <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center justify-center mb-6">
                            <Crown className="h-8 w-8 text-amber-500" />
                        </div>

                        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
                        <div className="text-zinc-400 text-sm mb-8 leading-relaxed">
                            {description || "Ready to unlock full access? Book a call or email us to upgrade to the Enterprise Plan."}
                        </div>



                        <button
                            onClick={() => window.open(ENALSYS_BOOKING_URL, '_blank')}
                            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-black font-bold rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-amber-500/20 mb-3"
                        >
                            Book a Call with Enalsys
                        </button>

                        <a
                            href={`mailto:${ENALSYS_EMAIL}`}
                            className="text-zinc-500 hover:text-white text-sm font-medium transition-colors"
                        >
                            Email us at {ENALSYS_EMAIL}
                        </a>


                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default UpgradeModal;
