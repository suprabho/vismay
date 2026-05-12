"use client";

import { useEffect, useState } from "react";
import type { PersonSummary } from "./page";
import DetailSheet from "@/components/DetailSheet";

type Citation = {
  citation_id: string;
  citation_number: number | null;
  title: string | null;
  url: string | null;
  source_type: string | null;
};

type RelEdge = {
  rel_type: string;
  other_id: string;            // the entity_id on the other side of the edge
  other_name: string | null;
  other_kind: "person" | "organization" | "other";
  direction: "out" | "in";     // out = person is :START_ID, in = person is :END_ID
  context: string | null;
  confidence: number | null;
  citations: string[];         // citation_number strings
  verification_status: string | null;
};

type FlightSummary = {
  flight_id: number;
  flight_date: string | null;
  from_codes: string[];
  to_codes: string[];
  aircraft_tail: string | null;
  raw_name: string;
};

type BlackbookEntry = {
  id: number;
  name: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  email: string | null;
};

type PersonDetailData = {
  relationships: RelEdge[];
  citations: Citation[];
  flights: FlightSummary[];
  blackbook: BlackbookEntry[];
};

interface Props {
  personId: string;
  person: PersonSummary | undefined;
  onClose: () => void;
  onDataLoaded: (
    personId: string,
    flightIds: number[],
    iataCodes: string[],
    blackbookIds: number[]
  ) => void;
}

