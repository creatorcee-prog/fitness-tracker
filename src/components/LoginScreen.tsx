"use client";

import { resolveConfig } from "@/config/runtime";
import type { SupabaseStore } from "@/lib/store/supabase";

export function LoginScreen({ store }: { store: SupabaseStore }) {
  const { brand } = resolveConfig();
  const signIn = () =>
    store.sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: `${location.origin}/auth/callback` } });
  return (
    <div className="page center">
      <h1>{brand.appName}</h1>
      <p className="muted">Sign in with Discord. {brand.botName}, the Discord bot, links to your account automatically.</p>
      <button className="btn primary big" onClick={signIn}>Sign in with Discord</button>
      <p className="muted small">Debugging? Set NEXT_PUBLIC_DATA_BACKEND=local to skip accounts.</p>
    </div>
  );
}
