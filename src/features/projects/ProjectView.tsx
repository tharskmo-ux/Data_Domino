import React, { useState, useEffect } from 'react';
import { Database, ChevronRight, FileCheck2 } from 'lucide-react';
import { useProjects } from './ProjectContext';
import ProjectSettingsModal from './ProjectSettingsModal'; // Import Modal
import FileUpload from '../etl/FileUpload';
import type { FileMetadata } from '../etl/FileUpload';
import ColumnMapper from '../etl/ColumnMapper';
import SupplierMatching from '../etl/SupplierMatching';
import CategoryMapper from '../etl/CategoryMapper';
import AnalyticsDashboard from '../etl/AnalyticsDashboard';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';
import AppSidebar, { type ETLStep } from '../../components/AppSidebar';
import DataProfiling from '../etl/DataProfiling';
import ActivityHistory from '../etl/ActivityHistory';
import { useSubscription } from '../subscription/SubscriptionContext';
import { Lock, FileDown, AlertCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

const ExportButton = () => {
    const { checkAccess } = useSubscription();
    const canExport = checkAccess('advanced_export');

    return (
        <button
            onClick={() => !canExport && alert("Upgrade to Enterprise to export detailed reports.")}
            className={cn(
                "px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                canExport
                    ? "bg-zinc-800 hover:bg-zinc-700 text-white"
                    : "bg-zinc-900 text-zinc-600 cursor-not-allowed border border-zinc-800"
            )}
        >
            {!canExport && <Lock className="h-3 w-3" />}
            <FileDown className="h-4 w-4" />
            Export
        </button>
    );
};

const ProjectView: React.FC = () => {
    const { role } = useAuth();
    const { currentProject, setCurrentProject, updateProject, deleteProject, addActivity, updateProjectCache, projectDataCache } = useProjects();
    const [activeStep, setActiveStep] = useState<ETLStep>('dashboard');

    const hasAlreadyUploaded = currentProject?.activities.some(a => a.type === 'upload');
    const isUploadDisabled = role === 'trial' && hasAlreadyUploaded;
    const [isProcessing, setIsProcessing] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Modal State

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

    // Initialize state from existing project
    useEffect(() => {
        if (currentProject) {
            // Restore active step based on status
            if (currentProject.status === 'completed') {
                setActiveStep('dashboard');
            } else if (currentProject.status === 'draft') {
                setActiveStep('dashboard'); // Default to start (Upload view) if draft
            }

            // Restore Currency
            if (currentProject.currency && currentProject.currency !== projectData.currency) {
                setProjectData(prev => ({ ...prev, currency: currentProject.currency! }));
            }

            // Restore from Session Cache
            if (projectDataCache[currentProject.id]) {
                const cached = projectDataCache[currentProject.id];
                setProjectData(prev => ({ ...prev, ...cached }));
                // If we have data, ensure we are not stuck on upload
                if (cached.raw && cached.raw.length > 0 && activeStep === 'dashboard' && currentProject.status === 'draft') {
                    // Logic allows dashboard, so we are good.
                }
            } else {
                // No cache found (New Project or Refresh) - Explicitly reset data to prevent checking previous state
                setProjectData({
                    raw: [],
                    headers: [],
                    mappings: {},
                    currency: currentProject.currency || 'INR',
                    clusters: [],
                    fileMeta: undefined
                });

                // Reset to upload view for drafts
                if (currentProject.status === 'draft') {
                    setActiveStep('dashboard');
                }
            }

            // In a real app, we would re-hydrate the projectData from the backend here.
            // Since we don't have a backend, we rely on the in-memory state if available,
            // or the user has to re-upload. This is a known limitation of this prototype.
            // However, we can at least show the dashboard if stats are present.
            if (currentProject.status === 'completed' && currentProject.stats) {
                // Mock re-hydration for demo purposes if raw data is missing but stats exist
                // (Ideally, we'd fetch raw data from IDB or API)
            }
        }
    }, [currentProject?.id]);

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
            // Multi-level category detection
            if (h.includes('l1') || h.includes('segment') || (h.includes('cat') && !h.includes('sub'))) initialMappings['category_l1'] = header;
            if (h.includes('l2') || h.includes('family') || h.includes('sub')) initialMappings['category_l2'] = header;
            if (h.includes('l3') || h.includes('class') || h.includes('commodity')) initialMappings['category_l3'] = header;

            // Fallback for simple 'category' to L1
            if (!initialMappings['category_l1'] && (h.includes('cat') || h.includes('dept'))) initialMappings['category_l1'] = header;

            if (h.includes('po') || h.includes('order')) initialMappings['po_number'] = header;
            if (h.includes('plant') || h.includes('facility')) initialMappings['plant'] = header;
            if (h.includes('loc')) initialMappings['location'] = header;
            if (h.includes('item') || h.includes('desc') || h.includes('sku') || h.includes('part')) initialMappings['item_description'] = header;
            if (h.includes('contract') || h.includes('agreement')) initialMappings['contract_ref'] = header;
            if (h.includes('qty') || h.includes('quantity') || h.includes('units') || h.includes('count')) initialMappings['quantity'] = header;
            if (h.includes('price') || h.includes('rate') || (h.includes('unit') && (h.includes('cost') || h.includes('price')))) initialMappings['unit_price'] = header;
        });

        console.log('Auto-mappings generated:', initialMappings);

        const newData = {
            raw: data,
            headers,
            mappings: initialMappings,
            fileMeta: metadata
        };

        setProjectData(prev => ({
            ...prev,
            ...newData
        }));

        if (currentProject) updateProjectCache(currentProject.id, newData);

        // Keep isProcessing as true to show the loading overlay
        // and immediately set activeStep to 'mapping' so that when isProcessing becomes false,
        // it renders the ColumnMapper, not the AnalyticsDashboard.
        setActiveStep('mapping');

        // Simulate ETL Engine Background Processing
        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('mapping'); // User Request: Upload -> Mapping

            if (currentProject) {
                updateProject(currentProject.id, {
                    stats: {
                        spend: 0,
                        quality: metadata.quality,
                        transactions: data.length,
                        categoriesCount: 0,
                        suppliersCount: 0
                    }
                });

                addActivity(currentProject.id, {
                    type: 'upload',
                    label: 'Advanced Data Ingestion Complete',
                    details: `Successfully ingested ${data.length} records with ${headers.length} columns.`,
                    metadata: { rowCount: data.length, colCount: headers.length }
                });
            }
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
            if (currentProject) {
                updateProject(currentProject.id, {
                    currency: globalCurrency,
                    stats: { ...currentProject.stats } // Ensure we don't wipe stats if they exist, though updateProject does a merge usually.
                });

                addActivity(currentProject.id, {
                    type: 'mapping',
                    label: 'Column Mapping Finalized',
                    details: `Mapped source fields to system taxonomy.`,
                });
            }
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
            if (currentProject) {
                addActivity(currentProject.id, {
                    type: 'matching',
                    label: 'Supplier Matching Complete',
                    details: `Identified and grouped supplier clusters for review.`,
                });
            }
            setActiveStep('categorization'); // Redirect to merged categorization step
        }, 2000);
    };

    const handleCategoryComplete = (updatedData: any[]) => {
        setIsProcessing(true);
        setProjectData(prev => ({
            ...prev,
            raw: updatedData
        }));

        // Calculate and save project stats
        const amountCol = projectData.mappings['amount'];
        const supplierCol = projectData.mappings['supplier'];
        const categoryCol = projectData.mappings['category_l1'] || projectData.mappings['category'] || 'category';

        const totalSpend = updatedData.reduce((acc, row) => {
            let val = 0;
            if (amountCol && row[amountCol]) {
                const s = String(row[amountCol]).replace(/[^0-9.-]+/g, "");
                val = parseFloat(s) || 0;
            }
            return acc + val;
        }, 0);

        const uniqueSuppliers = new Set(updatedData.map(r => r[supplierCol])).size;
        const uniqueCategories = new Set(updatedData.map(r => r[categoryCol])).size;

        updateProject(currentProject.id, {
            status: 'completed',
            stats: {
                spend: totalSpend,
                quality: projectData.fileMeta?.quality || 95,
                transactions: updatedData.length,
                categoriesCount: uniqueCategories,
                suppliersCount: uniqueSuppliers
            }
        });

        if (currentProject) {
            addActivity(currentProject.id, {
                type: 'categorization',
                label: 'Spend Categorization Finalized',
                details: 'Applied hierarchies across all identified suppliers.',
            });
        }

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('data-quality'); // User Request: Categorization -> Data Quality -> Dashboard
        }, 1500);
    };

    const handleDataQualityComplete = () => {
        setIsProcessing(true);
        // Finalize quality checks
        if (currentProject) {
            updateProject(currentProject.id, { status: 'completed' });
            // Ensure cache is up to date
            updateProjectCache(currentProject.id, projectData);
        }

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('dashboard'); // Final Step
        }, 1000);
    };

    return (
        <div className="flex h-screen bg-zinc-950 text-white overflow-hidden">
            {/* Side Navigation */}
            <AppSidebar
                activeStep={activeStep}
                onNavigate={setActiveStep}
                currentProject={currentProject}
                onBack={() => setCurrentProject(null)}
                onOpenSettings={() => setIsSettingsOpen(true)}
            />

            <ProjectSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                project={currentProject}
                onUpdate={(id, data) => updateProject(id, data)}
                onDelete={(id) => {
                    deleteProject(id);
                    setCurrentProject(null);
                }}
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
                                else if (activeStep === 'categorization') handleCategoryComplete(projectData.raw);
                                else if (activeStep === 'data-quality') handleDataQualityComplete();
                                else if (activeStep === 'dashboard') alert('Dashboard is active.');
                                else alert('Please complete the current step first.');
                            }}
                            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-primary/20"
                        >
                            Run Step
                        </button>

                        {/* Gated Export Button */}
                        <ExportButton />
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-12">
                    <div className={cn(
                        "mx-auto transition-all duration-500",
                        activeStep === 'dashboard' || activeStep === 'categorization' ? "max-w-7xl" : "max-w-4xl"
                    )}>
                        {activeStep === 'dashboard' && (
                            <>
                                {(projectData.raw.length === 0 && currentProject.status !== 'completed') ? (
                                    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                        <div>
                                            <h1 className="text-4xl font-bold mb-3 tracking-tight">Step 1: Data Ingestion</h1>
                                            <p className="text-lg text-zinc-500 max-w-2xl">
                                                Select your procurement data files. We support massive datasets (up to 100MB) from SAP, Tally, and custom ERP exports.
                                            </p>
                                        </div>
                                        <FileUpload
                                            onUploadComplete={handleUploadComplete}
                                            disabled={isUploadDisabled}
                                        />
                                        {isUploadDisabled && (
                                            <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3">
                                                <AlertCircle className="h-5 w-5 text-amber-500" />
                                                <p className="text-sm text-amber-500 font-medium">
                                                    Trial Limit: You can only upload one file per project.
                                                    <button className="ml-2 underline font-bold hover:text-amber-400">Upgrade to Enterprise</button>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <AnalyticsDashboard
                                        data={projectData.raw}
                                        mappings={projectData.mappings}
                                        clusters={projectData.clusters}
                                        currency={projectData.currency}
                                        projectStats={currentProject.stats}
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
                                        <h3 className="text-xl font-bold">Data Quality Assessment</h3>
                                        <p className="text-xs text-zinc-500 mt-1 uppercase tracking-widest font-bold">Deep Profiling Metrics</p>
                                    </div>
                                </div>

                                <DataProfiling
                                    data={projectData.raw}
                                    headers={projectData.headers}
                                />

                                <div className="mt-12 flex justify-end">
                                    <button
                                        onClick={handleDataQualityComplete}
                                        className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-emerald-500/20 hover:scale-[1.02] transition-all"
                                    >
                                        Finalize Project <FileCheck2 className="h-5 w-5" />
                                    </button>
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
                            <CategoryMapper
                                data={projectData.raw}
                                mappings={projectData.mappings}
                                onComplete={handleCategoryComplete}
                                currency={projectData.currency}
                            />
                        )}

                        {activeStep === 'history' && (
                            <ActivityHistory
                                activities={currentProject.activities || []}
                            />
                        )}
                    </div>
                </div>
            </main>
        </div >
    );
};

export default ProjectView;
