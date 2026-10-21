"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProfileMedia } from "@/lib/domain/types";
import { AVATAR, BANNER, resizeImage } from "@/lib/media/resize";
import { Avatar } from "./Avatar";
import { useApp } from "./AppProvider";

/** Your photo + banner (loaded once per data version). Empty if unavailable (offline, migration not run). */
export function useMyMedia() {
  const { store, version } = useApp();
  const [media, setMedia] = useState<ProfileMedia>({ avatar: null, banner: null });
  const reload = useCallback(async () => {
    setMedia(await store.getMyMedia().catch(() => ({ avatar: null, banner: null })));
  }, [store]);
  useEffect(() => {
    void reload();
  }, [reload, version]);
  return { media, setMedia, reload };
}

/** Banner across the top, photo overlapping it, with change/remove buttons. Friends see the same on your profile. */
export function ProfileMediaHeader({ onError }: { onError: (msg: string) => void }) {
  const { store, profile } = useApp();
  const { media, setMedia } = useMyMedia();
  const [busy, setBusy] = useState(false);

  const pick = (kind: keyof ProfileMedia) => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setBusy(true);
    try {
      const url = await resizeImage(f, kind === "avatar" ? AVATAR : BANNER);
      await store.setMyMedia({ [kind]: url });
      setMedia((m) => ({ ...m, [kind]: url }));
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const clear = (kind: keyof ProfileMedia) => async () => {
    await store.setMyMedia({ [kind]: null }).catch((err) => onError(String(err)));
    setMedia((m) => ({ ...m, [kind]: null }));
  };

  return (
    <div className="profile-hero">
      <div className="profile-banner" style={media.banner ? { backgroundImage: `url(${media.banner})` } : undefined} />
      <div className="profile-hero-row">
        <Avatar id={profile.id} name={profile.displayName} size={76} src={media.avatar} />
        <div className="row" style={{ gap: 6 }}>
          <label className="btn sm">{media.avatar ? "Change photo" : "Add photo"}<input type="file" accept="image/*" hidden disabled={busy} onChange={pick("avatar")} /></label>
          <label className="btn sm">{media.banner ? "Change banner" : "Add banner"}<input type="file" accept="image/*" hidden disabled={busy} onChange={pick("banner")} /></label>
          {media.avatar && <button className="btn sm ghost" onClick={clear("avatar")}>Remove photo</button>}
          {media.banner && <button className="btn sm ghost" onClick={clear("banner")}>Remove banner</button>}
        </div>
      </div>
      {busy && <span className="muted small">Saving…</span>}
    </div>
  );
}
