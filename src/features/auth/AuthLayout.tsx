import React from 'react';
import { IS_DEMO_MODE } from '../../lib/firebase';

const AuthLayout: React.FC<{ children: React.ReactNode, title: string, subtitle: string }> = ({ children, title, subtitle }) => {
    return (
        <div className="min-h-screen flex bg-background text-foreground dark">
            {/* Brand Side */}
            <div className="hidden lg:flex lg:w-1/2 bg-zinc-900 border-r border-zinc-800 flex-col justify-between p-12 relative overflow-hidden">
                <div className="relative z-10">
                    <div className="flex items-center gap-2 mb-12">
                        <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-xl">D</span>
                        </div>
                        <span className="text-2xl font-bold tracking-tight">Data Domino</span>
                    </div>

                    <h1 className="text-5xl font-bold leading-tight mb-6">
                        Procurement Analytics <br />
                        <span className="text-primary">Automated.</span>
                    </h1>
                    <p className="text-zinc-400 text-xl max-w-md">
                        Transform raw spend data into analysis-ready datasets in minutes, not days.
                    </p>
                </div>

                <div className="relative z-10">
                    <blockquote className="border-l-2 border-primary pl-6 py-2">
                        <p className="text-lg italic text-zinc-300">
                            "Reduced our data prep time from 5 days to just 2 hours. A game changer for SME procurement teams."
                        </p>
                        <footer className="mt-4 text-sm text-zinc-500">— S. Kumar, Finance Director</footer>
                    </blockquote>
                </div>

                {/* Decorative elements */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -mr-32 -mt-32"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -ml-32 -mb-32"></div>
            </div>

            {/* Form Side */}
            <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-6 lg:px-24">
                <div className="w-full max-w-md">
                    <div className="lg:hidden flex items-center gap-2 mb-8">
                        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                            <span className="text-white font-bold text-lg">D</span>
                        </div>
                        <span className="text-xl font-bold tracking-tight">Data Domino</span>
                    </div>

                    <h2 className="text-3xl font-bold mb-2">{title}</h2>
                    <p className="text-zinc-500 mb-8">{subtitle}</p>

                    {import.meta.env.DEV && IS_DEMO_MODE && (
                        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
                            <div className="mt-0.5 text-amber-500">
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-amber-200">Demo Mode Active</p>
                                <p className="text-xs text-amber-500/80 mt-1">
                                    Firebase is not configured. Using mock authentication for the preview. You can enter any email/password.
                                </p>
                            </div>
                        </div>
                    )}

                    {children}

                    <p className="mt-8 text-center text-sm text-zinc-500">
                        &copy; 2026 Data Domino. Built for Indian SMEs.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AuthLayout;
