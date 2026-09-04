import React from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';

// allowedRoles is optional — every existing usage (<ProtectedRoute><DashboardLayout/></ProtectedRoute>)
// omits it and behaves exactly as before (any authenticated user). Only the
// new Administration routes pass it, to restrict a whole route subtree to
// specific roles without needing a second wrapper component.
export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useApp();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}
