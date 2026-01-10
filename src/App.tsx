import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HeroPage from './pages/HeroPage';
import Dashboard from './pages/Dashboard';
import { useEffect, useState } from 'react';
import { RiskProvider } from './store/RiskContext';

export default function App() {
  // Global Theme State could live here or in a context
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
      <Router>
        <Routes>
          <Route path="/" element={<HeroPage />} />
          <Route
            path="/dashboard"
            element={<Dashboard themeMode={themeMode} setThemeMode={setThemeMode} />}
          />
        </Routes>
      </Router>
    </RiskProvider>
  );
}
