/**
 * Self-contained HTML rendering for a finalized Nashta plan — the downloadable
 * artifact (and the print view). No external CSS/JS; video thumbnails hotlink
 * i.ytimg.com. Recipe text comes from the internal corpus, so downloads are
 * for the cook's personal use (the page itself stays admin-gated).
 */
import type { MealPlan, MealPlanDishVideos, NashtaRecipeDetail } from '@vismay/content-source/epics'

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatPlanDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/** The corpus stores instructions as one prose blob — split into steps on
 *  sentence boundaries so mornings read as a checklist. (Also used by the
 *  plan page's recipe accordion.) */
export function instructionSteps(text: string): string[] {
  return text
    .split(/\.\s+(?=[A-Z])/)
    .map((s) => s.trim().replace(/\.?$/, '.'))
    .filter((s) => s.length > 3)
}

export const CATEGORY_ORDER = ['produce', 'dairy', 'grains', 'spices', 'pantry', 'other'] as const
export const CATEGORY_LABELS: Record<string, string> = {
  produce: 'Produce',
  dairy: 'Dairy',
  grains: 'Grains & flours',
  spices: 'Spices',
  pantry: 'Pantry',
  other: 'Other',
}

function shoppingSection(plan: MealPlan): string {
  const items = plan.shopping?.items ?? []
  if (items.length === 0) return ''
  const toBuy = items.filter((i) => !i.staple)
  const staples = items.filter((i) => i.staple)
  const group = (list: typeof items) =>
    CATEGORY_ORDER.filter((c) => list.some((i) => i.category === c))
      .map((c) => {
        const rows = list
          .filter((i) => i.category === c)
          .map(
            (i) =>
              `<li><label><input type="checkbox"> <strong>${esc(i.name)}</strong> — ${esc(i.quantity)}` +
              (i.forDishes.length ? ` <span class="muted">(${esc(i.forDishes.join(', '))})</span>` : '') +
              `</label></li>`
          )
          .join('\n')
        return `<h4>${CATEGORY_LABELS[c] ?? c}</h4>\n<ul class="checklist">${rows}</ul>`
      })
      .join('\n')
  return `<section>
  <h2>🛒 Shopping list</h2>
  ${toBuy.length ? group(toBuy) : '<p class="muted">Nothing to buy — it is all in the pantry.</p>'}
  ${staples.length ? `<details class="staples"><summary>Pantry check (${staples.length} staples you likely have)</summary>${group(staples)}</details>` : ''}
</section>`
}

function videosSection(videos: MealPlanDishVideos[] | null): string {
  if (!videos || videos.length === 0) return ''
  const blocks = videos
    .map((d) => {
      const cards = d.videos
        .map((v) => {
          const thumb = v.thumbnail
            ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy">`
            : `<div class="thumb-fallback">▶</div>`
          const meta = [v.channel, v.duration]
            .filter((x): x is string => Boolean(x))
            .map(esc)
            .join(' · ')
          return `<a class="video" href="${esc(v.url)}" target="_blank" rel="noopener">${thumb}<span class="video-title">${esc(v.title)}</span>${meta ? `<span class="muted">${meta}</span>` : ''}</a>`
        })
        .join('\n')
      return `<h4>${esc(d.dishTitle)} <span class="muted">· ${esc(d.query)}</span></h4>\n<div class="videos">${cards}</div>`
    })
    .join('\n')
  return `<section><h2>📺 Recipe videos (Hindi)</h2>\n${blocks}</section>`
}

function recipesSection(recipes: NashtaRecipeDetail[]): string {
  if (recipes.length === 0) return ''
  const blocks = recipes
    .map((r) => {
      const ings = (r.ingredientsRaw ?? '')
        .split(/,(?![^(]*\))/)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => `<li>${esc(s)}</li>`)
        .join('\n')
      const steps = instructionSteps(r.instructions ?? '')
      const body =
        steps.length > 1
          ? `<ol>${steps.map((s) => `<li>${esc(s)}</li>`).join('\n')}</ol>`
          : `<p>${esc(r.instructions ?? '')}</p>`
      const meta = [
        r.titleNative,
        r.prepMin != null ? `prep ${r.prepMin} min` : null,
        r.cookMin != null ? `cook ${r.cookMin} min` : null,
        r.servings != null ? `serves ${r.servings}` : null,
      ]
        .filter(Boolean)
        .map((x) => esc(String(x)))
        .join(' · ')
      return `<details class="recipe">
  <summary><strong>${esc(r.title)}</strong>${meta ? ` <span class="muted">${meta}</span>` : ''}</summary>
  ${ings ? `<h4>Ingredients (as published, serves ${r.servings ?? '?'})</h4><ul>${ings}</ul>` : ''}
  <h4>Method</h4>
  ${body}
  ${r.url ? `<p class="muted">Source: <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a></p>` : ''}
</details>`
    })
    .join('\n')
  return `<section><h2>🍳 Recipes</h2>\n${blocks}</section>`
}

