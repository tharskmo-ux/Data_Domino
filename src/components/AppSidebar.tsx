import React from 'react';
import { ArrowLeft, LayoutPanelLeft, UserCircle2, BarChart3, ChevronRight, Settings, History, ShieldCheck, Tag, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../features/auth/AuthContext';
import { useAdminView } from '../features/admin/AdminViewContext';
import type { Project } from '../features/projects/ProjectContext';

export type ETLStep = 'dashboard' | 'header-selection' | 'mapping' | 'data-quality' | 'matching' | 'categorization' | 'history';

interface AppSidebarProps {
    activeStep: ETLStep;
    onNavigate: (step: ETLStep) => void;
    currentProject?: Project | null;
    onBack?: () => void;
    onOpenSettings?: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ activeStep, onNavigate, currentProject, onBack, onOpenSettings }) => {
    const { role, isAdmin } = useAuth();
    const { isViewingClient, viewingClient } = useAdminView();

    // EFFECTIVE ROLE: Use mirrored role if applicable
    const effectiveRole = (isAdmin && isViewingClient && viewingClient) ? viewingClient.role : role;

    // Different steps descriptions based on context
    const isGlobal = !currentProject;

    const steps = [
        {
            id: 'dashboard',
            label: 'Dashboard',
            icon: BarChart3,
            description: isGlobal ? 'Global Overview & Projects' : 'Project Overview & Upload'
        },
        {
            id: 'header-selection',
            label: 'Header Discovery',
            icon: History, // Re-using History or importing Search
            description: isGlobal ? 'Header Detection Rules' : 'Identify correct header row'
        },
        {
            id: 'mapping',
            label: 'Column Mapping',
            icon: LayoutPanelLeft,
            description: isGlobal ? 'Global Field Dictionary' : 'Map headers to system fields'
        },
        {
            id: 'matching',
            label: 'Supplier Matching',
            icon: UserCircle2,
            description: isGlobal ? 'Master Vendor Index' : 'Fuzzy matching & clustering'
        },
        {
            id: 'categorization',
            label: 'Categorization',
            icon: Tag,
            description: isGlobal ? 'Global Spend Taxonomy' : 'Classify & Map Categories'
        },
        {
            id: 'data-quality',
            label: 'Data Quality',
            icon: ShieldCheck,
            description: isGlobal ? 'Cross-project Health' : 'Health check & Metadata'
        },
    ];

    // CRITICAL-01 FIX: Compute step completion at the top level of the component (not inside .map())
    const completedSteps = React.useMemo(() => {
        const completed = new Set<string>();
        if (!currentProject) return completed;
        const statusOrder = ['header_selected', 'mapped', 'matched', 'categorized', 'data_quality_complete'];
        const stepToStatus: Record<string, string[]> = {
            'header-selection': ['header_selected', 'mapped', 'matched', 'categorized', 'data_quality_complete'],
            'mapping': ['mapped', 'matched', 'categorized', 'data_quality_complete'],
            'matching': ['matched', 'categorized', 'data_quality_complete'],
            'categorization': ['categorized', 'data_quality_complete'],
            'data-quality': ['data_quality_complete'],
        };
        for (const [step, requiredStatuses] of Object.entries(stepToStatus)) {
            if (requiredStatuses.includes(currentProject.status)) {
                completed.add(step);
            }
        }
        // Also mark the active step if user has gone past it
        const activeIdx = statusOrder.indexOf(currentProject.status);
        if (activeStep && activeStep !== 'dashboard' && activeStep !== 'history') {
            const stepStatusMap: Record<string, number> = {
                'header-selection': 0,
                'mapping': 1,
                'matching': 2,
                'categorization': 3,
                'data-quality': 4,
            };
            const activeStepIdx = stepStatusMap[activeStep] ?? -1;
            if (activeIdx > activeStepIdx) {
                completed.add(activeStep);
            }
        }
        return completed;
    }, [currentProject, activeStep]);

    return (
        <aside className="w-80 border-r border-zinc-900 bg-zinc-900/30 flex flex-col h-screen fixed left-0 top-0 z-40 backdrop-blur-md">
            <div className="p-6 border-b border-zinc-900 flex items-center gap-3 h-20 shrink-0">
                {currentProject ? (
                    <>
                        <button
                            onClick={onBack}
                            className="p-2 hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </button>
                        <div className="flex-1 min-w-0">
                            <h2 className="font-bold truncate text-lg">{currentProject.name}</h2>
                            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 uppercase tracking-widest font-bold">
                                <span className="w-1.5 h-1.5 bg-primary rounded-full" />
                                {currentProject.status}
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="flex items-center gap-3 w-full">
                        <div className="w-8 h-8 bg-gradient-to-br from-primary to-emerald-600 rounded-lg flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
                            <span className="text-white font-black text-lg tracking-tighter">D</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-lg font-bold tracking-tight text-white leading-none">Data Domino</span>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="p-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                                    <CheckCircle2 className="h-2 w-2 text-emerald-500" />
                                </span>
                                <span className="text-[8px] font-black text-zinc-500 uppercase tracking-widest">Audit Verified</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                {steps.map((step) => {
                    const isActive = activeStep === step.id;
                    const StepIcon = step.icon;
                    const isCompleted = completedSteps.has(step.id);

                    return (
                        <button
                            key={step.id}
                            onClick={() => onNavigate(step.id as ETLStep)}
                            className={cn(
                                "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group relative",
                                isActive
                                    ? "bg-primary/10 text-white"
                                    : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
                            )}
                        >
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full" />
                            )}
                            <div className={cn(
                                "p-2.5 rounded-xl transition-colors shrink-0 relative",
                                isActive ? "bg-primary text-white" : "bg-zinc-900 text-zinc-600 group-hover:text-zinc-400"
                            )}>
                                <StepIcon className="h-5 w-5" />
                                {isCompleted && !isActive && (
                                    <div className="absolute -top-1 -right-1 bg-emerald-500 rounded-full border-2 border-zinc-950 p-[1px]">
                                        <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                                    </div>
                                )}
                            </div>
                            <div className="text-left">
                                <div className="font-bold text-sm">{step.label}</div>
                                <div className="text-[10px] opacity-60 font-medium">{step.description}</div>
                            </div>
                            {isActive && <ChevronRight className="ml-auto h-4 w-4 text-primary" />}
                        </button>
                    );
                })}
            </nav>


            <div className="p-4 border-t border-zinc-900 space-y-1 shrink-0">
                <button
                    onClick={() => onNavigate('history')}
                    className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-sm font-medium",
                        activeStep === 'history' ? "bg-primary/10 text-white" : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
                    )}
                >
                    <History className="h-4 w-4" /> Activity History
                </button>
                {(isAdmin || effectiveRole !== 'trial' || !currentProject) && (
                    <button
                        onClick={onOpenSettings}
                        className="w-full flex items-center gap-3 p-3 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded-xl transition-all text-sm font-medium"
                    >
                        <Settings className="h-4 w-4" /> {currentProject ? 'Project Settings' : 'Settings'}
                    </button>
                )}
            </div>
        </aside>
    );
};

export default AppSidebar;
