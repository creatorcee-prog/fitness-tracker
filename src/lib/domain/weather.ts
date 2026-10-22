import type { Unit } from "@/config/app.config";

/**
 * Weather nudges for runs and walks. Forecasts come from Open-Meteo (free,
 * no key, non-commercial use, CC BY 4.0: credit "Weather data by
 * Open-Meteo.com"). Only a rounded location (~1 km) is stored or sent.
 */
export interface WeatherPrefs {
  on: boolean;
  lat: number | null;
  lon: number | null;
  /** Shown back to you, e.g. "Austin, Texas". */
  place: string | null;
}

export const NO_WEATHER: WeatherPrefs = { on: false, lat: null, lon: null, place: null };
export const WEATHER_CREDIT = "Weather data by Open-Meteo.com";

/** One forecast hour, metric. `hour` is the local hour of day (0–23). */
export interface WeatherHour {
  hour: number;
  tempC: number;
  feelsC: number;
  rainPct: number;
  code: number;
  windKmh: number;
  isDay: boolean;
}

export type OutdoorVerdict =
  | { kind: "great" | "ok"; from: number; to: number; feelsC: number; rainPct: number; code: number }
  | { kind: "bad"; reason: "rain" | "storm" | "snow" | "cold" | "hot" | "wind" | "dark" };

/** ~1 km: precise enough for a forecast, vague enough not to pinpoint a home. */
export const roundCoord = (x: number) => Math.round(x * 100) / 100;

const WET = (c: number) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82);
const SNOW = (c: number) => (c >= 71 && c <= 77) || c === 85 || c === 86;
const STORM = (c: number) => c >= 95;

/** How nice an hour is for a run or walk: 2 great, 1 fine, 0 no. */
export function hourScore(h: WeatherHour): 0 | 1 | 2 {
  if (!h.isDay || h.hour < 6 || h.hour > 20 || STORM(h.code) || SNOW(h.code)) return 0;
  if (h.rainPct > 40 || WET(h.code) || h.windKmh > 40 || h.feelsC < -2 || h.feelsC > 32) return 0;
  return h.rainPct <= 20 && h.windKmh <= 25 && h.feelsC >= 8 && h.feelsC <= 26 ? 2 : 1;
}

/**
 * The best stretch left today (from `nowHour`): the longest run of great hours,
 * else of fine ones (earliest on a tie). If there's none, why not, so James
 * can say "gym day" instead.
 */
export function bestOutdoorWindow(hours: WeatherHour[], nowHour: number): OutdoorVerdict {
  const left = hours.filter((h) => h.hour >= nowHour).sort((a, b) => a.hour - b.hour);
  for (const want of [2, 1] as const) {
    let best: WeatherHour[] = [];
    let run: WeatherHour[] = [];
    for (const h of left) {
      if (hourScore(h) >= want && (!run.length || h.hour === run[run.length - 1].hour + 1)) run.push(h);
      else run = hourScore(h) >= want ? [h] : [];
      if (run.length > best.length) best = [...run];
    }
    if (best.length) {
      const mid = best[Math.floor((best.length - 1) / 2)];
      return { kind: want === 2 ? "great" : "ok", from: best[0].hour, to: best[best.length - 1].hour + 1, feelsC: mid.feelsC, rainPct: Math.max(...best.map((h) => h.rainPct)), code: mid.code };
    }
  }
  const day = left.filter((h) => h.isDay && h.hour >= 6 && h.hour <= 20);
  if (!day.length) return { kind: "bad", reason: "dark" };
  const count = (f: (h: WeatherHour) => boolean) => day.filter(f).length;
  const reasons: [OutdoorVerdict & { kind: "bad" }, number][] = [
    [{ kind: "bad", reason: "storm" }, count((h) => STORM(h.code))],
    [{ kind: "bad", reason: "snow" }, count((h) => SNOW(h.code))],
    [{ kind: "bad", reason: "rain" }, count((h) => WET(h.code) || h.rainPct > 40)],
    [{ kind: "bad", reason: "wind" }, count((h) => h.windKmh > 40)],
    [{ kind: "bad", reason: "cold" }, count((h) => h.feelsC < -2)],
    [{ kind: "bad", reason: "hot" }, count((h) => h.feelsC > 32)],
  ];
  return reasons.sort((a, b) => b[1] - a[1])[0][0];
}

