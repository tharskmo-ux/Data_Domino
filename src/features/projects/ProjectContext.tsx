import React, { createContext, useContext, useState, useEffect } from 'react';
import { useSubscription } from '../subscription/SubscriptionContext';
import { useAuth } from '../auth/AuthContext';

export interface Project {
    id: string;
    name: string;
    description: string;
    template: string;
    currency?: string;
    createdAt: string;
    status: 'draft' | 'processing' | 'completed' | 'error';
    stats: {
        spend: number;
        quality: number;
        transactions: number;
        categoriesCount: number;
        suppliersCount: number;
    };
    activities: {
        id: string;
        type: 'export' | 'mapping' | 'matching' | 'categorization' | 'upload' | 'header-selection' | 'creation';
        label: string;
        timestamp: string;
        details?: string;
        metadata?: any;
    }[];
}

interface ProjectContextType {
    projects: Project[];
    createProject: (data: { name: string, description: string, template: string }) => void;
    updateProject: (id: string, updates: Partial<Project>) => void;
    deleteProject: (id: string) => void;
    currentProject: Project | null;
    setCurrentProject: (project: Project | null) => void;
    addActivity: (projectId: string, activity: Omit<Project['activities'][0], 'id' | 'timestamp'>) => void;
    // Session Cache for large data (prototype only)
    projectDataCache: Record<string, any>;
    updateProjectCache: (projectId: string, data: any) => void;
    lifetimeProjectCount: number;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const { checkAccess } = useSubscription();
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    const [projectDataCache, setProjectDataCache] = useState<Record<string, any>>({});
    const [isLoaded, setIsLoaded] = useState(false);
    const [lifetimeProjectCount, setLifetimeProjectCount] = useState<number>(0);

    // Initial load and migration
    useEffect(() => {
        if (!user) {
            setProjects([]);
            setLifetimeProjectCount(0);
            setIsLoaded(false);
            return;
        }

        const userKey = `dd_projects_${user.uid}`;
        const countKey = `dd_lifetime_count_${user.uid}`;
        const legacyKey = 'dd_projects';
        const legacyCountKey = 'dd_lifetime_count';

        // Load project data
        let savedProjects = localStorage.getItem(userKey);
        if (!savedProjects) {
            const legacyData = localStorage.getItem(legacyKey);
            if (legacyData) {
                console.log("[ProjectContext] Migrating projects to user space...");
                localStorage.setItem(userKey, legacyData);
                savedProjects = legacyData;
            }
        }
        if (savedProjects) setProjects(JSON.parse(savedProjects));

        // Load lifetime count
        let savedCount = localStorage.getItem(countKey);
        if (!savedCount) {
            const legacyCount = localStorage.getItem(legacyCountKey);
            if (legacyCount) {
                localStorage.setItem(countKey, legacyCount);
                savedCount = legacyCount;
            }
        }
        if (savedCount) setLifetimeProjectCount(parseInt(savedCount, 10));

        setIsLoaded(true);
    }, [user]);

    // Save projects when they change (only after initial load!)
    useEffect(() => {
        if (!user || !isLoaded) return;
        localStorage.setItem(`dd_projects_${user.uid}`, JSON.stringify(projects));
    }, [projects, user, isLoaded]);

    // Save count when it changes
    useEffect(() => {
        if (!user || !isLoaded) return;
        localStorage.setItem(`dd_lifetime_count_${user.uid}`, lifetimeProjectCount.toString());
    }, [lifetimeProjectCount, user, isLoaded]);

    const createProject = (data: { name: string, description: string, template: string }) => {
        // Enforce project limit for Trial users (checkAccess handles role logic)
        if (!checkAccess('unlimited_projects') && projects.length >= 1) {
            console.error("Project limit reached for current plan.");
            return;
        }

        const newProject: Project = {
            id: Math.random().toString(36).substr(2, 9),
            ...data,
            currency: 'INR',
            createdAt: new Date().toISOString(),
            status: 'draft',
            stats: {
                spend: 0,
                quality: 0,
                transactions: 0,
                categoriesCount: 0,
                suppliersCount: 0
            },
            activities: [
                { id: 'act-1', type: 'creation', label: 'Initial project created', timestamp: new Date().toISOString() }
            ]
        };
        setProjects([newProject, ...projects]);
        setCurrentProject(newProject);

        // Increment lifetime count
        setLifetimeProjectCount(prev => prev + 1);
    };

    const updateProject = (id: string, updates: Partial<Project>) => {
        setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
        if (currentProject?.id === id) {
            setCurrentProject(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    const deleteProject = (id: string) => {
        setProjects(projects.filter(p => p.id !== id));
        if (currentProject?.id === id) setCurrentProject(null);
    };

    const addActivity = (projectId: string, activity: Omit<Project['activities'][0], 'id' | 'timestamp'>) => {
        const newActivity = {
            ...activity,
            id: `act-${Math.random().toString(36).substr(2, 5)}`,
            timestamp: new Date().toISOString()
        };
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, activities: [newActivity, ...(p.activities || [])] } : p));
        if (currentProject?.id === projectId) {
            setCurrentProject(prev => prev ? { ...prev, activities: [newActivity, ...(prev.activities || [])] } : null);
        }
    };

    const updateProjectCache = (projectId: string, data: any) => {
        setProjectDataCache(prev => ({
            ...prev,
            [projectId]: { ...prev[projectId], ...data }
        }));
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
            lifetimeProjectCount
        }}>
            {children}
        </ProjectContext.Provider>
    );
};



export const useProjects = () => {
    const context = useContext(ProjectContext);
    if (!context) throw new Error('useProjects must be used within a ProjectProvider');
    return context;
};
