"use client";

import QRCode from "qrcode";
import { useApp } from "./AppProvider";
import { useEffect, useState } from "react";

/** QR of the add-friend link. Scanning with any phone camera opens the app and sends a request. */
export function FriendQr({ code }: { code: string }) {
  const { cfg } = useApp();
  const [svg, setSvg] = useState("");
  const link = typeof window === "undefined" ? "" : `${window.location.origin}/friends/add?code=${encodeURIComponent(code)}`;

  useEffect(() => {
    if (!code || !link) return;
    QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111111", light: "#ffffff" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [code, link]);

  const share = async () => {
    if (navigator.share) await navigator.share({ title: `Add me on ${cfg.brand.appName}`, url: link }).catch(() => {});
    else await navigator.clipboard?.writeText(link);
  };

  if (!code) return null;
  return (
    <div className="stack" style={{ justifyItems: "center" }}>
      {/* White quiet zone so it scans on dark themes too. */}
      <div style={{ width: 200, height: 200, background: "#fff", borderRadius: 16, padding: 10 }} dangerouslySetInnerHTML={{ __html: svg }} aria-label="Friend QR code" role="img" />
      <button className="btn sm" onClick={share}>Share link</button>
    </div>
  );
}
