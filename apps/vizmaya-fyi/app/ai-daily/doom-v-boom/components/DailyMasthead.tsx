import Link from 'next/link'
import VizmayaLogo from '@/components/VizmayaLogo'
import { AI_DATA_CENTERS_THEME_DEFAULTS, aiDataCentersLogoPalette, type AiDataCentersTheme } from '../../../ai-data-centers/theme'

/**
 * The top bar of the AI Daily hub and the Doom v Boom landing: the Rive
 * wordmark (the edition masthead's, same palette) home, then the trail.
 * The last crumb is the current page.
 */
export default function DailyMasthead({ crumbs, overrides }: { crumbs: { label: string; href: string }[]; overrides: Partial<AiDataCentersTheme> }) {
  const palette = aiDataCentersLogoPalette({ ...AI_DATA_CENTERS_THEME_DEFAULTS, ...overrides })
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 py-5" aria-label="Breadcrumb">
      <ol className="flex items-center gap-3 font-[family-name:var(--mono)] text-[11px] uppercase tracking-[.12em] text-[var(--muted)]">
        <li className="flex">
          <Link href="/" aria-label="Vizmaya home" className="inline-flex items-center">
            <VizmayaLogo className="h-[28px] w-[116px]" palette={palette} />
          </Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.href} className="flex items-center gap-3">
            <span aria-hidden="true">/</span>
            {i === crumbs.length - 1 ? (
              <span className="text-[var(--bone)]" aria-current="page">
                {c.label}
              </span>
            ) : (
              <Link href={c.href}>{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
      <Link href="/ai-data-centers" className="font-[family-name:var(--mono)] text-[11px] uppercase tracking-[.12em]">
        {/* Colour on the span: the edition stylesheet's `.dcd a` inherits and outranks utilities. */}
        <span className="text-[var(--muted)] hover:text-[var(--bone)]">Live explorer →</span>
      </Link>
    </nav>
  )
}
