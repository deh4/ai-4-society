import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/AuthContext';
import type { UserRole } from '../lib/roles';

interface ProtectedRouteProps {
    children: React.ReactNode;
    /** If provided, user must have at least one of these roles */
    requiredRoles?: UserRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
    const { user, isAdmin, userDoc, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
                <div className="text-gray-400 text-sm">Checking access...</div>
            </div>
        );
    }

    // Must be signed in with an active role
    if (!user || !isAdmin) {
        return <Navigate to="/" replace />;
    }

    // If specific roles required, check them
    if (requiredRoles && userDoc) {
        const hasRequired = userDoc.roles.some(r => requiredRoles.includes(r));
        if (!hasRequired) {
            return <Navigate to="/admin" replace />;
        }
    }

    return <>{children}</>;
}
