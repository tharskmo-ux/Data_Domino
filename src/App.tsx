import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './lib/firebase';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { ProjectProvider } from './features/projects/ProjectContext';
import { SubscriptionProvider } from './features/subscription/SubscriptionContext';

import LoginPage from './features/auth/LoginPage';
import SignupPage from './features/auth/SignupPage';
import ForgotPasswordPage from './features/auth/ForgotPasswordPage';
import PlanSelectionPage from './features/auth/PlanSelectionPage';
import SuspendedPage from './features/auth/SuspendedPage';
import DashboardPage from './features/projects/DashboardPage';
import AdminDashboard from './features/admin/AdminDashboard';

const queryClient = new QueryClient();

const LoadingSpinner = () => (
  <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
  </div>
);

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const isSharedLink = new URLSearchParams(window.location.search).has('share');

  if (loading) return <LoadingSpinner />;
  if (!user && !isSharedLink) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const PlanSelectionRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [planSelected, setPlanSelected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    const checkPlan = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'user_roles', user.uid));
        if (docSnap.exists()) {
          setPlanSelected(docSnap.data().planSelected === true);
        } else {
          setPlanSelected(false);
        }
      } catch (error) {
        console.error('Plan check error:', error);
        setPlanSelected(false);
      } finally {
        setChecking(false);
      }
    };
    checkPlan();
  }, [user]);

  if (loading || checking) return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  if (!user) return <Navigate to="/login" replace />;
  if (!planSelected) return <Navigate to="/plan-selection" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
          <ProjectProvider>
            <Router>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/suspended" element={<SuspendedPage />} />

                <Route path="/plan-selection" element={
                  <ProtectedRoute>
                    <PlanSelectionPage />
                  </ProtectedRoute>
                } />

                <Route path="/" element={
                  <PlanSelectionRoute>
                    <DashboardPage />
                  </PlanSelectionRoute>
                } />

                <Route path="/admin" element={
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                } />

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Router>
          </ProjectProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