export function renderPlanHtml(plan: MealPlan, recipes: NashtaRecipeDetail[]): string {
  const combo = plan.selectedIndex != null ? plan.suggestions[plan.selectedIndex] : null
  const mealLabel = plan.meal.charAt(0).toUpperCase() + plan.meal.slice(1)
  const title = combo ? combo.title : `${mealLabel} plan`
  const prepAhead = [
    ...(combo?.overnightPrep ? [combo.overnightPrep] : []),
    ...(plan.shopping?.prepAhead ?? []),
  ]
  const roles: Record<string, string> = {
    main: 'Main',
    side: 'Side',
    condiment: 'Condiment',
    drink: 'Drink',
    dessert: 'Dessert',
  }
  const itemRows = (combo?.items ?? [])
    .map((i) => `<li><span class="role">${roles[i.role] ?? i.role}</span> ${esc(i.title)}</li>`)
    .join('\n')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nashta — ${esc(title)}</title>
<style>
  :root { --ink: #26201a; --muted: #8a7f72; --accent: #c65a1e; --card: #faf5ee; --line: #e8ddcf; }
  * { box-sizing: border-box; }
  body { margin: 0 auto; max-width: 760px; padding: 32px 20px 64px; font: 16px/1.6 -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", sans-serif; color: var(--ink); background: #fffdf9; }
  header { border-bottom: 3px solid var(--accent); padding-bottom: 16px; margin-bottom: 24px; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: var(--accent); font-weight: 700; }
  h1 { margin: 4px 0 6px; font-size: 30px; line-height: 1.2; }
  h2 { font-size: 20px; margin: 32px 0 12px; }
  h4 { margin: 16px 0 6px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  .muted { color: var(--muted); font-weight: 400; font-size: 0.9em; }
  .chips span { display: inline-block; background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 2px 12px; margin-right: 6px; font-size: 13px; }
  .menu { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px 20px; margin: 16px 0; }
  .menu ul { list-style: none; margin: 0; padding: 0; }
  .menu li { padding: 4px 0; }
  .role { display: inline-block; width: 92px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--accent); font-weight: 700; }
  .prep { background: #fff7e0; border: 1px solid #eadfae; border-radius: 12px; padding: 12px 20px; margin: 16px 0; }
  .prep strong { color: #8a6d00; }
  ul.checklist { list-style: none; padding-left: 2px; margin: 6px 0; }
  ul.checklist li { padding: 3px 0; }
  input[type="checkbox"] { margin-right: 8px; transform: scale(1.1); }
  .staples { margin-top: 12px; }
  .videos { display: flex; flex-wrap: wrap; gap: 12px; margin: 8px 0 16px; }
  .video { width: 200px; text-decoration: none; color: inherit; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; background: #fff; display: flex; flex-direction: column; }
  .video img { width: 100%; aspect-ratio: 16/9; object-fit: cover; display: block; }
  .thumb-fallback { width: 100%; aspect-ratio: 16/9; display: flex; align-items: center; justify-content: center; background: var(--card); color: var(--accent); font-size: 28px; }
  .video-title { padding: 8px 10px 2px; font-size: 13px; font-weight: 600; line-height: 1.35; }
  .video .muted { padding: 0 10px 10px; }
  details.recipe { border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; margin: 10px 0; background: #fff; }
  details.recipe summary { cursor: pointer; }
  details.recipe ol li { margin: 6px 0; }
  section a { color: var(--accent); }
  footer { margin-top: 48px; border-top: 1px solid var(--line); padding-top: 12px; font-size: 13px; color: var(--muted); }
  @media print { .videos { display: none; } details.recipe { break-inside: avoid; } details[open] summary { font-size: 18px; } body { padding-top: 0; } }
</style>
</head>
<body>
<header>
  <div class="eyebrow">Nashta · tomorrow's ${esc(plan.meal)}</div>
  <h1>${esc(title)}</h1>
  <div class="muted">${esc(formatPlanDate(plan.planDate))}</div>
  ${combo ? `<p>${esc(combo.rationale)}</p><div class="chips"><span>~${combo.estTotalMin} min</span><span>${esc(combo.effort)}</span></div>` : ''}
</header>
${combo ? `<div class="menu"><ul>${itemRows}</ul></div>` : ''}
${prepAhead.length ? `<div class="prep"><strong>${plan.meal === 'breakfast' ? 'Tonight:' : 'Prep ahead:'}</strong><ul>${prepAhead.map((p) => `<li>${esc(p)}</li>`).join('')}</ul></div>` : ''}
${shoppingSection(plan)}
${videosSection(plan.videos)}
${recipesSection(recipes)}
<footer>Planned with Nashta from the cook's instructions: “${esc(plan.instructions.trim())}”.<br>
Recipe text courtesy Archana's Kitchen (internal corpus) — for personal kitchen use.</footer>
</body>
</html>`
}
