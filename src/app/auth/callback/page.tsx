"use client";

import { useEffect } from "react";
import { AFTER_LOGIN_KEY } from "@/components/LoginScreen";

/**
 * OAuth lands here. The Supabase browser client exchanges the ?code= on load
 * (PKCE), and AppProvider then sees the session; we just go home.
 */
export default function AuthCallback() {
  useEffect(() => {
    let next = "/";
    try {
      const saved = sessionStorage.getItem(AFTER_LOGIN_KEY);
      sessionStorage.removeItem(AFTER_LOGIN_KEY);
      // Only same-site paths ("/friends/add?code=…"), never "//elsewhere.com".
      if (saved && saved.startsWith("/") && !saved.startsWith("//")) next = saved;
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => window.location.replace(next), 300);
    return () => clearTimeout(t);
  }, []);
  return <div className="page muted">Signing you in…</div>;
}
