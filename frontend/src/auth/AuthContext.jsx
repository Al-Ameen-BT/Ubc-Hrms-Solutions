import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi, brandingApi } from '../api/client';
import { useQueryClient } from '@tanstack/react-query';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [branding, setBranding] = useState(null);
  const [brandingVersion, setBrandingVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [orgCode, setOrgCode] = useState(() => {
    const match = window.location.pathname.match(/^\/o\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  });
  const [flash, setFlash] = useState(null);

  /* Load branding based on entry point */
  useEffect(() => {
    async function loadBranding() {
      try {
        const data = orgCode ? await brandingApi.org(orgCode) : await brandingApi.platform();
        setBranding(data);
        /* On a bank's own domain the public branding endpoint resolves the
           organisation from the Host header — adopt its code so sign-in is
           scoped to that bank even without an /o/<CODE> path. */
        if (!orgCode && data?.code) setOrgCode(data.code);

        // Dynamically update favicon
        const favUrl = data?.faviconUrl || (orgCode ? (data?.logoUrl || '/alert.png') : '/favicon.png');
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
          link = document.createElement('link');
          link.rel = 'icon';
          document.head.appendChild(link);
        }
        link.href = favUrl;

        // Dynamically update document title if appropriate
        if (data?.name || data?.platformName) {
          document.title = data.name || data.platformName;
        }
      } catch {
        /* branding is cosmetic — never block */
      }
    }
    loadBranding();
  }, [orgCode, brandingVersion]);

  useEffect(() => {
    const refresh = () => setBrandingVersion(version => version + 1);
    window.addEventListener('ucb:branding-changed', refresh);
    return () => window.removeEventListener('ucb:branding-changed', refresh);
  }, []);

  /* Restore session from token */
  useEffect(() => {
    async function restore() {
      const token = sessionStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const data = await authApi.me();
        setUser(data);
      } catch {
        sessionStorage.removeItem('token');
        queryClient.clear();
      } finally {
        setLoading(false);
      }
    }
    restore();
  }, [queryClient]);

  const login = useCallback(async (email, password, code) => {
    const data = await authApi.login(email, password, code);
    if (data.token) {
      queryClient.clear();
      sessionStorage.setItem('token', data.token);
      setUser(data.user);
      return { mfaRequired: false };
    }
    return { mfaRequired: true, challengeToken: data.mfaToken };
  }, [queryClient]);

  const verifyMfa = useCallback(async (challengeToken, code) => {
    const data = await authApi.verifyMfa(challengeToken, code);
    queryClient.clear();
    sessionStorage.setItem('token', data.token);
    setUser(data.user);
  }, [queryClient]);

  const logout = useCallback(() => {
    queryClient.clear();
    sessionStorage.removeItem('token');
    setUser(null);
  }, [queryClient]);

  /* The API client dispatches 'ucb:logout' when a session ends mid-flight
     (401) or the bank is suspended / its licence lapses (403). Clear the user
     and carry a notice to the sign-in screen. */
  useEffect(() => {
    function onLogout(e) {
      queryClient.clear();
      setUser(null);
      if (e && e.detail && e.detail.message) setFlash({ message: e.detail.message, kind: e.detail.kind || 'warn' });
    }
    window.addEventListener('ucb:logout', onLogout);
    return () => window.removeEventListener('ucb:logout', onLogout);
  }, [queryClient]);

  /* Re-fetches /auth/me and refreshes the stored user — used after actions
     that change server-side user state (password change, MFA enable/disable). */
  const refreshMe = useCallback(async () => {
    const data = await authApi.me();
    setUser(data);
    return data;
  }, []);

  const clearFlash = useCallback(() => setFlash(null), []);

  /* Role gate for UI affordances whose backend route is itself
     restricted. SUPER_ADMIN always passes. */
  const can = useCallback((...roles) => {
    const r = user?.role;
    if (!r) return false;
    if (r === 'SUPER_ADMIN') return true;
    return roles.includes(r);
  }, [user]);

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isOrgAdmin = user?.role === 'ORG_ADMIN';

  const value = {
    user,
    branding,
    loading,
    orgCode,
    flash,
    login,
    verifyMfa,
    logout,
    refreshMe,
    clearFlash,
    can,
    isSuperAdmin,
    isOrgAdmin,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
