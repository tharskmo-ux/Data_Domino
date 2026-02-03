import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from './features/auth/LoginPage';
import SignupPage from './features/auth/SignupPage';
import DashboardPage from './features/projects/DashboardPage';
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import { ProjectProvider } from './features/projects/ProjectContext';

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const isSharedLink = new URLSearchParams(window.location.search).has('share');

  if (loading) return (
    <div className="h-screen w-screen flex items-center justify-center bg-background text-foreground">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  if (!user && !isSharedLink) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

import { SubscriptionProvider } from './features/subscription/SubscriptionContext';
import AdminDashboard from './features/admin/AdminDashboard';

// ... (imports)

// ... (ProtectedRoute component)

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
                <Route path="/" element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                } />
                <Route path="/admin" element={<AdminDashboard />} />

                {/* Catch all */}
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
