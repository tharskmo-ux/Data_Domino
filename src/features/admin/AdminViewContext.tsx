import React, { createContext, useContext, useState } from 'react';

interface ViewingClient {
    uid: string;
    email: string;
    displayName: string;
    role: 'admin' | 'enterprise' | 'trial';
    subType: 'FREE' | 'ENTERPRISE';
}

interface AdminViewContextType {
    viewingClient: ViewingClient | null;
    startViewingClient: (client: ViewingClient) => void;
    stopViewingClient: () => void;
    isViewingClient: boolean;
}

const AdminViewContext = createContext<AdminViewContextType>({
    viewingClient: null,
    startViewingClient: () => { },
    stopViewingClient: () => { },
    isViewingClient: false,
});

export const useAdminView = () => useContext(AdminViewContext);

export const AdminViewProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [viewingClient, setViewingClient] = useState<ViewingClient | null>(() => {
        const saved = sessionStorage.getItem('admin_viewing_client');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch {
                return null;
            }
        }
        return null;
    });

    const startViewingClient = (client: ViewingClient) => {
        setViewingClient(client);
        sessionStorage.setItem('admin_viewing_client', JSON.stringify(client));
    };

    const stopViewingClient = () => {
        setViewingClient(null);
        sessionStorage.removeItem('admin_viewing_client');
    };

    return (
        <AdminViewContext.Provider value={{
            viewingClient,
            startViewingClient,
            stopViewingClient,
            isViewingClient: viewingClient !== null,
        }}>
            {children}
        </AdminViewContext.Provider>
    );
};
