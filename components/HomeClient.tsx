'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import VizmayaLogo from '@/components/VizmayaLogo'
import type { Theme } from '@/types/story'

export interface HomeStory {
  slug: string
  title: string
  subtitle: string
  date: string
  byline: string
  aura?: string
  theme?: Theme
}

export interface HomeEpic {
  slug: string
  name: string
  description: string | null
}

function AuraBackground({ slug }: { slug: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [show, setShow] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setShow(true)
          obs.disconnect()
        }
      },
      { rootMargin: '300px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} className="bn-aura" aria-hidden>
      {show && (
        <iframe
          title=""
          src={`https://aura.promad.design/embed/${slug}?hideText=true&hideIcons=true&input=off&theme=light`}
          loading="lazy"
          tabIndex={-1}
        />
      )}
    </div>
  )
}

const css = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
.vz{
  --teal:#057A6E;--pink:#E84D7A;--blue:#2B4ACF;
  --ink:#0C0C10;--cream:#F4F1EC;--muted:#4A4742;--line:rgba(12,12,16,.1);
  --ff-d:'Fraunces',Georgia,serif;
  --ff-m:'JetBrains Mono',ui-monospace,monospace;
  background:var(--cream);color:var(--ink);font-family:var(--ff-m);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.75;
}
.vz ::selection{background:var(--teal);color:var(--ink)}
.vz a{text-decoration:none;transition:opacity .3s,color .3s}.vz a:hover{opacity:.7}
.vz button{cursor:pointer;transition:opacity .3s}.vz button:hover{opacity:.85}
.vz em{font-style:italic}

