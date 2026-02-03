import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { db } from '../../lib/firebase';
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import type { Organization } from '../../types/organization';
import { Navigate } from 'react-router-dom';

// HARDCODED ADMIN WHITELIST
const ADMIN_EMAILS = ["harshad.am@enalsys.com"];

const AdminDashboard = () => {
    const { user, loading } = useAuth();
    const [orgs, setOrgs] = useState<Organization[]>([]);
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        if (!user) return;

        const fetchOrgs = async () => {
            // In a real app with thousands of orgs, we would need pagination.
            const querySnapshot = await getDocs(collection(db, "organizations"));
            const fetchedOrgs = querySnapshot.docs.map(doc => doc.data() as Organization);
            setOrgs(fetchedOrgs);
        };

        if (ADMIN_EMAILS.includes(user.email || '')) {
            fetchOrgs();
        }
    }, [user]);

    if (loading) return <div>Loading...</div>;

    if (!user || !ADMIN_EMAILS.includes(user.email || '')) {
        return <Navigate to="/" replace />;
    }

    const toggleSubscription = async (orgId: string, currentType: 'FREE' | 'ENTERPRISE') => {
        setActionLoading(orgId);
        try {
            const newType = currentType === 'FREE' ? 'ENTERPRISE' : 'FREE';
            const orgRef = doc(db, 'organizations', orgId);

            await updateDoc(orgRef, {
                'subscription.type': newType,
                'subscription.validUntil': newType === 'ENTERPRISE' ? Timestamp.fromMillis(Date.now() + 31536000000) : null // +1 Year
            });

            // Optimistic update
            setOrgs(prev => prev.map(o =>
                o.id === orgId
                    ? { ...o, subscription: { ...o.subscription, type: newType } }
                    : o
            ));

        } catch (error) {
            console.error("Failed to update subscription", error);
            alert("Failed to update subscription");
        } finally {
            setActionLoading(null);
        }
    };

    return (
        <div className="p-8 bg-gray-50 min-h-screen text-gray-900">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
                <a href="/" className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors">
                    Back to Dashboard
                </a>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization Name</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner Email</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subscription</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {orgs.map((org) => (
                            <tr key={org.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{org.name}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{org.ownerEmail || org.ownerId}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{org.subscription.status}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${org.subscription.type === 'ENTERPRISE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                                        }`}>
                                        {org.subscription.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                        onClick={() => toggleSubscription(org.id, org.subscription.type)}
                                        disabled={actionLoading === org.id}
                                        className="text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
                                    >
                                        {actionLoading === org.id ? 'Updating...' : (
                                            org.subscription.type === 'FREE' ? 'Upgrade to Enterprise' : 'Downgrade to Free'
                                        )}
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {orgs.length === 0 && (
                    <div className="p-6 text-center text-gray-500">No organizations found.</div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
