import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowRight, Loader2, CheckCircle2, ChevronLeft } from 'lucide-react';
import { useAuth } from './AuthContext';
import AuthLayout from './AuthLayout';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [loading, setLoading] = useState(false);
    const { forgotPassword } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            await forgotPassword(email);
            setSuccess(true);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to send reset email. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <AuthLayout
                title="Check your inbox"
                subtitle={`We've sent a password reset link to ${email}`}
            >
                <div className="space-y-6 text-center">
                    <div className="flex justify-center">
                        <div className="w-20 h-20 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center animate-in zoom-in duration-500">
                            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                        </div>
                    </div>

                    <p className="text-zinc-500 text-sm leading-relaxed">
                        If an account exists for this email, you will receive instructions to reset your password shortly.
                    </p>

                    <Link
                        to="/login"
                        className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-zinc-800"
                    >
                        Return to Sign In
                    </Link>
                </div>
            </AuthLayout>
        );
    }

    return (
        <AuthLayout
            title="Forgot password?"
            subtitle="Enter your email address and we'll send you instructions to reset your password."
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                    <div className="p-3 text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-lg">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400 ml-1">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3.5 h-5 w-5 text-zinc-500" />
                        <input
                            type="email"
                            placeholder="you@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            required
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6 shadow-lg shadow-primary/20 hover:shadow-primary/30 active:scale-[0.98]"
                >
                    {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <>
                            Send Reset Link <ArrowRight className="h-5 w-5" />
                        </>
                    )}
                </button>

                <div className="pt-4 flex justify-center">
                    <Link
                        to="/login"
                        className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-white transition-colors"
                    >
                        <ChevronLeft className="h-4 w-4" /> Back to Sign In
                    </Link>
                </div>
            </form>
        </AuthLayout>
    );
};

export default ForgotPasswordPage;
