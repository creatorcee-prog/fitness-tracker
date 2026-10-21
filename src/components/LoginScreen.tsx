"use client";

import { resolveConfig } from "@/config/runtime";
import type { SupabaseStore } from "@/lib/store/supabase";

const LABEL = { discord: "Sign in with Discord", google: "Continue with Google" } as const;

export function LoginScreen({ store }: { store: SupabaseStore }) {
  const { brand, auth } = resolveConfig();
  const signIn = (provider: "discord" | "google") =>
    store.sb.auth.signInWithOAuth({ provider, options: { redirectTo: `${location.origin}/auth/callback` } });
  return (
    <div className="page center">
      <h1>{brand.appName}</h1>
      <p className="muted">
        Sign in to keep your training in sync across devices.
        {auth.providers.includes("discord") && ` ${brand.botName}, the Discord bot, works with your account once Discord is linked (automatic when you sign in with Discord).`}
      </p>
      <div className="stack" style={{ gap: 10, width: "100%", maxWidth: 320 }}>
        {auth.providers.map((p) => (
          <button key={p} className={`btn big ${p === auth.providers[0] ? "primary" : ""}`} onClick={() => signIn(p)}>{LABEL[p]}</button>
        ))}
      </div>
      <p className="small" style={{ margin: 0 }}><strong>Invite only for now:</strong> you&apos;ll need the link from someone already using {brand.appName}.</p>
      <p className="muted small" style={{ margin: 0 }}>More sign-in options on the way!</p>
    </div>
  );
}
