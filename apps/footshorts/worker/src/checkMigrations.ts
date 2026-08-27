/**
 * Fail loudly when a merged footshorts migration hasn't been applied to the
 * live database.
 *
 * Migrations under supabase/footshorts/migrations are applied by hand
 * (`supabase db push`); nothing in CI runs them. On 2026-08-24 the
 * entity_aliases migration merged but was never pushed, the worker threw on
 * every article for three days, and the feed showed "No recent stories".
 *
 * PostgREST can't see supabase_migrations.schema_migrations, so instead we
 * parse every migration for `create table X` / `alter table X add column Y`
 * and probe each object via the REST API: a 404 (PGRST205, unknown table) or
 * 400 (42703, unknown column) means the migration is not applied.
 *
 * Run via: pnpm check:migrations   (also the first step of footshorts-ingest.yml)
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MIGRATIONS_DIR = resolve(__dirname, '../../../../supabase/footshorts/migrations');

type Probe = { migration: string; table: string; column?: string };

function extractProbes(file: string, sql: string): Probe[] {
  const probes: Probe[] = [];
  const src = sql.replace(/--[^\n]*/g, ''); // strip comments
  for (const m of src.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?/gi)) {
    probes.push({ migration: file, table: m[1]! });
  }
  for (const m of src.matchAll(
    /alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?"?([a-z_][a-z0-9_]*)"?\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z_][a-z0-9_]*)"?/gi
  )) {
    probes.push({ migration: file, table: m[1]!, column: m[2]! });
  }
  return probes;
}

async function exists(p: Probe): Promise<boolean> {
  const select = p.column ?? '*';
  const res = await fetch(`${URL_}/rest/v1/${p.table}?select=${select}&limit=0`, {
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
  });
  return res.ok;
}

async function main() {
  if (!URL_ || !KEY) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set');

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  const probes = files.flatMap((f) => extractProbes(f, readFileSync(join(MIGRATIONS_DIR, f), 'utf8')));

  const missing: Probe[] = [];
  for (const p of probes) {
    if (!(await exists(p))) missing.push(p);
  }

  if (missing.length === 0) {
    console.log(`[check-migrations] ok — ${probes.length} objects from ${files.length} migrations present`);
    return;
  }
  const byMigration = new Set(missing.map((m) => m.migration));
  for (const m of missing) {
    console.error(`[check-migrations] MISSING ${m.table}${m.column ? `.${m.column}` : ''}  (from ${m.migration})`);
  }
  throw new Error(
    `${byMigration.size} unapplied migration(s): ${[...byMigration].join(', ')} — run \`supabase db push\` for supabase/footshorts`
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('fatal:', e.message);
    process.exit(1);
  });
