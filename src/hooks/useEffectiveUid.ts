import { useAuth } from '../features/auth/AuthContext';
import { useAdminView } from '../features/admin/AdminViewContext';

export const useEffectiveUid = (): string | null => {
    const { user, isAdmin } = useAuth();
    const { isViewingClient, viewingClient } = useAdminView();

    if (isAdmin && isViewingClient && viewingClient) {
        return viewingClient.uid;
    }
    return user?.uid ?? null;
};
