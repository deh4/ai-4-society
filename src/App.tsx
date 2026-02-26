import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HeroPage from './pages/HeroPage';
import Dashboard from './pages/Dashboard';
import Contribute from './pages/Contribute';
import Admin from './pages/Admin';
import Observatory from './pages/Observatory';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RiskProvider } from './store/RiskContext';
import { AuthProvider } from './store/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <RiskProvider>
        <AuthProvider>
          <Router>
            <Routes>
              <Route path="/" element={<HeroPage />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/:riskId" element={<Dashboard />} />
              <Route path="/contribute" element={<Contribute />} />
              <Route path="/admin" element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              } />
              <Route path="/observatory" element={
                <ProtectedRoute requiredRoles={['lead']}>
                  <Observatory />
                </ProtectedRoute>
              } />
            </Routes>
          </Router>
        </AuthProvider>
      </RiskProvider>
    </ErrorBoundary>
  );
}
