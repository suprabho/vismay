import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowLeftIcon,
  ArrowUpRightIcon,
  EnvelopeSimpleIcon,
  LinkedinLogoIcon,
  XLogoIcon,
  YoutubeLogoIcon,
} from '@phosphor-icons/react/dist/ssr'
import { PenroseMark } from '@/components/home/bits'
import { loadHomeData } from '@/lib/home/homeData'
import { homeFontVars } from '@/lib/home/homeFonts'
import { HOME_SCHEME } from '@/lib/home/homeShape'
import { schemeVars } from '@/lib/home/logoPalette'
import { CONTACT, PROCESS, STUDIO, studioStats } from '@/lib/home/studio'

export const revalidate = 300

export const metadata: Metadata = {
  title: 'About — vizmaya',
  description: `${STUDIO.statement} A two-person data-journalism studio, and how to work with it.`,
  alternates: { canonical: '/about' },
}

const TOKENS = {
  ...schemeVars(HOME_SCHEME),
  '--serif': 'var(--font-home-serif), Georgia, serif',
  '--sans': 'var(--font-home-sans), -apple-system, "Segoe UI", sans-serif',
  '--mono': 'var(--font-home-mono), ui-monospace, monospace',
} as CSSProperties

const SOCIALS = [
  { href: STUDIO.youtube, label: 'YouTube', Icon: YoutubeLogoIcon },
  { href: STUDIO.linkedin, label: 'LinkedIn', Icon: LinkedinLogoIcon },
  { href: STUDIO.x, label: 'X', Icon: XLogoIcon },
]

const TEXT_LINK =
  'inline-flex items-center gap-2 text-[15px] font-medium text-(--text) underline decoration-(--signal) underline-offset-[6px] hover:text-(--signal)'

/**
 * The studio: who makes vizmaya, how it works with others and how to reach
 * it. In the home page's colours and type (lib/home), with the home page's
 * counts.
 */
