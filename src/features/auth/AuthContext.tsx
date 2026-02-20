// BOOTSTRAP: Firebase Console > Firestore > user_roles > new document > Document ID = your UID > field role: admin. Do this once only. Manage everything else from Admin Dashboard.

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, sendPasswordResetEmail, signOut, type User } from 'firebase/auth';
import { auth, db, IS_DEMO_MODE } from '../../lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'enterprise' | 'trial' | 'revoked' | 'none';

interface AuthContextType {
    user: User | null;
    role: UserRole;
    loading: boolean;
    isDemo: boolean;
    isAdmin: boolean;
    isEnterprise: boolean;
    isTrial: boolean;
    planSelected: boolean;
    forgotPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole>('none');
    const [planSelected, setPlanSelected] = useState<boolean>(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (IS_DEMO_MODE) {
            console.log("[Auth] Demo Mode Active - Defaulting to isAdmin=true, planSelected=true");
            const demoRole = localStorage.getItem('demo_role') as UserRole || 'admin';
            const email = demoRole === 'admin' ? 'harshad.am@enalsys.com' : 'demo@enalsys.com';

            setUser({
                uid: demoRole === 'admin' ? 'admin-uid' : 'demo-uid',
                email,
                displayName: demoRole === 'admin' ? 'Demo Admin' : 'Demo User'
            } as User);
            setRole(demoRole);
            setPlanSelected(true);
            setLoading(false);
            return;
        }

        const unsubscribe = onAuthStateChanged(auth, async (authenticatedUser) => {
            if (authenticatedUser) {
                try {
                    const roleRef = doc(db, 'user_roles', authenticatedUser.uid);
                    const roleSnap = await getDoc(roleRef);

                    if (roleSnap.exists()) {
                        const data = roleSnap.data();
                        const activeRole = data.role as UserRole;
                        const isPlanSelected = data.planSelected || false;

                        console.log(`[Auth] User Resolved: role=${activeRole}, planSelected=${isPlanSelected}`);
                        setPlanSelected(isPlanSelected);

                        if (activeRole === 'revoked') {
                            await signOut(auth);
                            setUser(null);
                            setRole('none');
                            setLoading(false);
                            return;
                        }

                        // Set admin, enterprise, or trial (anything else defaults to trial)
                        if (['admin', 'enterprise', 'trial'].includes(activeRole)) {
                            setRole(activeRole);
                        } else {
                            setRole('trial');
                        }
                    } else {
                        // Document DOES NOT EXIST (Brand new signup)
                        const initialRole: UserRole = 'trial';
                        await setDoc(roleRef, {
                            role: initialRole,
                            email: authenticatedUser.email,
                            displayName: authenticatedUser.displayName || (authenticatedUser.email ? authenticatedUser.email.split('@')[0] : 'User'),
                            createdAt: Timestamp.now(),
                            planSelected: false
                        });
                        setRole(initialRole);
                        setPlanSelected(false);
                    }
                } catch (error) {
                    console.error("[Auth] Role resolution error:", error);
                    // If anything fails, default to trial and never block the user
                    setRole('trial');
                }
            } else {
                setRole('none');
                setPlanSelected(false);
            }

            setUser(authenticatedUser);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const forgotPassword = async (email: string) => {
        if (IS_DEMO_MODE) {
            console.log("Demo Mode: Password reset sent to", email);
            return;
        }
        await sendPasswordResetEmail(auth, email);
    };

    return (
        <AuthContext.Provider value={{
            user,
            role,
            loading,
            isDemo: IS_DEMO_MODE,
            isAdmin: role === 'admin',
            isEnterprise: role === 'enterprise' || role === 'admin',
            isTrial: role === 'trial',
            planSelected,
            forgotPassword
        }}>
            {children}
        </AuthContext.Provider>
    );
};