export default function PersonDetail({ personId, person, onClose, onDataLoaded }: Props) {
  const [data, setData] = useState<PersonDetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/epstein/curated/person/${encodeURIComponent(personId)}`)
      .then((r) => r.json())
      .then((d: PersonDetailData) => {
        if (cancelled) return;
        setData(d);
        const codes = new Set<string>();
        for (const f of d.flights ?? []) {
          for (const c of f.from_codes) codes.add(c);
          for (const c of f.to_codes) codes.add(c);
        }
        onDataLoaded(
          personId,
          (d.flights ?? []).map((f) => f.flight_id),
          Array.from(codes),
          (d.blackbook ?? []).map((b) => b.id)
        );
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [personId, onDataLoaded]);

  const citationByNumber = new Map<string, Citation>();
  for (const c of data?.citations ?? []) {
    if (c.citation_number !== null) citationByNumber.set(String(c.citation_number), c);
  }

  return (
    <DetailSheet>
      <div
        className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 shrink-0"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)" }}
      >
        <div className="min-w-0">
          <p
            className="text-[10px] font-mono uppercase tracking-[0.24em] mb-1"
            style={{ color: "var(--vmy-ember)" }}
          >
            ✕ Person Dossier
          </p>
          <p
            className="text-lg leading-snug"
            style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--vmy-bone)", fontWeight: 500 }}
          >
            {person?.name ?? personId}
          </p>
          <p className="text-[11px] mt-0.5 leading-snug font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)" }}>
            {[person?.nationality, ...(person?.occupations ?? [])].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-lg leading-none shrink-0 transition-colors hover:opacity-100"
          style={{ color: "color-mix(in srgb, var(--vmy-bone) 40%, transparent)" }}
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {person?.summary && (
          <p className="text-xs leading-relaxed" style={{ color: "color-mix(in srgb, var(--vmy-bone) 78%, transparent)" }}>
            {person.summary}
          </p>
        )}

        {loading && (
          <p className="text-xs font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>Loading detail…</p>
        )}

        {data && (
          <>
            {data.flights.length > 0 && (
              <Section title={`Flights · ${data.flights.length}`}>
                <ul className="space-y-1.5">
                  {data.flights.slice(0, 30).map((f, i) => (
                    <li
                      key={i}
                      className="text-xs font-mono leading-snug"
                      style={{ color: "color-mix(in srgb, var(--vmy-bone) 72%, transparent)" }}
                    >
                      <span style={{ color: "var(--vmy-ember)" }}>
                        {f.flight_date ?? "—"}
                      </span>
                      <span className="mx-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>·</span>
                      <span>
                        {f.from_codes.join("→")}
                        {f.from_codes.length && f.to_codes.length ? "→" : ""}
                        {f.to_codes.join("→")}
                      </span>
                      {f.aircraft_tail && (
                        <span className="ml-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>{f.aircraft_tail}</span>
                      )}
                      <span className="ml-1.5 italic" style={{ color: "color-mix(in srgb, var(--vmy-bone) 35%, transparent)" }}>as {f.raw_name}</span>
                    </li>
                  ))}
                  {data.flights.length > 30 && (
                    <li className="text-[11px] font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>
                      +{data.flights.length - 30} more flights
                    </li>
                  )}
                </ul>
              </Section>
            )}

            {data.blackbook.length > 0 && (
              <Section title="Black Book">
                {data.blackbook.map((b) => (
                  <div key={b.id} className="text-xs leading-snug" style={{ color: "color-mix(in srgb, var(--vmy-bone) 72%, transparent)" }}>
                    {b.address && <div>{b.address}</div>}
                    {(b.city || b.country) && (
                      <div style={{ color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)" }}>
                        {[b.city, b.country].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {b.email && (
                      <div className="mt-0.5" style={{ color: "var(--vmy-rose)" }}>{b.email}</div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {data.relationships.length > 0 && (
              <Section title={`Relationships · ${data.relationships.length}`}>
                <ul className="space-y-2">
                  {data.relationships.map((r, i) => (
                    <RelationshipRow
                      key={i}
                      edge={r}
                      citations={citationByNumber}
                    />
                  ))}
                </ul>
              </Section>
            )}

            {data.relationships.length === 0 &&
              data.flights.length === 0 &&
              data.blackbook.length === 0 && (
                <p className="text-xs font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>
                  No relationships, flights, or Black Book entries linked.
                </p>
              )}
          </>
        )}
      </div>
    </DetailSheet>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-[10px] font-mono uppercase tracking-[0.22em] mb-2"
        style={{ color: "color-mix(in srgb, var(--vmy-bone) 45%, transparent)" }}
      >
        — {title}
      </p>
      {children}
    </div>
  );
}

function VerificationBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  // Factual = ember; Unverified = rose; everything else = bone-muted.
  const style: React.CSSProperties =
    s === "factual"
      ? { color: "var(--vmy-signal)", background: "color-mix(in srgb, var(--vmy-signal) 10%, transparent)", borderColor: "color-mix(in srgb, var(--vmy-signal) 35%, transparent)" }
      : s === "unverified"
      ? { color: "var(--vmy-rose)", background: "color-mix(in srgb, var(--vmy-rose) 12%, transparent)", borderColor: "color-mix(in srgb, var(--vmy-rose) 35%, transparent)" }
      : { color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)", background: "color-mix(in srgb, var(--vmy-bone) 5%, transparent)", borderColor: "color-mix(in srgb, var(--vmy-bone) 18%, transparent)" };
  return (
    <span
      className="inline-block text-[9px] font-mono uppercase tracking-wider px-1.5 py-px rounded border"
      style={style}
    >
      {status ?? "—"}
    </span>
  );
}

function RelationshipRow({
  edge,
  citations,
}: {
  edge: RelEdge;
  citations: Map<string, Citation>;
}) {
  return (
    <li
      className="rounded-lg px-2.5 py-2 leading-snug"
      style={{
        border: "1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)",
        background: "color-mix(in srgb, var(--vmy-ink) 40%, transparent)",
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="min-w-0">
          <span
            className="text-[10px] font-mono uppercase tracking-[0.16em]"
            style={{ color: "var(--vmy-ember)" }}
          >
            {edge.rel_type.replace(/_/g, " ")}
          </span>
          {edge.direction === "in" && (
            <span className="text-[10px] ml-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>(received)</span>
          )}
        </div>
        <VerificationBadge status={edge.verification_status} />
      </div>
      <p
        className="text-sm truncate"
        style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--vmy-bone)" }}
      >
        {edge.other_name ?? edge.other_id}
        {edge.other_kind !== "person" && (
          <span className="text-[11px] font-mono ml-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>
            [{edge.other_kind}]
          </span>
        )}
      </p>
      {edge.context && (
        <p
          className="text-[11px] mt-1 leading-relaxed"
          style={{ color: "color-mix(in srgb, var(--vmy-bone) 60%, transparent)" }}
        >
          {edge.context}
        </p>
      )}
      {edge.citations.length > 0 && (
        <p className="text-[11px] mt-1.5 leading-snug font-mono">
          <span className="mr-1" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>cites:</span>
          {edge.citations.map((num, i) => {
            const c = citations.get(num);
            return (
              <span key={i}>
                {c?.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: "var(--vmy-steel)", textDecorationColor: "color-mix(in srgb, var(--vmy-steel) 40%, transparent)" }}
                    title={c.title ?? undefined}
                  >
                    [{num}]
                  </a>
                ) : (
                  <span style={{ color: "color-mix(in srgb, var(--vmy-bone) 40%, transparent)" }}>[{num}]</span>
                )}
                {i < edge.citations.length - 1 && <span style={{ color: "color-mix(in srgb, var(--vmy-bone) 20%, transparent)" }}> </span>}
              </span>
            );
          })}
        </p>
      )}
    </li>
  );
}
