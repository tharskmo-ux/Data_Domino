import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, IS_DEMO_MODE } from '../../lib/firebase';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isDemo: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, isDemo: false });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (IS_DEMO_MODE) {
            // simulate a "demo" user for the mockup
            setUser({
                uid: 'demo-user',
                email: 'demo@example.com',
                displayName: 'Demo User',
            } as User);
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, isDemo: IS_DEMO_MODE }}>
            {children}
        </AuthContext.Provider>
    );
};
