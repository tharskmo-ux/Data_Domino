import React, { createContext, useContext, useState, useEffect } from 'react';

export interface Project {
    id: string;
    name: string;
    description: string;
    template: string;
    createdAt: string;
    status: 'draft' | 'processing' | 'completed' | 'error';
    stats: {
        spend: number;
        quality: number;
        transactions: number;
    };
}

interface ProjectContextType {
    projects: Project[];
    createProject: (data: { name: string, description: string, template: string }) => void;
    deleteProject: (id: string) => void;
    currentProject: Project | null;
    setCurrentProject: (project: Project | null) => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [currentProject, setCurrentProject] = useState<Project | null>(null);

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
            createdAt: new Date().toISOString(),
            status: 'draft',
            stats: {
                spend: 0,
                quality: 0,
                transactions: 0
            }
        };
        setProjects([newProject, ...projects]);
        setCurrentProject(newProject);
    };

    const deleteProject = (id: string) => {
        setProjects(projects.filter(p => p.id !== id));
        if (currentProject?.id === id) setCurrentProject(null);
    };

    return (
        <ProjectContext.Provider value={{ projects, createProject, deleteProject, currentProject, setCurrentProject }}>
            {children}
        </ProjectContext.Provider>
    );
};

export const useProjects = () => {
    const context = useContext(ProjectContext);
    if (!context) throw new Error('useProjects must be used within a ProjectProvider');
    return context;
};
