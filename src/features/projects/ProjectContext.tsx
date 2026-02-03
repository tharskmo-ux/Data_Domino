import React, { createContext, useContext, useState, useEffect } from 'react';

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
        type: 'export' | 'mapping' | 'matching' | 'categorization' | 'upload';
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
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);
    const [projectDataCache, setProjectDataCache] = useState<Record<string, any>>({});

    // Load from localStorage for MVP/Demo
    useEffect(() => {
        const saved = localStorage.getItem('dd_projects');
        if (saved) {
            setProjects(JSON.parse(saved));
        }
    }, []);

    useEffect(() => {
        localStorage.setItem('dd_projects', JSON.stringify(projects));
    }, [projects]);

    const createProject = (data: { name: string, description: string, template: string }) => {
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
                { id: 'act-1', type: 'upload', label: 'Initial project created', timestamp: new Date().toISOString() }
            ]
        };
        setProjects([newProject, ...projects]);
        setCurrentProject(newProject);
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
        <ProjectContext.Provider value={{ projects, createProject, updateProject, deleteProject, currentProject, setCurrentProject, addActivity, projectDataCache, updateProjectCache }}>
            {children}
        </ProjectContext.Provider>
    );
};



export const useProjects = () => {
    const context = useContext(ProjectContext);
    if (!context) throw new Error('useProjects must be used within a ProjectProvider');
    return context;
};
