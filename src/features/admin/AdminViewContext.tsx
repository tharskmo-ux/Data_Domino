import React, { createContext, useContext, useState } from 'react';

interface ViewingClient {
    uid: string;
    email: string;
    displayName: string;
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
    const [viewingClient, setViewingClient] = useState<ViewingClient | null>(null);

    return (
        <AdminViewContext.Provider value={{
            viewingClient,
            startViewingClient: (client) => setViewingClient(client),
            stopViewingClient: () => setViewingClient(null),
            isViewingClient: viewingClient !== null,
        }}>
            {children}
        </AdminViewContext.Provider>
    );
};
