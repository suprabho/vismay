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

export default async function WalletGeoPage() {
  const [epic, stories] = await Promise.all([
    getEpic("wallet-geo"),
    getEpicStories("wallet-geo"),
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

  return (
    <WalletGeoLanding
      epic={epic}
      summaries={summaries}
      stories={stories}
      theme={theme}
    />
  );
}
