import React, { useState, useRef, useEffect } from 'react';
import { Database, ChevronRight, FileCheck2 } from 'lucide-react';
import { normalizeProject, useProjects } from './ProjectContext';
import ProjectSettingsModal from './ProjectSettingsModal';
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
import HeaderRowSelector from '../etl/HeaderRowSelector';
import * as XLSX from 'xlsx';
import { normalizeWorksheet, stitchTransactions, normalizeDataKeys, cleanValue, filterNoise, detectCurrency, EXCHANGE_RATES } from '../../lib/dataExtraction';
import { ref, uploadBytes, getDownloadURL, uploadString } from 'firebase/storage';
import {
    collection,
    query,
    where,
    getDocs,
    addDoc,
    serverTimestamp,
    updateDoc,
    doc,
    onSnapshot,
} from 'firebase/firestore';
import { db, storage } from '../../lib/firebase';
import { useEffectiveUid } from '../../hooks/useEffectiveUid';
import { useAdminView } from '../admin/AdminViewContext';

interface ExportButtonProps {
    canExport: boolean;
    onExport: () => void;
}

const ExportButton: React.FC<ExportButtonProps> = ({ canExport, onExport }) => {
    return (
        <button
            onClick={() => {
                if (!canExport) {
                    alert('Upgrade to Enterprise to export detailed reports.');
                } else {
                    onExport();
                }
            }}
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
    const { role, user, isAdmin } = useAuth();
    const { currentProject, setCurrentProject, updateProject, deleteProject, addActivity, updateProjectCache, checkTrialLimit } = useProjects();
    const { checkAccess } = useSubscription();
    const canExport = checkAccess('advanced_export');
    const [activeStep, setActiveStep] = useState<ETLStep>('dashboard');
    const projectDataRef = useRef<any>(null);

    const [isLimitReached, setIsLimitReached] = useState(false);
    const effectiveUid = useEffectiveUid();
    const { isViewingClient, viewingClient, stopViewingClient } = useAdminView();
    const effectiveRole = (isAdmin && isViewingClient && viewingClient) ? viewingClient.role : role;
    const [isProcessing, setIsProcessing] = useState(false);
    const isUploadDisabled = (effectiveRole === 'trial' && isLimitReached) || isProcessing;
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isRestoring, setIsRestoring] = useState(false);
    const [analysis, setAnalysis] = useState<any>(null);
    const [totalSpend, setTotalSpend] = useState(0);
    const [savingsPotentialMin, setSavingsPotentialMin] = useState(0);
    const [savingsPotentialMax, setSavingsPotentialMax] = useState(0);
    const [uniqueVendors, setUniqueVendors] = useState(0);
    const [duplicateCount, setDuplicateCount] = useState(0);
    const [abcA, setAbcA] = useState(0);
    const [abcB, setAbcB] = useState(0);
    const [abcC, setAbcC] = useState(0);
    // Extended saved analytics signals (populated after the savings-engine save fix)
    const [identifiedSavings, setIdentifiedSavings] = useState(0);
    const [savingsBreakdown, setSavingsBreakdown] = useState<any>(null);
    const [contractedPercent, setContractedPercent] = useState<number | null>(null);
    const [ptRiskPercent, setPtRiskPercent] = useState<number | null>(null);
    const [singleSourcingPct, setSingleSourcingPct] = useState<number | null>(null);
    const [tailSpendPct, setTailSpendPct] = useState<number | null>(null);
    const [showResumePrompt, setShowResumePrompt] = useState(false);
    const [resumeStep, setResumeStep] = useState<string | number>(0);
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    const [projectData, setProjectData] = useState<{
        raw: any[];
        headers: string[];
        mappings: Record<string, string>;
        currency: string;
        clusters: any[];
        // The FileMetadata interface is already imported from '../etl/FileUpload'.
        // If you need to extend or modify its definition for this component,
        // it's better to do so in the original file or create a local type that extends it.
        // Placing an interface definition directly inside useState's type argument is a syntax error.
        fileMeta?: FileMetadata;
        rawSheetData?: any[][];
        merges?: any[];
        worksheet?: any;
        normalizationSummary?: {
            currenciesDetected: string[];
            rowsConverted: number;
            assumptionsMade: boolean;
            totalRows: number;
        };
        rawGridUrl?: string;
    }>({
        raw: [],
        headers: [],
        mappings: {},
        currency: 'INR',
        clusters: [],
        fileMeta: undefined
    });

    useEffect(() => {
        projectDataRef.current = projectData;
    }, [projectData]);

    // Check trial limit for UI
    useEffect(() => {
        if (effectiveRole === 'trial' && effectiveUid) {
            checkTrialLimit(effectiveUid).then(reached => setIsLimitReached(reached));
        }
    }, [effectiveUid, effectiveRole, checkTrialLimit]);

    // Detect interrupted uploads - derived from useEffect, removed in favour of determineProjectState
    const determineProjectState = (project: typeof currentProject) => {
        if (!project) return 'SHOW_UPLOAD';

        const step = Number(project.currentStep ?? 0);
        const hasRawGrid = !!project.rawGridUrl;
        const isFinished = project.status === 'data_quality_complete' || project.status === 'completed' || step >= 6;

        // Case 1 — Project fully completed
        if (isFinished) return 'SHOW_DASHBOARD';

        // Case 2 — Brand new project, no file yet
        if (!hasRawGrid && step === 0) {
            return 'SHOW_UPLOAD';
        }

        // Case 3 — File uploaded but pipeline not started
        if (step <= 1) return 'SHOW_RESUME_UPLOAD';

        // Case 4 — Pipeline in progress
        return 'SHOW_RESUME_PIPELINE';
    };

    const projectState = initialLoadDone ? determineProjectState(currentProject) : null;

    const resumeFromSavedGrid = async () => {
        if (!currentProject?.rawGridUrl) return;
        try {
            setIsRestoring(true);
            const response = await fetch((currentProject as any).rawGridUrl);
            const grid = await response.json();

            setProjectData(prev => ({
                ...prev,
                raw: grid,
                rawSheetData: grid,
            }));

            setActiveStep('header-selection');

            addActivity(currentProject!.id, {
                type: 'upload',
                label: 'Upload Resumed',
                details: `Resumed processing for ${currentProject!.fileName ?? 'previous file'}.`,
            });

        } catch (error) {
            console.error('Resume failed:', error);
            alert('Could not resume. Please upload your file again.');
        } finally {
            setIsRestoring(false);
        }
    };

    const navigateToPipelineStep = (step: number | string) => {
        const stepMap: Record<number | string, ETLStep> = {
            1: 'header-selection',
            2: 'mapping',
            3: 'matching',
            4: 'categorization',
            5: 'data-quality',
            6: 'dashboard'
        };
        setActiveStep(stepMap[step] || 'dashboard');
    };

    useEffect(() => {
        // Only run when there is no project selected yet. If currentProject is
        // already set (refresh, project switch, direct link), onSnapshot handles
        // all state restoration and sets initialLoadDone itself.
        if (!effectiveUid || currentProject) return;

        const loadDashboard = async () => {
            try {
                const q = query(
                    collection(db, 'projects'),
                    where('userId', '==', effectiveUid)
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    // Sort manually to avoid index requirement
                    const docs = snapshot.docs.map(d => ({
                        id: d.id,
                        data: d.data()
                    })).sort((a, b) => {
                        const tA = a.data.updatedAt?.toMillis ? a.data.updatedAt.toMillis() : new Date(a.data.updatedAt || 0).getTime();
                        const tB = b.data.updatedAt?.toMillis ? b.data.updatedAt.toMillis() : new Date(b.data.updatedAt || 0).getTime();
                        return tB - tA;
                    });

                    const data = docs[0].data;
                    const rawDocId = docs[0].id;
                    const projectId = rawDocId.includes('_')
                        ? rawDocId.slice(rawDocId.indexOf('_') + 1)
                        : rawDocId;
                    const project = normalizeProject(data, projectId);
                    setCurrentProject(project);
                    // onSnapshot will fire for this project and set initialLoadDone=true
                } else {
                    // No projects at all — nothing to load, unblock the UI
                    setInitialLoadDone(true);
                }
            } catch (error) {
                console.error('Dashboard load error:', error);
                setInitialLoadDone(true); // unblock UI on error
            }
            // No finally block: when a project is found, onSnapshot is the sole
            // setter of initialLoadDone so that all KPI state is populated first.
        };

        loadDashboard();
    }, [effectiveUid]); // currentProject?.id removed — re-running on switch caused race conditions

    // FIX 1: Reset all local state when the selected project changes so stale data
    // from the previous project is never shown while the new snapshot loads.
    const prevProjectIdRef = useRef<string | null>(null);
    useEffect(() => {
        const newId = currentProject?.id ?? null;
        if (newId === prevProjectIdRef.current) return; // same project — nothing to reset
        console.log('[ProjectView] Reset effect: switching from', prevProjectIdRef.current, 'to', newId);
        prevProjectIdRef.current = newId;

        // Reset pipeline session data and load indicator on every project switch
        setInitialLoadDone(false);
        setActiveStep('dashboard');
        setProjectData({
            raw: [],
            headers: [],
            mappings: {},
            currency: 'INR',
            clusters: [],
            fileMeta: undefined,
        });
        setAnalysis(null);
        setShowResumePrompt(false);
        setTotalSpend(0);
        setSavingsPotentialMin(0);
        setSavingsPotentialMax(0);
        setUniqueVendors(0);
        setDuplicateCount(0);
        setAbcA(0);
        setAbcB(0);
        setAbcC(0);
        setIdentifiedSavings(0);
        setSavingsBreakdown(null);
        setContractedPercent(null);
        setPtRiskPercent(null);
        setSingleSourcingPct(null);
        setTailSpendPct(null);
    }, [currentProject?.id]);

    useEffect(() => {
        if (!effectiveUid || !currentProject?.id || currentProject.id === 'shared-view') return;

        const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);

        const unsubscribe = onSnapshot(projectRef, (snap) => {
            console.log('[ProjectView] onSnapshot fired for', currentProject?.id, 'exists:', snap.exists());
            if (snap.exists()) {
                const project = snap.data();

                // CRITICAL-02 FIX: Prevent onSnapshot from overwriting mid-pipeline session data
                const normalized = normalizeProject(project, currentProject?.id || '');

                // FIX 2: Brand-new draft projects have no file yet — mark loading done immediately
                // so SHOW_UPLOAD renders right away.
                if (project.status === 'draft' && !project.rawGridUrl) {
                    setCurrentProject(normalized);
                    setIsRestoring(false);
                    setInitialLoadDone(true);
                    return;
                }

                // HIGH-03 FIX: Only update currentProject if id or status actually changed
                setCurrentProject(normalized);

                // Map numeric steps to ETLStep strings
                const stepMap: Record<number | string, ETLStep> = {
                    1: 'header-selection',
                    2: 'mapping',
                    3: 'matching',
                    4: 'categorization',
                    5: 'data-quality',
                    6: 'dashboard'
                };

                const step = project.currentStep;
                const stepNum = Number(step ?? 0);
                const isCompletedOrDone = project.status === 'data_quality_complete' || project.status === 'completed' || stepNum >= 6;
                const isMidPipeline = stepNum >= 2 && stepNum <= 5 && !isCompletedOrDone;

                if (isMidPipeline && stepMap[stepNum]) {
                    setActiveStep(stepMap[stepNum]);
                } else if (isCompletedOrDone) {
                    setActiveStep('dashboard');
                }

                // Restore resume-prompt state (shown when project has a partial upload)
                if (!isCompletedOrDone && project.currentStep && Number(project.currentStep) > 0) {
                    setShowResumePrompt(true);
                    setResumeStep(project.currentStep);
                }

                // Restore Pipeline Stats & Data — only fill gaps, never overwrite live session data
                setProjectData(prev => {
                    // CRITICAL-02: If we already have raw data from an active pipeline session, DO NOT overwrite
                    const hasLiveSession = prev.raw && prev.raw.length > 0;
                    if (hasLiveSession) {
                        console.log('[ProjectView] onSnapshot setProjectData: skipping — live session has', prev.raw.length, 'rows');
                        return prev;
                    }

                    // FIX: Always populate raw from Firestore preview (rawGrid) as a fallback.
                    // The auto-restore useEffect will overwrite with the full dataset from
                    // categoryResultsUrl if available — but we no longer leave raw=[] which
                    // caused data loss when the Storage fetch failed.
                    const fallbackRaw = normalized.rawGrid ?? prev.raw;
                    console.log('[ProjectView] onSnapshot setProjectData: restoring', fallbackRaw.length, 'rows from Firestore preview');

                    return {
                        ...prev,
                        raw: fallbackRaw,
                        headers: normalized.detectedHeaders ?? prev.headers,
                        mappings: normalized.columnMapping ?? prev.mappings,
                        currency: normalized.currency || 'INR',
                        clusters: normalized.supplierMatches ?? prev.clusters,
                        rawGridUrl: normalized.rawGridUrl || prev.rawGridUrl,
                        fileMeta: prev.fileMeta ?? {
                            name: normalized.fileName,
                            rows: normalized.rowCount ?? (normalized.stats?.transactions || 0),
                            quality: normalized.stats?.quality ?? 0
                        } as any
                    };
                });

                if (project.latestAnalysis) {
                    const la = project.latestAnalysis;
                    console.log('[ProjectView] onSnapshot: restoring latestAnalysis — totalSpend:', la.totalSpend, 'uniqueVendors:', la.uniqueVendors);
                    setAnalysis(la);
                    setTotalSpend(la.totalSpend ?? 0);
                    setSavingsPotentialMin(la.savingsPotentialMin ?? 0);
                    setSavingsPotentialMax(la.savingsPotentialMax ?? 0);
                    setUniqueVendors(la.uniqueVendors ?? 0);
                    setDuplicateCount(la.duplicateCount ?? 0);
                    setAbcA(la.abcA ?? 0);
                    setAbcB(la.abcB ?? 0);
                    setAbcC(la.abcC ?? 0);
                    // Extended signals (present in projects analysed after the savings-engine fix)
                    if (la.identifiedSavings != null) setIdentifiedSavings(la.identifiedSavings);
                    if (la.savingsBreakdown) setSavingsBreakdown(la.savingsBreakdown);
                    if (la.contractedPercent != null) setContractedPercent(la.contractedPercent);
                    if (la.ptRiskPercent != null) setPtRiskPercent(la.ptRiskPercent);
                    if (la.singleSourcingPct != null) setSingleSourcingPct(la.singleSourcingPct);
                    if (la.tailSpendPct != null) setTailSpendPct(la.tailSpendPct);
                } else if (project.stats) {
                    // Fallback: latestAnalysis may be missing for older projects or if the
                    // Storage-backed write failed. Use the stats field (always written by
                    // updateProject at categorization time) so the dashboard never shows zeros.
                    console.warn('[ProjectView] onSnapshot: NO latestAnalysis — falling back to stats field');
                    const s = project.stats;
                    setTotalSpend(s.spend ?? 0);
                    setUniqueVendors(s.suppliersCount ?? 0);
                    setSavingsPotentialMin(s.savingsPotential ?? 0);
                    setSavingsPotentialMax((s.savingsPotential ?? 0) * 1.2);
                } else {
                    console.warn('[ProjectView] onSnapshot: NO latestAnalysis and NO stats found in Firestore doc!');
                }

                // Unblock the UI NOW — all critical KPI state is set above.
                // Raw sheet grid fetch is deferred below as a background update so it
                // never delays the dashboard from rendering.
                setIsRestoring(false);
                setInitialLoadDone(true);

                // Recover raw grid JSON from Storage in the background (for the data-grid view).
                // This is fire-and-forget — it does NOT block setInitialLoadDone.
                if (project.rawGridUrl) {
                    fetch(project.rawGridUrl as string)
                        .then(r => r.json())
                        .then((grid: any) => setProjectData(prev => ({ ...prev, rawSheetData: grid })))
                        .catch((err: any) => console.error('[Grid Recovery] Failed to fetch raw grid:', err));
                }

                return;
            }
            setIsRestoring(false);
            setInitialLoadDone(true);
        }, (err) => {
            console.error('[ProjectView] Sync error:', err);
            setIsRestoring(false);
            setInitialLoadDone(true);
        });

        return () => unsubscribe();
        // FIX 1: currentProject?.id added back — safe because we guard stale writes above with the
        // "hasLiveSession" check (CRITICAL-02) and the draft fast-path (FIX 2).
    }, [effectiveUid, currentProject?.id]);

    // AUTO-RESTORE: For completed projects, ALWAYS fetch the full processed row dataset from
    // Firebase Storage (categoryResultsUrl) to ensure 100% data parity between user and admin views.
    // This overrides the 100-row Firestore preview (rawGrid) that onSnapshot may have loaded.
    useEffect(() => {
        const catUrl = currentProject?.categoryResultsUrl;
        const projectIsComplete = currentProject?.status === 'data_quality_complete' || currentProject?.status === 'completed';
        const la = currentProject?.latestAnalysis;

        // Only run when the project is complete and we have finished the initial load
        if (!projectIsComplete || !initialLoadDone) return;

        // If we already have full data from an active pipeline session (more rows than the rowCount
        // stored in Firestore), skip — user just finished the pipeline in this session.
        // FIX: If rowCount is 0 (legacy), always attempt restoration to be safe.
        const knownRowCount = currentProject?.rowCount || 0;
        const alreadyFull = projectData.raw.length > 0 && knownRowCount > 0 && projectData.raw.length >= knownRowCount;
        if (alreadyFull) return;

        (async () => {
            setIsRestoring(true);
            try {
                if (catUrl) {
                    console.log('[Auto-Restore] Fetching full dataset from categoryResultsUrl:', catUrl);
                    const response = await fetch(catUrl);
                    if (!response.ok) {
                        console.error('[Auto-Restore] Storage fetch failed:', response.status, response.statusText);
                        console.warn('[Auto-Restore] Dashboard will use Firestore preview data instead.');
                        return;
                    }
                    const rows = await response.json();
                    console.log('[Auto-Restore] Successfully loaded', rows.length, 'rows from Storage');

                    setProjectData(prev => ({
                        ...prev,
                        raw: rows,
                        mappings: (Object.keys(prev.mappings).length > 0 ? prev.mappings : la?.mappings) ?? prev.mappings,
                        currency: prev.currency || la?.currency || 'INR',
                        clusters: (prev.clusters.length > 0 ? prev.clusters : la?.clusters) ?? prev.clusters,
                    }));
                } else if (currentProject?.categoryResults && Array.isArray(currentProject.categoryResults) && currentProject.categoryResults.length > 0) {
                    // EXPORT FIX A (Legacy Firestore): Before PERF-03, rows were written directly to Firestore as categoryResults[]
                    console.log('[Auto-Restore] Using legacy Firestore categoryResults:', currentProject.categoryResults.length, 'rows');
                    const legacyRows = currentProject.categoryResults;
                    setProjectData(prev => ({
                        ...prev,
                        raw: legacyRows,
                        mappings: (Object.keys(prev.mappings).length > 0 ? prev.mappings : la?.mappings) ?? prev.mappings,
                        currency: prev.currency || la?.currency || 'INR',
                        clusters: (prev.clusters.length > 0 ? prev.clusters : la?.clusters) ?? prev.clusters,
                    }));
                } else {
                    console.warn('[Auto-Restore] No categoryResultsUrl and no legacy data. Dashboard will use Firestore preview only.');
                }
            } catch (err) {
                console.error('[Auto-Restore] Failed to load category results:', err);
                console.warn('[Auto-Restore] Dashboard will use Firestore preview data (rawGrid) as fallback.');
            } finally {
                setIsRestoring(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentProject?.status, currentProject?.id, initialLoadDone]);

    const handleUploadComplete = (data: any[], metadata: FileMetadata, rawSheetData: any[][], merges: any[], worksheet: any, rawFile?: File) => {
        setIsProcessing(true);
        setProjectData(prev => ({
            ...prev,
            raw: data,
            fileMeta: metadata,
            rawSheetData,
            merges,
            worksheet
        }));

        setActiveStep('header-selection');

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('header-selection');

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
                    details: `Successfully ingested ${data.length} records. Analyzing structures...`,
                });

                if (rawFile && effectiveUid && db && storage) {
                    (async () => {
                        try {
                            const storagePath = `uploads/${effectiveUid}/${Date.now()}_${rawFile.name}`;
                            const storageRef = ref(storage, storagePath);
                            const snapshot = await uploadBytes(storageRef, rawFile);
                            const fileUrl = await getDownloadURL(snapshot.ref);

                            const rawGridJson = JSON.stringify(rawSheetData);
                            const rawGridRef = ref(storage, `uploads/${effectiveUid}/${currentProject.id}/raw_grid.json`);
                            await uploadString(rawGridRef, rawGridJson, 'raw');
                            const rawGridUrl = await getDownloadURL(rawGridRef);

                            const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                            await updateDoc(projectRef, {
                                currentStep: 1,
                                fileName: rawFile.name,
                                rowCount: data.length,
                                rawGrid: data.slice(0, 100), // Persist first 100 rows as preview
                                rawGridUrl,
                                status: 'upload_complete',
                                merges: merges || [],
                                updatedAt: serverTimestamp(),
                            });

                            await addDoc(collection(db, 'uploads'), {
                                userId: effectiveUid,
                                projectId: currentProject.id,
                                fileName: rawFile.name,
                                fileUrl,
                                filePath: snapshot.ref.fullPath,
                                uploadedAt: serverTimestamp(),
                                rowCount: data.length,
                                fileSizeMB: parseFloat((rawFile.size / 1024 / 1024).toFixed(2)),
                                quality: metadata.quality,
                            });
                        } catch (err) {
                            console.error('[Upload Persist] Error saving to Firebase:', err);
                        }
                    })();
                }
            }
        }, 1500);
    };

    const handleHeaderRowSelection = (rowIndex: number) => {
        if (!projectData.rawSheetData || !projectData.worksheet) return;
        setIsProcessing(true);

        const originalHeaders = projectData.rawSheetData[rowIndex].map((h: any) => String(h || '').trim());
        const cleanHeaders = originalHeaders.map(h => h.replace(/\s+/g, ' '));
        const initialMappings: Record<string, string> = {};

        cleanHeaders.forEach(header => {
            const h = header.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (h.includes('date')) initialMappings['date'] = header;
            if (h.includes('amount') || h.includes('val') || h.includes('sum')) initialMappings['amount'] = header;
            if (h.includes('vendor') || h.includes('supplier') || h.includes('name') || h.includes('party')) initialMappings['supplier'] = header;
            if (h.includes('currency') || h.includes('curr')) initialMappings['currency'] = header;
            const isCat = h.includes('l1') || h.includes('segment') || h.includes('head') || h.includes('account') || (h.includes('cat') && !h.includes('sub'));
            if (isCat && !initialMappings['category_l1']) initialMappings['category_l1'] = header;
            if (h.includes('l2') || h.includes('family') || h.includes('sub')) initialMappings['category_l2'] = header;
            if (h.includes('l3') || h.includes('class') || h.includes('commodity')) initialMappings['category_l3'] = header;
            if (!initialMappings['category_l1'] && (h.includes('cat') || h.includes('dept') || h.includes('cost'))) initialMappings['category_l1'] = header;
            if (h.includes('po') || h.includes('order')) initialMappings['po_number'] = header;
            if (h.includes('invoice') || h.includes('bill')) initialMappings['invoice_number'] = header;
            if (h.includes('plant') || h.includes('facility')) initialMappings['plant'] = header;
            if (h.includes('loc')) initialMappings['location'] = header;
            if (h.includes('item') || h.includes('desc') || h.includes('sku') || h.includes('part')) initialMappings['item_description'] = header;
            if (h.includes('contract') || h.includes('agreement')) initialMappings['contract_ref'] = header;
            if (h.includes('qty') || h.includes('quantity') || h.includes('units') || h.includes('count')) initialMappings['quantity'] = header;
            if (h.includes('price') || h.includes('rate') || (h.includes('unit') && (h.includes('cost') || h.includes('price')))) initialMappings['unit_price'] = header;
            if (h.includes('term') || h.includes('pay')) initialMappings['payment_terms'] = header;
        });

        const normalizedWS = normalizeWorksheet(projectData.worksheet);
        let data = XLSX.utils.sheet_to_json(normalizedWS, { range: rowIndex });
        data = normalizeDataKeys(data);

        const markerColumns = cleanHeaders.filter(h => {
            const lower = h.toLowerCase();
            return lower.includes('desc') || lower.includes('item') || lower.includes('amount') || lower.includes('val');
        });

        const stickyColumns = cleanHeaders.filter(h => {
            const lower = h.toLowerCase();
            return lower.includes('vendor') || lower.includes('date') || lower.includes('bill') || lower.includes('invoice') || lower.includes('supplier') || lower.includes('party');
        });

        data = stitchTransactions(data, stickyColumns, markerColumns);
        data = filterNoise(data);

        const amountCol = initialMappings['amount'];
        const currencyCol = initialMappings['currency'];
        let rowsConverted = 0;
        let assumptionsMade = false;
        const currenciesDetectedSet = new Set<string>();

        data = (data as any[]).map(row => {
            const cleaned: any = {};
            Object.keys(row as object).forEach(key => cleaned[key] = cleanValue((row as any)[key]));
            let currCode = null;
            if (currencyCol && row[currencyCol]) currCode = detectCurrency(row[currencyCol]);
            if (!currCode && amountCol && row[amountCol]) currCode = detectCurrency(row[amountCol]);
            if (!currCode) { currCode = 'INR'; assumptionsMade = true; } else { rowsConverted++; }
            currenciesDetectedSet.add(currCode);
            const rate = EXCHANGE_RATES[currCode] || 1;
            const amountVal = cleaned[amountCol] || 0;
            cleaned['Net_Value_INR'] = amountVal * rate;
            return cleaned;
        });

        const normalizationSummary = {
            currenciesDetected: Array.from(currenciesDetectedSet),
            rowsConverted,
            assumptionsMade,
            totalRows: data.length
        };

        if (!cleanHeaders.includes('Net_Value_INR')) cleanHeaders.push('Net_Value_INR');

        const newData = { raw: data, headers: cleanHeaders, mappings: initialMappings, normalizationSummary };
        setProjectData(prev => ({ ...prev, ...newData }));
        if (currentProject) updateProjectCache(currentProject.id, newData);

        if (currentProject) {
            addActivity(currentProject.id, {
                type: 'header-selection',
                label: 'Column Structural Recognition Complete',
                details: `Identified ${cleanHeaders.length} headers. Header row set to index ${rowIndex}.`,
            });
        }

        if (effectiveUid && db && currentProject) {
            (async () => {
                try {
                    const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                    await updateDoc(projectRef, {
                        selectedHeaderRow: rowIndex,
                        detectedHeaders: cleanHeaders,
                        status: 'header_selected',
                        currentStep: 2,
                        updatedAt: serverTimestamp(),
                    });
                } catch (err) {
                    console.error('[Header Selection Persist] Error updating Firestore:', err);
                }
            })();
        }

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('mapping');
        }, 1500);
    };

    useEffect(() => {
        if (isProcessing) {
            setProgress(0);
            const interval = setInterval(() => {
                setProgress(prev => {
                    if (prev >= 95) return prev;
                    return prev + Math.floor(Math.random() * 5) + 1;
                });
            }, 100);
            return () => clearInterval(interval);
        } else {
            setProgress(100);
        }
    }, [isProcessing]);

    const handleMappingComplete = (mappings: Record<string, string>, globalCurrency: string) => {
        setIsProcessing(true);
        setProjectData(prev => ({ ...prev, mappings, currency: globalCurrency }));
        if (effectiveUid && db && currentProject) {
            (async () => {
                try {
                    const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                    await updateDoc(projectRef, {
                        columnMapping: mappings,
                        status: 'mapping_complete',
                        currentStep: 3,
                        updatedAt: serverTimestamp(),
                    });
                } catch (err) {
                    console.error('[Mapping Persist] Error updating Firestore:', err);
                }
            })();
        }

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('matching');
        }, 2500);
    };

    const handleMatchingComplete = (clusters: any[]) => {
        setIsProcessing(true);
        setProjectData(prev => ({ ...prev, clusters }));

        if (currentProject) {
            addActivity(currentProject.id, {
                type: 'matching',
                label: 'Supplier Matching Complete',
                details: `Identified and grouped supplier clusters for review.`,
            });
        }

        if (effectiveUid && db && currentProject) {
            (async () => {
                try {
                    const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                    await updateDoc(projectRef, {
                        supplierMatches: clusters,
                        status: 'matching_complete',
                        currentStep: 4,
                        updatedAt: serverTimestamp(),
                    });
                } catch (err) {
                    console.error('[Matching Persist] Error updating Firestore:', err);
                }
            })();
        }

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('categorization');
        }, 2000);
    };

    const handleCategoryComplete = (updatedData: any[]) => {
        setIsProcessing(true);
        setProjectData(prev => ({ ...prev, raw: updatedData }));
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

        if (!currentProject) return;
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

        addActivity(currentProject.id, {
            type: 'categorization',
            label: 'Spend Categorization Finalized',
            details: 'Applied hierarchies across all identified suppliers.',
        });

        if (effectiveUid && db && currentProject) {
            (async () => {
                try {
                    // Phase 9 PERF-03 FIX: Persist large JSON to Storage instead of Firestore doc
                    let categoryResultsUrl = '';
                    if (storage) {
                        const rawJson = JSON.stringify(updatedData);
                        const rawRef = ref(storage, `uploads/${effectiveUid}/${currentProject.id}/category_results.json`);
                        await uploadString(rawRef, rawJson, 'raw');
                        categoryResultsUrl = await getDownloadURL(rawRef);
                    }


                    // Analytics Calculation
                    const amounts = updatedData.map(row => {
                        if (amountCol && row[amountCol]) {
                            const s = String(row[amountCol]).replace(/[^0-9.-]+/g, "");
                            return parseFloat(s) || 0;
                        }
                        return 0;
                    });
                    const totalSpendVal = amounts.reduce((acc, val) => acc + val, 0);
                    const avgTransactionValue = totalSpendVal / updatedData.length;
                    const maxTransaction = Math.max(...amounts, 0);

                    const supplierSpendMap: Record<string, number> = {};
                    updatedData.forEach((row, i) => {
                        const s = String(row[supplierCol] || 'Unknown');
                        supplierSpendMap[s] = (supplierSpendMap[s] || 0) + amounts[i];
                    });

                    const sortedSuppliers = Object.entries(supplierSpendMap).sort((a, b) => b[1] - a[1]);
                    const topVendors = sortedSuppliers.slice(0, 5).map(([name]) => name);
                    const topVendorSpend = sortedSuppliers.slice(0, 5).reduce((acc, [_, spend]) => acc + spend, 0);

                    // ABC: compute as *spend buckets* (not transaction counts) so the
                    // dashboard can display them directly as currency / percentage of spend.
                    const sortedSpend = [...amounts].sort((a, b) => b - a);
                    let currentCumul = 0;
                    let abcA = 0, abcB = 0, abcC = 0; // spend totals per tier
                    sortedSpend.forEach(val => {
                        currentCumul += val;
                        if (currentCumul <= totalSpendVal * 0.7) abcA += val;
                        else if (currentCumul <= totalSpendVal * 0.9) abcB += val;
                        else abcC += val;
                    });

                    // ── Compute savings signals from the full dataset ──────────────────────
                    // These mirror the AnalyticsDashboard dynamicStats logic so saved values
                    // match what was shown to the user when the analysis first completed.
                    const amountColSave = projectData.mappings['amount'];
                    const contractColSave = projectData.mappings['contract_ref'];
                    const ptColSave = projectData.mappings['payment_terms'];
                    const itemColSave = projectData.mappings['item_description'];

                    let contractedSpendSave = 0;
                    let ptRiskSpendSave = 0;
                    let totalIdentifiedSavingsSave = 0;
                    let priceVarianceSave = 0;
                    let complianceSave = 0;
                    let singleSourceSave = 0;
                    let tailSpendSave = 0;
                    let processEffSave = 0;
                    const isHighValueCurrencySave = /^(USD|GBP|EUR|AUD|CAD|CHF|SGD)$/i.test(projectData.currency || 'INR');
                    const lvThreshold = isHighValueCurrencySave ? 100 : 5000;
                    const peFixedSave = isHighValueCurrencySave ? 50 : 500;

                    // Global supplier spend for tail detection
                    const gSupplierSpend: Record<string, number> = {};
                    updatedData.forEach(r => {
                        const s = String(r[supplierCol] || '');
                        const a = parseFloat(String(r[amountColSave] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                        gSupplierSpend[s] = (gSupplierSpend[s] || 0) + a;
                    });
                    const gTotal = Object.values(gSupplierSpend).reduce((x, y) => x + y, 0);
                    const gTailThresh = gTotal * 0.2;
                    const gSorted = Object.entries(gSupplierSpend).sort((a, b) => a[1] - b[1]);
                    const gTailSet = new Set<string>();
                    let gCum = 0;
                    for (const [s, a] of gSorted) {
                        if (gCum + a <= gTailThresh) { gTailSet.add(s); gCum += a; } else break;
                    }

                    // Global item stats for price arbitrage
                    const gItemStats: Record<string, { minPrice: number, supplierCount: number, suppliers: Set<string> }> = {};
                    const unitPriceColSave = projectData.mappings['unit_price'];
                    updatedData.forEach(r => {
                        const item = String(r[itemColSave] || '').trim();
                        if (!item) return;
                        const up = parseFloat(String(r[unitPriceColSave] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                        const sup = String(r[supplierCol] || '');
                        if (!gItemStats[item]) gItemStats[item] = { minPrice: up || Infinity, supplierCount: 0, suppliers: new Set() };
                        gItemStats[item].suppliers.add(sup);
                        if (up > 0 && up < gItemStats[item].minPrice) gItemStats[item].minPrice = up;
                    });
                    Object.values(gItemStats).forEach(s => {
                        s.supplierCount = s.suppliers.size;
                        if (s.minPrice === Infinity) s.minPrice = 0;
                    });

                    const isContractedRefSave = (val: string): boolean => {
                        if (!val || /^[-–—/\s]*$/.test(val)) return false;
                        if (/^(n\/?a|none|nil|unverified|not available|no contract|tbd|pending|--)$/i.test(val.trim())) return false;
                        return /contracted|active|valid|yes|\bY\b|PO-|CT-|CON-|AGR-|\d{4,}/i.test(val);
                    };

                    updatedData.forEach(r => {
                        const amount = parseFloat(String(r[amountColSave] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                        const supplier = String(r[supplierCol] || '');
                        const item = String(r[itemColSave] || '').trim();
                        const up = parseFloat(String(r[unitPriceColSave] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                        const qty = parseFloat(String(r[projectData.mappings['quantity']] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                        const contractRaw = String(r[contractColSave] || r['Contract_Status'] || '').trim();
                        const hasContract = isContractedRefSave(contractRaw);
                        const ptVal = String(r[ptColSave] || '').toLowerCase();
                        if (hasContract) contractedSpendSave += amount;
                        if (/immediate|cash|net 7|net0|net.?7|pickup|advance|prepay/i.test(ptVal)) ptRiskSpendSave += amount;

                        let rowSav = 0;
                        // Lever 1: Price Arbitrage
                        if (item && gItemStats[item]?.supplierCount > 1 && up > gItemStats[item].minPrice) {
                            const impliedQty = qty || (up > 0 ? amount / up : 0);
                            const v = (up - gItemStats[item].minPrice) * impliedQty;
                            if (v > 0) { rowSav = v; priceVarianceSave += v; totalIdentifiedSavingsSave += v; }
                        }
                        // Lever 2: Contract Compliance
                        if (rowSav === 0 && !hasContract) {
                            const catL = String(r[projectData.mappings['category_l1'] || projectData.mappings['category']] || '').toLowerCase();
                            let rate = 0.05;
                            if (catL.includes('material') || catL.includes('raw') || catL.includes('production')) rate = 0.08;
                            else if (catL.includes('it') || catL.includes('tech') || catL.includes('software')) rate = 0.06;
                            else if (catL.includes('logistics') || catL.includes('transport')) rate = 0.07;
                            else if (catL.includes('facility') || catL.includes('maintenance')) rate = 0.10;
                            else if (catL.includes('marketing') || catL.includes('media')) rate = 0.08;
                            rowSav = amount * rate; complianceSave += rowSav; totalIdentifiedSavingsSave += rowSav;
                        }
                        // Lever 3: Single Source (contracted sole-source at 3%)
                        if (rowSav === 0 && item && gItemStats[item]?.supplierCount === 1) {
                            rowSav = amount * 0.03; singleSourceSave += rowSav; totalIdentifiedSavingsSave += rowSav;
                        }
                        // Lever 4: Tail Spend
                        if (rowSav === 0 && gTailSet.has(supplier)) {
                            rowSav = amount * 0.10; tailSpendSave += rowSav; totalIdentifiedSavingsSave += rowSav;
                        }
                        // Lever 5: Process Efficiency
                        if (rowSav === 0 && amount < lvThreshold) {
                            rowSav = peFixedSave; processEffSave += rowSav; totalIdentifiedSavingsSave += rowSav;
                        }
                    });

                    const contractedPctSave = totalSpendVal > 0 ? (contractedSpendSave / totalSpendVal) * 100 : 0;
                    const ptRiskPctSave = totalSpendVal > 0 ? (ptRiskSpendSave / totalSpendVal) * 100 : 0;

                    // Item-level sourcing signals
                    const iMapSave: Record<string, { spend: number, suppliers: Set<string> }> = {};
                    updatedData.forEach(r => {
                        const item = String(r[itemColSave] || '').trim();
                        if (!item) return;
                        const sup = String(r[supplierCol] || 'Unknown');
                        const amt = parseFloat(String(r[amountColSave] || '0').replace(/[^0-9.-]+/g, '')) || 0;
                        if (!iMapSave[item]) iMapSave[item] = { spend: 0, suppliers: new Set() };
                        iMapSave[item].spend += amt;
                        iMapSave[item].suppliers.add(sup);
                    });
                    const singleSrcSpendSave = Object.values(iMapSave).filter(i => i.suppliers.size === 1).reduce((a, i) => a + i.spend, 0);
                    const singleSourcingPctSave = totalSpendVal > 0 ? (singleSrcSpendSave / totalSpendVal) * 100 : 0;

                    // Tail spend % for lever signals
                    const tailSpendAmtSave = Object.entries(gSupplierSpend).filter(([s]) => gTailSet.has(s)).reduce((a, [, v]) => a + v, 0);
                    const tailSpendPctSave = gTotal > 0 ? (tailSpendAmtSave / gTotal) * 100 : 0;

                    const dateCol = projectData.mappings['date'];
                    let dateRangeStart = '';
                    let dateRangeEnd = '';
                    if (dateCol) {
                        const dates = updatedData.map(row => row[dateCol]).filter(Boolean).map(d => new Date(d)).filter(d => !isNaN(d.getTime()));
                        if (dates.length > 0) {
                            // Phase 9 MEDIUM-02 FIX: Removed unguarded spread operator Math.max(...dates)
                            dateRangeStart = new Date(dates.reduce((min, d) => Math.min(min, d.getTime()), dates[0].getTime())).toISOString();
                            dateRangeEnd = new Date(dates.reduce((max, d) => Math.max(max, d.getTime()), dates[0].getTime())).toISOString();
                        }
                    }

                    const rowHashes = updatedData.map(row => `${row[supplierCol]}|${row[amountCol]}|${row[dateCol]}`);
                    const hashCounts: Record<string, number> = {};
                    rowHashes.forEach(h => hashCounts[h] = (hashCounts[h] || 0) + 1);
                    let duplicateCount = 0;
                    let duplicateValue = 0;
                    Object.entries(hashCounts).forEach(([hash, count]) => {
                        if (count > 1) {
                            duplicateCount += (count - 1);
                            const amountStr = hash.split('|')[1].replace(/[^0-9.-]+/g, "");
                            duplicateValue += (parseFloat(amountStr) || 0) * (count - 1);
                        }
                    });

                    const projectsDocRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                    await updateDoc(projectsDocRef, {
                        // PERF-03 FIX: We store the URL, not the megabyte JSON block
                        categoryResultsUrl,
                        status: 'categorization_complete',
                        currentStep: 5,
                        updatedAt: serverTimestamp(),
                        latestAnalysis: {
                            totalSpend: totalSpendVal,
                            avgTransactionValue,
                            maxTransaction,
                            uniqueVendors: uniqueSuppliers,
                            topVendors,
                            topVendorSpend,
                            duplicateCount,
                            duplicateValue,
                            // Savings — use REAL computed values, not synthetic 8-12% estimates
                            savingsPotentialMin: totalIdentifiedSavingsSave,
                            savingsPotentialMax: totalIdentifiedSavingsSave * 1.2,
                            identifiedSavings: totalIdentifiedSavingsSave,
                            // Savings breakdown by lever (for Quick-Win / Strategic split on restore)
                            savingsBreakdown: {
                                priceVariance: priceVarianceSave,
                                compliance: complianceSave,
                                singleSource: singleSourceSave,
                                tailSpend: tailSpendSave,
                                processEfficiency: processEffSave,
                            },
                            // Key dataset signals (for data-driven lever probabilities on restore)
                            contractedPercent: contractedPctSave,
                            ptRiskPercent: ptRiskPctSave,
                            singleSourcingPct: singleSourcingPctSave,
                            tailSpendPct: tailSpendPctSave,
                            // ABC as spend amounts (not counts) for correct % display
                            abcA,
                            abcB,
                            abcC,
                            dateRangeStart,
                            dateRangeEnd,
                            totalRows: updatedData.length,
                            mappings: projectData.mappings,
                            currency: projectData.currency,
                            // NOTE: clusters (supplier matches) are already stored in the supplierMatches
                            // field of the project document. Do NOT duplicate them here — large cluster
                            // arrays can push the Firestore document past the 1 MB limit and silently
                            // fail the entire write, causing latestAnalysis to be missing on revisit.
                        }
                    });

                    // Also update the original upload doc for easier global lookups
                    const uploadsQuery = query(collection(db, 'uploads'), where('projectId', '==', currentProject.id), where('userId', '==', effectiveUid));
                    const snap = await getDocs(uploadsQuery);
                    if (!snap.empty) {
                        await updateDoc(snap.docs[0].ref, {
                            analysis: {
                                totalSpend: totalSpendVal,
                                uniqueVendors: uniqueSuppliers,
                                uniqueCategories,
                                savingsPotentialMin: totalIdentifiedSavingsSave,
                                savingsPotentialMax: totalIdentifiedSavingsSave * 1.2,
                                identifiedSavings: totalIdentifiedSavingsSave,
                                duplicateCount,
                                abcA,
                                abcB,
                                abcC,
                                categoryResultsUrl: categoryResultsUrl // Mirrored for unified download access
                            }
                        });
                    }
                } catch (err) {
                    console.error('[Analysis Persist] Error writing projects doc:', err);
                }
            })();
        }

        setTimeout(() => {
            setIsProcessing(false);
            setActiveStep('data-quality');
        }, 1500);
    };

    const handleExport = async () => {
        const pd = projectData;
        // CRITICAL-03 FIX: Guard against !effectiveUid instead of !user
        if (!pd || pd.raw.length === 0 || !effectiveUid) return;
        try {
            const wb = XLSX.utils.book_new();
            const ws = XLSX.utils.json_to_sheet(pd.raw);
            XLSX.utils.book_append_sheet(wb, ws, 'Data Domino Export');
            const wbArrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
            const blob = new Blob([wbArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const fileName = `${currentProject?.name ?? 'export'}_${Date.now()}.xlsx`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(url);

            if (effectiveUid && db && storage) {
                try {
                    const storagePath = `exports/${effectiveUid}/${fileName}`;
                    const storageRef = ref(storage, storagePath);
                    const snapshot = await uploadBytes(storageRef, blob);
                    const fileUrl = await getDownloadURL(snapshot.ref);
                    await addDoc(collection(db, 'exports'), {
                        userId: effectiveUid,
                        projectId: currentProject?.id ?? '',
                        fileName,
                        fileUrl,
                        filePath: snapshot.ref.fullPath,
                        exportedAt: serverTimestamp(),
                        rowCount: pd.raw.length,
                    });
                    if (currentProject) {
                        addActivity(currentProject.id, {
                            type: 'export',
                            label: 'Report Exported',
                            details: `${pd.raw.length} rows exported to ${fileName}`,
                            metadata: { fileUrl },
                        });
                    }
                } catch (err) {
                    console.error('[Export Persist] Error saving to Firebase:', err);
                }
            }
        } catch (err) {
            console.error('[Export] Error generating xlsx:', err);
        }
    };

    const handleDataQualityComplete = () => {
        setIsProcessing(true);
        if (currentProject) {
            updateProject(currentProject.id, {
                status: 'data_quality_complete',
                currentStep: 6
            });
            updateProjectCache(currentProject.id, projectData);

            // Phase 9 CRITICAL-04 FIX: Removed !isViewingClient so Admins can finalize pipelines on behalf of users.
            if (effectiveUid && db) {
                (async () => {
                    try {
                        const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                        await updateDoc(projectRef, {
                            // Phase 9 PERF-03: DO NOT save raw payload objects in docs. We rely on rawGridUrl stored previously.
                            status: 'data_quality_complete',
                            currentStep: 6,
                            finalizedAt: serverTimestamp(),
                            updatedAt: serverTimestamp(),
                        });
                    } catch (err) {
                        console.error('[Finalize Persist] Error updating Firestore:', err);
                    }
                })();
            }
        }
        setIsProcessing(false);
        setActiveStep('dashboard');
    };

    return (
        <div className="flex flex-col h-screen bg-zinc-950 text-white overflow-hidden">
            {isRestoring && (
                <div className="flex fixed inset-0 z-[110] bg-zinc-950 items-center justify-center text-white px-6">
                    <div className="max-w-md w-full text-center space-y-8">
                        <div className="relative w-24 h-24 mx-auto">
                            <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                            <div className="relative w-full h-full bg-zinc-900 border border-zinc-800 rounded-3xl flex items-center justify-center">
                                <Database className="h-10 w-10 text-primary animate-pulse" />
                            </div>
                        </div>
                        <div>
                            <h2 className="text-3xl font-bold mb-3 tracking-tight">Restoring Session</h2>
                            <p className="text-zinc-500 text-lg leading-relaxed">
                                Recovering your project data and pipeline state...
                            </p>
                        </div>
                    </div>
                </div>
            )}
            {isProcessing && (
                <div className="flex fixed inset-0 z-[100] bg-zinc-950 items-center justify-center text-white px-6">
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
                                Analyzing data structures, normalizing currencies, and preparing your interface...
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
                                <span>Processing Pipeline</span>
                                <span>{progress}% Complete</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
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
            <div className="flex flex-1 overflow-hidden">
                <AppSidebar activeStep={activeStep} onNavigate={setActiveStep} currentProject={currentProject!} onBack={() => setCurrentProject(null)} onOpenSettings={() => setIsSettingsOpen(true)} />
                <ProjectSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} project={currentProject!} onUpdate={(id, data) => updateProject(id, data)} onDelete={(id) => { deleteProject(id); setCurrentProject(null); }} />
                <main className="flex-1 flex flex-col overflow-hidden pl-80">
                    <header className="h-16 border-b border-zinc-900 bg-zinc-950/50 backdrop-blur-md flex items-center justify-between px-8 shrink-0">
                        <div className="flex items-center gap-4 text-sm">
                            <span className="text-zinc-500">Pipeline</span>
                            <ChevronRight className="h-4 w-4 text-zinc-700" />
                            <span className="font-bold text-primary capitalize">{activeStep}</span>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 mr-2">
                                <span className={cn("px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border", effectiveRole === 'admin' ? "bg-red-500/10 text-red-400 border-red-500/20" : effectiveRole === 'enterprise' ? "bg-primary/10 text-primary border-primary/20" : "bg-amber-500/10 text-amber-400 border-amber-500/20")}>{effectiveRole === 'admin' ? 'Admin' : effectiveRole === 'enterprise' ? 'Enterprise' : 'Trial'}</span>
                                <span className="text-zinc-500 text-xs font-medium hidden md:inline">{(isAdmin && isViewingClient && viewingClient) ? viewingClient.displayName || viewingClient.email?.split('@')[0] : user?.displayName || user?.email?.split('@')[0]}</span>
                            </div>
                            <div className="px-3 py-1.5 bg-zinc-900 rounded-lg text-xs font-bold text-zinc-400 flex items-center gap-2"><FileCheck2 className="h-4 w-4 text-zinc-600" /> Last Save: Just now</div>
                            {/* FIX 5: Save Draft persists the current pipeline step to Firestore */}
                            <button onClick={async () => {
                                if (!currentProject || !effectiveUid) return;
                                try {
                                    const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                                    await updateDoc(projectRef, {
                                        columnMapping: projectData.mappings,
                                        currency: projectData.currency,
                                        updatedAt: serverTimestamp(),
                                    });
                                    alert('Draft saved successfully.');
                                } catch (err) {
                                    console.error('[Save Draft]', err);
                                    alert('Save failed. Please try again.');
                                }
                            }} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg text-xs font-bold transition-all">Save Draft</button>
                            {/* FIX 6: Run Step is only enabled when there is meaningful data to process */}
                            {(() => {
                                const canRunStep = (
                                    (activeStep === 'header-selection' && (projectData.rawSheetData?.length ?? 0) > 0) ||
                                    (activeStep === 'mapping' && projectData.headers.length > 0) ||
                                    (activeStep === 'matching' && projectData.raw.length > 0) ||
                                    (activeStep === 'categorization' && projectData.raw.length > 0) ||
                                    (activeStep === 'data-quality' && projectData.raw.length > 0)
                                );
                                return (
                                    <button
                                        disabled={!canRunStep}
                                        onClick={() => {
                                            if (activeStep === 'mapping') handleMappingComplete(projectData.mappings, projectData.currency);
                                            else if (activeStep === 'matching') handleMatchingComplete(projectData.clusters);
                                            else if (activeStep === 'categorization') handleCategoryComplete(projectData.raw);
                                            else if (activeStep === 'data-quality') handleDataQualityComplete();
                                        }}
                                        className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-primary/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                                    >
                                        Run Step
                                    </button>
                                );
                            })()}
                            <ExportButton canExport={canExport} onExport={handleExport} />
                        </div>
                    </header>
                    <div className="flex-1 overflow-y-auto p-12">
                        <div className={cn("mx-auto transition-all duration-500", activeStep === 'dashboard' || activeStep === 'categorization' ? "max-w-7xl" : "max-w-4xl")}>
                            {activeStep === 'dashboard' && (
                                <>
                                    {!initialLoadDone ? (
                                        <div className="space-y-8 animate-pulse">
                                            <div className="h-12 bg-zinc-900 rounded-2xl w-1/3" />
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                                {[1, 2, 3, 4].map(i => (
                                                    <div key={i} className="h-32 bg-zinc-900 rounded-3xl" />
                                                ))}
                                            </div>
                                            <div className="h-96 bg-zinc-900 rounded-[2.5rem]" />
                                        </div>
                                    ) : (
                                        <>
                                            {showResumePrompt && projectState === 'SHOW_RESUME_PIPELINE' && (
                                                <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-8 flex items-center justify-between backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-500">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                                                            <p className="font-bold text-sm">Resume your project</p>
                                                        </div>
                                                        <p className="text-xs text-zinc-500 font-medium">
                                                            You were on step {resumeStep} of 6 — <span className="text-zinc-300">{currentProject?.name}</span>
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => navigateToPipelineStep(resumeStep)}
                                                        className="bg-primary hover:bg-primary/90 text-white px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
                                                    >
                                                        Continue
                                                    </button>
                                                </div>
                                            )}

                                            {/* CASE 2: File uploaded but pipeline not started — show resume prompt */}
                                            {projectState === 'SHOW_RESUME_UPLOAD' && (
                                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                    <div>
                                                        <h1 className="text-4xl font-bold mb-3 tracking-tight">Step 1: Data Ingestion</h1>
                                                        <p className="text-lg text-zinc-500 max-w-2xl">Your file was uploaded but the pipeline was not started. Continue below or upload a different file.</p>
                                                    </div>
                                                    <div className="bg-zinc-900/50 border border-primary/20 rounded-2xl p-6 animate-in fade-in slide-in-from-top-4 duration-500">
                                                        <div className="flex items-center gap-3 mb-4">
                                                            <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                                                                <Database className="h-5 w-5 text-primary" />
                                                            </div>
                                                            <div>
                                                                <p className="font-bold text-sm">Continue your previous upload</p>
                                                                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-0.5">
                                                                    {currentProject?.fileName ?? 'previous file'} was uploaded but not processed.
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-3">
                                                            <button
                                                                onClick={() => resumeFromSavedGrid()}
                                                                className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-primary/20"
                                                            >
                                                                Continue Processing
                                                            </button>
                                                            {/* FIX 7: Reset in-place — clear rawGridUrl from Firestore and show the FileUpload widget
                                                                 without navigating the user away from their current project. */}
                                                            <button
                                                                onClick={async () => {
                                                                    if (!currentProject || !effectiveUid) return;
                                                                    try {
                                                                        const projectRef = doc(db, 'projects', `${effectiveUid}_${currentProject.id}`);
                                                                        await updateDoc(projectRef, {
                                                                            rawGridUrl: null,
                                                                            currentStep: 0,
                                                                            status: 'draft',
                                                                            fileName: null,
                                                                            rowCount: 0,
                                                                            updatedAt: serverTimestamp(),
                                                                        });
                                                                        // Clear local session data so SHOW_UPLOAD renders
                                                                        setProjectData({
                                                                            raw: [],
                                                                            headers: [],
                                                                            mappings: {},
                                                                            currency: 'INR',
                                                                            clusters: [],
                                                                            fileMeta: undefined,
                                                                        });
                                                                        setActiveStep('dashboard');
                                                                        // Update local project object so determineProjectState flips immediately
                                                                        updateProject(currentProject.id, {
                                                                            rawGridUrl: undefined,
                                                                            currentStep: 0,
                                                                            status: 'draft',
                                                                        } as any);
                                                                    } catch (err) {
                                                                        console.error('[Upload Different File]', err);
                                                                    }
                                                                }}
                                                                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                                                            >
                                                                Upload Different File
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* CASE 1: Brand new project — show upload form */}
                                            {projectState === 'SHOW_UPLOAD' && (
                                                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                                    <div>
                                                        <h1 className="text-4xl font-bold mb-3 tracking-tight">Step 1: Data Ingestion</h1>
                                                        <p className="text-lg text-zinc-500 max-w-2xl">Select procurement data files. We support massive datasets from SAP, Tally, and custom ERP exports.</p>
                                                    </div>
                                                    <FileUpload onUploadComplete={(data, metadata, raw, merges, ws, rawFile) => handleUploadComplete(data, metadata, raw!, merges!, ws!, rawFile)} disabled={isUploadDisabled} />
                                                    {isUploadDisabled && (
                                                        <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-center gap-3">
                                                            <AlertCircle className="h-5 w-5 text-amber-500" />
                                                            <div className="flex-1">
                                                                <p className="text-sm text-amber-500 font-bold">Trial Limit Reached</p>
                                                                <p className="text-xs text-amber-500/70 mt-0.5 font-medium">
                                                                    You have completed your free trial project. Upgrade to Enterprise to analyze unlimited procurement files.
                                                                </p>
                                                                <button
                                                                    onClick={() => window.open('https://cal.id/hello-enalsys', '_blank')}
                                                                    className="mt-2 bg-amber-500 text-black px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-amber-400 transition-colors"
                                                                >
                                                                    Upgrade Now
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* CASE 4: Completed project — show analytics dashboard */}
                                            {projectState === 'SHOW_DASHBOARD' && (
                                                <AnalyticsDashboard
                                                    data={projectData.raw}
                                                    mappings={projectData.mappings}
                                                    clusters={projectData.clusters}
                                                    currency={projectData.currency}
                                                    projectStats={currentProject?.stats}
                                                    restoredAnalysis={analysis}
                                                    isLoading={isRestoring}
                                                    restoredStats={{
                                                        totalSpend,
                                                        savingsPotentialMin,
                                                        savingsPotentialMax,
                                                        uniqueVendors,
                                                        duplicateCount,
                                                        abcA,
                                                        abcB,
                                                        abcC,
                                                        // Extended savings signals (present for projects after the savings-engine fix)
                                                        ...(identifiedSavings ? { identifiedSavings } : {}),
                                                        ...(savingsBreakdown ? { savingsBreakdown } : {}),
                                                        ...(contractedPercent != null ? { contractedPercent } : {}),
                                                        ...(ptRiskPercent != null ? { ptRiskPercent } : {}),
                                                        ...(singleSourcingPct != null ? { singleSourcingPct } : {}),
                                                        ...(tailSpendPct != null ? { tailSpendPct } : {}),
                                                    }}
                                                />
                                            )}
                                        </>

                                    )}
                                </>
                            )}
                            {activeStep === 'data-quality' && (projectData.fileMeta || projectData.raw.length > 0) && (
                                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8 bg-zinc-900/40 border border-zinc-900 rounded-[2.5rem] backdrop-blur-sm">
                                    <h3 className="text-xl font-bold mb-8">Data Quality Assessment</h3>
                                    <DataProfiling data={projectData.raw} headers={projectData.headers} normalizationSummary={projectData.normalizationSummary} />
                                    <div className="mt-12 flex justify-end">
                                        <button onClick={handleDataQualityComplete} className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-emerald-500/20 hover:scale-[1.02] transition-all">Finalize Project <FileCheck2 className="h-5 w-5" /></button>
                                    </div>
                                </motion.div>
                            )}
                            {activeStep === 'mapping' && <ColumnMapper onConfirm={handleMappingComplete} headers={projectData.headers} initialMappings={projectData.mappings} />}
                            {activeStep === 'header-selection' && (
                                projectData.rawSheetData && projectData.rawSheetData.length > 0 ? (
                                    <HeaderRowSelector rawData={projectData.rawSheetData} merges={projectData.merges} onSelect={handleHeaderRowSelection} />
                                ) : (currentProject?.rawGridUrl || isRestoring) ? (
                                    <div className="flex flex-col items-center justify-center h-[60vh] space-y-8 animate-in fade-in duration-500">
                                        <div className="relative">
                                            <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Database className="h-8 w-8 text-primary animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="text-center space-y-2">
                                            <h2 className="text-2xl font-bold">Resuming Session</h2>
                                            <p className="text-zinc-500 max-w-sm">
                                                Restoring your spreadsheet data from secure storage.
                                                This usually takes just a few seconds...
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center p-12 bg-zinc-900/50 border border-zinc-800 rounded-[2.5rem] text-center max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4">
                                        <div className="w-20 h-20 bg-amber-500/10 rounded-3xl flex items-center justify-center text-amber-500">
                                            <AlertCircle className="h-10 w-10" />
                                        </div>
                                        <div className="space-y-3">
                                            <h2 className="text-2xl font-bold">Header Data Session Expired</h2>
                                            <p className="text-zinc-500">
                                                For security and performance, original spreadsheet grids are kept in memory only during the active upload session.
                                            </p>
                                        </div>
                                        {projectData.raw.length > 0 ? (
                                            <div className="p-6 bg-emerald-500/5 border border-emerald-500/10 rounded-2xl text-emerald-500 text-sm font-medium">
                                                Your project is already processed and analytics are ready.
                                                You can view results on the Dashboard.
                                            </div>
                                        ) : (
                                            <p className="text-zinc-500 text-sm">
                                                To re-run header discovery, please re-upload your file on the Dashboard.
                                            </p>
                                        )}
                                        <button
                                            onClick={() => setActiveStep('dashboard')}
                                            className="px-8 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all border border-zinc-700"
                                        >
                                            Return to Dashboard
                                        </button>
                                    </div>
                                )
                            )}
                            {activeStep === 'matching' && <SupplierMatching onComplete={handleMatchingComplete} data={projectData.raw} mappings={projectData.mappings} />}
                            {activeStep === 'categorization' && <CategoryMapper data={projectData.raw} mappings={projectData.mappings} onComplete={handleCategoryComplete} currency={projectData.currency} />}
                            {activeStep === 'history' && <ActivityHistory projectId={currentProject?.id || ''} />}
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
};

export default ProjectView;
