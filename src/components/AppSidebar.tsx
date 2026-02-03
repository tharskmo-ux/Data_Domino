import React from 'react';
import { ArrowLeft, LayoutPanelLeft, UserCircle2, BarChart3, ChevronRight, Settings, History, ShieldCheck, Tag, CheckCircle2 } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Project } from '../features/projects/ProjectContext';

export type ETLStep = 'dashboard' | 'mapping' | 'data-quality' | 'matching' | 'categorization' | 'history';

interface AppSidebarProps {
    activeStep: ETLStep;
    onNavigate: (step: ETLStep) => void;
    currentProject?: Project | null;
    onBack?: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ activeStep, onNavigate, currentProject, onBack }) => {

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
                        <div className="w-8 h-8 bg-primary rounded flex items-center justify-center shrink-0">
                            <span className="text-white font-bold text-lg">D</span>
                        </div>
                        <span className="text-xl font-bold tracking-tight text-white">Data Domino</span>
                    </div>
                )}
            </div>

            <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
                {steps.map((step) => {
                    const isActive = activeStep === step.id;
                    const StepIcon = step.icon;

                    // Determine if step is completed
                    const isCompleted = React.useMemo(() => {
                        if (!currentProject) return false;
                        if (currentProject.status === 'completed') return true;

                        // Check explicit activity history
                        const hasActivity = currentProject.activities.some(a => {
                            if (step.id === 'mapping') return a.type === 'mapping';
                            if (step.id === 'matching') return a.type === 'matching';
                            if (step.id === 'categorization') return a.type === 'categorization';
                            if (step.id === 'data-quality') return a.type === 'categorization' && steps.findIndex(s => s.id === 'data-quality') < steps.findIndex(s => s.id === activeStep); // Rough proxy
                            return false;
                        });

                        // Sequence-based inference (if we are on step 4, step 1,2,3 are done)
                        const stepIndex = steps.findIndex(s => s.id === step.id);
                        const currentIndex = steps.findIndex(s => s.id === activeStep);

                        // Special Handling: Dashboard is the final goal
                        if (step.id === 'dashboard') return false;
                        if (step.id === 'data-quality') return false;

                        return hasActivity || (stepIndex < currentIndex && currentIndex > 0);
                    }, [currentProject, activeStep, step.id]);

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
                <button
                    onClick={() => alert('Project Settings will be available in the Enterprise edition.')}
                    className="w-full flex items-center gap-3 p-3 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded-xl transition-all text-sm font-medium"
                >
                    <Settings className="h-4 w-4" /> Project Settings
                </button>
            </div>
        </aside>
    );
};

export default AppSidebar;
