"use client";

import { useEffect, useState } from "react";
import DetailSheet from "@/components/DetailSheet";
import BreakdownBars from "@/components/wallet-geo/BreakdownBars";
import ObservationCalendar from "@/components/wallet-geo/ObservationCalendar";
import type { CountryProfile } from "@/lib/wallet-geo/data";
import type { WalletGeoTheme } from "./theme";

interface Props {
  code: string;
  onClose: () => void;
  theme: WalletGeoTheme;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: CountryProfile }
  | { kind: "missing" }
  | { kind: "error"; message: string };

// Parent mounts this with `key={code}` so each country gets a fresh component
// instance — that's why initial loading state can come from useState and the
// effect doesn't need to reset it.
export default function CountryDetail({ code, onClose, theme }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/wallet-geo/country/${encodeURIComponent(code)}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setState({ kind: "missing" });
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as CountryProfile;
        if (!cancelled) setState({ kind: "ready", data });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <DetailSheet>
      <Header
        title={state.kind === "ready" ? state.data.name : code}
        addressCount={state.kind === "ready" ? state.data.addressCount : null}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-5">
        {state.kind === "loading" && (
          <p className="text-xs font-mono text-zinc-500 mt-3">Loading profile…</p>
        )}
        {state.kind === "error" && (
          <p className="text-xs font-mono text-rose-400 mt-3">
            Failed to load: {state.message}
          </p>
        )}
        {state.kind === "missing" && (
          <p className="text-xs font-mono text-zinc-500 mt-3">
            No profile data for this country.
          </p>
        )}
        {state.kind === "ready" && <Profile data={state.data} theme={theme} />}
      </div>
    </DetailSheet>
  );
}

function Header({
  title,
  addressCount,
  onClose,
}: {
  title: string;
  addressCount: number | null;
  onClose: () => void;
}) {
  return (
    <div
      className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 shrink-0"
      style={{ borderBottom: "1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)" }}
    >
      <div className="min-w-0">
        <p
          className="text-[10px] font-mono uppercase tracking-[0.22em] mb-1"
          style={{ color: "var(--vmy-ember)" }}
        >
          Wallet geography
        </p>
        <h2
          className="text-lg leading-snug truncate"
          style={{ color: "var(--vmy-bone)", fontWeight: 500 }}
        >
          {title}
        </h2>
        {addressCount != null && (
          <p
            className="text-[11px] font-mono mt-0.5"
            style={{ color: "color-mix(in srgb, var(--vmy-bone) 55%, transparent)" }}
          >
            {addressCount.toLocaleString()} addresses observed
          </p>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Close"
        className="text-lg leading-none shrink-0 hover:text-white"
        style={{ color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)" }}
      >
        ×
      </button>
    </div>
  );
}

function Profile({ data, theme }: { data: CountryProfile; theme: WalletGeoTheme }) {
  return (
    <>
      {data.summary && (
        <p
          className="text-sm leading-relaxed mt-3"
          style={{ color: "color-mix(in srgb, var(--vmy-bone) 80%, transparent)" }}
        >
          {data.summary}
        </p>
      )}

      <Tiles data={data} />

      <Block title="IP type" subtitle="Share of observed sessions">
        <BreakdownBars
          entries={data.ipType}
          total={data.addressCount}
          colors={[
            theme.accentHi,
            theme.accent,
            theme.accentMid,
            theme.accentLo,
            "#475569",
          ]}
        />
      </Block>

      <Block title="Platform" subtitle="Linked social-media handle (PRD §5.3)">
        <BreakdownBars
          entries={data.platform}
          total={data.addressCount}
          colors={[
            theme.accentHi,
            theme.accent,
            theme.accentMid,
            theme.accentLo,
            "#475569",
          ]}
        />
      </Block>

      <Block title="Dataset" subtitle="Source feed — most provenance is gated">
        <BreakdownBars
          entries={data.dataset}
          total={data.addressCount}
          colors={[
            theme.accentLo,
            theme.accentLo,
            theme.accentLo,
            theme.accent,
            theme.accentMid,
          ]}
        />
      </Block>

      <Block
        title="Observations"
        subtitle={`${data.observationTotal.toLocaleString()} sessions · peak ${data.observationPeak.count.toLocaleString()} on ${formatDate(data.observationPeak.date)}`}
      >
        <ObservationCalendar
          observations={data.observations}
          accent={theme.accentHi}
          accentMid={theme.accentMid}
          accentLo={theme.accentLo}
          line={theme.line}
          muted={theme.muted}
        />
      </Block>

      <p
        className="text-[10px] font-mono leading-snug"
        style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}
      >
        Synthesized real-shape mock. Country totals anchored to{" "}
        <a
          className="underline"
          href="https://www.chainalysis.com/blog/2025-global-crypto-adoption-index/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Chainalysis 2025 Geography of Crypto
        </a>
        ; IP-type bias from{" "}
        <a
          className="underline"
          href="https://cybernews.com/best-vpn/vpn-usage-by-country/"
          target="_blank"
          rel="noopener noreferrer"
        >
          public VPN-adoption stats
        </a>
        . Per the Tracker PRD, most production-dataset provenance is gated to
        licensed customers — rendered here as &ldquo;Confidential&rdquo; rows.
      </p>
    </>
  );
}

function Tiles({ data }: { data: CountryProfile }) {
  const topIp = data.ipType[0];
  const topPlatform = data.platform[0];
  const tiles: { label: string; value: string; suffix?: string }[] = [
    { label: "Addresses", value: formatBig(data.addressCount) },
    {
      label: "Top IP type",
      value: topIp.label,
      suffix: `${Math.round((topIp.count / data.addressCount) * 100)}%`,
    },
    {
      label: "Top platform",
      value: topPlatform.label,
      suffix: `${Math.round((topPlatform.count / data.addressCount) * 100)}%`,
    },
    {
      label: "Confidential share",
      value: `${Math.round(
        (data.dataset
          .filter((d) => d.confidential)
          .reduce((a, b) => a + b.count, 0) /
          data.addressCount) *
          100
      )}%`,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <div
          key={t.label}
          className="rounded-md px-3 py-2"
          style={{
            background: "color-mix(in srgb, var(--vmy-bone) 4%, transparent)",
            border: "1px solid color-mix(in srgb, var(--vmy-bone) 6%, transparent)",
          }}
        >
          <div
            className="text-[9px] font-mono uppercase tracking-[0.18em]"
            style={{ color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)" }}
          >
            {t.label}
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span
              className="text-base leading-none truncate"
              style={{ color: "var(--vmy-bone)", fontWeight: 500 }}
            >
              {t.value}
            </span>
            {t.suffix && (
              <span
                className="text-[10px] font-mono"
                style={{ color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)" }}
              >
                {t.suffix}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Block({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2">
        <p className="text-xs" style={{ color: "var(--vmy-bone)", fontWeight: 500 }}>
          {title}
        </p>
        <p
          className="text-[10px] font-mono"
          style={{ color: "color-mix(in srgb, var(--vmy-bone) 45%, transparent)" }}
        >
          {subtitle}
        </p>
      </div>
      {children}
    </div>
  );
}

function formatBig(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString();
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
