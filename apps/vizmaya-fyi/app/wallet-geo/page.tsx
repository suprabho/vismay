import type { Metadata } from "next";
import { getEpic, getEpicStories } from "@vismay/content-source/epics";
import { listWalletGeoSummaries } from "@/lib/wallet-geo/data";
import WalletGeoLanding from "./WalletGeoLanding";
import { resolveWalletGeoTheme } from "./theme";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Wallet Geography — vizmaya",
  description:
    "Where crypto wallets transact from. Per-country address counts, IP-type splits, platform mix, and 12-month observation calendars.",
  alternates: { canonical: "/wallet-geo" },
};

type SearchParams = Record<string, string | string[] | undefined>;

function num(v: string | string[] | undefined): number | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined || s === "") return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: string | string[] | undefined): boolean {
  const s = Array.isArray(v) ? v[0] : v;
  return s === "1" || s === "true";
}

export default async function WalletGeoPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const [epic, stories, sp] = await Promise.all([
    getEpic("wallet-geo"),
    getEpicStories("wallet-geo"),
    searchParams,
  ]);

  if (!epic) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-400 px-6 text-center">
        <p className="text-sm font-mono">
          Wallet Geography epic not seeded. Apply migration 040.
        </p>
      </div>
    );
  }

  const theme = resolveWalletGeoTheme(epic.theme);
  const summaries = listWalletGeoSummaries();

  // ?lng=&lat=&zoom=&pitch=&bearing= override the default view; any missing
  // axis falls through to the hardcoded default inside WalletGeoLanding.
  // ?embed=1 strips the header + story footer for clean iframe embeds.
  const initialView = {
    longitude: num(sp.lng),
    latitude: num(sp.lat),
    zoom: num(sp.zoom),
    pitch: num(sp.pitch),
    bearing: num(sp.bearing),
  };

  return (
    <WalletGeoLanding
      epic={epic}
      summaries={summaries}
      stories={stories}
      theme={theme}
      embed={bool(sp.embed)}
      initialView={initialView}
    />
  );
}
