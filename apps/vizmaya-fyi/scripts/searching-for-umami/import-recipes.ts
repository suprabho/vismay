/**
 * Recipe-corpora importer — loads the two local food datasets into Supabase
 * (migration 070: food_recipes + food_ingredients):
 *
 *   vizmaya-data/6000+ Indian Food Recipes Dataset/IndianFoodDatasetCSV.csv
 *     → food_recipes (source 'archanas-kitchen', 6.8k rows, full instructions)
 *   vizmaya-data/CulinaryDB/*.csv
 *     → food_recipes (source 'culinarydb', 45.7k rows, ingredient sets only)
 *     → food_ingredients (1,033-term vocabulary incl. compounds)
 *
 * Run locally:  pnpm searching-for-umami:import-recipes [--dry-run] [--source <s>]
 *   --dry-run            parse + print counts/samples, no env or DB needed
 *   --source <s>         only 'archanas-kitchen' or 'culinarydb'
 *
 * Required env (loaded from apps/vizmaya-fyi/.env.local / .env):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Idempotency: upsert on (source, source_id) / (entity_id). Batches stay far
 * below the shared instance's comfort zone (see project_supabase_write_wedge):
 * small rows, ≤150 KB per request, sequential with a breather between batches.
 *
 * Rights: these are INTERNAL grounding corpora — the tables carry no anon RLS
 * policies (instructions are the source sites' editorial text; CulinaryDB is
 * research-use). Nothing here feeds a public surface directly.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(SCRIPT_DIR, '../../')
const REPO_ROOT = resolve(SCRIPT_DIR, '../../../../')
const AK_CSV = resolve(REPO_ROOT, 'vizmaya-data/6000+ Indian Food Recipes Dataset/IndianFoodDatasetCSV.csv')
const CDB_DIR = resolve(REPO_ROOT, 'vizmaya-data/CulinaryDB')

loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const ONLY_SOURCE = args.includes('--source') ? args[args.indexOf('--source') + 1] : null

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ── minimal RFC-4180 CSV (quoted fields carry commas and newlines) ──────── */

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += ch
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    if (row.length > 1 || row[0] !== '') rows.push(row)
  }
  return rows
}

function csvObjects(path: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(readFileSync(path, 'utf8'))
  const keys = header.map((h) => h.replace(/^﻿/, '').trim())
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])))
}

/* ── shared row shape ────────────────────────────────────────────────────── */

interface RecipeRow {
  source: string
  source_id: string
  slug: string | null
  title: string
  title_native: string | null
  cuisine: string | null
  cuisine_raw: string | null
  course: string | null
  diet: string | null
  prep_min: number | null
  cook_min: number | null
  total_min: number | null
  servings: number | null
  ingredients: string[]
  ingredients_raw: string | null
  instructions: string | null
  url: string | null
}

const int = (v: string | undefined): number | null => {
  const n = Number(v)
  return Number.isFinite(n) && Number.isInteger(n) && n >= 0 ? n : null
}

/* ── archanas-kitchen ────────────────────────────────────────────────────── */

/** AK ingredient tokens look like "3 tablespoon Gram flour (besan) - sifted".
 *  Keep the name: strip leading quantity + unit words, parenthetical aliases
 *  and the " - modifier" tail. */
const UNIT_WORDS = new Set([
  'tablespoon', 'tablespoons', 'tbsp', 'teaspoon', 'teaspoons', 'tsp', 'cup', 'cups',
  'inch', 'inches', 'sprig', 'sprigs', 'pinch', 'of', 'cube', 'cubes', 'stalk', 'stalks',
  'slice', 'slices', 'piece', 'pieces', 'bunch', 'handful', 'can', 'tin', 'packet',
])

function cleanAkIngredient(token: string): string | null {
  let t = token.split(' - ')[0]
  t = t.replace(/\([^)]*\)/g, ' ') // drop parenthetical aliases
  // Leading quantity, optionally glued to a weight/volume unit. Weight words
  // are NOT in UNIT_WORDS: "Gram flour" is an ingredient, "200 grams" a dose.
  t = t.replace(/^[\s\d/.,¼½¾⅓⅔-]+(?:(?:grams?|gms?|g|kg|ml|litres?|liters?)\b)?\s*/i, '')
  const words = t.split(/\s+/).filter(Boolean)
  while (words.length > 1 && UNIT_WORDS.has(words[0].toLowerCase())) words.shift()
  const name = words.join(' ').replace(/\s+/g, ' ').trim()
  if (!name || name.length > 60) return null
  // Untranslated rows (Devanagari etc.) stay out of the cleaned array —
  // ingredients_raw keeps the original string either way.
  if (!/[a-zA-Z]/.test(name) || /[^ -ɏ]/.test(name)) return null
  return name
}

