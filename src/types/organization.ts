import { Timestamp } from 'firebase/firestore';

export type SubscriptionType = 'FREE' | 'ENTERPRISE';
export type SubscriptionStatus = 'ACTIVE' | 'PAST_DUE' | 'CANCELLED';

export interface Subscription {
    type: SubscriptionType;
    status: SubscriptionStatus;
    validUntil?: Timestamp;
    startedAt: Timestamp;
}

export interface Organization {
    id: string;
    name: string;
    ownerId: string;
    ownerEmail?: string; // Helpful for Admin Dashboard
    createdAt: Timestamp;
    subscription: Subscription;
    members: string[]; // Array of user UIDs
}

export interface UserProfile {
    uid: string;
    email: string;
    displayName: string;
    organizationId?: string; // Link to their organization
    role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
