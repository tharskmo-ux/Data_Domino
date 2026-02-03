import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db, IS_DEMO_MODE } from '../../lib/firebase';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import type { Organization, Subscription } from '../../types/organization';

interface SubscriptionContextType {
    organization: Organization | null;
    subscription: Subscription | null;
    loading: boolean;
    checkAccess: (feature: 'advanced_export' | 'unlimited_projects' | 'team_management') => boolean;
    upgradeToEnterprise: () => Promise<void>; // For demo/admin purposes
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
    const context = useContext(SubscriptionContext);
    if (!context) throw new Error('useSubscription must be used within a SubscriptionProvider');
    return context;
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading: authLoading } = useAuth();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setOrganization(null);
            setLoading(false);
            return;
        }

        const fetchOrg = async () => {
            if (IS_DEMO_MODE) {
                // Mock data for Demo Mode
                setOrganization({
                    id: 'demo-org',
                    name: 'Demo Corp',
                    ownerId: user.uid,
                    createdAt: Timestamp.now(),
                    members: [user.uid],
                    subscription: {
                        type: 'FREE',
                        status: 'ACTIVE',
                        startedAt: Timestamp.now()
                    }
                });
                setLoading(false);
                return;
            }

            try {
                // For simplified MVP, we assume User ID maps to an Org or we fetch it.
                // In a real app, User profile would have `orgId`.
                // Here, let's assume we store organization under `organizations/{user.uid}` 
                // for single-tenant-like structure initially, or query by member.
                // Let's stick to a simple: User creates Org -> Org ID stored in local state/profile.

                // CHECK if user is already part of an org (simplification: ID = UID for first org)
                const orgRef = doc(db, 'organizations', user.uid);
                const orgSnap = await getDoc(orgRef);

                if (orgSnap.exists()) {
                    setOrganization(orgSnap.data() as Organization);
                } else {
                    // Auto-create Free Org for new user
                    const newOrg: Organization = {
                        id: user.uid,
                        name: `${user.displayName || 'User'}'s Workspace`,
                        ownerId: user.uid,
                        ownerEmail: user.email || '',
                        createdAt: Timestamp.now(),
                        members: [user.uid],
                        subscription: {
                            type: 'FREE',
                            status: 'ACTIVE',
                            startedAt: Timestamp.now()
                        }
                    };
                    await setDoc(orgRef, newOrg);
                    setOrganization(newOrg);
                }
            } catch (err) {
                console.error("Failed to fetch organization", err);
            } finally {
                setLoading(false);
            }
        };

        fetchOrg();
    }, [user, authLoading]);

    const checkAccess = (feature: 'advanced_export' | 'unlimited_projects' | 'team_management') => {
        if (!organization) return false;
        const subType = organization.subscription.type;

        if (subType === 'ENTERPRISE') return true;

        // Free Tier Limits
        switch (feature) {
            case 'advanced_export': return false;
            case 'team_management': return false; // Single user only
            case 'unlimited_projects': return false; // Limit to 1
            default: return true;
        }
    };

    const upgradeToEnterprise = async () => {
        if (!organization) return;
        // This is a client-side helper, but in reality this should be done via Admin Dashboard
        // We include it here if we want to build a "Self-Upgrade" button for testing
        console.log("Upgrading to Enterprise (Implementation Pending Admin Action)");
    };

    return (
        <SubscriptionContext.Provider value={{
            organization,
            subscription: organization?.subscription || null,
            loading,
            checkAccess,
            upgradeToEnterprise
        }}>
            {children}
        </SubscriptionContext.Provider>
    );
};
