import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { HARSHAD_ADMIN_EMAIL } from '../../lib/constants';
import AuthLayout from './AuthLayout';
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react';
import { useAuth } from './AuthContext';

const LoginPage = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();
    const { isDemo } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        if (isDemo) {
            // Mock login delay
            setTimeout(() => {
                // UPDATE DEMO ROLE BASED ON EMAIL INPUT
                const role = email === HARSHAD_ADMIN_EMAIL ? 'admin' : 'user';
                localStorage.setItem('demo_role', role);

                // Force reload to pick up new AuthContext state
                window.location.href = '/';
            }, 800);
            return;
        }

        try {
            await signInWithEmailAndPassword(auth, email, password);
            navigate('/');
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to login. Please check your credentials.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <AuthLayout
            title="Welcome back!"
            subtitle="Sign in to your account to manage your procurement data."
        >
            <form onSubmit={handleLogin} className="space-y-4">
                {error && (
                    <div className="p-3 text-sm bg-destructive/10 border border-destructive/20 text-destructive rounded-lg">
                        {error}
                    </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium text-zinc-400 ml-1">Email Address</label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-3 h-5 w-5 text-zinc-500" />
                        <input
                            type="email"
                            placeholder="you@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            required
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex justify-between items-center ml-1">
                        <label className="text-sm font-medium text-zinc-400">Password</label>
                        <Link to="/forgot-password" title="title:Forgot password?" className="text-xs text-primary hover:underline">Forgot password?</Link>
                    </div>
                    <div className="relative">
                        <Lock className="absolute left-3 top-3 h-5 w-5 text-zinc-500" />
                        <input
                            type="password"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2.5 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
                            required
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6 shadow-lg shadow-primary/20"
                >
                    {loading ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                        <>
                            Sign In <ArrowRight className="h-5 w-5" />
                        </>
                    )}
                </button>

                <p className="text-center text-sm text-zinc-500 mt-6">
                    Don't have an account?{' '}
                    <Link to="/signup" className="text-primary font-medium hover:underline">
                        Create an account
                    </Link>
                </p>

                {import.meta.env.DEV && (
                    <div className="mt-8 pt-8 border-t border-zinc-800 text-center">
                        <button
                            type="button"
                            onClick={() => navigate('/')}
                            className="text-xs text-zinc-600 hover:text-primary transition-colors uppercase tracking-widest font-bold"
                        >
                            Developer Bypass (Go to Dashboard)
                        </button>
                        <p className="text-[10px] text-zinc-700 mt-2">
                            Demo Mode Status: <span className={isDemo ? "text-green-900" : "text-red-900"}>{isDemo ? "Active" : "Inactive"}</span>
                        </p>
                    </div>
                )}
            </form>
        </AuthLayout>
    );
};

export default LoginPage;
