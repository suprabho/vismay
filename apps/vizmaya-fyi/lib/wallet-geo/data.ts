// Deterministic synth for the /wallet-geo epic. All numbers are derived from
// the country baselines in countries.ts and a per-country PRNG seeded by the
// ISO code, so the same code path always produces the same data — no API
// calls, no DB lookups.
//
// Anchored to public reports:
//   - country totals / ordering: Chainalysis 2025 Geography of Cryptocurrency
//   - IP-type split: bias by per-country VPN-adoption rate (cybernews.com)
//
// The "Source" dimension is intentionally skewed to "Confidential" per the
// PRD note that most of the dataset's provenance is gated.

import {
  WALLET_GEO_COUNTRIES,
  WALLET_GEO_COUNTRIES_BY_CODE,
  type WalletGeoCountry,
} from "./countries";

// ─── PRNG ──────────────────────────────────────────────────────────────────
// mulberry32 — small, fast, no deps. Deterministic for a given seed.

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedFromCode(code: string): number {
  let h = 2166136261;
  for (let i = 0; i < code.length; i++) {
    h ^= code.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ─── Breakdown dimensions ──────────────────────────────────────────────────

export const IP_TYPE_KEYS = ["residential", "vpn", "commercial", "hosting", "mobile"] as const;
export type IpType = typeof IP_TYPE_KEYS[number];

export const IP_TYPE_LABELS: Record<IpType, string> = {
  residential: "Residential",
  vpn: "VPN",
  commercial: "Commercial",
  hosting: "Hosting",
  mobile: "Mobile",
};

export const PLATFORM_KEYS = ["x", "telegram", "discord", "reddit", "farcaster"] as const;
export type Platform = typeof PLATFORM_KEYS[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X / Twitter",
  telegram: "Telegram",
  discord: "Discord",
  reddit: "Reddit",
  farcaster: "Farcaster",
};

export const DATASET_KEYS = ["confidential_a", "confidential_b", "confidential_c", "public_etherscan", "public_blockchair"] as const;
export type Dataset = typeof DATASET_KEYS[number];

export const DATASET_LABELS: Record<Dataset, string> = {
  confidential_a: "Confidential · Source A",
  confidential_b: "Confidential · Source B",
  confidential_c: "Confidential · Source C",
  public_etherscan: "Etherscan tx",
  public_blockchair: "Blockchair tx",
};

export const DATASET_CONFIDENTIAL: Record<Dataset, boolean> = {
  confidential_a: true,
  confidential_b: true,
  confidential_c: true,
  public_etherscan: false,
  public_blockchair: false,
};

export interface BreakdownEntry {
  key: string;
  label: string;
  count: number;
  confidential?: boolean;
}

export interface DailyObservation {
  date: string; // ISO YYYY-MM-DD
  count: number;
}

export interface CountryProfile {
  code: string;
  name: string;
  lat: number;
  lng: number;
  addressCount: number;
  summary: string;
  ipType: BreakdownEntry[];
  platform: BreakdownEntry[];
  dataset: BreakdownEntry[];
  observations: DailyObservation[]; // last 365 days, newest last
  // Convenience aggregates derived from observations.
  observationTotal: number;
  observationPeak: { date: string; count: number };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Distribute `total` over `weights` proportionally, rounding to integers and
 * funnelling any rounding remainder into the largest bucket so the parts sum
 * back to `total`.
 */
function allocate(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (w / sumW) * total);
  const floored = raw.map((v) => Math.floor(v));
  const remainder = total - floored.reduce((a, b) => a + b, 0);
  if (remainder > 0) {
    let maxIdx = 0;
    for (let i = 1; i < floored.length; i++) {
      if (raw[i] - floored[i] > raw[maxIdx] - floored[maxIdx]) maxIdx = i;
    }
    floored[maxIdx] += remainder;
  }
  return floored;
}

function ipTypeWeights(country: WalletGeoCountry): Record<IpType, number> {
  // Residential is the base; VPN scales with the country's VPN-adoption rate;
  // commercial/hosting are tied to financial-hub posture (proxied by GDP weight
  // baked into the country baseline — heuristically: institutional markets get
  // a lift). Mobile is largest in retail-led emerging markets.
  const v = country.vpnRate; // 0..1
  const isHub = ["US", "GB", "SG", "CH", "HK", "DE", "JP", "KR", "FR", "NL", "IL", "AE"].includes(country.code);
  const hubBoost = isHub ? 1 : 0;
  const isRetailEM = ["IN", "PK", "VN", "NG", "PH", "ID", "ET", "EG", "VE"].includes(country.code);
  const emBoost = isRetailEM ? 1 : 0;
  return {
    residential: 0.55 * (1 - v * 0.6) + (emBoost ? 0.15 : 0),
    vpn: 0.05 + v * 0.6,
    commercial: 0.10 + hubBoost * 0.12,
    hosting: 0.07 + hubBoost * 0.08,
    mobile: 0.18 + emBoost * 0.18,
  };
}

function platformWeights(rng: () => number): number[] {
  // Most addresses link via X or Telegram. Discord is a meaningful but smaller
  // chunk. Reddit + Farcaster are long-tail. Small per-country jitter.
  return [
    0.42 + (rng() - 0.5) * 0.06, // X
    0.28 + (rng() - 0.5) * 0.06, // Telegram
    0.16 + (rng() - 0.5) * 0.04, // Discord
    0.10 + (rng() - 0.5) * 0.03, // Reddit
    0.04 + (rng() - 0.5) * 0.02, // Farcaster
  ].map((w) => Math.max(0, w));
}

function datasetWeights(rng: () => number): number[] {
  // PRD: most of the data lineage is confidential. Confidential A/B/C carry
  // ~85% of the volume; public datasets are the remaining ~15%.
  return [
    0.42 + (rng() - 0.5) * 0.06, // confidential_a
    0.28 + (rng() - 0.5) * 0.05, // confidential_b
    0.16 + (rng() - 0.5) * 0.04, // confidential_c
    0.09 + (rng() - 0.5) * 0.02, // public_etherscan
    0.05 + (rng() - 0.5) * 0.02, // public_blockchair
  ].map((w) => Math.max(0, w));
}

// ─── Daily observation synthesis ───────────────────────────────────────────

// Today defaults to a fixed reference date so the rendered calendar lines up
// across server-render and client-render without timezone drift. The user
// can override via WALLET_GEO_REFERENCE_DATE if they want it to "move".
function referenceDate(): Date {
  const env = typeof process !== "undefined" ? process.env.WALLET_GEO_REFERENCE_DATE : undefined;
  if (env && /^\d{4}-\d{2}-\d{2}$/.test(env)) return new Date(`${env}T00:00:00Z`);
  return new Date("2026-05-18T00:00:00Z");
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildObservations(country: WalletGeoCountry, rng: () => number): DailyObservation[] {
  // Daily mean ≈ baseline_addresses / ~12 (an address typically sees several
  // observations across the year). Add a weekly cycle (weekday > weekend),
  // mild quarterly trend, and per-country noise.
  const dailyMean = Math.max(1, country.addressBaseline / 280);
  const end = referenceDate();
  const start = new Date(end);
  start.setUTCDate(end.getUTCDate() - 364);

  const out: DailyObservation[] = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const dow = d.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dow === 0 || dow === 6;
    // Weekly factor + linear ramp + noise.
    const weeklyFactor = isWeekend ? 0.7 : 1.0;
    const trendFactor = 0.6 + (i / 365) * 0.8;
    const noise = 0.4 + rng() * 1.2;
    let count = Math.round(dailyMean * weeklyFactor * trendFactor * noise);
    // Sprinkle a few "incidents" — sharp spikes ~5x daily mean on a handful
    // of days per country.
    if (rng() < 0.012) count = Math.round(count + dailyMean * (3 + rng() * 5));
    if (count < 0) count = 0;
    out.push({ date: formatDate(d), count });
  }
  return out;
}

// ─── Public API ────────────────────────────────────────────────────────────

const PROFILE_CACHE = new Map<string, CountryProfile>();

export function getWalletGeoCountryProfile(code: string): CountryProfile | null {
  const upper = code.toUpperCase();
  const cached = PROFILE_CACHE.get(upper);
  if (cached) return cached;
  const country = WALLET_GEO_COUNTRIES_BY_CODE[upper];
  if (!country) return null;

  const rng = mulberry32(seedFromCode(upper));

  const addressCount = Math.round(country.addressBaseline * (0.95 + rng() * 0.1));

  // IP Type
  const ipWeights = ipTypeWeights(country);
  const ipCounts = allocate(addressCount, IP_TYPE_KEYS.map((k) => ipWeights[k]));
  const ipType: BreakdownEntry[] = IP_TYPE_KEYS.map((k, i) => ({
    key: k,
    label: IP_TYPE_LABELS[k],
    count: ipCounts[i],
  }));
  ipType.sort((a, b) => b.count - a.count);

  // Platform
  const platformCounts = allocate(addressCount, platformWeights(rng));
  const platform: BreakdownEntry[] = PLATFORM_KEYS.map((k, i) => ({
    key: k,
    label: PLATFORM_LABELS[k],
    count: platformCounts[i],
  }));
  platform.sort((a, b) => b.count - a.count);

  // Dataset
  const datasetCounts = allocate(addressCount, datasetWeights(rng));
  const dataset: BreakdownEntry[] = DATASET_KEYS.map((k, i) => ({
    key: k,
    label: DATASET_LABELS[k],
    count: datasetCounts[i],
    confidential: DATASET_CONFIDENTIAL[k],
  }));
  dataset.sort((a, b) => b.count - a.count);

  // Observations
  const observations = buildObservations(country, rng);
  let observationTotal = 0;
  let peak: { date: string; count: number } = { date: observations[0].date, count: 0 };
  for (const o of observations) {
    observationTotal += o.count;
    if (o.count > peak.count) peak = o;
  }

  const profile: CountryProfile = {
    code: country.code,
    name: country.name,
    lat: country.lat,
    lng: country.lng,
    addressCount,
    summary: country.summary,
    ipType,
    platform,
    dataset,
    observations,
    observationTotal,
    observationPeak: peak,
  };
  PROFILE_CACHE.set(upper, profile);
  return profile;
}

/**
 * Lightweight per-country aggregates for the choropleth (no breakdowns, no
 * timeseries). Cheap to compute and serializable straight into the page.
 */
export interface WalletGeoSummary {
  code: string;
  name: string;
  lat: number;
  lng: number;
  addressCount: number;
}

export function listWalletGeoSummaries(): WalletGeoSummary[] {
  return WALLET_GEO_COUNTRIES.map((c) => {
    const p = getWalletGeoCountryProfile(c.code);
    return {
      code: c.code,
      name: c.name,
      lat: c.lat,
      lng: c.lng,
      addressCount: p?.addressCount ?? c.addressBaseline,
    };
  });
}
