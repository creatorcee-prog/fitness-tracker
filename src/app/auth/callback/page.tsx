"use client";

import { useEffect } from "react";

/**
 * OAuth lands here. The Supabase browser client exchanges the ?code= on load
 * (PKCE), and AppProvider then sees the session; we just go home.
 */
export default function AuthCallback() {
  useEffect(() => {
    const t = setTimeout(() => window.location.replace("/"), 300);
    return () => clearTimeout(t);
  }, []);
  return <div className="page muted">Signing you in…</div>;
}
