import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { user, isAdmin, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <div className="text-gray-400 text-sm">Checking access...</div>
            </div>
        );
    }

    if (!user || !isAdmin) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}
