"use client";

import type { SupabaseStore } from "@/lib/store/supabase";

export function LoginScreen({ store }: { store: SupabaseStore }) {
  const signIn = () =>
    store.sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: `${location.origin}/auth/callback` } });
  return (
    <div className="page center">
      <h1>Fitness Tracker</h1>
      <p className="muted">Sign in with Discord. The bot links to your account automatically.</p>
      <button className="btn primary big" onClick={signIn}>Sign in with Discord</button>
      <p className="muted small">Debugging? Set NEXT_PUBLIC_DATA_BACKEND=local to skip accounts.</p>
    </div>
  );
}
