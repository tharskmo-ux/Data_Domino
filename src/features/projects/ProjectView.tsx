import React, { useState } from 'react';
import { Database, UserCircle2, BarChart3, ChevronRight, FileCheck2, FileText, Layers, ShieldCheck } from 'lucide-react';
import { useProjects } from './ProjectContext';
import FileUpload from '../etl/FileUpload';
import type { FileMetadata } from '../etl/FileUpload';
import ColumnMapper from '../etl/ColumnMapper';
import SupplierMatching from '../etl/SupplierMatching';
import AnalyticsDashboard from '../etl/AnalyticsDashboard';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import AppSidebar, { type ETLStep } from '../../components/AppSidebar';

const ProjectView: React.FC = () => {
    const { currentProject, setCurrentProject } = useProjects();
    const [activeStep, setActiveStep] = useState<ETLStep>('dashboard');
    const [isProcessing, setIsProcessing] = useState(false);

    // Core ETL Data State
    const [projectData, setProjectData] = useState<{
        raw: any[];
        headers: string[];
        mappings: Record<string, string>;
        currency: string;
        clusters: any[];
        fileMeta?: FileMetadata;
    }>({
        raw: [],
        headers: [],
        mappings: {},
        currency: 'INR',
        clusters: [],
        fileMeta: undefined
    });

    if (!currentProject) return null;

    const handleUploadComplete = (data: any[], metadata: FileMetadata) => {
        console.log('Ingestion complete. Rows:', data.length);
        setIsProcessing(true);

        const headers = data.length > 0 ? Object.keys(data[0]) : [];

        // Intelligent Auto-mapping logic (moved from ColumnMapper to initialize faster)
        const initialMappings: Record<string, string> = {};
        headers.forEach(header => {
            const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');

            if (h.includes('date')) initialMappings['date'] = header;
            if (h.includes('amount') || h.includes('val') || h.includes('sum')) initialMappings['amount'] = header;
            if (h.includes('vendor') || h.includes('supplier') || h.includes('name')) initialMappings['supplier'] = header;
            if (h.includes('currency') || h.includes('curr')) initialMappings['currency'] = header;
            if (h.includes('cat') || h.includes('dept')) initialMappings['category'] = header;
            if (h.includes('po') || h.includes('order')) initialMappings['po_number'] = header;
            if (h.includes('plant') || h.includes('facility')) initialMappings['plant'] = header;
            if (h.includes('loc')) initialMappings['location'] = header;
        });

        console.log('Auto-mappings generated:', initialMappings);

        setProjectData(prev => ({
            ...prev,
            raw: data,
            headers,
            mappings: initialMappings, // Set initial mappings immediately
            fileMeta: metadata
        }));

        // Simulate ETL Engine Background Processing
        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('mapping'); // Auto-redirect to mapping to confirm
        }, 2000);
    };


    const [progress, setProgress] = useState(0);

    // Dynamic Progress Animation
    React.useEffect(() => {
        if (isProcessing) {
            setProgress(0);
            const interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 95) return prev; // Hold at 95 until process completes
                    return prev + Math.floor(Math.random() * 5) + 1;
                });
            }, 100);
            return () => clearInterval(interval);
        } else {
            setProgress(100);
        }
    }, [isProcessing]);

    if (isProcessing) {
        return (
            <div className="flex h-screen bg-zinc-950 items-center justify-center text-white px-6">
                <div className="max-w-md w-full text-center space-y-8">
                    <div className="relative w-24 h-24 mx-auto">
                        <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                        <div className="relative w-full h-full bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center">
                            <Database className="h-10 w-10 text-primary animate-pulse" />
                        </div>
                    </div>
                    <div>
                        <h2 className="text-3xl font-bold mb-3 tracking-tight">ETL Engine Active</h2>
                        <p className="text-zinc-500 text-lg leading-relaxed">
                            Analyzing data structures, normalizing currencies, and preparing your column mapping interface...
                        </p>
                    </div>
                    <div className="space-y-3">
                        <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-primary"
                                initial={{ width: "0%" }}
                                animate={{ width: `${progress}%` }}
                                transition={{ ease: "linear" }}
                            />
                        </div>
                        <div className="flex justify-between text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                            <span>Scanning Schema</span>
                            <span>{progress}% Complete</span>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const handleMappingComplete = (mappings: Record<string, string>, globalCurrency: string) => {
        console.log('Mapping confirmed:', mappings, 'Global Currency:', globalCurrency);
        setIsProcessing(true);

        setProjectData(prev => ({
            ...prev,
            mappings,
            currency: globalCurrency
        }));

        // Simulate deeper processing/matching setup
        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('matching');
        }, 2500);
    };

    const handleMatchingComplete = (clusters: any[]) => {
        setIsProcessing(true);
        setProjectData(prev => ({
            ...prev,
            clusters
        }));

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('dashboard'); // Redirect to dashboard after matching
        }, 2000);
    };

    return (
        <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
            {/* Side Navigation */}
            <AppSidebar
                activeStep={activeStep}
                onNavigate={setActiveStep}
                currentProject={currentProject}
                onBack={() => setCurrentProject(null)}
            />

            {/* Main Workspace Area */}
            <main className="flex-1 flex flex-col overflow-hidden pl-80">
                {/* Header */}
                <header className="h-16 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
                    <div className="flex items-center gap-4 text-sm">
                        <span className="text-zinc-500">Pipeline</span>
                        <ChevronRight className="h-4 w-4 text-zinc-700" />
                        <span className="font-bold text-primary capitalize">{activeStep}</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="px-3 py-1.5 bg-zinc-900 rounded-lg text-xs font-bold text-zinc-400 flex items-center gap-2">
                            <FileCheck2 className="h-4 w-4 text-zinc-600" /> Last Save: Just now
                        </div>
                        <button
                            onClick={() => alert('Project draft saved successfully.')}
                            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold transition-all"
                        >
                            Save Draft
                        </button>
                        <button
                            onClick={() => {
                                if (activeStep === 'dashboard' && projectData.fileMeta) setActiveStep('mapping');
                                else if (activeStep === 'mapping') handleMappingComplete(projectData.mappings, projectData.currency);
                                else if (activeStep === 'matching') handleMatchingComplete(projectData.clusters);
                                else if (activeStep === 'dashboard') alert('Dashboard is active.');
                                else alert('Please complete the current step first.');
                            }}
                            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-primary/20"
                        >
                            Run Step
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-12">
                    <div className={cn(
                        "mx-auto transition-all duration-500",
                        activeStep === 'dashboard' || activeStep === 'categorization' ? "max-w-7xl" : "max-w-4xl"
                    )}>
                        {activeStep === 'dashboard' && (
                            <>
                                {projectData.raw.length === 0 ? (
                                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div>
                                            <h1 className="text-4xl font-bold mb-3 tracking-tight">Step 1: Data Ingestion</h1>
                                            <p className="text-lg text-zinc-500 max-w-2xl">
                                                Select your procurement data files. We support massive datasets (up to 100MB) from SAP, Tally, and custom ERP exports.
                                            </p>
                                        </div>
                                        <FileUpload onUploadComplete={handleUploadComplete} />
                                    </div>
                                ) : (
                                    <AnalyticsDashboard
                                        data={projectData.raw}
                                        mappings={projectData.mappings}
                                        clusters={projectData.clusters}
                                    />
                                )}
                            </>
                        )}

                        {activeStep === 'data-quality' && projectData.fileMeta && (
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="p-8 bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] backdrop-blur-sm"
                            >
                                <div className="flex justify-between items-center mb-8">
                                    <div>
                                        <h3 className="text-xl font-bold">Ingested File Details</h3>
                                        <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest font-bold">Metadata Snapshot</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    <div className="p-5 bg-zinc-950/50 rounded-2xl border border-zinc-900/50">
                                        <div className="flex items-center gap-3 mb-3 text-zinc-500">
                                            <Database className="h-4 w-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">File Identity</span>
                                        </div>
                                        <div className="text-sm font-bold text-white truncate">{projectData.fileMeta.name}</div>
                                        <div className="text-[10px] text-zinc-600 font-bold mt-1 uppercase tracking-wider">{projectData.fileMeta.type}</div>
                                    </div>

                                    <div className="p-5 bg-zinc-950/50 rounded-2xl border border-zinc-900/50">
                                        <div className="flex items-center gap-3 mb-3 text-zinc-500">
                                            <FileText className="h-4 w-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Storage & Tech</span>
                                        </div>
                                        <div className="text-sm font-bold text-white">{projectData.fileMeta.format} Format</div>
                                        <div className="text-[10px] text-zinc-600 font-bold mt-1 uppercase tracking-wider">{projectData.fileMeta.size} Payload</div>
                                    </div>

                                    <div className="p-5 bg-zinc-950/50 rounded-2xl border border-zinc-900/50">
                                        <div className="flex items-center gap-3 mb-3 text-zinc-500">
                                            <Layers className="h-4 w-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Record Volume</span>
                                        </div>
                                        <div className="text-sm font-bold text-white">{projectData.fileMeta.rows.toLocaleString()} Rows</div>
                                        <div className="text-[10px] text-zinc-600 font-bold mt-1 uppercase tracking-wider">{projectData.fileMeta.cols} Columns Found</div>
                                    </div>

                                    <div className="p-5 bg-zinc-950/50 rounded-2xl border border-zinc-900/50">
                                        <div className="flex items-center gap-3 mb-3 text-emerald-500/70">
                                            <ShieldCheck className="h-4 w-4" />
                                            <span className="text-[10px] font-black uppercase tracking-widest">Signal Quality</span>
                                        </div>
                                        <div className="text-sm font-bold text-white">{projectData.fileMeta.quality}% Valid</div>
                                        <div className="text-[10px] text-zinc-600 font-bold mt-1 uppercase tracking-wider">Low Noise Identified</div>
                                    </div>
                                </div>
                            </motion.div>
                        )}

                        {activeStep === 'mapping' && (
                            <ColumnMapper
                                onConfirm={handleMappingComplete}
                                headers={projectData.headers}
                                initialMappings={projectData.mappings}
                            />
                        )}

                        {activeStep === 'matching' && (
                            <SupplierMatching
                                onComplete={handleMatchingComplete}
                                data={projectData.raw}
                                mappings={projectData.mappings}
                            />
                        )}

                        {activeStep === 'categorization' && (
                            <AnalyticsDashboard
                                data={projectData.raw}
                                mappings={projectData.mappings}
                                clusters={projectData.clusters}
                                initialTab="categorization"
                            />
                        )}
                    </div >
                </div >
            </main >
        </div >
    );
};

export default ProjectView;
