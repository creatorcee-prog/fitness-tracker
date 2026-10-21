"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";

const RESULT: Record<string, string> = {
  sent: "Friend request sent. They'll show up once they accept.",
  accepted: "You're now friends!",
  "not-found": "That code doesn't match anyone.",
  self: "That's your own code.",
};

/** Landing page for a scanned friend QR / shared link: /friends/add?code=XXXX */
export default function AddFriendPage() {
  const { store, refresh } = useApp();
  const [msg, setMsg] = useState("Adding friend…");
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return; // strict mode runs effects twice in dev
    done.current = true;
    const code = new URLSearchParams(window.location.search).get("code") ?? "";
    if (!code) return setMsg("No friend code in this link.");
    store.sendFriendRequest(code).then((r) => { setMsg(RESULT[r] ?? r); refresh(); }).catch((e) => setMsg(String(e)));
  }, [store, refresh]);

  return (
    <div className="page center stack" style={{ justifyItems: "center" }}>
      <h1>Add friend</h1>
      <p>{msg}</p>
      <Link className="btn primary" href="/friends">Go to Friends</Link>
    </div>
  );
}
