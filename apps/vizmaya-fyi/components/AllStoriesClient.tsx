'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import VizmayaLogo from '@/components/VizmayaLogo'

export interface ArchiveStory {
  slug: string
  title: string
  subtitle: string
  date: string
  byline: string
}

const css = `
*,*::before,*::after{margin:0;padding:0;box-sizing:border-box}
.vz{
  --teal:#057A6E;--pink:#E84D7A;--blue:#2B4ACF;
  --ink:#0C0C10;--cream:#F4F1EC;--muted:#4A4742;--line:rgba(12,12,16,.1);
  --ff-d:'Fraunces',Georgia,serif;
  --ff-m:'JetBrains Mono',ui-monospace,monospace;
  background:var(--cream);color:var(--ink);font-family:var(--ff-m);-webkit-font-smoothing:antialiased;font-size:15px;line-height:1.75;min-height:100vh;
}
.vz ::selection{background:var(--teal);color:var(--ink)}
.vz a{text-decoration:none;transition:opacity .3s,color .3s}.vz a:hover{opacity:.7}
.vz button{cursor:pointer;transition:opacity .3s}.vz button:hover{opacity:.85}
.vz em{font-style:italic}

.vz .rv{opacity:0;transform:translateY(16px);transition:opacity .7s cubic-bezier(.22,1,.36,1),transform .7s cubic-bezier(.22,1,.36,1)}
.vz .rv.v{opacity:1;transform:translateY(0)}
.vz .rv[data-d="1"]{transition-delay:.08s}.vz .rv[data-d="2"]{transition-delay:.16s}

.vz .nav{position:fixed;top:0;left:0;right:0;z-index:200;display:flex;justify-content:space-between;align-items:center;padding:18px clamp(24px,5vw,56px);background:transparent;transition:background .4s,border-color .4s,backdrop-filter .4s;border-bottom:1px solid transparent}
.vz .nav.scrolled{background:rgba(244,241,236,.94);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.vz .nav-logo{cursor:pointer;display:flex;align-items:center;background:none;border:none;padding:0}
.vz .nav-r{display:flex;gap:28px;align-items:center}
.vz .nav-link{font-family:var(--ff-m);font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:var(--ink);opacity:.55}
.vz .nav-cta{font-family:var(--ff-m);font-size:10.5px;letter-spacing:1.8px;text-transform:uppercase;color:var(--cream)!important;background:var(--ink);padding:10px 18px;border-radius:2px;opacity:1!important}

.vz .kicker{font-family:var(--ff-m);font-size:10.5px;letter-spacing:2.4px;text-transform:uppercase;color:var(--teal);display:inline-flex;align-items:center;gap:10px}
.vz .kicker::before{content:'';display:inline-block;width:20px;height:1px;background:var(--teal)}
.vz h1,.vz h2{font-family:var(--ff-d);font-weight:500;font-style:normal;letter-spacing:-.015em;color:var(--ink);line-height:1.1;margin:0}

.vz .head{padding:140px clamp(24px,5vw,56px) 60px;border-bottom:1px solid var(--line)}
.vz .head-inner{max-width:1180px;margin:0 auto}
.vz .head h1{font-size:clamp(40px,6vw,76px);line-height:1.04;letter-spacing:-.025em;margin:24px 0 24px;max-width:18ch}
.vz .head h1 em{font-family:var(--ff-d);font-style:italic;font-weight:400}
.vz .head-deck{font-family:var(--ff-m);font-size:13.5px;line-height:1.85;color:var(--muted);max-width:58ch}
.vz .head-meta{margin-top:36px;font-family:var(--ff-m);font-size:11px;letter-spacing:1.8px;text-transform:uppercase;color:var(--muted);opacity:.7}

.vz .list{padding:32px clamp(24px,5vw,56px) 120px}
.vz .list-inner{max-width:1180px;margin:0 auto}
.vz .row{display:grid;grid-template-columns:140px 1fr 120px;gap:clamp(20px,4vw,56px);align-items:baseline;padding:32px 0;border-bottom:1px solid var(--line);color:var(--ink)}
.vz .row:hover{opacity:1}
.vz .row:hover h2{color:var(--teal)}
.vz .row:hover .arrow{opacity:1;transform:translateX(4px)}
.vz .row-num{font-family:var(--ff-m);font-size:10.5px;letter-spacing:2px;color:var(--teal);text-transform:uppercase}
.vz .row-num .date{display:block;color:var(--muted);margin-top:6px;letter-spacing:1.6px}
.vz .row-body h2{font-family:var(--ff-d);font-style:italic;font-weight:400;font-size:clamp(24px,3vw,34px);line-height:1.18;margin:0 0 8px;transition:color .3s}
.vz .row-body p{font-family:var(--ff-m);font-size:13.5px;line-height:1.7;color:var(--muted);max-width:60ch}
.vz .row-body .byline{margin-top:10px;font-family:var(--ff-m);font-size:10.5px;letter-spacing:1.4px;text-transform:uppercase;color:var(--muted);opacity:.7}
.vz .arrow{font-family:var(--ff-m);font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--teal);text-align:right;opacity:.55;transition:opacity .3s,transform .3s}

.vz footer{background:var(--ink);padding:32px clamp(24px,5vw,56px);border-top:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px}
.vz footer .mark{font-family:var(--ff-d);font-size:14px;font-style:italic;color:rgba(244,241,236,.4)}
.vz footer .links{display:flex;gap:24px}
.vz footer .links a{font-family:var(--ff-m);font-size:10px;letter-spacing:1.8px;text-transform:uppercase;color:rgba(244,241,236,.3)}

@media(max-width:720px){
  .vz .row{grid-template-columns:1fr;gap:14px}
  .vz .arrow{text-align:left;opacity:.7}
  .vz .nav-link{display:none}
}
`