.vz .rv{opacity:0;transform:translateY(16px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
.vz .rv.v{opacity:1;transform:translateY(0)}
.vz .rv[data-d="1"]{transition-delay:.08s}.vz .rv[data-d="2"]{transition-delay:.16s}
.vz .rv[data-d="3"]{transition-delay:.24s}.vz .rv[data-d="4"]{transition-delay:.32s}

/* Nav ---------------------------------------------------- */
.vz .nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;justify-content:space-between;align-items:center;padding:18px clamp(24px,5vw,56px);background:transparent;transition:background .4s,border-color .4s,backdrop-filter .4s;border-bottom:1px solid transparent}
.vz .nav.scrolled{background:rgba(244,241,236,.94);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.vz .nav-logo{cursor:pointer;display:flex;align-items:center;background:none;border:none;padding:0}
.vz .nav-r{display:flex;gap:28px;align-items:center}
.vz .nav-link{font-family:var(--ff-m);font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:var(--ink);opacity:.55}
.vz .nav-cta{font-family:var(--ff-m);font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;color:var(--cream)!important;background:var(--ink);padding:10px 18px;border-radius:2px;opacity:1!important}

/* Shared ------------------------------------------------- */
.vz .rule{height:1px;background:var(--line);width:100%}
.vz .container{max-width:1180px;margin:0 auto;padding:0 clamp(24px,5vw,56px)}
.vz .kicker{font-family:var(--ff-m);font-size:10.5px;letter-spacing:2.4px;text-transform:uppercase;color:var(--teal);display:inline-flex;align-items:center;gap:10px}
.vz .kicker::before{content:'';display:inline-block;width:20px;height:1px;background:var(--teal)}
.vz h1,.vz h2,.vz h3{font-family:var(--ff-d);font-weight:500;font-style:normal;letter-spacing:-.015em;color:var(--ink);line-height:1.1;margin:0}
.vz .body{font-family:var(--ff-m);font-size:14px;line-height:1.85;color:var(--muted);margin:0}
.vz .btn{font-family:var(--ff-m);font-size:11px;letter-spacing:2px;text-transform:uppercase;padding:14px 26px;border-radius:2px;border:1px solid var(--ink);font-weight:500;display:inline-block;background:var(--ink);color:var(--cream)}
.vz .btn.ghost{background:transparent;color:var(--ink)}
.vz .btn.teal{background:var(--teal);color:var(--ink);border-color:var(--teal)}

/* Masthead (hero + work grid as one top block) ----------- */
.vz .masthead{padding:150px clamp(24px,5vw,56px) 100px;position:relative}
.vz .hero{display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;max-width:1200px;margin:0 auto 80px;position:relative}
.vz .hero-kick,.vz .hero-h1,.vz .hero-deck{opacity:0;transition:opacity .7s ease,transform .8s cubic-bezier(.22,1,.36,1)}
.vz .hero-kick{transition-delay:.15s}
.vz .hero-h1{transform:translateY(20px);transition-delay:.3s}
.vz .hero-deck{transition-delay:.55s}
.vz .loaded .hero-kick,.vz .loaded .hero-deck{opacity:1}
.vz .loaded .hero-h1{opacity:1;transform:translateY(0)}
.vz .hero h1{font-size:clamp(42px,6.8vw,88px);line-height:1.02;letter-spacing:-.025em;margin:28px 0 32px;max-width:15ch}
.vz .hero h1 em{font-family:var(--ff-d);font-style:italic;font-weight:400}
.vz .hero-deck{font-family:var(--ff-m);font-size:13px;line-height:1.75;color:var(--muted);max-width:52ch;margin:0 auto;letter-spacing:.01em}

/* Triad (Data · Narrative · Design) ---------------------- */
.vz .triad{padding:96px clamp(24px,5vw,56px);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.vz .triad-head{text-align:center;margin-bottom:72px}
.vz .triad-head h2{font-size:clamp(28px,3.4vw,40px);font-style:italic;font-weight:400;margin-top:18px;max-width:22ch;margin-left:auto;margin-right:auto}
.vz .triad-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;max-width:1100px;margin:0 auto}
.vz .triad-col{padding:0 clamp(16px,3vw,40px);text-align:center;position:relative}
.vz .triad-col + .triad-col{border-left:1px solid var(--line)}
.vz .triad-col .node{font-family:var(--ff-m);font-size:10.5px;letter-spacing:2.4px;text-transform:uppercase;margin-bottom:18px}
.vz .triad-col h3{font-size:clamp(32px,4vw,52px);font-style:italic;font-weight:400;margin-bottom:16px}
.vz .triad-col p{font-family:var(--ff-m);font-size:13px;line-height:1.85;color:var(--muted);max-width:28ch;margin:0 auto}
.vz .triad-col.data .node{color:var(--teal)}
.vz .triad-col.narrative .node{color:var(--pink)}
.vz .triad-col.design .node{color:var(--blue)}
.vz .triad-foot{text-align:center;margin-top:64px;max-width:58ch;margin-left:auto;margin-right:auto}
.vz .triad-foot p{font-family:var(--ff-m);font-size:12.5px;line-height:1.85;color:var(--muted)}
.vz .triad-foot em{font-family:var(--ff-d);font-style:italic;font-size:15px;color:var(--ink)}

/* Work / bento ------------------------------------------- */
.vz .bento{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:minmax(170px,auto);gap:14px;max-width:1200px;margin:0 auto;text-align:left}
.vz .bn{position:relative;background:#fff;border:1px solid var(--line);border-radius:6px;padding:26px;display:flex;flex-direction:column;justify-content:space-between;transition:transform .3s ease,box-shadow .3s ease,border-color .3s ease;color:var(--ink);overflow:hidden;isolation:isolate}
.vz .bn > *{position:relative;z-index:1}
.vz .bn-aura{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;border-radius:inherit}
.vz .bn-aura iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent}
.vz .bn-aura::after{content:'';position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.55) 0%,rgba(0,0,0,.18) 55%,rgba(0,0,0,0) 100%)}
.vz .bn.has-aura,.vz .bn.has-aura.feature,.vz .bn.has-aura.accent-pink,.vz .bn.has-aura.accent-blue{background:var(--bn-bg,#0c0c10);border-color:color-mix(in srgb,var(--bn-text,#fff) 12%,transparent);color:var(--bn-text,#fff)}
.vz .bn.has-aura .bn-aura::after{background:linear-gradient(to top,color-mix(in srgb,var(--bn-bg,#000) 70%,transparent) 0%,color-mix(in srgb,var(--bn-bg,#000) 22%,transparent) 55%,transparent 100%)}
.vz .bn.has-aura h3,.vz .bn.has-aura.feature h3{color:var(--bn-text,#fff)}
.vz .bn.has-aura p,.vz .bn.has-aura.feature p,.vz .bn.has-aura .bn-k,.vz .bn.has-aura.feature .bn-k{color:color-mix(in srgb,var(--bn-muted,var(--bn-text,#fff)) 92%,transparent)}
.vz .bn.has-aura .bn-n{color:var(--bn-accent,var(--bn-text,#fff))}
.vz .bn.has-aura .bn-a{color:var(--bn-accent,var(--bn-text,#fff));opacity:.7}
.vz .bn.has-aura:hover .bn-a{opacity:1}
.vz .bn:hover{transform:translateY(-2px);box-shadow:0 12px 32px -18px rgba(12,12,16,.22);border-color:rgba(12,12,16,.18);opacity:1}
.vz .bn-k{font-family:var(--ff-m);font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);display:flex;justify-content:space-between;align-items:center;margin-bottom:18px}
.vz .bn-n{color:var(--teal)}
.vz .bn h3{font-family:var(--ff-d);font-style:italic;font-weight:400;color:var(--ink);line-height:1.18;margin:0 0 10px;font-size:22px}
.vz .bn p{font-family:var(--ff-m);font-size:12.5px;line-height:1.7;color:var(--muted);margin:0}
.vz .bn-a{margin-top:18px;font-family:var(--ff-m);font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--teal);opacity:.55;transition:opacity .3s}
.vz .bn:hover .bn-a{opacity:1}
.vz .bn.feature{grid-column:span 4;grid-row:span 2;background:var(--ink);border-color:rgba(255,255,255,.08);color:#fff}
.vz .bn.feature h3{color:#fff;font-size:clamp(26px,3vw,38px);line-height:1.15}
.vz .bn.feature p{color:rgba(255,255,255,.78);font-size:13.5px;line-height:1.75}
.vz .bn.feature .bn-k{color:rgba(255,255,255,.4)}
.vz .bn.feature .bn-n{color:var(--teal)}
.vz .bn.wide{grid-column:span 2}
.vz .bn.tall{grid-column:span 2;grid-row:span 2}
.vz .bn.accent-pink{background:var(--pink);border-color:transparent;color:#fff}
.vz .bn.accent-pink:not(.has-aura) h3,.vz .bn.accent-pink:not(.has-aura) p,.vz .bn.accent-pink:not(.has-aura) .bn-k,.vz .bn.accent-pink:not(.has-aura) .bn-a{color:#fff}
.vz .bn.accent-pink:not(.has-aura) p,.vz .bn.accent-pink:not(.has-aura) .bn-k{color:rgba(255,255,255,.8)}
.vz .bn.accent-blue{background:var(--blue);border-color:transparent;color:#fff}
.vz .bn.accent-blue:not(.has-aura) h3,.vz .bn.accent-blue:not(.has-aura) p,.vz .bn.accent-blue:not(.has-aura) .bn-k,.vz .bn.accent-blue:not(.has-aura) .bn-a{color:#fff}
.vz .bn.accent-blue:not(.has-aura) p,.vz .bn.accent-blue:not(.has-aura) .bn-k{color:rgba(255,255,255,.8)}

/* Epics --------------------------------------------------- */
.vz .epics{padding:120px clamp(24px,5vw,56px);border-top:1px solid var(--line);background:var(--cream)}
.vz .epics-inner{max-width:1100px;margin:0 auto}
.vz .epics-head{text-align:center;margin-bottom:64px}
.vz .epics-head h2{font-size:clamp(30px,4vw,48px);font-style:italic;font-weight:400;margin-top:18px;max-width:22ch;margin-left:auto;margin-right:auto}
.vz .epics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px}
.vz .ep{position:relative;background:#fff;border:1px solid var(--line);border-radius:6px;padding:32px;display:flex;flex-direction:column;justify-content:space-between;transition:transform .3s ease,box-shadow .3s ease,border-color .3s ease;color:var(--ink);min-height:220px}
.vz .ep:hover{transform:translateY(-2px);box-shadow:0 12px 32px -18px rgba(12,12,16,.22);border-color:rgba(12,12,16,.18);opacity:1}
.vz .ep-k{font-family:var(--ff-m);font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:var(--pink);margin-bottom:18px}
.vz .ep h3{font-family:var(--ff-d);font-style:italic;font-weight:400;color:var(--ink);line-height:1.18;margin:0 0 12px;font-size:26px}
.vz .ep p{font-family:var(--ff-m);font-size:13px;line-height:1.75;color:var(--muted);margin:0}
.vz .ep-a{margin-top:24px;font-family:var(--ff-m);font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:var(--pink);opacity:.6;transition:opacity .3s}
.vz .ep:hover .ep-a{opacity:1}

/* Manifesto ---------------------------------------------- */
.vz .manifesto{padding:120px clamp(24px,5vw,56px);background:var(--cream);border-top:1px solid var(--line)}
.vz .manifesto-inner{max-width:760px;margin:0 auto}
.vz .manifesto h2{font-size:clamp(30px,4vw,48px);font-style:italic;font-weight:400;margin:20px 0 40px;line-height:1.12}
.vz .manifesto p{font-family:var(--ff-m);font-size:14.5px;line-height:1.95;color:#2A2824;margin:0 0 24px}
.vz .pull{font-family:var(--ff-d);font-style:italic;font-weight:400;font-size:clamp(22px,2.8vw,30px);line-height:1.35;color:var(--ink);padding:36px 0;margin:40px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);text-align:center}

/* Who we are --------------------------------------------- */
.vz .who{padding:120px clamp(24px,5vw,56px);border-top:1px solid var(--line)}
.vz .who-inner{max-width:1100px;margin:0 auto}
.vz .who-head{text-align:center;margin-bottom:72px}
.vz .who-head h2{font-size:clamp(30px,4vw,48px);font-style:italic;font-weight:400;margin-top:18px}
.vz .who-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(40px,6vw,80px)}
.vz .bio h3{font-family:var(--ff-d);font-style:italic;font-weight:400;font-size:28px;margin-bottom:6px}
.vz .bio .role{font-family:var(--ff-m);font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;color:var(--teal);margin-bottom:20px}
.vz .bio p{font-family:var(--ff-m);font-size:13.5px;line-height:1.85;color:#2A2824;margin:0}

/* Contact ------------------------------------------------ */
.vz .contact{padding:140px clamp(24px,5vw,56px);background:var(--ink);color:var(--cream);text-align:center}
.vz .contact h2{color:var(--cream);font-size:clamp(30px,4.4vw,52px);font-style:italic;font-weight:400;max-width:18ch;margin:24px auto 28px;line-height:1.12}
.vz .contact p{font-family:var(--ff-m);font-size:13.5px;color:rgba(244,241,236,.6);max-width:44ch;margin:0 auto 40px;line-height:1.8}
.vz .contact .kicker{color:var(--teal)}
.vz .contact .kicker::before{background:var(--teal)}
.vz .contact .btn.teal{background:var(--teal);color:var(--ink);border-color:var(--teal)}

/* Footer ------------------------------------------------- */
.vz footer{background:var(--ink);padding:32px clamp(24px,5vw,56px);border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.vz footer .mark{font-family:var(--ff-d);font-size:14px;font-style:italic;color:rgba(244,241,236,.4)}
.vz footer .loc{font-family:var(--ff-m);font-size:10px;letter-spacing:1.6px;color:rgba(244,241,236,.25);margin-left:14px;text-transform:uppercase}
.vz footer .links{display:flex;gap:24px}
.vz footer .links a{font-family:var(--ff-m);font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:rgba(244,241,236,.3)}

/* Responsive --------------------------------------------- */
@media(max-width:860px){
  .vz .bento{grid-template-columns:repeat(2,1fr)}
  .vz .bn,.vz .bn.feature,.vz .bn.wide,.vz .bn.tall{grid-column:span 2;grid-row:auto}
  .vz .triad-grid{grid-template-columns:1fr}
  .vz .triad-col + .triad-col{border-left:none;border-top:1px solid var(--line);margin-top:40px;padding-top:40px}
  .vz .who-grid{grid-template-columns:1fr}
}
@media(max-width:560px){
  .vz .nav-link{display:none}
}
`

export default function HomeClient({ stories, epics = [] }: { stories: HomeStory[]; epics?: HomeEpic[] }) {
  useEffect(() => {
    const nav = document.getElementById('nav')
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 60)
    window.addEventListener('scroll', onScroll)

    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('v') }),
      { threshold: 0.12 }
    )
    document.querySelectorAll('.rv').forEach((el) => obs.observe(el))

    const t = setTimeout(() => document.getElementById('hero')?.classList.add('loaded'), 80)

    return () => {
      window.removeEventListener('scroll', onScroll)
      obs.disconnect()
      clearTimeout(t)
    }
  }, [])

  return (
    <div className="vz">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=JetBrains+Mono:wght@400;500;600&display=swap"
        rel="stylesheet"
      />
      <style dangerouslySetInnerHTML={{ __html: css }} />

      <nav className="nav" id="nav">
        <button
          className="nav-logo"
          onClick={() => document.getElementById('hero')?.scrollIntoView({ behavior: 'smooth' })}
          aria-label="Vizmaya Labs"
        >
          <VizmayaLogo
            className="w-[180px] h-[44px]"
            palette={{
              text: '#111111',
              teal: '#00E6D9',
              accent: '#FC3692',
              accent2: '#004CFF',
              surface: '#FFFFFF',
              muted: '#1D1D1D',
              line: '#111111',
            }}
          />
        </button>
        <div className="nav-r">
          <a className="nav-link" href="#work">Work</a>
          <a className="nav-link" href="#epics">Epics</a>
          <Link className="nav-link" href="/stories">Archive</Link>
          <a className="nav-link" href="#about">About</a>
          <a className="nav-cta" href="https://www.youtube.com/@Vizmayaa" target="_blank" rel="noreferrer">Subscribe</a>
        </div>
      </nav>

      {/* MASTHEAD — hero + work grid as one block */}
      <section id="hero" className="masthead">
        <div className="hero">
          <div className="hero-kick kicker">Data journalism · Geopolitical storytelling</div>
          <h1 className="hero-h1">
            We turn complex data into stories<br />
            <em>impossible to ignore.</em>
          </h1>
          <p className="hero-deck">
           We build scrollytelling pieces and visual essays that hold the rigour and the explanation together, where the map does the argument and the prose does the meaning.
          </p>
        </div>

        <div id="work" className="bento rv">
          {stories.map((s, i) => {
            const mod = i % 5
            const isTall = mod === 3
            const isTrailingTall = isTall && i >= stories.length - 2
            const tileClass = i === 0
              ? 'feature'
              : mod === 1 ? 'wide'
              : mod === 2 ? 'wide'
              : isTall ? (isTrailingTall ? 'wide accent-pink' : 'tall accent-pink')
              : 'wide accent-blue'
            const auraClass = s.aura ? ' has-aura' : ''
            const themeStyle: CSSProperties | undefined = s.aura && s.theme
              ? {
                  ['--bn-bg' as string]: s.theme.colors.background,
                  ['--bn-text' as string]: s.theme.colors.text,
                  ['--bn-muted' as string]: s.theme.colors.muted,
                  ['--bn-accent' as string]: s.theme.colors.accent,
                }
              : undefined
            return (
              <Link key={s.slug} href={`/story/${s.slug}`} className={`bn ${tileClass}${auraClass}`} style={themeStyle}>
                {s.aura && <AuraBackground slug={s.aura} />}
                <div>
                  <div className="bn-k">
                    <span className="bn-n">#{String(i + 1).padStart(2, '0')}</span>
                    <span>{new Date(s.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.subtitle}</p>
                </div>
                <div className="bn-a">Read →</div>
              </Link>
            )
          })}
        </div>
      </section>

      {/* EPICS — long-running collections */}
      {epics.length > 0 && (
        <section id="epics" className="epics">
          <div className="epics-inner">
            <div className="epics-head">
              <div className="rv kicker">Epics</div>
              <h2 className="rv" data-d="1">Investigations we keep returning to.</h2>
            </div>
            <div className="epics-grid">
              {epics.map((e, i) => (
                <Link
                  key={e.slug}
                  href={`/${e.slug}`}
                  className="ep rv"
                  data-d={String((i % 3) + 1)}
                >
                  <div>
                    <div className="ep-k">Collection · {String(i + 1).padStart(2, '0')}</div>
                    <h3>{e.name}</h3>
                    {e.description && <p>{e.description}</p>}
                  </div>
                  <div className="ep-a">Enter →</div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* TRIAD — three worlds, three mysteries */}
      <section className="triad">
        <div className="triad-head">
          <div className="rv kicker">Process</div>
          <h2 className="rv" data-d="1">
            Three things. In order. Every time.
          </h2>
        </div>

        <div className="triad-grid">
          <div className="triad-col data rv" data-d="1">
            <div className="node">01 — Data</div>
            <h3>Pattern</h3>
            <p>TWe start with the dataset, not the story. The pattern has to exist before we decide what it means. We find it, and we refuse to distort it.</p>
          </div>
          <div className="triad-col narrative rv" data-d="2">
            <div className="node">02 — Narrative</div>
            <h3>Meaning</h3>
            <p>We find the question the data answers. The thing a reader can carry away, repeat, and use to see the world differently.</p>
          </div>
          <div className="triad-col design rv" data-d="3">
            <div className="node">03 — Design</div>
            <h3>Form</h3>
            <p>We find the format the insight actually needs. Sometimes a fifteen-section scrollytelling piece. Sometimes a single annotated map and four sentences. The form serves the story, never the other way around.</p>
          </div>
        </div>

        <div className="triad-foot rv" data-d="4">
          <p>
            Our mark borrows from Roger Penrose&apos;s diagram of reality&apos;s three mysteries —
            the leaps between pattern, mind, and form. None of them makes sense alone.{' '}
            <em>Vismaya</em> is Sanskrit for wonder: the feeling when something you couldn&apos;t
            see becomes suddenly, undeniably visible. We added the <em>z</em> for viz. That&apos;s the job.
          </p>
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="manifesto">
        <div className="manifesto-inner">
          <div className="rv kicker">What we believe</div>
          <h2 className="rv" data-d="1">Rigour and beauty are the same demand.</h2>

          <p className="rv" data-d="1">
            The world is full of important things nobody can see — not because they&apos;re hidden,
            but because nobody has bothered to make them legible. The supply chain that keeps
            your phone alive runs through six countries and a chokepoint most people can&apos;t
            name. The policy shift that will reshape your industry in five years is sitting in
            an appendix, unread. The slow variable that explains the fast headline is right
            there in the dataset, ignored.
          </p>

          <div className="pull rv" data-d="2">
            &ldquo;Either things stay buried in jargon, or they get compressed into hot takes.
            Both fail the same way.&rdquo;
          </div>

          <p className="rv" data-d="1">
            We don&apos;t start with a format — we start with a question: what does this insight
            actually need to land? Sometimes it&apos;s a ten-minute scrollytelling piece. Sometimes
            a single chart with a headline. Sometimes a forty-five-second reel. We&apos;d rather
            kill a good story than publish a wrong one, and we&apos;d rather make one person
            think differently than impress ten thousand who scroll past and feel nothing.
          </p>
        </div>
      </section>

      {/* WHO WE ARE */}
      <section id="about" className="who">
        <div className="who-inner">
          <div className="who-head">
            <div className="rv kicker">Who we are</div>
            <h2 className="rv" data-d="1">A two-person studio</h2>
          </div>
          <div className="who-grid">
            <div className="bio rv" data-d="1">
              <h3>Shashank A. Pandey</h3>
              <div className="role">Data storytelling · Visual journalism</div>
              <p>
                He started as a journalist who couldn't stop designing, and a designer who couldn't stop researching. Nobody hired that combination, so he taught himself. Not out of strategy. Because the obsession left no choice.
                He believes clarity is an act of generosity. That every number is someone's lived reality compressed into a digit, and most of the time that life gets flattened into a chart no one reads. He exists to give it back its shape: to sit at the border between what is true and what is understood, and to refuse to let the distance between them be someone else's problem.
              </p>
            </div>
            <div className="bio rv" data-d="2">
              <h3>Suprabho Dhenki</h3>
              <div className="role">Product design · Creative technology</div>
              <p>
                Product designer and creative technologist. Founder of Promad, where he builds
                design tools and workflows — Figma plugins, parametric systems, AI-assisted
                production pipelines — that address the fragmentation of modern creative work.
                Previously designed at Microsoft, 1mg, ClearTax, Merkle Science, and Kidzovo;
                early work on interaction design at IIT Guwahati was featured in a CHI
                publication. Bridges design and code through motion, data visualization, and
                modular frameworks for creative production.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CONTACT */}
      <section className="contact">
        <div className="rv kicker">Work with us</div>
        <h2 className="rv" data-d="1">
          Have data that deserves a better story?
        </h2>
        <p className="rv" data-d="2">
        We work with B2B data companies, research institutions, and think tanks who have findings worth publishing but need the storytelling and design layer to make them travel.
        A typical engagement starts with a data brief and an editorial call. We produce scrollytelling pieces, map-led visual essays, standalone infographics, and data reels. Turnaround is two to four weeks depending on scope.
        </p>
        <div className="rv" data-d="3">
          <a className="btn teal" href="mailto:vizmaya@promad.design">Get in touch &nbsp;→</a>
        </div>
      </section>

      <footer>
        <div>
          <span className="mark">Vizmaya Labs</span>
        </div>
        <div className="links">
          <a href="https://www.youtube.com/@Vizmayaa" target="_blank" rel="noreferrer">Youtube</a>
          <a href="https://www.linkedin.com/company/vizmaya/" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="https://x.com/VizmayaFyi" target="_blank" rel="noreferrer">X</a>
        </div>
      </footer>
    </div>
  )
}