export default async function AboutPage() {
  const data = await loadHomeData()
  const stats = studioStats({
    stories: data.stories.length,
    epics: data.epics.length,
    mornings: data.dailyEditions[0]?.number ?? 0,
  })

  return (
    <div
      style={TOKENS}
      className={`${homeFontVars} min-h-screen bg-(--bg) font-(family-name:--sans) text-(--text) antialiased selection:bg-(--signal) selection:text-(--on-signal)`}
    >
      <nav aria-label="vizmaya" className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-4 sm:px-8">
        <Link href="/" className="inline-flex items-center gap-3 font-(family-name:--serif) text-[24px] leading-none">
          <PenroseMark size={20} /> vizmaya
        </Link>
        <Link href="/" className="inline-flex items-center gap-2 text-[14px] text-(--muted) transition-colors hover:text-(--text)">
          <ArrowLeftIcon size={14} weight="bold" aria-hidden /> Stories
        </Link>
      </nav>

      <main>
        <header className="relative overflow-hidden px-4 pb-16 pt-20 sm:px-8 md:pb-24 md:pt-28">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-[20%] -top-[30%] h-[900px] w-[900px] rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--signal)_16%,transparent),transparent_62%)]"
          />
          <div className="relative mx-auto max-w-[1180px]">
            <h1 className="max-w-[13ch] font-(family-name:--serif) text-[clamp(52px,9.4vw,140px)] font-normal leading-[.9] tracking-[-.03em] text-balance">
              We turn complex data into stories <em className="text-(--signal)">impossible to ignore.</em>
            </h1>
            <div className="mt-12 grid gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] md:gap-16">
              <p className="max-w-[58ch] text-[clamp(18px,1.55vw,21px)] leading-[1.65] text-(--muted)">{STUDIO.deck}</p>
              <dl className="grid grid-cols-2 gap-x-8 gap-y-7 self-start border-t border-(--line2) pt-6">
                {stats.map((s) => (
                  <div key={s.label}>
                    <dt className="sr-only">{s.label}</dt>
                    <dd>
                      <span className="block font-(family-name:--serif) text-[64px] leading-[.85] tracking-[-.02em] tabular-nums">{s.n}</span>
                      <span className="mt-2 block text-[14px] text-(--muted)">{s.label}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </header>

        <section aria-labelledby="studio-h" className="border-t border-(--line) px-4 py-20 sm:px-8 md:py-28">
          <div className="mx-auto max-w-[1180px]">
            <h2 id="studio-h" className="mb-10 font-(family-name:--serif) text-[clamp(44px,6.4vw,84px)] font-normal leading-[.95] tracking-[-.02em] md:mb-14">
              The <em className="text-(--signal)">studio</em>
            </h2>
            <div className="grid gap-12 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-16">
              <figure>
                <blockquote className="font-(family-name:--serif) text-[clamp(34px,4.2vw,58px)] leading-[1.02] tracking-[-.015em] text-balance">
                  The map does the argument. The prose does <em className="text-(--signal)">the meaning.</em>
                </blockquote>
                <figcaption className="mt-6 max-w-[52ch] text-[16px] leading-[1.7] text-(--muted)">
                  Vizmaya {STUDIO.motto.charAt(0).toLowerCase() + STUDIO.motto.slice(1)} Two people who make data stories for others, and
                  publish their own.
                </figcaption>
                {/* An HTML story, served by a route handler rather than the app router: a full load. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/s/vizmaya-studio" className={`mt-8 ${TEXT_LINK}`}>
                  The studio’s own story, as a board <ArrowUpRightIcon size={15} weight="bold" aria-hidden />
                </a>
              </figure>
              <ol className="grid gap-px overflow-hidden rounded-[14px] border border-(--line) bg-(--line)">
                {PROCESS.map((p) => (
                  <li key={p.n} className="grid grid-cols-[60px_1fr] gap-4 bg-(--surface) p-6">
                    <span className="font-(family-name:--serif) text-[44px] italic leading-[.8] text-(--signal)">{p.n}</span>
                    <span>
                      <span className="block font-(family-name:--serif) text-[28px] leading-none">{p.title}</span>
                      <span className="mt-2 block text-[15px] leading-[1.6] text-(--muted)">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="contact"
          aria-labelledby="contact-h"
          className="relative overflow-hidden border-t border-(--line) bg-(--surface) px-4 py-28 text-center sm:px-8 md:py-40"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-full h-[700px] w-[1100px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--third)_20%,transparent),transparent_62%)]"
          />
          <div className="relative mx-auto max-w-[820px]">
            <h2
              id="contact-h"
              className="mx-auto max-w-[16ch] font-(family-name:--serif) text-[clamp(44px,6.4vw,88px)] font-normal leading-[.95] tracking-[-.02em] text-balance"
            >
              Have data that deserves a <em className="text-(--signal)">better story?</em>
            </h2>
            <p className="mx-auto mt-7 max-w-[60ch] text-[16px] leading-[1.8] text-(--muted)">{CONTACT.body}</p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <a
                href={`mailto:${STUDIO.email}`}
                className="inline-flex items-center gap-2 rounded-full bg-(--signal) px-7 py-4 text-[15px] font-medium text-(--on-signal) transition-colors hover:bg-(--text) hover:text-(--bg)"
              >
                <EnvelopeSimpleIcon size={17} weight="bold" aria-hidden /> Get in touch
              </a>
              <a
                href={STUDIO.newsletter}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-(--line2) px-7 py-4 text-[15px] text-(--text) transition-colors hover:border-(--text)"
              >
                Read The Asymmetry Letter <ArrowUpRightIcon size={15} weight="bold" aria-hidden />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-5 border-t border-(--line) px-4 py-7 sm:px-8">
        <div className="flex items-center gap-3">
          <PenroseMark size={20} />
          <span className="font-(family-name:--serif) text-[20px] leading-none">{STUDIO.name}</span>
          <span className="hidden max-w-[44ch] text-[13px] text-(--dim) md:inline">{STUDIO.motto}</span>
        </div>
        <div className="flex items-center gap-5 text-(--muted)">
          {SOCIALS.map(({ href, label, Icon }) => (
            <a key={label} href={href} target="_blank" rel="noreferrer" aria-label={label} className="transition-colors hover:text-(--signal)">
              <Icon size={20} aria-hidden />
            </a>
          ))}
        </div>
      </footer>
    </div>
  )
}
