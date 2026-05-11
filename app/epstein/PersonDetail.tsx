"use client";

import { useEffect, useState } from "react";
import type { PersonSummary } from "./page";

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
  onFlightsLoaded: (personId: string, flightIds: number[], iataCodes: string[]) => void;
}

export default function PersonDetail({ personId, person, onClose, onFlightsLoaded }: Props) {
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
        onFlightsLoaded(personId, (d.flights ?? []).map((f) => f.flight_id), Array.from(codes));
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
  }, [personId, onFlightsLoaded]);

  const citationByNumber = new Map<string, Citation>();
  for (const c of data?.citations ?? []) {
    if (c.citation_number !== null) citationByNumber.set(String(c.citation_number), c);
  }

  return (
    <div className="absolute left-4 top-16 bottom-6 z-20 w-[420px] flex flex-col bg-black/90 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-2xl">
      <div className="px-4 pt-3 pb-3 border-b border-white/10 flex items-start justify-between gap-2 flex-shrink-0">
        <div className="min-w-0">
          <p className="text-[11px] font-mono text-white/40 uppercase tracking-widest mb-0.5">
            Person
          </p>
          <p className="text-sm font-mono font-semibold text-white leading-snug">
            {person?.name ?? personId}
          </p>
          <p className="text-[11px] text-white/50 mt-0.5 leading-snug">
            {[person?.nationality, ...(person?.occupations ?? [])].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-white/30 hover:text-white/70 text-lg leading-none flex-shrink-0 transition-colors"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {person?.summary && (
          <p className="text-xs text-white/70 leading-relaxed">{person.summary}</p>
        )}

        {loading && (
          <p className="text-xs text-white/30 font-mono">Loading detail…</p>
        )}

        {data && (
          <>
            {data.flights.length > 0 && (
              <Section title={`Flights (${data.flights.length})`}>
                <ul className="space-y-1.5">
                  {data.flights.slice(0, 30).map((f, i) => (
                    <li key={i} className="text-xs font-mono text-white/70 leading-snug">
                      <span className="text-orange-300/80">
                        {f.flight_date ?? "—"}
                      </span>
                      <span className="mx-1.5 text-white/30">·</span>
                      <span>
                        {f.from_codes.join("→")}
                        {f.from_codes.length && f.to_codes.length ? "→" : ""}
                        {f.to_codes.join("→")}
                      </span>
                      {f.aircraft_tail && (
                        <span className="ml-1.5 text-white/30">{f.aircraft_tail}</span>
                      )}
                      <span className="ml-1.5 text-white/30 italic">as {f.raw_name}</span>
                    </li>
                  ))}
                  {data.flights.length > 30 && (
                    <li className="text-[11px] text-white/30 font-mono">
                      +{data.flights.length - 30} more flights
                    </li>
                  )}
                </ul>
              </Section>
            )}

            {data.blackbook.length > 0 && (
              <Section title="Black Book">
                {data.blackbook.map((b) => (
                  <div key={b.id} className="text-xs text-white/70 leading-snug">
                    {b.address && <div>{b.address}</div>}
                    {(b.city || b.country) && (
                      <div className="text-white/50">
                        {[b.city, b.country].filter(Boolean).join(", ")}
                      </div>
                    )}
                    {b.email && (
                      <div className="text-orange-300/70 mt-0.5">{b.email}</div>
                    )}
                  </div>
                ))}
              </Section>
            )}

            {data.relationships.length > 0 && (
              <Section title={`Relationships (${data.relationships.length})`}>
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
                <p className="text-xs text-white/30 font-mono">
                  No relationships, flights, or Black Book entries linked.
                </p>
              )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-mono text-white/40 uppercase tracking-widest mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function VerificationBadge({ status }: { status: string | null }) {
  const s = (status ?? "").toLowerCase();
  // Factual = green; Unverified = amber; everything else = grey
  const styles =
    s === "factual"
      ? "bg-green-500/15 text-green-300 border-green-400/40"
      : s === "unverified"
      ? "bg-amber-500/15 text-amber-300 border-amber-400/40"
      : "bg-white/5 text-white/50 border-white/20";
  return (
    <span
      className={`inline-block text-[10px] font-mono uppercase tracking-wider px-1.5 py-px rounded border ${styles}`}
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
    <li className="border border-white/10 rounded-lg px-2.5 py-2 leading-snug">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="min-w-0">
          <span className="text-[11px] font-mono text-orange-300/90 uppercase tracking-wider">
            {edge.rel_type.replace(/_/g, " ")}
          </span>
          {edge.direction === "in" && (
            <span className="text-[10px] text-white/30 ml-1.5">(received)</span>
          )}
        </div>
        <VerificationBadge status={edge.verification_status} />
      </div>
      <p className="text-xs text-white/80 truncate">
        {edge.other_name ?? edge.other_id}
        {edge.other_kind !== "person" && (
          <span className="text-white/30 ml-1.5">[{edge.other_kind}]</span>
        )}
      </p>
      {edge.context && (
        <p className="text-[11px] text-white/55 mt-1 leading-relaxed">{edge.context}</p>
      )}
      {edge.citations.length > 0 && (
        <p className="text-[11px] mt-1.5 leading-snug">
          <span className="text-white/30 mr-1">cites:</span>
          {edge.citations.map((num, i) => {
            const c = citations.get(num);
            return (
              <span key={i}>
                {c?.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-300/80 hover:text-orange-300 underline decoration-orange-300/30"
                    title={c.title ?? undefined}
                  >
                    [{num}]
                  </a>
                ) : (
                  <span className="text-white/40">[{num}]</span>
                )}
                {i < edge.citations.length - 1 && <span className="text-white/20"> </span>}
              </span>
            );
          })}
        </p>
      )}
    </li>
  );
}
