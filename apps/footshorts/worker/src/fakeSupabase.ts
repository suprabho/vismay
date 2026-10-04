/**
 * In-memory stand-in for the slice of the Supabase client the resolver and
 * the team top-up use. Test-only.
 *
 * Mirrors PostgREST's silent `max-rows` cap (1000 on Supabase): a select
 * returns at most that many rows whatever range was asked for — the cap that
 * hid every national team past the first page in production.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const MAX_ROWS = 1000;

type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

class Query implements PromiseLike<{ data: unknown; error: null }> {
  private op: 'select' | 'insert' | 'update' | 'upsert' = 'select';
  private filters: ((r: Row) => boolean)[] = [];
  private range_: [number, number] | null = null;
  private payload: Row[] = [];
  private patch: Row = {};
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private shape: 'many' | 'single' | 'maybeSingle' = 'many';

  constructor(private tables: Tables, private table: string, private ids: { n: number }) {}

  private get rows(): Row[] {
    return (this.tables[this.table] ??= []);
  }

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  order() {
    return this;
  }
  range(from: number, to: number) {
    this.range_ = [from, to];
    return this;
  }
  single() {
    this.shape = 'single';
    return this;
  }
  maybeSingle() {
    this.shape = 'maybeSingle';
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = 'insert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.patch = patch;
    return this;
  }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.upsertOpts = opts;
    return this;
  }

  private run(): unknown {
    if (this.op === 'insert') {
      const added = this.payload.map((r) => ({ id: `gen-${++this.ids.n}`, ...r }));
      this.rows.push(...added);
      return this.shape === 'many' ? added : added[0];
    }
    if (this.op === 'update') {
      for (const r of this.rows.filter((r) => this.filters.every((f) => f(r)))) Object.assign(r, this.patch);
      return null;
    }
    if (this.op === 'upsert') {
      const keys = (this.upsertOpts.onConflict ?? 'id').split(',');
      for (const r of this.payload) {
        const existing = this.rows.find((e) => keys.every((k) => e[k] === r[k]));
        if (!existing) this.rows.push({ ...r });
        else if (!this.upsertOpts.ignoreDuplicates) Object.assign(existing, r);
      }
      return null;
    }
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.range_) out = out.slice(this.range_[0], this.range_[1] + 1);
    out = out.slice(0, MAX_ROWS);
    if (this.shape === 'many') return out;
    return out[0] ?? null;
  }

  then<A = { data: unknown; error: null }, B = never>(
    onFulfilled?: ((v: { data: unknown; error: null }) => A | PromiseLike<A>) | null,
    onRejected?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => ({ data: this.run(), error: null as null }))
      .then(onFulfilled, onRejected);
  }
}

/** A fake client over `tables`, which it mutates in place. */
export function fakeSupabase(tables: Tables): SupabaseClient {
  const ids = { n: 0 };
  return { from: (table: string) => new Query(tables, table, ids) } as unknown as SupabaseClient;
}
