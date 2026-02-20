import { useAuth } from '../auth/AuthContext';
import { auth } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { LogOut, Plus, FolderOpen, TrendingUp, ShieldCheck, Clock, Trash2, ArrowRight, Users, Target } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useState, useEffect } from 'react';
import CreateProjectModal from './CreateProjectModal';
import GlobalSettingsModal from '../settings/GlobalSettingsModal';
import ProjectView from './ProjectView';
import { useProjects } from './ProjectContext';
import AppSidebar, { type ETLStep } from '../../components/AppSidebar';
import { motion } from 'framer-motion';
import ActivityHistory from '../etl/ActivityHistory';
import { useSubscription } from '../subscription/SubscriptionContext';
import OrganizationNameModal from '../subscription/OrganizationNameModal';

const DashboardPage = () => {
    const { user, isDemo, role, isAdmin } = useAuth();
    const { projects, createProject, deleteProject, currentProject, setCurrentProject } = useProjects();
    const { organization } = useSubscription();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [activeGlobalView, setActiveGlobalView] = useState<ETLStep>('dashboard');

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

    const handleCreateProject = (data: { name: string, description: string, template: string }) => {
        createProject(data);
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-white dark text-foreground flex flex-col">
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
                        <span className="text-sm font-medium text-zinc-200">{user?.displayName || 'User'}</span>
                        <span className="text-[10px] text-zinc-500 font-medium">{user?.email}</span>
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
                                        onClick={() => setIsModalOpen(true)}
                                        disabled={role === 'trial' && projects.length >= 1}
                                        className={cn(
                                            "group px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg",
                                            role === 'trial' && projects.length >= 1
                                                ? "bg-zinc-800 text-zinc-500 cursor-not-allowed border border-zinc-700 shadow-none"
                                                : "bg-primary hover:bg-primary/90 text-white shadow-primary/20 hover:shadow-primary/30"
                                        )}
                                    >
                                        <div className={cn(
                                            "p-1 rounded-lg transition-transform",
                                            role === 'trial' && projects.length >= 1 ? "bg-zinc-700" : "bg-white/20 group-hover:scale-110"
                                        )}>
                                            <Plus className="h-4 w-4" />
                                        </div>
                                        {role === 'trial' && projects.length >= 1 ? 'Project Limit Reached' : 'Create New Project'}
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                                    {[
                                        { label: 'Projects Count', value: projects.length.toString(), icon: FolderOpen, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
                                        { label: 'Total Spend Processed', value: '₹0', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
                                        { label: 'Avg Data Quality', value: '0%', icon: ShieldCheck, color: 'text-amber-500', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
                                        { label: 'Last Activity', value: projects.length > 0 ? 'Today' : 'None', icon: Clock, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
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
                                                            {role !== 'trial' && (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        deleteProject(project.id);
                                                                    }}
                                                                    className="p-2 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                                                                >
                                                                    <Trash2 className="h-4 w-4" />
                                                                </button>
                                                            )}
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
                                                                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: project.currency || 'INR', notation: 'compact' }).format(project.stats?.spend || 0)}
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
                                                            <span>Created {new Date(project.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
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
                                <ActivityHistory
                                    activities={projects.flatMap(p => (p.activities || []).map(a => ({ ...a, label: `[${p.name}] ${a.label}` }))).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())}
                                />
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
            </div >


            <CreateProjectModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleCreateProject}
            />
        </div >
    );
};

export default DashboardPage;
