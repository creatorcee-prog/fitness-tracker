"use client";

import { useEffect, useState } from "react";
import { NO_WEATHER, outdoorToday, roundCoord, searchPlaces, WEATHER_CREDIT, weatherLine, type WeatherPrefs } from "@/lib/domain/weather";
import { useApp } from "./AppProvider";

/**
 * Settings → Reminders: weather nudges for runs and walks. Off until you turn
 * it on and pick a place; only a rounded location (~1 km) is saved.
 */
export function WeatherCard() {
  const { cfg, store, profile, setProfile, now } = useApp();
  const w: WeatherPrefs = profile.weather ?? NO_WEATHER;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ label: string; lat: number; lon: number }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const save = async (patch: Partial<WeatherPrefs>) => {
    try {
      setProfile(await store.updateProfile({ weather: { ...w, ...patch } }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    if (!w.on || w.lat == null) return setPreview(null);
    void outdoorToday(w, now()).then((v) => setPreview(v ? weatherLine(v, profile.unit) || "Nothing outdoors left today." : "Couldn't get the forecast right now."));
  }, [w.on, w.lat, w.lon, profile.unit, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const useMyLocation = () => {
    if (!navigator.geolocation) return setMsg("This browser can't share its location. Search for your city instead.");
    setMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (p) => { setMsg(null); void save({ on: true, lat: roundCoord(p.coords.latitude), lon: roundCoord(p.coords.longitude), place: "My location" }); },
      () => setMsg("Location access was blocked. Search for your city instead."),
      { maximumAge: 3_600_000, timeout: 10_000 },
    );
  };

  const search = async () => {
    setMsg(null);
    try {
      const r = await searchPlaces(query);
      setResults(r);
      if (!r.length) setMsg("No places found.");
    } catch {
      setMsg("Search isn't available right now.");
    }
  };

  if (store.kind !== "local" && profile.weather === undefined) {
    return <div className="card"><h2>Weather nudges</h2><p className="muted small">Needs migration 0016.</p></div>;
  }

  return (
    <div className="card stack">
      <h2>Weather nudges</h2>
      <p className="muted small" style={{ margin: 0 }}>
        {cfg.brand.botName} points out the best window for a run or walk today: in your Discord check-in and on Today in the morning. Off by default; only your rough area (about 1 km) is saved.
      </p>
      <label className="row small">
        <input type="checkbox" checked={w.on} disabled={w.lat == null} onChange={(e) => save({ on: e.target.checked })} /> Weather nudges {w.lat == null && <span className="muted">(pick a place first)</span>}
      </label>
      {w.place && <div className="small">Place: <strong>{w.place}</strong></div>}
      <div className="row">
        <button className="btn sm" onClick={useMyLocation}>📍 Use my location</button>
        <form className="row" style={{ flex: 1, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); void search(); }}>
          <input style={{ flex: 1, minWidth: 0 }} placeholder="or search a city" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="City" />
          <button className="btn sm" type="submit" disabled={query.trim().length < 2}>Search</button>
        </form>
      </div>
      {results.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} className="btn sm ghost" style={{ justifyContent: "flex-start" }} onClick={() => { setResults([]); setQuery(""); void save({ on: true, lat: r.lat, lon: r.lon, place: r.label }); }}>{r.label}</button>
          ))}
        </div>
      )}
      {preview && <p className="small" style={{ margin: 0 }}>Today: {preview}</p>}
      {msg && <p className="small" style={{ margin: 0, color: "var(--bad)" }}>{msg}</p>}
      <p className="muted small" style={{ margin: 0 }}><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">{WEATHER_CREDIT}</a> (CC BY 4.0)</p>
    </div>
  );
}
