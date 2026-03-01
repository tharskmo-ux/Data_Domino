import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Plus,
    FolderOpen,
    TrendingUp,
    ShieldCheck,
    Clock,
    ArrowRight,
    Trash2,
    Target,
    Users,
    LogOut,
    Loader2
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { useProjects, normalizeProject } from './ProjectContext';
import { useSubscription } from '../subscription/SubscriptionContext';
import { cn } from '../../lib/utils';
import ProjectView from './ProjectView';
import { signOut } from 'firebase/auth';
import { auth, db } from '../../lib/firebase';
import {
    collection, query, where,
    onSnapshot, getDocs, deleteDoc
} from 'firebase/firestore';
import { useEffectiveUid } from '../../hooks/useEffectiveUid';
import CreateProjectModal from './CreateProjectModal';
import GlobalSettingsModal from '../settings/GlobalSettingsModal';
import AppSidebar from '../../components/AppSidebar';
import type { ETLStep } from '../../components/AppSidebar';
import ActivityHistory from '../etl/ActivityHistory';
import OrganizationNameModal from '../subscription/OrganizationNameModal';
import { useAdminView } from '../admin/AdminViewContext';
import ClientFilesPanel from '../admin/ClientFilesPanel';

const DashboardPage = () => {
    const { user, isDemo, role, isAdmin } = useAuth();
    const { createProject, deleteProject, currentProject, setCurrentProject, checkTrialLimit } = useProjects();
    const { organization } = useSubscription();
    const { isViewingClient, viewingClient, stopViewingClient } = useAdminView();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeGlobalView, setActiveGlobalView] = useState<ETLStep>('dashboard');

    const [projects, setProjects] = useState<any[]>([]);
    const [totalSpend, setTotalSpend] = useState(0);
    const [savingsPotentialMax, setSavingsPotentialMax] = useState(0);
    const [uniqueVendors, setUniqueVendors] = useState(0);
    const [showResumePrompt, setShowResumePrompt] = useState(false);
    const [resumeStep, setResumeStep] = useState<string | number>(0);
    const [isLimitReached, setIsLimitReached] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const effectiveUid = useEffectiveUid();

    // EFFECTIVE ROLE: If viewing a client, use their role for UI logic
    const effectiveRole = (isAdmin && isViewingClient && viewingClient) ? viewingClient.role : role;

    useEffect(() => {
        const cleanupAbandonedProjects = async (uid: string) => {
            try {
                // EXPORT FIX C: Use smart auto-detection for exports too.
                const allProjectsQuery = query(
                    collection(db, 'projects'),
                    where('userId', '==', uid)
                );
                const snap = await getDocs(allProjectsQuery);
                const oneHourAgo = Date.now() - 60 * 60 * 1000;
                const deletePromises = snap.docs
                    .filter(d => {
                        const data = d.data();
                        // Only delete if truly empty — no file uploaded, no pipeline progress, AND older than 1 hour
                        if (data.rawGridUrl) return false;
                        if (data.currentStep !== 0) return false;
                        const createdAt = data.createdAt;
                        if (!createdAt) return false;
                        const ts = createdAt.toMillis ? createdAt.toMillis() : new Date(createdAt).getTime();
                        return ts < oneHourAgo;
                    })
                    .map(d => deleteDoc(d.ref));
                await Promise.all(deletePromises);
            } catch (err) {
                console.error('Cleanup failed:', err);
            }
        };

        if (effectiveUid) {
            cleanupAbandonedProjects(effectiveUid);
        }
    }, [effectiveUid]);


    useEffect(() => {
        if (effectiveRole === 'trial' && effectiveUid) {
            // Check based on both the loaded projects list AND the backend check for safety
            const localLimit = projects.length >= 1;
            if (localLimit) {
                setIsLimitReached(true);
            } else {
                checkTrialLimit(effectiveUid).then(reached => setIsLimitReached(reached));
            }
        } else {
            setIsLimitReached(false);
        }
    }, [effectiveUid, effectiveRole, checkTrialLimit, projects.length]);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('share')) {
            const mockProject: any = {
                id: 'shared-view',
                name: params.get('project') || 'Shared Project',
                description: 'Read-only view of project analytics',
                status: 'completed',
                currency: 'INR',
                createdAt: new Date().toISOString(),
                stats: {
                    spend: 12500000,
                    quality: 98,
                    transactions: 1450,
                    categoriesCount: 12,
                    suppliersCount: 45
                },
                activities: []
            };
            setCurrentProject(mockProject);
        }
    }, [setCurrentProject]);

    // Real-time project synchronization
    useEffect(() => {
        if (!effectiveUid) return;

        const q = query(
            collection(db, 'projects'),
            where('userId', '==', effectiveUid)
            // Removed: where('currentStep', '>=', 1), orderBy('updatedAt', 'desc'), limit(10) to avoid composite index requirements
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                // Map, filter step 0, sort manually, then limit to latest 10
                let projectsData = snapshot.docs
                    .map(d => {
                        // Doc IDs are "{uid}_{projectId}" — slice from first underscore
                        const rawId = d.id;
                        const projectId = rawId.includes('_') ? rawId.slice(rawId.indexOf('_') + 1) : rawId;
                        return normalizeProject(d.data(), projectId);
                    })
                    .filter(p => p.currentStep == null || (typeof p.currentStep === 'number' && p.currentStep >= 1) || (typeof p.currentStep === 'string' && p.currentStep !== 'upload'))
                    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

                // Take top 10
                projectsData = projectsData.slice(0, 10);

                setProjects(projectsData);

                console.log('[Dashboard] Projects Data synced:', projectsData.length);

                const latest = projectsData[0] as any;

                if (latest && latest.status !== 'data_quality_complete' && latest.currentStep > 0) {
                    setShowResumePrompt(true);
                    setResumeStep(latest.currentStep);
                } else {
                    setShowResumePrompt(false);
                }
            } else {
                setProjects([]);
                setShowResumePrompt(false);
            }
        }, (error) => {
            console.error('Project listener error:', error);
        });

        return () => unsubscribe();
    }, [effectiveUid]);

    // Phase 13: Robust Stats Aggregation using useMemo
    useEffect(() => {
        if (!projects || projects.length === 0) {
            setTotalSpend(0);
            setSavingsPotentialMax(0);
            setUniqueVendors(0);
            return;
        }

        const aggregated = projects.reduce((acc, p) => ({
            spend: acc.spend + (p.stats?.spend || 0),
            savings: acc.savings + (p.stats?.savingsPotential || 0),
            vendors: acc.vendors + (p.stats?.suppliersCount || 0)
        }), { spend: 0, savings: 0, vendors: 0 });

        setTotalSpend(aggregated.spend);
        setSavingsPotentialMax(aggregated.savings);
        setUniqueVendors(aggregated.vendors);
        console.log('[Dashboard] Aggregated Stats (useMemo-ish):', aggregated);
    }, [projects]);

    // If a project is selected, show the project workspace instead of the dashboard
    if (currentProject) {
        return <ProjectView key={currentProject.id} />;
    }

    const handleSignOut = () => {
        if (isDemo) {
            window.location.href = '/login';
            return;
        }
        signOut(auth);
    };

    // FIX 4: Return the Promise from createProject so CreateProjectModal can await it before closing.
    // This eliminates the 800 ms setTimeout race-condition that caused the modal to close before
    // setCurrentProject resolved, leaving the user on the dashboard instead of the FileUpload screen.
    const handleCreateProject = async (data: { name: string, description: string, template: string }): Promise<void> => {
        setIsCreating(true);
        try {
            await createProject(data);
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white dark text-foreground flex flex-col">
            {/* Admin Client View Banner — only renders for admin in client view mode */}
            {isAdmin && isViewingClient && (
                <div className="w-full bg-amber-500/15 border-b border-amber-500/30 px-4 py-1.5 flex items-center justify-between z-[60] shrink-0">
                    <div className="flex items-center gap-2 text-amber-400 text-xs text-[10px] uppercase font-bold tracking-widest">
                        <span>👁</span>
                        <span className="font-bold">Admin View Mode</span>
                        <span className="text-amber-400/70 translate-y-[1px]">
                            — {viewingClient?.displayName} ({viewingClient?.email})
                        </span>
                    </div>
                    <button
                        onClick={stopViewingClient}
                        className="text-amber-400 hover:text-amber-300 text-[10px] font-bold uppercase tracking-widest underline underline-offset-4"
                    >
                        Exit
                    </button>
                </div>
            )}
            <header className="h-16 border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-md sticky top-0 z-50 px-6 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-6">
                    {isDemo ? (
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
                                <span className="text-white font-bold text-lg">D</span>
                            </div>
                            <span className="text-lg font-bold tracking-tight">Data Domino</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 w-full">
                            <div className="w-10 h-10 bg-gradient-to-br from-primary to-emerald-600 rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                                <span className="text-white font-black text-xl tracking-tighter">D</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-lg font-bold tracking-tight text-white leading-none">Data Domino</span>
                                <span className="text-[10px] font-bold text-zinc-500 tracking-widest uppercase">Analytics Suite</span>
                            </div>
                        </div>
                    )}
                    {isDemo && (
                        <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full">
                            <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
                            <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest">Demo Mode</span>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4">
                    {/* Admin Access Button - Restricted to admin role */}
                    {isAdmin && (
                        <div className="flex gap-2">
                            {/* Admin Testing Tool: Quickly verify what a user sees */}
                            {isDemo && (
                                <button
                                    onClick={() => {
                                        localStorage.setItem('demo_role', 'user');
                                        window.location.reload();
                                    }}
                                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-lg text-xs font-bold uppercase tracking-wider border border-zinc-700 transition-all"
                                >
                                    Test User View
                                </button>
                            )}

                            <a
                                href="/admin"
                                className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-500 rounded-lg text-xs font-bold uppercase tracking-wider border border-amber-500/20 transition-all"
                            >
                                <ShieldCheck className="h-4 w-4" />
                                Super Admin
                            </a>
                        </div>
                    )}

                    <div className="flex flex-col items-end mr-2">
                        <span className="text-sm font-medium text-zinc-200">
                            {(isAdmin && isViewingClient && viewingClient) ? viewingClient.displayName : user?.displayName || 'User'}
                        </span>
                        <div className="flex items-center gap-2">
                            <span className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                                effectiveRole === 'admin' ? "bg-red-500/10 text-red-400 border-red-500/20" :
                                    effectiveRole === 'enterprise' ? "bg-primary/10 text-primary border-primary/20" :
                                        "bg-amber-500/10 text-amber-400 border-amber-500/20"
                            )}>
                                {effectiveRole === 'admin' ? 'Admin' : effectiveRole === 'enterprise' ? 'Enterprise' : 'Trial'}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-medium">
                                {(isAdmin && isViewingClient && viewingClient) ? viewingClient.email : user?.email}
                            </span>
                        </div>
                    </div>
                    <button
                        onClick={handleSignOut}
                        className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400 hover:text-white transition-colors border border-transparent hover:border-zinc-700"
                    >
                        <LogOut className="h-5 w-5" />
                    </button>
                </div>
            </header>

            {/* Sidebar & Main Content Wrapper */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Ambient Background Gradient */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/5 via-zinc-950/0 to-zinc-950/0 pointer-events-none" />

                <AppSidebar
                    activeStep={activeGlobalView}
                    onNavigate={setActiveGlobalView}
                    onOpenSettings={() => setIsSettingsOpen(true)}
                />

                <GlobalSettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                />

                <OrganizationNameModal
                    isOpen={organization !== null && organization.companyName === null && !isDemo}
                />

                <main className="flex-1 overflow-y-auto pl-80 relative z-10">
                    <div className="max-w-7xl mx-auto p-8">

                        {/* GLOBAL DASHBOARD VIEW */}
                        {activeGlobalView === 'dashboard' && (
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                <div className="flex justify-between items-end mb-10">
                                    <div>
                                        <h1 className="text-3xl font-bold mb-2">
                                            Welcome back to {organization?.companyName || organization?.adminEmail?.split('@')[1] || 'Data Domino'}, {user?.displayName?.split(' ')[0] || 'User'}
                                        </h1>
                                        <p className="text-zinc-400">Here's an overview of your procurement data projects.</p>
                                    </div>
                                    <button
                                        onClick={() => isLimitReached ? window.open('https://cal.id/hello-enalsys', '_blank') : setIsModalOpen(true)}
                                        disabled={isCreating}
                                        className={cn(
                                            "group px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg",
                                            (effectiveRole === 'trial' && isLimitReached)
                                                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30"
                                                : "bg-primary hover:bg-primary/90 text-white shadow-primary/20 hover:shadow-primary/30",
                                            isCreating && "opacity-50 cursor-not-allowed"
                                        )}
                                    >
                                        <div className={cn(
                                            "p-1 rounded-lg transition-transform",
                                            (effectiveRole === 'trial' && isLimitReached) ? "bg-amber-500/20" : "bg-white/20 group-hover:scale-110"
                                        )}>
                                            {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                        </div>
                                        {isCreating ? 'Creating...' : (effectiveRole === 'trial' && isLimitReached) ? 'Upgrade to Enterprise' : 'Create New Project'}
                                    </button>
                                </div>

                                {showResumePrompt && (
                                    <div className="mb-10 bg-primary/10 border border-primary/20 rounded-2xl p-6 flex items-center justify-between animate-in slide-in-from-top duration-500">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center text-primary">
                                                <TrendingUp className="h-6 w-6" />
                                            </div>
                                            <div>
                                                <h3 className="font-bold text-lg text-white">Resume your project</h3>
                                                <p className="text-sm text-zinc-400">You were at Step {resumeStep}. Jump back in to continue your analysis.</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setCurrentProject(projects[0])}
                                            className="px-6 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
                                        >
                                            Continue <ArrowRight className="h-4 w-4" />
                                        </button>
                                    </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                                    {[
                                        { label: 'Projects Count', value: projects.length.toString(), icon: FolderOpen, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                                        {
                                            label: 'Total Spend Processed',
                                            value: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact' }).format(totalSpend),
                                            icon: TrendingUp,
                                            color: 'text-emerald-500',
                                            bg: 'bg-emerald-500/10',
                                            border: 'border-emerald-500/20'
                                        },
                                        { label: 'Potential Savings', value: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', notation: 'compact' }).format(savingsPotentialMax), icon: ShieldCheck, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                                        { label: 'Unique Suppliers', value: uniqueVendors.toString(), icon: Users, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
                                    ].map((stat, i) => (
                                        <div key={i} className="group bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 p-6 rounded-2xl hover:border-zinc-700 transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-black/50">
                                            <div className="flex justify-between items-start mb-4">
                                                <span className="text-zinc-500 text-[11px] font-bold uppercase tracking-widest group-hover:text-zinc-400 transition-colors">{stat.label}</span>
                                                <div className={`p-2 rounded-xl ${stat.bg} ${stat.border} border transition-colors`}>
                                                    <stat.icon className={`h-4 w-4 ${stat.color}`} />
                                                </div>
                                            </div>
                                            <div className="text-3xl font-bold tracking-tight text-zinc-100 group-hover:text-white transition-colors">{stat.value}</div>
                                        </div>
                                    ))}
                                </div>

                                {projects.length === 0 ? (
                                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center">
                                        <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mb-6 text-zinc-500">
                                            <FolderOpen className="h-8 w-8" />
                                        </div>
                                        <h3 className="text-xl font-bold mb-2">No projects found</h3>
                                        <p className="text-zinc-500 max-w-sm mb-8">
                                            You haven't created any procurement analytics projects yet. Start by uploading your spend data.
                                        </p>
                                        <button
                                            onClick={() => setIsModalOpen(true)}
                                            className="bg-zinc-800 hover:bg-zinc-700 text-white px-8 py-3 rounded-xl font-bold transition-all border border-zinc-700"
                                        >
                                            Create Your First Project
                                        </button>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {projects.map((project) => (
                                            <motion.div
                                                initial={{ opacity: 0, scale: 0.95 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                key={project.id}
                                                className="group relative bg-zinc-900/60 backdrop-blur-sm border border-zinc-800 rounded-3xl overflow-hidden hover:border-primary/50 transition-all cursor-pointer hover:shadow-2xl hover:shadow-primary/5"
                                                onClick={() => setCurrentProject(project)}
                                            >
                                                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20 pointer-events-none" />

                                                <div className="p-7 relative">
                                                    <div className="flex justify-between items-start mb-6">
                                                        <div className="w-12 h-12 bg-zinc-800/80 rounded-2xl flex items-center justify-center group-hover:bg-primary/20 group-hover:text-primary transition-all duration-300 border border-zinc-700/50 group-hover:border-primary/20">
                                                            <FolderOpen className="h-6 w-6" />
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${project.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                                                'bg-zinc-800 text-zinc-400 border-zinc-700'
                                                                }`}>
                                                                {project.status || 'Active'}
                                                            </div>
                                                            {(() => {
                                                                const isCompleted = project.status === 'data_quality_complete' || project.status === 'completed' || Number(project.currentStep) >= 6;
                                                                const canDelete = isAdmin || effectiveRole !== 'trial' || !isCompleted;
                                                                return canDelete ? (
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            deleteProject(project.id);
                                                                        }}
                                                                        className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                                    >
                                                                        <Trash2 className="h-4 w-4" />
                                                                    </button>
                                                                ) : null;
                                                            })()}
                                                        </div>
                                                    </div>

                                                    <h3 className="text-xl font-bold mb-1 group-hover:text-primary transition-colors pr-8">{project.name}</h3>
                                                    <p className="text-zinc-500 text-xs mb-6 h-8 line-clamp-2">
                                                        {project.description || 'No description provided.'}
                                                    </p>

                                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                                        <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800">
                                                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Total Spend</div>
                                                            <div className="text-lg font-bold text-white font-mono">
                                                                {(() => {
                                                                    try {
                                                                        const currency = (project.currency?.length === 3) ? project.currency : 'INR';
                                                                        return new Intl.NumberFormat('en-IN', { style: 'currency', currency, notation: 'compact' }).format(project.stats?.spend || 0);
                                                                    } catch (e) {
                                                                        return `₹${(project.stats?.spend || 0).toLocaleString()}`;
                                                                    }
                                                                })()}
                                                            </div>
                                                        </div>
                                                        <div className="bg-zinc-950/50 rounded-xl p-3 border border-zinc-800">
                                                            <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-1">Data Quality</div>
                                                            <div className={`text-lg font-bold font-mono ${project.stats?.quality > 90 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                                                {project.stats?.quality || 0}%
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-4 text-xs font-medium text-zinc-400 mb-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <Users className="h-3.5 w-3.5 text-zinc-600" />
                                                            <span>{project.stats?.suppliersCount || 0} Vendors</span>
                                                        </div>
                                                        <div className="w-1 h-1 bg-zinc-800 rounded-full" />
                                                        <div className="flex items-center gap-1.5">
                                                            <Target className="h-3.5 w-3.5 text-zinc-600" />
                                                            <span>{project.stats?.categoriesCount || 0} Categories</span>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between pt-4 border-t border-zinc-800/50">
                                                        <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                                                            <Clock className="h-3.5 w-3.5" />
                                                            <span>Created {(() => {
                                                                const d = new Date(project.createdAt);
                                                                return isNaN(d.getTime()) ? 'Recently' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                                            })()}</span>
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-bold uppercase tracking-wider group-hover:text-primary transition-colors group-hover:translate-x-1 duration-300">
                                                            Open Project <ArrowRight className="h-3.5 w-3.5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </motion.div>
                        )}

                        {activeGlobalView === 'history' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div className="flex justify-between items-end mb-6">
                                    <div>
                                        <h2 className="text-3xl font-bold mb-2">Global Activity Feed</h2>
                                        <p className="text-zinc-500 text-lg">Audit trail across all procurement projects</p>
                                    </div>
                                </div>
                                <ActivityHistory />
                            </div>
                        )}

                        {/* GLOBAL SUMMARY VIEWS (Placeholders) */}
                        {activeGlobalView !== 'dashboard' && activeGlobalView !== 'history' && (
                            <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
                                <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center border border-zinc-800">
                                    {activeGlobalView === 'data-quality' && <ShieldCheck className="h-10 w-10 text-emerald-500" />}
                                    {activeGlobalView === 'categorization' && <FolderOpen className="h-10 w-10 text-blue-500" />}
                                    {activeGlobalView === 'matching' && <TrendingUp className="h-10 w-10 text-amber-500" />}
                                    {activeGlobalView === 'mapping' && <LogOut className="h-10 w-10 text-purple-500" />}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold capitalize mb-2">Global {activeGlobalView.replace('-', ' ')} Summary</h2>
                                    <p className="text-zinc-500 max-w-md">
                                        This view aggregates insights across all your projects.
                                        Select a specific project from the Dashboard to view detailed analysis.
                                    </p>
                                </div>
                                <button
                                    onClick={() => setActiveGlobalView('dashboard')}
                                    className="px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg font-bold transition-all"
                                >
                                    Go to Dashboard
                                </button>
                            </div>
                        )}

                    </div>
                </main>
            </div>


            {/* FIX 8: Pass canCreate so the modal uses checkTrialLimit (completed projects only)
                 rather than the total project count which would block on empty drafts. */}
            <CreateProjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleCreateProject}
                canCreate={!isLimitReached || isAdmin}
            />

            {/* Client Files Panel — dynamically handles admin vs enterprise view internally */}
            <div className="pl-80 px-8 pb-12">
                <ClientFilesPanel />
            </div>
        </div>
    );
};

export default DashboardPage;
