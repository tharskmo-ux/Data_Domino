import React, { useState } from 'react';
import { X, User, ShieldCheck, LogOut, Building2, Bell } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { HARSHAD_ADMIN_EMAIL } from '../../lib/constants';
import { useSubscription } from '../subscription/SubscriptionContext';

interface GlobalSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const GlobalSettingsModal: React.FC<GlobalSettingsModalProps> = ({ isOpen, onClose }) => {
    const { user, isDemo } = useAuth();
    const { organization } = useSubscription();
    const [activeTab, setActiveTab] = useState<'profile' | 'notifications'>('profile');

    if (!isOpen) return null;

    const handleSignOut = () => {
        if (isDemo) {
            window.location.href = '/login';
            return;
        }
        signOut(auth);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

            <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col md:flex-row h-[500px]">

                {/* Sidebar */}
                <div className="w-full md:w-64 bg-zinc-950/50 border-r border-zinc-800 p-6 flex flex-col">
                    <h2 className="text-xl font-bold text-white mb-6">Settings</h2>
                    <nav className="space-y-2 flex-1">
                        <button
                            onClick={() => setActiveTab('profile')}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-medium ${activeTab === 'profile' ? 'bg-primary/10 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                        >
                            <User className="h-4 w-4" /> Profile
                        </button>
                        <button
                            onClick={() => setActiveTab('notifications')}
                            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-medium ${activeTab === 'notifications' ? 'bg-primary/10 text-white' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900'}`}
                        >
                            <Bell className="h-4 w-4" /> Notifications
                        </button>
                    </nav>

                    <div className="pt-6 border-t border-zinc-800">
                        <button
                            onClick={handleSignOut}
                            className="w-full flex items-center gap-3 p-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all text-sm font-medium"
                        >
                            <LogOut className="h-4 w-4" /> Sign Out
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-8 overflow-y-auto">
                    <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-zinc-800 rounded-full text-zinc-500 hover:text-white transition-colors">
                        <X className="h-5 w-5" />
                    </button>

                    {activeTab === 'profile' && (
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Profile Information</h3>
                                <p className="text-sm text-zinc-500">Manage your account details.</p>
                            </div>

                            <div className="flex items-center gap-4 p-4 bg-zinc-800/50 rounded-2xl border border-zinc-800">
                                <div className="w-16 h-16 bg-gradient-to-br from-primary to-emerald-600 rounded-full flex items-center justify-center text-2xl font-bold text-white">
                                    {user?.displayName?.[0] || 'U'}
                                </div>
                                <div>
                                    <div className="font-bold text-white text-lg">{user?.displayName || 'Demo User'}</div>
                                    <div className="text-zinc-500">{user?.email || 'demo@example.com'}</div>
                                </div>
                            </div>

                            {/* Admin Section */}
                            {(user?.email === HARSHAD_ADMIN_EMAIL || isDemo) && (
                                <div className="p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl space-y-4">
                                    <div className="flex items-center gap-3 text-amber-500">
                                        <ShieldCheck className="h-6 w-6" />
                                        <h4 className="font-bold">Super Admin Access</h4>
                                    </div>
                                    <p className="text-sm text-zinc-400">
                                        You have super admin privileges. Access the global administration dashboard to manage organizations and subscriptions.
                                    </p>
                                    <a
                                        href="/admin"
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-amber-500/20 text-sm"
                                    >
                                        Open Admin Dashboard
                                    </a>
                                </div>
                            )}

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-zinc-400">Organization</label>
                                <div className="flex items-center gap-3 p-3 bg-zinc-950 border border-zinc-800 rounded-xl text-zinc-300">
                                    <Building2 className="h-4 w-4 text-zinc-500" />
                                    <span>{organization?.companyName || organization?.adminEmail?.split('@')[1] || 'Workspace'}</span>
                                    <span className="ml-auto text-xs font-bold px-2 py-0.5 bg-zinc-800 rounded text-zinc-500 uppercase">
                                        {organization?.subscription.type || 'FREE'} TIER
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'notifications' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-white mb-1">Notifications</h3>
                                <p className="text-sm text-zinc-500">Manage how you receive updates.</p>
                            </div>
                            <div className="p-8 text-center text-zinc-500 bg-zinc-950/50 rounded-2xl border border-zinc-800 border-dashed">
                                <Bell className="h-8 w-8 mx-auto mb-3 opacity-20" />
                                <p>No notification preferences available yet.</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GlobalSettingsModal;
