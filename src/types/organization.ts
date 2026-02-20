import { Timestamp } from 'firebase/firestore';

export type SubscriptionType = 'FREE' | 'ENTERPRISE';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'SUSPENDED';

export interface Subscription {
    type: SubscriptionType;
    status: SubscriptionStatus;
    validUntil?: Timestamp;
    startedAt: Timestamp;
}

export interface Organization {
    id: string;
    name: string;
    companyName: string;
    userName: string;
    displayName: string | null;
    adminId: string;
    adminEmail: string;
    createdAt: Timestamp;
    subscription: Subscription;
    members: string[]; // Array of user UIDs
}

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    organizationId?: string; // Link to their organization
    role: 'admin' | 'enterprise' | 'trial' | 'revoked';
}
