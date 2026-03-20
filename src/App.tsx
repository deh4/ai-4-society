// src/App.tsx
import { HelmetProvider } from "react-helmet-async";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import HeroPage from "./pages/HeroPage";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import Observatory from "./pages/Observatory";
import About from "./pages/About";
import Help from "./pages/Help";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RiskProvider } from "./store/RiskContext";
import { GraphProvider } from "./store/GraphContext";
import { AuthProvider } from "./store/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

export default function App() {
  return (
    <HelmetProvider>
    <ErrorBoundary>
      <RiskProvider>
        <AuthProvider>
          <GraphProvider>
            <Router>
              <Routes>
                {/* v2 public pages */}
                <Route path="/" element={<HeroPage />} />
                <Route path="/about" element={<About />} />
                <Route path="/observatory" element={<Observatory />} />
                <Route path="/observatory/:nodeId" element={<Observatory />} />

                {/* v1 pages (preserved) */}
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/:riskId" element={<Dashboard />} />
                <Route path="/help" element={
                  <ProtectedRoute>
                    <Help />
                  </ProtectedRoute>
                } />

                {/* Admin (protected) */}
                <Route path="/admin" element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                } />
              </Routes>
            </Router>
          </GraphProvider>
        </AuthProvider>
      </RiskProvider>
    </ErrorBoundary>
    </HelmetProvider>
  );
}
