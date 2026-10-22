import { describe, expect, it } from "vitest";
import { bestOutdoorWindow, forecastUrl, hourScore, localHourFromForecast, parseForecast, weatherLine, type WeatherHour } from "./weather";

const h = (hour: number, over: Partial<WeatherHour> = {}): WeatherHour => ({ hour, tempC: 18, feelsC: 18, rainPct: 0, code: 1, windKmh: 10, isDay: hour >= 7 && hour <= 19, ...over });
const day = (f: (hour: number) => Partial<WeatherHour>) => Array.from({ length: 24 }, (_, i) => h(i, f(i)));

describe("hourScore", () => {
  it("rates comfortable daylight hours great and rules out rain, storms and night", () => {
    expect(hourScore(h(10))).toBe(2);
    expect(hourScore(h(10, { feelsC: 30 }))).toBe(1);
    expect(hourScore(h(10, { code: 63 }))).toBe(0);
    expect(hourScore(h(10, { code: 95 }))).toBe(0);
    expect(hourScore(h(10, { rainPct: 60 }))).toBe(0);
    expect(hourScore(h(22))).toBe(0);
  });
});

describe("bestOutdoorWindow", () => {
  it("finds the longest great stretch left today", () => {
    const hours = day((i) => (i >= 9 && i <= 12 ? { code: 63, rainPct: 80 } : i >= 16 && i <= 18 ? {} : { feelsC: 29 }));
    expect(bestOutdoorWindow(hours, 8)).toMatchObject({ kind: "great", from: 16, to: 19 });
  });
  it("only looks at hours still to come", () => {
    const hours = day((i) => (i >= 7 && i <= 10 ? {} : { code: 63, rainPct: 90 }));
    expect(bestOutdoorWindow(hours, 12)).toEqual({ kind: "bad", reason: "rain" });
  });
  it("falls back to a fine window, and explains a bad day", () => {
    expect(bestOutdoorWindow(day(() => ({ feelsC: 30 })), 6).kind).toBe("ok");
    expect(bestOutdoorWindow(day(() => ({ code: 75 })), 6)).toEqual({ kind: "bad", reason: "snow" });
    expect(bestOutdoorWindow(day(() => ({})), 21)).toEqual({ kind: "bad", reason: "dark" });
  });
});

describe("weatherLine", () => {
  it("speaks the user's unit", () => {
    const v = { kind: "great" as const, from: 17, to: 19, feelsC: 19, rainPct: 10, code: 0 };
    expect(weatherLine(v, "lb")).toBe("🌤️ Great weather for a run or walk 5pm–7pm: feels like 66°F, clear, 10% chance of rain.");
    expect(weatherLine(v, "kg")).toContain("19°C");
    expect(weatherLine({ kind: "bad", reason: "rain" }, "lb")).toContain("gym");
  });
});

describe("Open-Meteo parsing", () => {
  it("reads today's hours and the local hour", () => {
    const json = {
      utc_offset_seconds: -4 * 3600,
      hourly: {
        time: ["2026-10-21T00:00", "2026-10-21T17:00", "2026-10-22T00:00"],
        temperature_2m: [10, 18, 9], apparent_temperature: [9, 17, 8], precipitation_probability: [0, 10, 0],
        weather_code: [0, 2, 0], wind_speed_10m: [5, 12, 4], is_day: [0, 1, 0],
      },
    };
    expect(parseForecast(json)).toEqual([
      { hour: 0, tempC: 10, feelsC: 9, rainPct: 0, code: 0, windKmh: 5, isDay: false },
      { hour: 17, tempC: 18, feelsC: 17, rainPct: 10, code: 2, windKmh: 12, isDay: true },
    ]);
    expect(localHourFromForecast(json, new Date("2026-10-21T21:30:00Z"))).toBe(17);
    expect(parseForecast(null)).toEqual([]);
  });
  it("sends a rounded location only", () => {
    expect(forecastUrl(40.712776, -74.005974)).toContain("latitude=40.71&longitude=-74.01");
  });
});
