"use client";

import { useEffect, useState } from "react";
import DetailSheet from "@/components/DetailSheet";

type Passenger = {
  raw_name: string;
  person_entity_id: string | null;
};

type FlightRow = {
  flight_id: number;
  flight_date: string | null;
  from_codes: string[];
  to_codes: string[];
  aircraft_tail: string | null;
  remarks: string | null;
  passengers: Passenger[];
};

type PersonHit = { entity_id: string; name: string; flights: number };

type AirportInfo = {
  iata: string;
  full_name: string | null;
  city: string | null;
  country: string | null;
  state: string | null;
  lat: number;
  lng: number;
  airport_type: string | null;
};

type Data = {
  airport: AirportInfo | null;
  flights: FlightRow[];
  persons: PersonHit[];
};

interface Props {
  iata: string;
  onClose: () => void;
  onSelectPerson: (entityId: string) => void;
}

export default function AirportDetail({ iata, onClose, onSelectPerson }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/epstein/curated/airport/${encodeURIComponent(iata)}`)
      .then((r) => r.json())
      .then((d: Data) => {
        if (!cancelled) setData(d);
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
  }, [iata]);

  const airport = data?.airport;

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
            ✈ Airport
          </p>
          <p
            className="text-lg leading-snug truncate"
            style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--vmy-bone)", fontWeight: 500 }}
          >
            <span className="font-mono text-[13px] mr-2" style={{ color: "var(--vmy-ember)" }}>{iata}</span>
            {airport?.full_name ?? ""}
          </p>
          {(airport?.city || airport?.country) && (
            <p className="text-[11px] mt-0.5 leading-snug font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)" }}>
              {[airport?.city, airport?.state, airport?.country].filter(Boolean).join(" · ")}
            </p>
          )}
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
        {loading && (
          <p className="text-xs font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>Loading detail…</p>
        )}

        {data && (
          <>
            {data.persons.length > 0 && (
              <Section title={`People · ${data.persons.length}`}>
                <ul className="space-y-1">
                  {data.persons.slice(0, 50).map((p) => (
                    <li key={p.entity_id}>
                      <button
                        onClick={() => onSelectPerson(p.entity_id)}
                        className="w-full text-left text-xs transition-colors flex items-center justify-between gap-2 group"
                        style={{ color: "color-mix(in srgb, var(--vmy-bone) 82%, transparent)" }}
                      >
                        <span
                          className="truncate group-hover:text-(--vmy-ember) transition-colors"
                          style={{ fontFamily: "var(--font-fraunces), serif", fontSize: "13px" }}
                        >
                          {p.name}
                        </span>
                        <span className="font-mono text-[11px] shrink-0" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>
                          {p.flights}
                        </span>
                      </button>
                    </li>
                  ))}
                  {data.persons.length > 50 && (
                    <li className="text-[11px] font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>
                      +{data.persons.length - 50} more
                    </li>
                  )}
                </ul>
              </Section>
            )}

            {data.flights.length > 0 && (
              <Section title={`Flights · ${data.flights.length}`}>
                <ul className="space-y-1.5">
                  {data.flights.slice(0, 40).map((f) => (
                    <li
                      key={f.flight_id}
                      className="text-xs font-mono leading-snug"
                      style={{ color: "color-mix(in srgb, var(--vmy-bone) 72%, transparent)" }}
                    >
                      <span style={{ color: "var(--vmy-ember)" }}>{f.flight_date ?? "—"}</span>
                      <span className="mx-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>·</span>
                      <span>
                        {f.from_codes.join("→")}
                        {f.from_codes.length && f.to_codes.length ? "→" : ""}
                        {f.to_codes.join("→")}
                      </span>
                      {f.aircraft_tail && (
                        <span className="ml-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>{f.aircraft_tail}</span>
                      )}
                      {f.passengers.length > 0 && (
                        <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "color-mix(in srgb, var(--vmy-bone) 40%, transparent)" }}>
                          {f.passengers
                            .slice(0, 4)
                            .map((p) => p.raw_name)
                            .join(", ")}
                          {f.passengers.length > 4 ? ` +${f.passengers.length - 4}` : ""}
                        </p>
                      )}
                    </li>
                  ))}
                  {data.flights.length > 40 && (
                    <li className="text-[11px] font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>
                      +{data.flights.length - 40} more flights
                    </li>
                  )}
                </ul>
              </Section>
            )}

            {data.flights.length === 0 && (
              <p className="text-xs font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 30%, transparent)" }}>No flights linked.</p>
            )}
          </>
        )}
      </div>
    </DetailSheet>
  );
}

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