export default function AllStoriesClient({ stories }: { stories: ArchiveStory[] }) {
  useEffect(() => {
    const nav = document.getElementById('nav')
    const onScroll = () => nav?.classList.toggle('scrolled', window.scrollY > 60)
    window.addEventListener('scroll', onScroll)

    const obs = new IntersectionObserver(
      (es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add('v') }),
      { threshold: 0.12 }
    )
    document.querySelectorAll('.rv').forEach((el) => obs.observe(el))

    return () => {
      window.removeEventListener('scroll', onScroll)
      obs.disconnect()
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
        <Link className="nav-logo" href="/" aria-label="Vizmaya Labs">
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
        </Link>
        <div className="nav-r">
          <Link className="nav-link" href="/#work">Work</Link>
          <Link className="nav-link" href="/#about">About</Link>
          <a className="nav-cta" href="https://theasymmetryletter.substack.com" target="_blank" rel="noreferrer">Subscribe</a>
        </div>
      </nav>

      <section className="head">
        <div className="head-inner">
          <div className="rv kicker">Archive</div>
          <h1 className="rv" data-d="1">
            All stories.<br /><em>Every piece, in one place.</em>
          </h1>
          <p className="rv head-deck" data-d="2">
            The full catalogue of scrollytelling pieces, visual essays, and data reports from Vizmaya Labs — geopolitics, technology, demographics, and the slow variables that explain the fast headlines.
          </p>
          <div className="rv head-meta" data-d="2">
            {stories.length} {stories.length === 1 ? 'story' : 'stories'}
          </div>
        </div>
      </section>

      <section className="list">
        <div className="list-inner">
          {stories.map((s, i) => (
            <Link key={s.slug} href={`/story/${s.slug}`} className="row">
              <div className="row-num">
                #{String(i + 1).padStart(2, '0')}
                <span className="date">
                  {new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
              <div className="row-body">
                <h2>{s.title}</h2>
                <p>{s.subtitle}</p>
                {s.byline && <div className="byline">{s.byline}</div>}
              </div>
              <div className="arrow">Read →</div>
            </Link>
          ))}
        </div>
      </section>

      <footer>
        <div>
          <span className="mark">Vizmaya Labs</span>
        </div>
        <div className="links">
          <a href="https://theasymmetryletter.substack.com" target="_blank" rel="noreferrer">Newsletter</a>
          <a href="https://linkedin.com/company/vizmaya-labs" target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="https://instagram.com/vizzmaya" target="_blank" rel="noreferrer">Instagram</a>
        </div>
      </footer>
    </div>
  )
}