/** Split on commas that sit outside parentheses. */
function splitIngredientString(raw: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** AK cuisine labels are mostly Indian regional; map those to the epic slug,
 *  leave the rest (Continental, Italian, …) unmapped with cuisine_raw kept. */
const AK_INDIAN = /indian|punjabi|bengali|maharashtrian|kerala|tamil|karnataka|rajasthani|gujarati|andhra|hyderabadi|goan|awadhi|chettinad|kashmiri|sindhi|mangalorean|konkan|malabar|lucknowi|bihari|assamese|oriya|north east|himachal|udupi|mughlai|parsi|coorg|kongunadu|uttarakhand|haryana|jharkhand|nagaland/i

function loadArchanasKitchen(): RecipeRow[] {
  const rows = csvObjects(AK_CSV)
  return rows
    .filter((r) => r.TranslatedRecipeName && r.Srno)
    .map((r) => {
      const rawIngredients = r.TranslatedIngredients || r.Ingredients || ''
      const ingredients = [
        ...new Map(
          splitIngredientString(rawIngredients)
            .map(cleanAkIngredient)
            .filter((x): x is string => x !== null)
            .map((x) => [x.toLowerCase(), x])
        ).values(),
      ].slice(0, 30)
      const urlSlug = r.URL?.match(/archanaskitchen\.com\/([^/?#]+)\/?$/)?.[1] ?? null
      return {
        source: 'archanas-kitchen',
        source_id: r.Srno,
        slug: urlSlug,
        title: r.TranslatedRecipeName,
        title_native: r.RecipeName !== r.TranslatedRecipeName ? r.RecipeName : null,
        cuisine: AK_INDIAN.test(r.Cuisine ?? '') ? 'india' : null,
        cuisine_raw: r.Cuisine || null,
        course: r.Course || null,
        diet: r.Diet || null,
        prep_min: int(r.PrepTimeInMins),
        cook_min: int(r.CookTimeInMins),
        total_min: int(r.TotalTimeInMins),
        servings: int(r.Servings),
        ingredients,
        ingredients_raw: rawIngredients || null,
        instructions: r.TranslatedInstructions || null,
        url: r.URL || null,
      }
    })
}

/* ── culinarydb ──────────────────────────────────────────────────────────── */

const CDB_CUISINE: Record<string, string> = {
  'Indian Subcontinent': 'india',
  China: 'china',
  Thailand: 'thailand',
  Japan: 'japan',
  // 'South East Asia' stays unmapped: mixes Indonesian/Malaysian/Vietnamese.
}

interface IngredientRow {
  entity_id: number
  name: string
  synonyms: string[]
  category: string | null
  is_compound: boolean
  constituents: string[]
}

function loadCulinaryDb(): { recipes: RecipeRow[]; ingredients: IngredientRow[] } {
  const details = csvObjects(resolve(CDB_DIR, '01_Recipe_Details.csv'))
  const mapping = csvObjects(resolve(CDB_DIR, '04_Recipe-Ingredients_Aliases.csv'))

  const byRecipe = new Map<string, string[]>()
  for (const m of mapping) {
    const id = m['Recipe ID']
    const name = (m['Aliased Ingredient Name'] ?? '').trim().toLowerCase()
    if (!id || !name) continue
    let list = byRecipe.get(id)
    if (!list) byRecipe.set(id, (list = []))
    if (!list.includes(name)) list.push(name)
  }

  const recipes = details
    .filter((r) => r['Recipe ID'] && r.Title)
    .map((r) => ({
      source: 'culinarydb',
      source_id: r['Recipe ID'],
      slug: null,
      title: r.Title,
      title_native: null,
      cuisine: CDB_CUISINE[r.Cuisine] ?? null,
      cuisine_raw: r.Cuisine || null,
      course: null,
      diet: null,
      prep_min: null,
      cook_min: null,
      total_min: null,
      servings: null,
      ingredients: (byRecipe.get(r['Recipe ID']) ?? []).slice(0, 40),
      ingredients_raw: null,
      instructions: null,
      url: null,
    }))

  const splitList = (v: string) => v.split(/[;,]/).map((s) => s.trim()).filter(Boolean)
  const base = csvObjects(resolve(CDB_DIR, '02_Ingredients.csv')).map((r) => ({
    entity_id: Number(r['Entity ID']),
    name: r['Aliased Ingredient Name'],
    synonyms: splitList(r['Ingredient Synonyms'] ?? ''),
    category: r.Category || null,
    is_compound: false,
    constituents: [],
  }))
  const compounds = csvObjects(resolve(CDB_DIR, '03_Compound_Ingredients.csv')).map((r) => ({
    entity_id: Number(r.entity_id),
    name: r['Compound Ingredient Name'],
    synonyms: splitList(r['Compound Ingredient Synonyms'] ?? ''),
    category: r.Category || null,
    is_compound: true,
    constituents: splitList(r['Contituent Ingredients'] ?? ''), // sic: dataset's own header typo
  }))
  const ingredients = [...base, ...compounds].filter((r) => Number.isFinite(r.entity_id) && r.name)
  return { recipes, ingredients }
}

/* ── upsert ──────────────────────────────────────────────────────────────── */

async function upsertBatches<T>(
  db: SupabaseClient,
  table: string,
  rows: T[],
  onConflict: string,
  batchSize: number
): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    // supabase-js's upsert typing rejects a bare generic T[]; the rows are
    // plain payload objects, so widen through unknown.
    const batch = rows.slice(i, i + batchSize) as unknown as Record<string, unknown>[]
    const { error } = await db.from(table).upsert(batch, { onConflict })
    if (error) {
      if (/relation .* does not exist|Could not find the table/i.test(error.message)) {
        throw new Error(
          `table "${table}" is missing — apply supabase/vizmaya-fyi/migrations/070_food_recipes.sql first (dashboard SQL editor)`
        )
      }
      throw new Error(`${table} upsert failed at row ${i}: ${error.message}`)
    }
    if ((i / batchSize) % 20 === 0 || i + batchSize >= rows.length) {
      console.log(`[recipes] ${table}: ${Math.min(i + batchSize, rows.length)}/${rows.length}`)
    }
    await sleep(120) // breathe — shared instance (see project_supabase_write_wedge)
  }
}

/* ── main ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const wantAk = !ONLY_SOURCE || ONLY_SOURCE === 'archanas-kitchen'
  const wantCdb = !ONLY_SOURCE || ONLY_SOURCE === 'culinarydb'
  if (ONLY_SOURCE && !wantAk && !wantCdb) {
    throw new Error(`unknown --source "${ONLY_SOURCE}" (archanas-kitchen | culinarydb)`)
  }

  const ak = wantAk ? loadArchanasKitchen() : []
  const cdb = wantCdb ? loadCulinaryDb() : { recipes: [], ingredients: [] }

  if (wantAk) {
    const mapped = ak.filter((r) => r.cuisine === 'india').length
    console.log(`[recipes] archanas-kitchen: ${ak.length} recipes (${mapped} mapped cuisine=india)`)
    console.log(`[recipes]   sample: ${ak[0].title} — [${ak[0].ingredients.slice(0, 6).join(', ')}]`)
  }
  if (wantCdb) {
    const withIng = cdb.recipes.filter((r) => r.ingredients.length > 0).length
    const mapped = cdb.recipes.filter((r) => r.cuisine).length
    console.log(
      `[recipes] culinarydb: ${cdb.recipes.length} recipes (${withIng} with ingredients, ${mapped} mapped to epic cuisines), ${cdb.ingredients.length} vocabulary terms`
    )
    const s = cdb.recipes.find((r) => r.ingredients.length > 3)
    if (s) console.log(`[recipes]   sample: ${s.title} — [${s.ingredients.slice(0, 6).join(', ')}]`)
  }

  if (DRY_RUN) {
    console.log('[recipes] dry run complete (no writes)')
    return
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  const db = createClient(url, key)

  if (wantCdb) await upsertBatches(db, 'food_ingredients', cdb.ingredients, 'entity_id', 500)
  if (wantAk) await upsertBatches(db, 'food_recipes', ak, 'source,source_id', 50)
  if (wantCdb) await upsertBatches(db, 'food_recipes', cdb.recipes, 'source,source_id', 400)

  console.log('[recipes] done')
}

main().catch((err) => {
  console.error('[recipes] failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
