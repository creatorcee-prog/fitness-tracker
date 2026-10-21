"use client";

import Link from "next/link";
import { useApp } from "@/components/AppProvider";

/** Plain-language privacy policy. Keep in sync with what the code actually sends where. */
export default function PrivacyPage() {
  const { cfg } = useApp();
  const app = cfg.brand.appName;
  const bot = cfg.brand.botName;
  return (
    <div className="page stack">
      <Link href="/settings" className="small" style={{ fontWeight: 600 }}>‹ Settings</Link>
      <h1>Privacy</h1>
      <div className="card stack">
        <h2>What {app} stores</h2>
        <p>Your Discord account ID and display name (from signing in with Discord), and what you log: splits, workouts, sets, PRs, calories, reminders, friends and settings. It&apos;s stored in our database (Supabase), and the app is hosted on Vercel.</p>
        <p>Row-level security means only you can read your own data. Friends you&apos;ve accepted see a summary (today&apos;s split day, whether you&apos;ve logged, sessions, top lifts and recent PRs) only while &quot;Share my status&quot; is on. They never see your individual sets.</p>
      </div>
      <div className="card stack">
        <h2>Discord</h2>
        <p>{bot}, the Discord bot, reads the commands you send it and replies through Discord. In servers, replies with your data are only visible to you. PR announcements are posted only if you turn them on.</p>
      </div>
      <div className="card stack">
        <h2>AI answers (/ask and the in-app chat)</h2>
        <p>
          When you ask {bot} something, in Discord with <code>/ask</code> or with the chat button in the app, your question and a short training summary (recent sessions&apos; top sets, PRs, goals, bodyweight trend, today&apos;s split day) are sent to Groq to generate the answer. In the app chat, your last couple of questions and answers are included too, so follow-ups make sense. Your name and Discord ID are not included. The AI can&apos;t change your data. Nothing is sent to Groq unless you ask {bot} something. The chat itself is only kept in your browser tab.
        </p>
      </div>
      <div className="card stack">
        <h2>Your controls</h2>
        <p>Export everything as JSON or CSV, or reset all your data, from Settings → Data. To delete your account entirely, contact the app owner.</p>
      </div>
    </div>
  );
}
