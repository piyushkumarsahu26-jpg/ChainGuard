// frontend/src/context/AppContext.jsx
import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import authService from '../services/authService';
import { disconnectSocket } from '../services/socket';

const AppContext = createContext(null);

let toastId = 0;

export function AppProvider({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem('cg_auth') === 'true'
  );
  const [accessToken, setAccessToken] = useState(
    () => sessionStorage.getItem('accessToken') || null
  );
  const [user, setUser] = useState(() => {
  const storedUser = sessionStorage.getItem("user");

  if (!storedUser || storedUser === "undefined") {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch {
    return null;
  }
});
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toasts, setToasts] = useState([]);

  const login = useCallback(async (email, password) => {
    const response = await authService.login(email, password);

const token = response?.data?.data?.accessToken;
const loggedInUser = response?.data?.data?.user;

    sessionStorage.setItem('accessToken', token);
    sessionStorage.setItem('user', JSON.stringify(loggedInUser));
    sessionStorage.setItem('cg_auth', 'true');

    setAccessToken(token);
    setUser(loggedInUser);
    setIsAuthenticated(true);

    return response;
  }, []);

  const logout = useCallback(async () => {
    // Close the authenticated Socket.IO connection before clearing auth
    // state, so no live connection carries over into the next session.
    disconnectSocket();

    try {
      await authService.logout();
    } catch (err) {
      // proceed with local logout even if the backend call fails
    } finally {
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('user');
      sessionStorage.removeItem('cg_auth');

      setAccessToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => {
    const restoreAuth = async () => {
      const storedToken = sessionStorage.getItem('accessToken');

      if (!storedToken) {
        return;
      }

      const storedUser = sessionStorage.getItem("user");

if (storedUser && storedUser !== "undefined") {
  try {
    setAccessToken(storedToken);
    setUser(JSON.parse(storedUser));
    setIsAuthenticated(true);
    return;
  } catch {
    sessionStorage.removeItem("user");
  }
}

      try {
  const response = await authService.me();

const restoredUser = response?.data?.data;

if (!restoredUser) {
  throw new Error("User data not returned from /auth/me");
}

if (!restoredUser) {
  throw new Error("User data not returned from /auth/me");
}

sessionStorage.setItem("user", JSON.stringify(restoredUser));
setAccessToken(storedToken);
setUser(restoredUser);
setIsAuthenticated(true);
      } catch (err) {
        sessionStorage.removeItem('accessToken');
        sessionStorage.removeItem('user');
        sessionStorage.removeItem('cg_auth');

        setAccessToken(null);
        setUser(null);
        setIsAuthenticated(false);

        window.location.href = '/login';
      }
    };

    restoreAuth();
  }, []);

  const pushToast = useCallback((toast) => {
    const id = ++toastId;
    setToasts((t) => [...t, { id, ...toast }]);
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <AppContext.Provider
      value={{
        isAuthenticated,
        login,
        logout,
        user,
        accessToken,
        sidebarCollapsed,
        setSidebarCollapsed,
        toasts,
        pushToast,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}