const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h < 12 || h === 24 ? "am" : "pm"}`;
const temp = (c: number, unit: Unit) => (unit === "lb" ? `${Math.round((c * 9) / 5 + 32)}°F` : `${Math.round(c)}°C`);
const sky = (code: number) => (code === 0 ? "clear" : code <= 2 ? "mostly sunny" : code === 3 ? "cloudy" : code === 45 || code === 48 ? "foggy" : "dry");

/** One line for James / the check-in DM. The unit follows lb → °F, kg → °C. */
export function weatherLine(v: OutdoorVerdict, unit: Unit): string {
  if (v.kind !== "bad") {
    const when = v.to - v.from >= 10 ? "most of the day" : `${hourLabel(v.from)}–${hourLabel(v.to)}`;
    const lead = v.kind === "great" ? "Great weather for a run or walk" : "Decent window for a walk";
    return `🌤️ ${lead} ${when}: feels like ${temp(v.feelsC, unit)}, ${sky(v.code)}${v.rainPct > 0 ? `, ${v.rainPct}% chance of rain` : ""}.`;
  }
  const why: Record<typeof v.reason, string> = {
    rain: "🌧️ Rainy today. A good day for the gym!",
    storm: "⛈️ Storms today. Keep the cardio indoors!",
    snow: "❄️ Snow today. Treadmill or bike if you want cardio!",
    wind: "💨 Very windy today. Indoor cardio might be nicer.",
    cold: "🥶 Bitterly cold today. Indoor cardio, or bundle up!",
    hot: "🥵 Very hot today. Go early or late, and bring water!",
    dark: "",
  };
  return why[v.reason];
}

/** Open-Meteo's hourly arrays → WeatherHour[] for today (local time). */
export function parseForecast(json: unknown): WeatherHour[] {
  const h = (json as { hourly?: Record<string, unknown[]> })?.hourly;
  if (!h || !Array.isArray(h.time)) return [];
  const today = String(h.time[0] ?? "").slice(0, 10);
  return h.time.flatMap((t, i) => {
    const s = String(t);
    if (s.slice(0, 10) !== today) return [];
    return [{
      hour: Number(s.slice(11, 13)),
      tempC: Number(h.temperature_2m?.[i] ?? 0),
      feelsC: Number(h.apparent_temperature?.[i] ?? h.temperature_2m?.[i] ?? 0),
      rainPct: Number(h.precipitation_probability?.[i] ?? 0),
      code: Number(h.weather_code?.[i] ?? 0),
      windKmh: Number(h.wind_speed_10m?.[i] ?? 0),
      isDay: Number(h.is_day?.[i] ?? 1) === 1,
    }];
  });
}

export function forecastUrl(lat: number, lon: number): string {
  const q = new URLSearchParams({
    latitude: String(roundCoord(lat)),
    longitude: String(roundCoord(lon)),
    hourly: "temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,is_day",
    timezone: "auto",
    forecast_days: "1",
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

/** The local hour now at the forecast's place (Open-Meteo returns its UTC offset). */
export function localHourFromForecast(json: unknown, now: Date): number {
  const off = Number((json as { utc_offset_seconds?: number })?.utc_offset_seconds ?? 0);
  return new Date(now.getTime() + off * 1000).getUTCHours();
}

/** Fetch today's forecast and judge it. Null if the service is down (nudges just skip). */
export async function outdoorToday(prefs: WeatherPrefs, now: Date, fetchImpl: typeof fetch = fetch): Promise<OutdoorVerdict | null> {
  if (!prefs.on || prefs.lat == null || prefs.lon == null) return null;
  try {
    const res = await fetchImpl(forecastUrl(prefs.lat, prefs.lon));
    if (!res.ok) return null;
    const json = await res.json();
    const hours = parseForecast(json);
    return hours.length ? bestOutdoorWindow(hours, localHourFromForecast(json, now)) : null;
  } catch {
    return null;
  }
}

/** City search for Settings (Open-Meteo geocoding). */
export async function searchPlaces(name: string, fetchImpl: typeof fetch = fetch): Promise<{ label: string; lat: number; lon: number }[]> {
  const q = new URLSearchParams({ name: name.trim(), count: "5", language: "en", format: "json" });
  const res = await fetchImpl(`https://geocoding-api.open-meteo.com/v1/search?${q}`);
  if (!res.ok) return [];
  const json = (await res.json()) as { results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[] };
  return (json.results ?? []).map((r) => ({ label: [r.name, r.admin1, r.country].filter(Boolean).join(", "), lat: roundCoord(r.latitude), lon: roundCoord(r.longitude) }));
}
