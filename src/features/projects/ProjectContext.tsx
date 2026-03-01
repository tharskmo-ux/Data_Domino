import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useEffectiveUid } from '../../hooks/useEffectiveUid';
import { db } from '../../lib/firebase';
import {
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc,
    deleteDoc,
    serverTimestamp,
    getDoc
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { useAdminView } from '../admin/AdminViewContext';


export interface Project {
    id: string;
    name: string;
    description: string;
    template: string;
    currency?: string;
    createdAt: string;
    status: 'draft' | 'processing' | 'completed' | 'error' | 'upload_complete' | 'header_selected' | 'mapping_complete' | 'matching_complete' | 'categorization_complete' | 'data_quality_complete';
    stats: {
        spend: number;
        quality: number;
        transactions: number;
        categoriesCount: number;
        suppliersCount: number;
        savingsPotential?: number;
    };
    activities: {
        id: string;
        type: 'export' | 'mapping' | 'matching' | 'categorization' | 'upload' | 'header-selection' | 'creation';
        label: string;
        timestamp: string;
        details?: string;
        metadata?: any;
    }[];
    // Pipeline Persistence Fields
    currentStep?: string | number;
    uploadId?: string;
    fileName?: string;
    rowCount?: number;
    rawGrid?: any[];
    merges?: any[];
    selectedHeaderRow?: number;
    detectedHeaders?: string[];
    columnMapping?: Record<string, string>;
    supplierMatches?: any[];
    categoryResults?: any[];
    dataQualityResults?: any;
    latestAnalysis?: any;
    rawGridUrl?: string;
    categoryResultsUrl?: string;
    finalizedAt?: string;
}

interface ProjectContextType {
    projects: Project[];
    // FIX 4: Promise<void> return type so CreateProjectModal can await the Firestore write
    createProject: (data: { name: string, description: string, template: string }) => Promise<void>;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    currentProject: Project | null;
    setCurrentProject: React.Dispatch<React.SetStateAction<Project | null>>;
    addActivity: (projectId: string, activity: Omit<Project['activities'][0], 'id' | 'timestamp'>) => void;
    // Session Cache for large data (prototype only)
    projectDataCache: Record<string, any>;
    updateProjectCache: (projectId: string, data: any) => void;
    lifetimeProjectCount: number;
    checkTrialLimit: (uid: string) => Promise<boolean>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

// Helper to normalize project data from any source (LocalStorage or Firestore)
export const normalizeProject = (data: any, projectUuid: string): Project => {
    const normalizeDate = (date: any): string => {
        try {
            if (!date) return new Date().toISOString();
            if (date.toDate) return date.toDate().toISOString();
            if (typeof date === 'object' && date.seconds) return new Date(date.seconds * 1000).toISOString();
            const d = new Date(date);
            return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        } catch (e) { return new Date().toISOString(); }
    };

    const cleanNum = (val: any): number => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        const s = String(val).replace(/[^0-9.-]+/g, "");
        return parseFloat(s) || 0;
    };

    const safeStats = data.stats || {};
    // Extract stats from latestAnalysis (handle both nested and flat structures)
    const la = data.latestAnalysis || {};
    const laStats = la.stats || {};

    return {
        id: projectUuid,
        name: String(data.name || data.projectName || la.projectName || data.label || `Project ${projectUuid.slice(-4)}`),
        description: String(data.description || la.description || 'No description provided.'),
        template: String(data.template || 'default'),
        currency: String(data.currency || la.currency || 'INR').slice(0, 3),
        createdAt: normalizeDate(data.createdAt || data.timestamp || data.updatedAt || la.timestamp),
        status: data.status || (data.latestAnalysis ? 'completed' : 'draft'),
        stats: {
            spend: cleanNum(safeStats.spend || laStats.spend || la.totalSpend || la.spend),
            quality: cleanNum(safeStats.quality || laStats.quality || la.quality || 0),
            transactions: cleanNum(safeStats.transactions || laStats.transactions || la.rowCount || 0),
            categoriesCount: cleanNum(safeStats.categoriesCount || laStats.categoriesCount || la.uniqueCategories),
            suppliersCount: cleanNum(safeStats.suppliersCount || laStats.suppliersCount || la.uniqueVendors || la.suppliersCount),
            savingsPotential: cleanNum(safeStats.savingsPotential || laStats.savingsPotential || la.savingsPotentialMin || la.savingsPotentialMax || data.savingsPotential || (cleanNum(la.totalSpend || la.spend) * 0.1)),
        },
        activities: (Array.isArray(data.activities) ? data.activities : []).map((act: any) => ({
            id: String(act.id || Math.random().toString(36).substr(2, 5)),
            type: act.type || 'creation',
            label: String(act.label || 'Activity'),
            timestamp: normalizeDate(act.timestamp),
            details: String(act.details || ''),
            metadata: act.metadata || {}
        })),
        // Pipeline Persistence Restoration
        // FIX 3: Use numeric values (0 = new, 6 = done) so Number() never produces NaN
        currentStep: data.currentStep !== undefined ? data.currentStep : (data.latestAnalysis ? 6 : 0),
        uploadId: data.uploadId || la.uploadId,
        fileName: data.fileName || la.fileName,
        rowCount: cleanNum(data.rowCount || la.rowCount),
        rawGrid: Array.isArray(data.rawGrid) ? data.rawGrid : (Array.isArray(la.raw) ? la.raw : []),
        merges: Array.isArray(data.merges) ? data.merges : (Array.isArray(la.merges) ? la.merges : []),
        selectedHeaderRow: data.selectedHeaderRow !== undefined ? data.selectedHeaderRow : la.selectedHeaderRow,
        detectedHeaders: Array.isArray(data.detectedHeaders) ? data.detectedHeaders : la.headers,
        columnMapping: data.columnMapping || la.mappings,
        supplierMatches: Array.isArray(data.supplierMatches) ? data.supplierMatches : la.clusters,
        categoryResults: Array.isArray(data.categoryResults) ? data.categoryResults : la.categoryResults,
        dataQualityResults: data.dataQualityResults || null,
        latestAnalysis: data.latestAnalysis || null,
        rawGridUrl: data.rawGridUrl || null,
        categoryResultsUrl: data.categoryResultsUrl || null,
        finalizedAt: normalizeDate(data.finalizedAt)
    };
};

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { role, isAdmin } = useAuth();
    const { isViewingClient, viewingClient } = useAdminView();
    const effectiveUid = useEffectiveUid();

    // Determine the effective role for limit checks
    const effectiveRole = (isAdmin && isViewingClient && viewingClient) ? viewingClient.role : role;
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    const [projectDataCache, setProjectDataCache] = useState<Record<string, any>>({});
    const [lifetimeProjectCount, setLifetimeProjectCount] = useState(0);
    const isCreatingRef = useRef(false);

    const updateProjectCache = (projectId: string, data: any) => {
        setProjectDataCache(prev => ({ ...prev, [projectId]: data }));
    };

    // Load projects from Firestore
    useEffect(() => {
        if (!effectiveUid) {
            setProjects([]);
            return;
        }

        const fetchProjects = async () => {
            try {
                const projectsRef = collection(db, 'projects');
                const q = query(projectsRef, where('userId', '==', effectiveUid));
                const querySnapshot = await getDocs(q);

                const loadedProjects = querySnapshot.docs.map(doc => {
                    // Doc IDs are "{uid}_{projectId}" — slice from first underscore to preserve
                    // project IDs that might themselves contain underscores in future.
                    const rawId = doc.id;
                    const projectId = rawId.includes('_') ? rawId.slice(rawId.indexOf('_') + 1) : rawId;
                    return normalizeProject(doc.data(), projectId);
                });

                setProjects(loadedProjects);
                setLifetimeProjectCount(loadedProjects.length);
            } catch (err) {
                console.error('[ProjectContext] Error fetching projects:', err);
            }
        };

        fetchProjects();
    }, [effectiveUid]);

    const createProject = async (data: { name: string, description: string, template: string }) => {
        if (!effectiveUid || isCreatingRef.current) return;

        // SAFEGUARD: Enforce trial limit — only Admin and Enterprise can bypass.
        // This implicitly captures 'trial', 'none', and any other new role types.
        if (effectiveRole !== 'admin' && effectiveRole !== 'enterprise') {
            // First check local state for immediate feedback — exclude empty step-0 drafts
            const meaningfulLocal = projects.filter(
                p => (Number(p.currentStep) > 0) || !!p.rawGridUrl
            );
            if (meaningfulLocal.length >= 1) {
                console.error('[ProjectContext] Trial limit reached (local).');
                return;
            }

            // Then check backend to be absolutely sure (prevents bypass if local state is clearing)
            const isLimitReached = await checkTrialLimit(effectiveUid);
            if (isLimitReached) {
                console.error('[ProjectContext] Trial limit reached (backend).');
                return;
            }
        }

        isCreatingRef.current = true;
        try {
            const projectId = Math.random().toString(36).substr(2, 9);
            const docId = `${effectiveUid}_${projectId}`;
            const newProject: Project = {
                id: projectId,
                ...data,
                createdAt: new Date().toISOString(),
                status: 'draft',
                // FIX 3: Explicitly set currentStep:0 so determineProjectState returns SHOW_UPLOAD immediately
                currentStep: 0,
                stats: { spend: 0, quality: 0, transactions: 0, categoriesCount: 0, suppliersCount: 0 },
                activities: [{
                    id: Math.random().toString(36).substr(2, 5),
                    type: 'creation',
                    label: 'Project Created',
                    timestamp: new Date().toISOString(),
                    details: 'Project initial setup completed.'
                }]
            };

            await setDoc(doc(db, 'projects', docId), {
                ...newProject,
                userId: effectiveUid,
                updatedAt: serverTimestamp()
            });

            setProjects(prev => [...prev, newProject]);
            setCurrentProject(newProject);
        } catch (err) {
            console.error('[ProjectContext] Error creating project:', err);
        } finally {
            isCreatingRef.current = false;
        }
    };

    const updateProject = async (id: string, updates: Partial<Project>) => {
        if (!effectiveUid) return;

        try {
            const docId = `${effectiveUid}_${id}`;
            const projectRef = doc(db, 'projects', docId);

            // If updating stats, ensure we merge properly
            await setDoc(projectRef, updates, { merge: true });

            setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
            if (currentProject?.id === id) {
                setCurrentProject(prev => prev ? { ...prev, ...updates } : null);
            }
        } catch (err) {
            console.error('[ProjectContext] Error updating project:', err);
        }
    };

    const deleteProject = async (id: string) => {
        if (!effectiveUid) return;

        try {
            const docId = `${effectiveUid}_${id}`;

            // 1. Delete associated uploads.
            // userId filter is required — without it Firestore rejects the query
            // because the security rule requires resource.data.userId == request.auth.uid
            // and that condition can't be proven without the constraint.
            // Wrapped in its own try/catch so a cleanup failure never blocks project deletion.
            try {
                const uploadsQuery = query(
                    collection(db, 'uploads'),
                    where('projectId', '==', id),
                    where('userId', '==', effectiveUid)
                );
                const uploadsSnap = await getDocs(uploadsQuery);
                await Promise.all(uploadsSnap.docs.map(d => deleteDoc(d.ref)));
            } catch (uploadErr) {
                console.warn('[ProjectContext] Upload cleanup failed (non-fatal):', uploadErr);
            }

            // 2. Delete the project document
            await deleteDoc(doc(db, 'projects', docId));

            // 3. Update local state
            setProjects(prev => prev.filter(p => p.id !== id));
            if (currentProject?.id === id) setCurrentProject(null);
        } catch (err) {
            console.error('[ProjectContext] Error deleting project:', err);
        }
    };

    const checkTrialLimit = async (uid: string): Promise<boolean> => {
        // Count only meaningful projects — ones where a file was actually uploaded.
        // Empty step-0 drafts (no file, no pipeline progress) are excluded so they
        // don't block a trial user from ever creating their first real project.
        const allQuery = query(
            collection(db, 'projects'),
            where('userId', '==', uid)
        );
        const allSnap = await getDocs(allQuery);
        const meaningful = allSnap.docs.filter(d => {
            const data = d.data();
            return (data.currentStep != null && Number(data.currentStep) > 0) || !!data.rawGridUrl;
        });
        return meaningful.length >= 1;
    };

    const addActivity = async (projectId: string, activity: Omit<Project['activities'][0], 'id' | 'timestamp'>) => {
        if (!effectiveUid) return;

        try {
            const docId = `${effectiveUid}_${projectId}`;
            const projectRef = doc(db, 'projects', docId);
            const snap = await getDoc(projectRef);

            if (snap.exists()) {
                const data = snap.data();
                const newActivity = {
                    ...activity,
                    id: Math.random().toString(36).substr(2, 5),
                    timestamp: new Date().toISOString()
                };

                const updatedActivities = [...(data.activities || []), newActivity];
                await setDoc(projectRef, { activities: updatedActivities }, { merge: true });

                setProjects(prev => prev.map(p => p.id === projectId ? { ...p, activities: updatedActivities } : p));
                if (currentProject?.id === projectId) {
                    setCurrentProject(prev => prev ? { ...prev, activities: updatedActivities } : null);
                }
            }
        } catch (err) {
            console.error('[ProjectContext] Error adding activity:', err);
        }
    };

    return (
        <ProjectContext.Provider value={{
            projects,
            createProject,
            updateProject,
            deleteProject,
            currentProject,
            setCurrentProject,
            addActivity,
            projectDataCache,
            updateProjectCache,
            lifetimeProjectCount,
            checkTrialLimit
        }}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProjects = () => {
    const context = useContext(ProjectContext);
    if (context === undefined) {
        throw new Error('useProjects must be used within a ProjectProvider');
    }
    return context;
};
