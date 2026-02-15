import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HeroPage from './pages/HeroPage';
import Dashboard from './pages/Dashboard';
import Contribute from './pages/Contribute';
import Admin from './pages/Admin';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useEffect, useState } from 'react';
import { RiskProvider } from './store/RiskContext';
import { AuthProvider } from './store/AuthContext';

export default function App() {
  const [themeMode, setThemeMode] = useState<'monitor' | 'solution'>('monitor');

  useEffect(() => {
    if (themeMode === 'solution') {
      document.body.setAttribute('data-theme', 'solution');
    } else {
      document.body.removeAttribute('data-theme');
    }
  }, [themeMode]);

  return (
    <RiskProvider>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<HeroPage />} />
            <Route
              path="/dashboard"
              element={<Dashboard themeMode={themeMode} setThemeMode={setThemeMode} />}
            />
            <Route path="/contribute" element={<Contribute />} />
            <Route path="/admin" element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            } />
          </Routes>
        </Router>
      </AuthProvider>
    </RiskProvider>
  );
}
