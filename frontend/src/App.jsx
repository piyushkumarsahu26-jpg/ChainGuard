import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import DashboardLayout from './components/layout/DashboardLayout';
import ProtectedRoute from './components/layout/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ExaminationSetup from './pages/ExaminationSetup';
import QRGeneration from './pages/QRGeneration';
import LiveMonitoring from './pages/LiveMonitoring';
import EnvelopeDetails from './pages/EnvelopeDetails';
import EnvelopeScanner from './pages/EnvelopeScanner';
import TransportMonitoring from './pages/TransportMonitoring';
import QRVerification from './pages/QRVerification';
import SecurityCommandCenter from './pages/SecurityCommandCenter';
import AlertCenter from './pages/AlertCenter';
import Analytics from './pages/Analytics';
import CameraManagement from './pages/CameraManagement';
import AIDetection from './pages/AIDetection';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import UserManagement from './pages/UserManagement';
import UserDetails from './pages/UserDetails';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/command-center" element={<SecurityCommandCenter />} />
        <Route path="/examination-setup" element={<ExaminationSetup />} />
        <Route path="/qr-generation" element={<QRGeneration />} />
        <Route path="/envelopes" element={<EnvelopeDetails />} />
        <Route path="/transport" element={<TransportMonitoring />} />
        <Route path="/qr-verification" element={<QRVerification />} />
        <Route path="/scanner" element={<EnvelopeScanner />} />
        <Route path="/monitoring" element={<LiveMonitoring />} />
        <Route path="/alerts" element={<AlertCenter />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/cameras" element={<CameraManagement />} />
        <Route path="/ai-detection" element={<AIDetection />} />
        <Route path="/settings" element={<Settings />} />

        <Route
          path="/admin/users"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRATOR']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users/:id"
          element={
            <ProtectedRoute allowedRoles={['ADMINISTRATOR']}>
              <UserDetails />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
