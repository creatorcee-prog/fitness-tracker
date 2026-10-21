"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabaseOf } from "@/lib/store";
import { useApp } from "./AppProvider";

interface Msg {
  role: "user" | "coach";
  text: string;
  /** Only real answers are sent back as history (not "try later" notices). */
  answered?: boolean;
}

/** Tiny, safe renderer for the coach's replies: **bold**, `code`, bullet lines and paragraphs. No HTML injection. */
function Rich({ text }: { text: string }) {
  const inline = (s: string, key: number): ReactNode[] =>
    s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") ? <code key={`${key}-${i}`}>{part.slice(1, -1)}</code>
      : part,
    );
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={`ul-${blocks.length}`}>{bullets.map((b, i) => <li key={i}>{inline(b, i)}</li>)}</ul>);
    bullets = [];
  };
  text.split("\n").forEach((line, i) => {
    const m = line.match(/^\s*[-*•]\s+(.*)/) ?? line.match(/^\s*\d+[.)]\s+(.*)/);
    if (m) return void bullets.push(m[1]);
    flush();
    if (line.trim()) blocks.push(<p key={`p-${i}`}>{inline(line.replace(/^#+\s*/, ""), i)}</p>);
  });
  flush();
  return <>{blocks}</>;
}

/**
 * Floating "Ask James" button + chat panel. Talks to /api/ask with the
 * signed-in user's session; caps are shared with Discord /ask.
 */
export function CoachChat() {
  const { cfg, store } = useApp();
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const sb = supabaseOf(store);
  const bot = cfg.brand.botName;

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [msgs, busy]);
  // Keep the conversation for this browser tab only (not stored anywhere).
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("ft:coach-chat");
      if (saved) setMsgs(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem("ft:coach-chat", JSON.stringify(msgs.slice(-20)));
    } catch {
      /* ignore */
    }
  }, [msgs]);

  if (!cfg.ai.chatButton || path === "/privacy") return null;

  const send = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    const history = pairs(msgs);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      if (!sb) throw new Error("local");
      const { data } = await sb.sb.auth.getSession();
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ question: q, history }),
      });
      const json = (await res.json()) as { outcome?: string; answer?: string };
      setMsgs((m) => [...m, { role: "coach", text: json.answer ?? "Something went wrong.", answered: json.outcome === "answered" }]);
    } catch (e) {
      const offline = typeof navigator !== "undefined" && !navigator.onLine;
      const text = (e as Error).message === "local"
        ? `${bot} needs the online (Supabase) version of the app.`
        : offline ? "You're offline. Ask me again when you have signal." : "⚠️ I couldn't answer right now. Please try again in a bit.";
      setMsgs((m) => [...m, { role: "coach", text }]);
    } finally {
      setBusy(false);
    }
  };

  const suggestions = ["How's my bench trending?", "What should I aim for next session?", "Am I training consistently enough?"];

  return (
    <>
      {!open && (
        <button className={`coach-fab ${path === "/" ? "compact" : ""}`} onClick={() => setOpen(true)} aria-label={`Ask ${bot}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.8A8 8 0 1 1 21 12z" />
            <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
          </svg>
          <span>Ask {bot}</span>
        </button>
      )}
      {open && (
        <div className="coach-panel" role="dialog" aria-label={`Chat with ${bot}`}>
          <div className="coach-head">
            <div className="avatar-btn" style={{ width: 34, height: 34, fontSize: "0.9rem" }}>{bot.slice(0, 1)}</div>
            <div style={{ flex: 1 }}>
              <strong>{bot}</strong>
              <div className="muted" style={{ fontSize: "0.72rem" }}>AI coach · reads your logged data · can&apos;t change it</div>
            </div>
            {msgs.length > 0 && <button className="btn sm ghost" onClick={() => setMsgs([])}>Clear</button>}
            <button className="btn sm ghost" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
          </div>

          <div className="coach-body">
            {msgs.length === 0 && (
              <div className="stack" style={{ gap: 8 }}>
                <p className="muted small" style={{ margin: 0 }}>Ask about your training. I answer from what you&apos;ve logged.</p>
                {suggestions.map((s) => <button key={s} className="chip" style={{ justifySelf: "start" }} onClick={() => send(s)}>{s}</button>)}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`bubble ${m.role}`}>{m.role === "coach" ? <Rich text={m.text} /> : m.text}</div>
            ))}
            {busy && <div className="bubble coach typing" aria-label={`${bot} is typing`}><i /><i /><i /></div>}
            <div ref={endRef} />
          </div>

          <form className="coach-input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Message ${bot}…`} maxLength={300} aria-label="Your question" />
            <button className="btn primary" type="submit" disabled={busy || !input.trim()} aria-label="Send">↑</button>
          </form>
          <div className="muted" style={{ fontSize: "0.68rem", padding: "0 14px 10px" }}>
            Not medical advice. Questions + a training summary go to Groq. <Link href="/privacy" onClick={() => setOpen(false)}>Privacy</Link>
          </div>
        </div>
      )}
    </>
  );
}

/** Pair up earlier user/coach messages into {question, answer} turns for follow-ups. */
function pairs(msgs: Msg[]) {
  const out: { question: string; answer: string }[] = [];
  for (let i = 0; i + 1 < msgs.length; i++) {
    if (msgs[i].role === "user" && msgs[i + 1].role === "coach" && msgs[i + 1].answered) out.push({ question: msgs[i].text, answer: msgs[i + 1].text });
  }
  return out.slice(-4);
}
