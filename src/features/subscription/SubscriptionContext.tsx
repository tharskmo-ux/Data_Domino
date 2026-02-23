import React, { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db, IS_DEMO_MODE } from '../../lib/firebase';
import { doc, getDoc, setDoc, updateDoc, Timestamp } from 'firebase/firestore';
import type { Organization, Subscription } from '../../types/organization';
import { ENALSYS_BOOKING_URL } from '../../lib/constants';
import { useEffectiveUid } from '../../hooks/useEffectiveUid';
import { useAdminView } from '../admin/AdminViewContext';

interface SubscriptionContextType {
    organization: Organization | null;
    subscription: Subscription | null;
    loading: boolean;
    checkAccess: (feature: 'advanced_export' | 'unlimited_projects' | 'team_management' | 'savings_roi') => boolean;
    updateCompanyName: (name: string) => Promise<void>;
    upgradeToEnterprise: () => Promise<void>; // For demo/admin purposes
    isSuspended: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
    const context = useContext(SubscriptionContext);
    if (!context) throw new Error('useSubscription must be used within a SubscriptionProvider');
    return context;
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading: authLoading, isAdmin, isEnterprise } = useAuth();
    const effectiveUid = useEffectiveUid();
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [loading, setLoading] = useState(true);


    useEffect(() => {
        if (authLoading) return;
        if (!effectiveUid || !user) {
            setOrganization(null);
            setLoading(false);
            return;
        }

        const fetchOrg = async () => {
            if (IS_DEMO_MODE) {
                // Mock data for Demo Mode
                setOrganization({
                    id: 'demo-org',
                    name: user?.displayName || user?.email?.split('@')[0] || 'Demo Workspace',
                    companyName: 'Demo Corp',
                    userName: user?.email ? user.email.split('@')[0] : 'demo',
                    displayName: user?.displayName || 'Demo User',
                    adminId: effectiveUid,
                    adminEmail: user?.email || 'demo@example.com',
                    createdAt: Timestamp.now(),
                    members: [effectiveUid],
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
                const orgRef = doc(db, 'organizations', effectiveUid);
                const orgSnap = await getDoc(orgRef);

                if (orgSnap.exists()) {
                    setOrganization(orgSnap.data() as Organization);
                } else {
                    // Auto-create Free Org for new user
                    // HIGH-02 FIX: Prevent admin email injection when impersonating clients.
                    // If effectiveUid !== user.uid, we are impersonating. 
                    const isImpersonating = user.uid !== effectiveUid;

                    const newOrg: Organization = {
                        id: effectiveUid,
                        name: isImpersonating ? 'Client Workspace' : (user?.displayName || user?.email?.split('@')[0] || 'Workspace'),
                        companyName: "",
                        userName: isImpersonating ? 'client' : (user.email ? user.email.split('@')[0] : 'user'),
                        displayName: isImpersonating ? null : (user?.displayName || null),
                        adminId: effectiveUid,
                        adminEmail: isImpersonating ? '' : (user?.email || ''),
                        createdAt: Timestamp.now(),
                        members: [effectiveUid],
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
    }, [effectiveUid, authLoading, user]);

    const { isViewingClient, viewingClient } = useAdminView();

    const checkAccess = (feature: 'advanced_export' | 'unlimited_projects' | 'team_management' | 'savings_roi') => {
        // GLOBAL ADMIN/ENTERPRISE OVERRIDE: 
        // Real admins and enterprise users always have full access to view data unblurred, 
        // even when mirroring a restricted trial client.
        if (isAdmin || isEnterprise) return true;

        // If mirroring, use mirrored user's permissions (only reaches here for non-admins)
        if (isViewingClient && viewingClient) {
            const mirroredRole = viewingClient.role;
            const mirroredIsEnterprise = mirroredRole === 'enterprise' || mirroredRole === 'admin';

            if (mirroredIsEnterprise) return true;

            // Free Tier Limits for mirrored user
            switch (feature) {
                case 'advanced_export': return false;
                case 'team_management': return false;
                case 'unlimited_projects': return false;
                case 'savings_roi': return false;
                default: return true;
            }
        }

        if (!organization) return false;

        // Trial/Free Tier Limits
        switch (feature) {
            case 'advanced_export': return false;
            case 'team_management': return false;
            case 'unlimited_projects': return false;
            case 'savings_roi': return false;
            default: return true;
        }
    };

    const updateCompanyName = async (name: string) => {
        if (!effectiveUid || !organization) return;

        try {
            const orgRef = doc(db, 'organizations', effectiveUid);
            await updateDoc(orgRef, { companyName: name, name: name });

            // Update local state
            setOrganization(prev => prev ? { ...prev, companyName: name, name: name } : null);
        } catch (err) {
            console.error("Failed to update company name", err);
            throw err;
        }
    };

    const upgradeToEnterprise = async () => {
        window.open(ENALSYS_BOOKING_URL, '_blank');
    };

    const isSuspended = organization?.subscription.status !== 'ACTIVE' && !IS_DEMO_MODE;

    return (
        <SubscriptionContext.Provider value={{
            organization,
            subscription: organization?.subscription || null,
            loading,
            checkAccess,
            updateCompanyName,
            upgradeToEnterprise,
            isSuspended
        }}>
            {children}
        </SubscriptionContext.Provider>
    );
};
