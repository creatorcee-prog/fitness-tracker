"use client";

import { useEffect, useState } from "react";
import { supabaseOf } from "@/lib/store";
import { useApp } from "./AppProvider";

type Provider = "discord" | "google";
const NAME: Record<Provider, string> = { discord: "Discord", google: "Google" };

/**
 * Which sign-in methods this account has, with buttons to link the others.
 * Linking Discord to a Google account is what lets James (the bot) find you.
 * Needs "Manual linking" turned on in Supabase → Authentication → Sign In / Providers.
 */
export function SignInMethodsCard() {
  const { cfg, store, profile } = useApp();
  const [copied, setCopied] = useState(false);
  const sb = supabaseOf(store);
  const [linked, setLinked] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!sb) return;
    void sb.sb.auth.getUserIdentities().then(({ data, error }) => {
      if (error) setErr(error.message);
      else setLinked((data?.identities ?? []).map((i) => i.provider));
    });
  }, [sb]);

  if (!sb) return null;

  const link = async (provider: Provider) => {
    setErr(null);
    const { error } = await sb.sb.auth.linkIdentity({ provider, options: { redirectTo: `${location.origin}/auth/callback` } });
    if (error) setErr(/manual linking/i.test(error.message) ? "Linking is turned off. In Supabase → Authentication → Sign In / Providers, enable “Manual linking”." : error.message);
  };

  return (
    <div className="card stack">
      <h2>Sign-in methods</h2>
      {linked === null && !err && <span className="muted small">Loading…</span>}
      {cfg.auth.providers.map((p) => {
        const on = linked?.includes(p);
        return (
          <div key={p} className="spread">
            <span>{NAME[p]}</span>
            {linked && (on ? <span className="pill good">Linked</span> : <button className="btn sm" onClick={() => link(p)}>Link {NAME[p]}</button>)}
          </div>
        );
      })}
      {linked && !linked.includes("discord") && (
        <p className="muted small" style={{ margin: 0 }}>Link Discord so {cfg.brand.botName} (the bot) knows it&apos;s you: <code>/log</code>, reminders and <code>/ask</code> need it.</p>
      )}
      {err && <span className="small" style={{ color: "var(--bad)" }}>{err}</span>}
      <details>
        <summary className="muted small">Account ID</summary>
        <div className="row" style={{ marginTop: 6 }}>
          <code className="small" style={{ wordBreak: "break-all", flex: 1 }}>{profile.id}</code>
          <button className="btn sm" onClick={async () => { try { await navigator.clipboard.writeText(profile.id); setCopied(true); } catch { /* ignore */ } }}>{copied ? "Copied" : "Copy"}</button>
        </div>
        <p className="muted small" style={{ margin: "6px 0 0" }}>For the app owner: put this in <code>AI_DEV_USER_IDS</code> (Vercel) to give an account developer limits for {cfg.brand.botName}.</p>
      </details>
    </div>
  );
}
