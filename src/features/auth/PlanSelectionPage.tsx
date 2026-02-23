import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Zap, Shield, Activity, FileText, Users, ArrowRight, Loader2, Star, LogOut, LayoutDashboard } from 'lucide-react';
import { useAuth } from './AuthContext';
import { useSubscription } from '../subscription/SubscriptionContext';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc, setDoc, Timestamp } from 'firebase/firestore';
import { useEffectiveUid } from '../../hooks/useEffectiveUid';
import { ENALSYS_BOOKING_URL } from '../../lib/constants';
import { motion } from 'framer-motion';
import { useEffect } from 'react';

const PlanSelectionPage: React.FC = () => {
    const { user, isDemo, planSelected } = useAuth();
    const effectiveUid = useEffectiveUid();
    const { loading: subLoading, isSuspended } = useSubscription();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            console.error('Logout error:', error);
        }
    };

    // Reactive redirect: Move to dashboard as soon as planSelected is synced and confirmed active
    useEffect(() => {
        // We only redirect if plan is selected AND subscription is loaded AND NOT suspended
        if (planSelected && !subLoading && !isSuspended) {
            // Redirect handled by PlanSelectionRoute usually, but defensive check
            navigate('/');
        }
    }, [planSelected, subLoading, isSuspended, navigate]);

    const isExhausted = planSelected && !subLoading && isSuspended;

    // showNavButtons if: 
    // 1. User hasn't selected a plan (Onboarding)
    // 2. Plan selected but trial exhausted (Post-onboarding restricted)
    // 3. Demo mode (for testing visibility)
    const showNavButtons = (!planSelected || isExhausted || isDemo);

    const handleStartTrial = async () => {
        if (isDemo || !effectiveUid) return;
        setLoading(true);
        setError(null);
        try {
            const roleRef = doc(db, 'user_roles', effectiveUid);
            const roleSnap = await getDoc(roleRef);

            if (roleSnap.exists()) {
                // UPDATE: Comply with 'affectedKeys().hasOnly(["planSelected"])'
                await updateDoc(roleRef, {
                    planSelected: true
                });
            } else {
                // HIGH-01 FIX: While the client passes `role: 'trial'` here, this is safely 
                // mitigated by Firestore Security Rules which enforce `request.resource.data.role == 'trial'`
                // on create. Any client tampering to 'admin' or 'enterprise' will be rejected by the server.
                await setDoc(roleRef, {
                    role: 'trial',
                    planSelected: true,
                    email: user?.email,
                    displayName: user?.displayName || user?.email?.split('@')[0] || 'User',
                    createdAt: Timestamp.now()
                });
            }

            // DO NOT navigate manually here. 
            // The useEffect above will handle it once AuthContext syncs.
        } catch (error: any) {
            console.error('Trial activation error:', error);
            setError(`Activation failed: ${error.message || 'Permission Denied'}`);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectEnterprise = () => {
        window.open(ENALSYS_BOOKING_URL, '_blank');
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-500/5 blur-[120px] rounded-full pointer-events-none" />

            {/* Navigation Header */}
            {showNavButtons && (
                <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-50">
                    <button
                        onClick={handleLogout}
                        className="flex items-center gap-2 px-4 py-2 text-zinc-500 hover:text-white font-bold text-[10px] uppercase tracking-[0.2em] transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Logout
                    </button>

                    {planSelected && (
                        <button
                            onClick={() => navigate('/')}
                            className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700/50 rounded-xl text-white font-bold text-[10px] uppercase tracking-[0.2em] transition-all"
                        >
                            <LayoutDashboard className="w-4 h-4" /> Go to Dashboard
                        </button>
                    )}
                </div>
            )}

            <div className="max-w-6xl w-full relative z-10 flex flex-col items-center">
                <div className="mb-12 text-center">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="text-4xl md:text-5xl font-black mb-4 tracking-tighter"
                    >
                        Activate Your Intelligence <span className="text-glow-primary text-primary">Engine</span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="text-zinc-400 text-lg max-w-2xl mx-auto font-medium"
                    >
                        Welcome to Data Domino. Select a plan to begin decrypting your procurement spend and unlocking hidden ROI.
                    </motion.p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-5xl">
                    {/* Trial Card */}
                    <motion.div
                        initial={{ opacity: 0, x: -30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.3 }}
                        className="group bg-zinc-900/40 border border-zinc-800 rounded-[2.5rem] p-8 md:p-10 flex flex-col hover:border-zinc-700 transition-all duration-500 relative overflow-hidden h-full"
                    >
                        <div className="mb-8">
                            <h2 className="text-2xl font-black mb-1">Free Trial</h2>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-white">₹0</span>
                                <span className="text-zinc-500 font-bold uppercase tracking-widest text-[10px]">/ month</span>
                            </div>
                        </div>

                        <ul className="space-y-4 mb-10 flex-1">
                            {[
                                "Upload and process 1 procurement file",
                                "Basic vendor normalisation",
                                "ABC / Pareto classification",
                                "Basic spend analytics",
                                "Savings & ROI preview (blurred)",
                                "1 project only"
                            ].map((feature, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-zinc-400 font-medium">
                                    <div className="mt-1 w-4 h-4 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-700">
                                        <Check className="w-2.5 h-2.5 text-zinc-500" />
                                    </div>
                                    {feature}
                                </li>
                            ))}
                        </ul>

                        <button
                            onClick={handleStartTrial}
                            disabled={loading}
                            className="w-full flex items-center justify-center gap-2 px-8 py-5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-emerald-600/10 active:scale-[0.98] uppercase tracking-widest disabled:opacity-50"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Start Free Trial <ArrowRight className="w-5 h-5" /></>}
                        </button>
                        <p className="text-center mt-4 text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-loose">
                            No credit card required
                        </p>
                        {error && (
                            <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                                <p className="text-center text-[10px] text-red-500 font-bold uppercase tracking-widest leading-normal">
                                    {error}
                                </p>
                            </div>
                        )}
                    </motion.div>

                    {/* Enterprise Card */}
                    <motion.div
                        initial={{ opacity: 0, x: 30 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.4 }}
                        className="group bg-zinc-900/60 border-2 border-primary/30 rounded-[2.5rem] p-8 md:p-10 flex flex-col hover:border-primary/50 transition-all duration-500 relative overflow-hidden h-full shadow-[0_0_50px_-12px_rgba(20,184,166,0.15)]"
                    >
                        {/* Popular Badge */}
                        <div className="absolute top-6 right-6">
                            <div className="flex items-center gap-1.5 px-3 py-1 bg-primary text-white text-[10px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-primary/20 animate-pulse">
                                <Star className="w-3 h-3 fill-current" />
                                Most Popular
                            </div>
                        </div>

                        <div className="mb-8">
                            <h2 className="text-2xl font-black mb-1">Enterprise</h2>
                            <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-black text-white">Custom Pricing</span>
                            </div>
                        </div>

                        <div className="mb-6 p-4 rounded-2xl bg-primary/5 border border-primary/10">
                            <p className="text-primary text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                                <Activity className="w-3 h-3" />
                                Everything in Trial plus:
                            </p>
                            <ul className="grid grid-cols-1 gap-3">
                                {[
                                    { label: "Unlimited projects", icon: Shield },
                                    { label: "Full Savings & ROI analysis", icon: Activity },
                                    { label: "Contract status flagging", icon: FileText },
                                    { label: "Duplicate invoice detection", icon: Shield },
                                    { label: "Payment terms risk analysis", icon: Activity },
                                    { label: "Full Excel export", icon: FileText },
                                    { label: "Team management", icon: Users },
                                    { label: "Priority support", icon: Zap }
                                ].map((feature, i) => (
                                    <li key={i} className="flex items-center gap-2 text-[11px] text-white font-bold uppercase tracking-tight">
                                        <feature.icon className="w-3 h-3 text-primary shrink-0" />
                                        {feature.label}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <button
                            onClick={handleSelectEnterprise}
                            className="w-full flex items-center justify-center gap-2 px-8 py-5 bg-primary hover:bg-teal-500 text-white font-black rounded-2xl transition-all shadow-xl shadow-primary/20 active:scale-[0.98] uppercase tracking-widest"
                        >
                            Talk to Enalsys <ArrowRight className="w-5 h-5" />
                        </button>
                        <p className="text-center mt-4 text-[10px] text-zinc-500 font-bold uppercase tracking-widest leading-loose">
                            Account setup within 24 hours
                        </p>
                    </motion.div>
                </div>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="mt-16 text-zinc-600 font-bold text-[10px] uppercase tracking-[0.2em]"
                >
                    &copy; {new Date().getFullYear()} ENALSYS PRIVATE LIMITED
                </motion.p>
            </div>
        </div>
    );
};

export default PlanSelectionPage;
