import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db } from '../../lib/firebase';
import {
    collection,
    getDocs,
    writeBatch,
    doc,
    Timestamp,
    setDoc
} from 'firebase/firestore';
import { Navigate, Link } from 'react-router-dom';
import {
    Search,
    ArrowLeft,
    Users,
    Zap,
    Shield,
    AlertCircle,
    CheckCircle2,
    XCircle,
    UserCircle2,
    Building2,
    Calendar,
    Mail,
    Info,
    Activity
} from 'lucide-react';
import { cn } from '../../lib/utils';

type AppRole = 'admin' | 'enterprise' | 'trial' | 'revoked';

interface JoinedUser {
    uid: string;
    email: string;
    displayName: string;
    orgName: string;
    joinedAt: Timestamp;
    role: AppRole;
    subType: 'FREE' | 'ENTERPRISE';
    subStatus: 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED';
}

const AdminDashboard = () => {
    const { user, isAdmin } = useAuth();
    const [users, setUsers] = useState<JoinedUser[]>([]);
    const [fetchLoading, setFetchLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{
        show: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
        isDestructive?: boolean;
    }>({ show: false, title: "", message: "", onConfirm: () => { } });

    const fetchData = async () => {
        try {
            const [rolesSnap, orgsSnap] = await Promise.all([
                getDocs(collection(db, "user_roles")),
                getDocs(collection(db, "organizations"))
            ]);

            const rolesData = rolesSnap.docs.map(d => ({ uid: d.id, ...d.data() } as any));
            const orgsData = orgsSnap.docs.reduce((acc, d) => {
                acc[d.id] = d.data();
                return acc;
            }, {} as any);

            const joined: JoinedUser[] = [];
            const batch = writeBatch(db);
            let hasDeletions = false;

            for (const roleDoc of rolesData) {
                const email = roleDoc.email || "";

                // Cleanup ghost accounts
                if (email === "admin@corp.com" || email === "trial-user@corp.com") {
                    batch.delete(doc(db, "user_roles", roleDoc.uid));
                    batch.delete(doc(db, "organizations", roleDoc.uid));
                    hasDeletions = true;
                    continue;
                }


                const org = orgsData[roleDoc.uid] || {};
                const fallbackName = email ? email.split('@')[0] : `User_${roleDoc.uid.substring(0, 5)}`;

                // Get domain name for Org fallback (e.g. Enalsys from enalsys.com)
                const domainPart = email.split('@')[1] || "";
                const domainNameRaw = domainPart.split('.')[0] || "";
                const fallbackOrg = domainNameRaw
                    ? domainNameRaw.charAt(0).toUpperCase() + domainNameRaw.slice(1)
                    : `Org_${roleDoc.uid.substring(0, 5)}`;

                // Detect generic names to override
                const currentOrgName = org.companyName || org.name || "";
                const isGeneric = !currentOrgName ||
                    currentOrgName === "User's Workspace" ||
                    currentOrgName.toLowerCase() === fallbackName.toLowerCase();

                joined.push({
                    uid: roleDoc.uid,
                    email: email || 'No Email Registered',
                    displayName: roleDoc.displayName || fallbackName,
                    orgName: isGeneric ? fallbackOrg : currentOrgName,
                    joinedAt: roleDoc.createdAt || org.createdAt || Timestamp.now(),
                    role: roleDoc.role as AppRole,
                    subType: org.subscription?.type || 'FREE',
                    subStatus: org.subscription?.status || 'ACTIVE'
                });
            }

            // NEW: Backfill/Bootstrap current user if data is missing
            if (user) {
                const currentUserRole = rolesData.find(r => r.uid === user.uid);
                if (!currentUserRole || !currentUserRole.email || !currentUserRole.displayName) {
                    const roleRef = doc(db, 'user_roles', user.uid);
                    await setDoc(roleRef, {
                        role: currentUserRole?.role || 'admin',
                        email: user.email,
                        displayName: user.displayName || user.email?.split('@')[0] || 'Admin',
                        createdAt: currentUserRole?.createdAt || Timestamp.now(),
                        planSelected: true
                    }, { merge: true });
                    fetchData(); // Refetch
                    return;
                }
            }

            if (hasDeletions) await batch.commit();
            setUsers(joined);
        } catch (error) {
            console.error("Fetch failed", error);
            showToast("Failed to fetch system data", "error");
        } finally {
            setFetchLoading(false);
        }
    };

    useEffect(() => {
        if (user && isAdmin) {
            fetchData();
        }
    }, [user, isAdmin]);

    const showToast = (message: string, type: 'success' | 'error') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3000);
    };

    const adminCount = useMemo(() => users.filter(u => u.role === 'admin').length, [users]);

    const stats = useMemo(() => ({
        total: users.length,
        admins: users.filter(u => u.role === 'admin').length,
        enterprise: users.filter(u => u.role === 'enterprise').length,
        trial: users.filter(u => u.role === 'trial').length,
        revoked: users.filter(u => u.role === 'revoked').length
    }), [users]);

    const filteredUsers = users.filter(u =>
        u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const runAction = async (targetUid: string, role: AppRole, subType: 'FREE' | 'ENTERPRISE', subStatus: 'ACTIVE' | 'SUSPENDED') => {
        setActionLoading(targetUid);
        try {
            const batch = writeBatch(db);
            const roleRef = doc(db, 'user_roles', targetUid);
            const orgRef = doc(db, 'organizations', targetUid);

            batch.update(roleRef, { role });
            batch.update(orgRef, {
                'subscription.type': subType,
                'subscription.status': subStatus,
                'subscription.validUntil': subType === 'ENTERPRISE' ? Timestamp.fromMillis(Date.now() + 31536000000) : null
            });

            await batch.commit();
            await fetchData();
            showToast("User updated successfully", "success");
        } catch (error: any) {
            console.error("Action failed", error);
            showToast(error.message || "Update failed", "error");
        } finally {
            setActionLoading(null);
            setConfirmModal({ ...confirmModal, show: false });
        }
    };

    const handleAction = (u: JoinedUser, actionType: string) => {
        switch (actionType) {
            case 'UPGRADE_ENTERPRISE':
                runAction(u.uid, 'enterprise', 'ENTERPRISE', 'ACTIVE');
                break;
            case 'DOWNGRADE_FREE':
                setConfirmModal({
                    show: true,
                    title: "Downgrade to Free",
                    message: `Are you sure you want to downgrade ${u.email} to the Trial/Free tier?`,
                    onConfirm: () => runAction(u.uid, 'trial', 'FREE', 'ACTIVE'),
                    isDestructive: true
                });
                break;
            case 'MAKE_ADMIN':
                setConfirmModal({
                    show: true,
                    title: "Make Admin",
                    message: `Grant full administrative access to ${u.email}? This gives them total control over Data Domino.`,
                    onConfirm: () => runAction(u.uid, 'admin', 'ENTERPRISE', 'ACTIVE'),
                    isDestructive: true
                });
                break;
            case 'REMOVE_ADMIN':
                setConfirmModal({
                    show: true,
                    title: "Remove Admin",
                    message: `Remove administrative access from ${u.email}? They will be downgraded to Enterprise status.`,
                    onConfirm: () => runAction(u.uid, 'enterprise', 'ENTERPRISE', 'ACTIVE'),
                    isDestructive: true
                });
                break;
            case 'REVOKE_ACCESS':
                setConfirmModal({
                    show: true,
                    title: "Revoke Access",
                    message: `Immediately suspend all access for ${u.email}? They will be signed out and redirected to the suspended page.`,
                    onConfirm: () => runAction(u.uid, 'revoked', 'FREE', 'SUSPENDED'),
                    isDestructive: true
                });
                break;
            case 'RESTORE_ACCESS':
                runAction(u.uid, 'trial', 'FREE', 'ACTIVE');
                break;
        }
    };

    if (!isAdmin) return <Navigate to="/" replace />;
    if (fetchLoading) return (
        <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
            <p className="text-zinc-500 font-bold text-xs uppercase tracking-widest animate-pulse">Synchronizing Intelligence...</p>
        </div>
    );

    return (
        <div className="min-h-screen bg-zinc-950 text-white p-6 md:p-10">
            {/* Success/Error Toast */}
            {toast && (
                <div className={cn(
                    "fixed top-6 right-6 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-right-4 duration-300 font-black uppercase text-[10px] tracking-widest border",
                    toast.type === 'success' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"
                )}>
                    {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                    {toast.message}
                </div>
            )}

            {/* Confirmation Modal */}
            {confirmModal.show && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-[2rem] max-w-md w-full p-8 shadow-2xl shadow-black/50">
                        <div className="w-14 h-14 bg-red-500/10 rounded-2xl flex items-center justify-center border border-red-500/20 mb-6">
                            <AlertCircle className="w-7 h-7 text-red-500" />
                        </div>
                        <h3 className="text-xl font-black mb-2 tracking-tight">{confirmModal.title}</h3>
                        <p className="text-zinc-400 text-sm mb-8 leading-relaxed">{confirmModal.message}</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setConfirmModal({ ...confirmModal, show: false })}
                                className="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 font-black rounded-xl transition-all text-[10px] uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmModal.onConfirm}
                                className="flex-1 py-4 bg-red-600 hover:bg-red-500 text-white font-black rounded-xl transition-all text-[10px] uppercase tracking-widest shadow-xl shadow-red-600/20"
                            >
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                <div>
                    <h1 className="text-4xl font-black tracking-tighter mb-2">Super Admin <span className="text-primary text-glow-primary">Dashboard</span></h1>
                    <p className="text-zinc-500 text-sm font-medium">Full system control and user lifecycle management.</p>
                </div>
                <Link to="/" className="flex items-center gap-2 px-6 py-3 bg-zinc-900 border border-zinc-800 rounded-xl font-black text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white hover:border-zinc-700 transition-all">
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Dashboard
                </Link>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                {[
                    { label: "Total Users", value: stats.total, icon: Users, color: "text-white" },
                    { label: "Admin Fleet", value: stats.admins, icon: Shield, color: "text-red-500" },
                    { label: "Enterprise", value: stats.enterprise, icon: Zap, color: "text-primary" },
                    { label: "Trial Access", value: stats.trial, icon: Activity, color: "text-amber-500" }
                ].map((s, i) => (
                    <div key={i} className="bg-zinc-900/40 border border-zinc-800/50 rounded-3xl p-6 relative overflow-hidden group hover:border-zinc-700/50 transition-all">
                        <div className="flex items-start justify-between relative z-10">
                            <div>
                                <p className="text-zinc-500 text-[10px] font-black uppercase tracking-widest mb-1">{s.label}</p>
                                <p className={cn("text-3xl font-black", s.color)}>{s.value}</p>
                            </div>
                            <div className="p-3 bg-white/5 rounded-2xl border border-white/5 group-hover:scale-110 transition-transform">
                                <s.icon className={cn("w-5 h-5", s.color)} />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Search & Table */}
            <div className="bg-zinc-900/40 border border-zinc-800/50 rounded-[2.5rem] overflow-hidden">
                <div className="p-6 md:p-8 border-b border-zinc-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <input
                            type="text"
                            placeholder="Filter by email or name..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-zinc-950/50 border border-zinc-800 rounded-2xl py-3 pl-12 pr-4 text-sm font-medium focus:outline-none focus:border-primary/50 transition-all placeholder:text-zinc-600"
                        />
                    </div>
                    <div className="text-[10px] font-black text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                        <Info className="w-3.5 h-3.5" />
                        Syncing live with Firestore
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-zinc-800/50 bg-zinc-950/20">
                                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Organisation</th>
                                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">User</th>
                                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Joined</th>
                                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Role</th>
                                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest">Subscription</th>
                                <th className="p-6 text-[10px] font-black text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/30">
                            {filteredUsers.map((u) => {
                                const isSelf = u.uid === user?.uid;
                                return (
                                    <tr key={u.uid} className="group hover:bg-white/[0.02] transition-colors">
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
                                                    <Building2 className="w-4 h-4 text-primary" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black tracking-tight leading-none mb-1">{u.orgName}</p>
                                                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-tight">{u.uid.substring(0, 8)}...</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-3">
                                                <div className="w-9 h-9 rounded-xl bg-zinc-100/5 border border-white/5 flex items-center justify-center shrink-0">
                                                    <UserCircle2 className="w-4 h-4 text-zinc-400" />
                                                </div>
                                                <div>
                                                    <p className="text-sm font-bold text-zinc-200 leading-none mb-1">{u.displayName}</p>
                                                    <p className="text-[11px] text-zinc-500 font-medium lowercase flex items-center gap-1">
                                                        <Mail className="w-2.5 h-2.5" />
                                                        {u.email}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="text-[11px] font-bold text-zinc-500 flex items-center gap-2">
                                                <Calendar className="w-3 h-3" />
                                                {u.joinedAt.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className={cn(
                                                "inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                                u.role === 'admin' ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                    u.role === 'enterprise' ? "bg-primary/10 text-primary border-primary/20" :
                                                        u.role === 'trial' ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
                                                            "bg-zinc-800 text-zinc-500 border-zinc-700 line-through"
                                            )}>
                                                {u.role}
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-tight text-zinc-300">{u.subType}</p>
                                                <p className={cn(
                                                    "text-[8px] font-black uppercase tracking-[0.1em]",
                                                    u.subStatus === 'ACTIVE' ? "text-emerald-500" : "text-red-500"
                                                )}>{u.subStatus}</p>
                                            </div>
                                        </td>
                                        <td className="p-6 text-right">
                                            {isSelf ? (
                                                <div className="px-4 py-1.5 bg-zinc-800 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-500 inline-block border border-zinc-700">
                                                    Your Account
                                                </div>
                                            ) : u.role === 'admin' && adminCount === 1 ? (
                                                <div className="group/tt relative inline-block">
                                                    <div className="px-4 py-1.5 bg-zinc-950/50 rounded-lg text-[9px] font-black uppercase tracking-widest text-zinc-700 inline-block border border-zinc-800 cursor-not-allowed">
                                                        Locked
                                                    </div>
                                                    <div className="absolute right-0 bottom-full mb-2 w-48 p-2 bg-black border border-zinc-800 rounded-lg text-[9px] font-bold text-zinc-500 uppercase text-center opacity-0 group-hover/tt:opacity-100 transition-opacity pointer-events-none">
                                                        Cannot modify — only admin in system
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-2">
                                                    {u.role === 'admin' && adminCount >= 2 && (
                                                        <button
                                                            disabled={!!actionLoading}
                                                            onClick={() => handleAction(u, 'REMOVE_ADMIN')}
                                                            className="px-3 py-1.5 bg-zinc-800 hover:bg-orange-600/10 hover:text-orange-500 border border-zinc-700 hover:border-orange-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Remove Admin
                                                        </button>
                                                    )}
                                                    {u.role === 'enterprise' && (
                                                        <>
                                                            <button
                                                                disabled={!!actionLoading}
                                                                onClick={() => handleAction(u, 'DOWNGRADE_FREE')}
                                                                className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all text-zinc-400"
                                                            >
                                                                Downgrade to Free
                                                            </button>
                                                            <button
                                                                disabled={!!actionLoading}
                                                                onClick={() => handleAction(u, 'MAKE_ADMIN')}
                                                                className="px-3 py-1.5 bg-zinc-800 hover:bg-red-600/10 hover:text-red-500 border border-zinc-700 hover:border-red-500/30 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                Make Admin
                                                            </button>
                                                            <button
                                                                disabled={!!actionLoading}
                                                                onClick={() => handleAction(u, 'REVOKE_ACCESS')}
                                                                className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                Revoke Access
                                                            </button>
                                                        </>
                                                    )}
                                                    {u.role === 'trial' && (
                                                        <>
                                                            <button
                                                                disabled={!!actionLoading}
                                                                onClick={() => handleAction(u, 'UPGRADE_ENTERPRISE')}
                                                                className="px-3 py-1.5 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                Upgrade to Enterprise
                                                            </button>
                                                            <button
                                                                disabled={!!actionLoading}
                                                                onClick={() => handleAction(u, 'REVOKE_ACCESS')}
                                                                className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                Revoke Access
                                                            </button>
                                                        </>
                                                    )}
                                                    {u.role === 'revoked' && (
                                                        <button
                                                            disabled={!!actionLoading}
                                                            onClick={() => handleAction(u, 'RESTORE_ACCESS')}
                                                            className="px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/20 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all"
                                                        >
                                                            Restore Access
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredUsers.length === 0 && (
                    <div className="p-20 text-center">
                        <UserCircle2 className="w-12 h-12 text-zinc-800 mx-auto mb-4" />
                        <p className="text-zinc-500 font-bold text-[10px] uppercase tracking-widest">No matching human assets found.</p>
                    </div>
                )}
            </div>

            <p className="mt-12 text-center text-zinc-700 font-bold text-[10px] uppercase tracking-[0.2em] pointer-events-none">
                &copy; {new Date().getFullYear()} ENALSYS PRIVATE LIMITED &bull; SUPER ADMIN PROTOCOL V4.0
            </p>
        </div>
    );
};

export default AdminDashboard;
