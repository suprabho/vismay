'use client';

import { useEffect, useState } from 'react';
import { RecapMarkdown } from '@/components/RecapMarkdown';
import { useRecap, useRecapList, type RecapMeta } from '@/lib/useRecaps';

function scopeLabel(scope: string): string {
  if (scope === 'all') return 'All competitions';
  return scope
    .split('-')
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function selKey(r: { recap_date: string; scope: string }): string {
  return `${r.recap_date}::${r.scope}`;
}

function RecapRow({ r, active, onClick }: { r: RecapMeta; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? 'w-full rounded-lg border border-accent bg-surface px-3 py-2.5 text-left'
          : 'w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left hover:border-muted'
      }
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-text">{r.recap_date}</span>
        <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          {scopeLabel(r.scope)}
        </span>
      </div>
      <div className="mt-1 text-xs text-muted">
        {r.fixture_count} match{r.fixture_count === 1 ? '' : 'es'} · {r.article_count} stor
        {r.article_count === 1 ? 'y' : 'ies'}
        {r.model ? '' : ' · no narrative'}
      </div>
    </button>
  );
}

export default function RecapAdminPage() {
  const { data: list, isLoading, error } = useRecapList();
  const [selected, setSelected] = useState<{ date: string; scope: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // Default to the newest recap once the list loads.
  useEffect(() => {
    if (!selected && list && list.length > 0) {
      setSelected({ date: list[0]!.recap_date, scope: list[0]!.scope });
    }
  }, [list, selected]);

  const { data: recap, isLoading: loadingRecap } = useRecap(
    selected?.date ?? null,
    selected?.scope ?? null,
  );

  const copy = async () => {
    if (!recap) return;
    await navigator.clipboard.writeText(recap.markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <p className="mb-2 text-base text-text">Could not load recaps</p>
        <p className="text-sm text-muted">{(error as Error)?.message ?? 'Unknown error'}</p>
      </div>
    );
  }

  if (!list || list.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="mb-3 text-lg font-semibold text-text">Recaps</h1>
        <div className="rounded-lg border border-border bg-surface px-4 py-8 text-center">
          <p className="mb-1 text-sm text-text">No recaps yet.</p>
          <p className="text-xs text-muted">
            Generate one with{' '}
            <code className="rounded bg-bg px-1 py-0.5 text-[11px]">pnpm recap</code> in the worker
            (runs automatically after the day&apos;s last game via the scores workflow).
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="mb-4 text-lg font-semibold text-text">Recaps</h1>

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        {/* List */}
        <div className="space-y-2">
          {list.map((r) => {
            const active = !!selected && selKey({ recap_date: selected.date, scope: selected.scope }) === selKey(r);
            return (
              <RecapRow
                key={selKey(r)}
                r={r}
                active={active}
                onClick={() => setSelected({ date: r.recap_date, scope: r.scope })}
              />
            );
          })}
        </div>

        {/* Detail */}
        <div className="min-w-0">
          {loadingRecap ? (
            <div className="flex min-h-[40vh] items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            </div>
          ) : recap ? (
            <article className="rounded-lg border border-border bg-surface px-5 py-5">
              <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                <span className="text-xs text-muted">
                  {recap.model ? `Narrative: ${recap.model}` : 'Deterministic only'} · generated{' '}
                  {new Date(recap.generated_at).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={copy}
                  className="rounded-full border border-border px-3 py-1 text-xs text-muted hover:border-muted hover:text-text"
                >
                  {copied ? 'Copied' : 'Copy markdown'}
                </button>
              </div>
              <RecapMarkdown markdown={recap.markdown} />
            </article>
          ) : (
            <p className="text-sm text-muted">Select a recap.</p>
          )}
        </div>
      </div>
    </main>
  );
}
