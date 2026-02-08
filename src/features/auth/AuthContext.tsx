import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, IS_DEMO_MODE } from '../../lib/firebase';

export type UserRole = 'admin' | 'enterprise' | 'trial' | 'none';

interface AuthContextType {
    user: User | null;
    loading: boolean;
    isDemo: boolean;
    role: UserRole;
    isAdmin: boolean;
    isEnterprise: boolean;
    isTrial: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    isDemo: false,
    role: 'none',
    isAdmin: false,
    isEnterprise: false,
    isTrial: false
});

export const useAuth = () => useContext(AuthContext);

// Role Whitelists - should match your Firebase Security Rules
const ADMIN_EMAILS = ["harshad.am@enalsys.com"];
const ENTERPRISE_EMAILS = ["admin@corp.com"];
const TRIAL_EMAILS = ["trial-user@corp.com"];

const getRoleFromEmail = (email: string | null): UserRole => {
    if (!email) return 'none';
    if (ADMIN_EMAILS.includes(email)) return 'admin';
    if (ENTERPRISE_EMAILS.includes(email)) return 'enterprise';
    if (TRIAL_EMAILS.includes(email)) return 'trial';

    // Default to trial for any other logged-in user
    return 'trial';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole>('none');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (IS_DEMO_MODE) {
            const demoRole = localStorage.getItem('demo_role') || 'admin';
            const email = demoRole === 'admin' ? 'harshad.am@enalsys.com' : 'user@test.com';

            setUser({
                uid: demoRole === 'admin' ? 'admin-user' : 'demo-user',
                email: email,
                displayName: demoRole === 'admin' ? 'Harshad (Admin)' : 'Harshad',
            } as User);

            setRole(demoRole === 'admin' ? 'admin' : 'trial');
            setLoading(false);

            const handleStorageChange = () => window.location.reload();
            window.addEventListener('storage', handleStorageChange);
            return () => window.removeEventListener('storage', handleStorageChange);
        }

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setRole(user ? getRoleFromEmail(user.email) : 'none');
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            isDemo: IS_DEMO_MODE,
            role,
            isAdmin: role === 'admin',
            isEnterprise: role === 'enterprise',
            isTrial: role === 'trial'
        }}>
            {children}
        </AuthContext.Provider>
    );
};
