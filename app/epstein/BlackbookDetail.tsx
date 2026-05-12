"use client";

import { useEffect, useState } from "react";
import DetailSheet from "@/components/DetailSheet";

type Entry = {
  id: number;
  page: number | null;
  page_link: string | null;
  name: string | null;
  surname: string | null;
  first_name: string | null;
  company: string | null;
  address_type: string | null;
  address: string | null;
  zip: string | null;
  city: string | null;
  country: string | null;
  phone_generic: string | null;
  phone_work: string | null;
  phone_home: string | null;
  phone_mobile: string | null;
  email: string | null;
  lat: number | null;
  lng: number | null;
};

type Data = {
  blackbook: Entry | null;
  persons: Array<{ entity_id: string; name: string }>;
};

interface Props {
  blackbookId: number;
  onClose: () => void;
  onSelectPerson: (entityId: string) => void;
}

export default function BlackbookDetail({ blackbookId, onClose, onSelectPerson }: Props) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setData(null);
    fetch(`/api/epstein/curated/blackbook/${encodeURIComponent(String(blackbookId))}`)
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
  }, [blackbookId]);

  const e = data?.blackbook;
  const phones = e
    ? [
        ["work", e.phone_work],
        ["home", e.phone_home],
        ["mobile", e.phone_mobile],
        ["other", e.phone_generic],
      ].filter(([, v]) => Boolean(v)) as [string, string][]
    : [];

  return (
    <DetailSheet>
      <div
        className="px-4 pt-3 pb-3 flex items-start justify-between gap-2 shrink-0"
        style={{ borderBottom: "1px solid color-mix(in srgb, var(--vmy-bone) 8%, transparent)" }}
      >
        <div className="min-w-0">
          <p
            className="text-[10px] font-mono uppercase tracking-[0.24em] mb-1"
            style={{ color: "var(--vmy-rose)" }}
          >
            ⚑ Black Book
          </p>
          <p
            className="text-lg leading-snug"
            style={{ fontFamily: "var(--font-fraunces), serif", color: "var(--vmy-bone)", fontWeight: 500 }}
          >
            {e?.name ?? "—"}
          </p>
          {e?.company && (
            <p className="text-[11px] mt-0.5 leading-snug font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 50%, transparent)" }}>
              {e.company}
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

        {e && (
          <>
            {(e.address || e.city || e.country) && (
              <Section title="Address">
                <div className="text-xs leading-relaxed" style={{ color: "color-mix(in srgb, var(--vmy-bone) 78%, transparent)" }}>
                  {e.address && <div>{e.address}</div>}
                  {(e.city || e.zip) && (
                    <div style={{ color: "color-mix(in srgb, var(--vmy-bone) 55%, transparent)" }}>
                      {[e.city, e.zip].filter(Boolean).join(" ")}
                    </div>
                  )}
                  {e.country && <div style={{ color: "color-mix(in srgb, var(--vmy-bone) 55%, transparent)" }}>{e.country}</div>}
                  {e.address_type && (
                    <div className="text-[11px] mt-0.5 font-mono" style={{ color: "color-mix(in srgb, var(--vmy-bone) 35%, transparent)" }}>
                      [{e.address_type}]
                    </div>
                  )}
                </div>
              </Section>
            )}

            {(phones.length > 0 || e.email) && (
              <Section title="Contact">
                <ul className="text-xs font-mono space-y-0.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 78%, transparent)" }}>
                  {phones.map(([kind, val]) => (
                    <li key={kind}>
                      <span className="mr-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 35%, transparent)" }}>{kind}</span>
                      {val}
                    </li>
                  ))}
                  {e.email && (
                    <li>
                      <span className="mr-1.5" style={{ color: "color-mix(in srgb, var(--vmy-bone) 35%, transparent)" }}>email</span>
                      <span style={{ color: "var(--vmy-rose)" }}>{e.email}</span>
                    </li>
                  )}
                </ul>
              </Section>
            )}

            {data && data.persons.length > 0 && (
              <Section title={`People · ${data.persons.length}`}>
                <ul className="space-y-1">
                  {data.persons.map((p) => (
                    <li key={p.entity_id}>
                      <button
                        onClick={() => onSelectPerson(p.entity_id)}
                        className="w-full text-left transition-colors truncate hover:text-(--vmy-ember)"
                        style={{
                          fontFamily: "var(--font-fraunces), serif",
                          fontSize: "13px",
                          color: "color-mix(in srgb, var(--vmy-bone) 85%, transparent)",
                        }}
                      >
                        {p.name}
                      </button>
                    </li>
                  ))}
                </ul>
                <p
                  className="text-[10px] mt-2 font-mono italic leading-snug"
                  style={{ color: "color-mix(in srgb, var(--vmy-bone) 35%, transparent)" }}
                >
                  Surname match — verify before drawing conclusions.
                </p>
              </Section>
            )}

            {e.page_link && (
              <Section title="Source">
                <a
                  href={e.page_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono underline"
                  style={{ color: "var(--vmy-rose)", textDecorationColor: "color-mix(in srgb, var(--vmy-rose) 40%, transparent)" }}
                >
                  Page {e.page ?? ""} scan ↗
                </a>
              </Section>
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
