import type { SourceGroup } from '@vismay/content-source/dcEditionAssembly'

/**
 * Chapter VII — every link in the edition grouped by outlet, numbered.
 * Derived from the stories and papers the edition carries (never written),
 * so it cannot drift from the body.
 */
export default function Sources({ groups }: { groups: SourceGroup[] }) {
  if (groups.length === 0) return <p className="notice">This edition carries no linked sources.</p>
  return (
    <div className="sources">
      {groups.map((g) => (
        <div className="grp" key={g.name}>
          <h3>
            {g.name} <span>{g.items.length}</span>
          </h3>
          <ol>
            {g.items.map((it) => (
              <li key={it.url + it.n}>
                <span className="n">{String(it.n).padStart(2, '0')}</span>
                <span>
                  <a href={it.url} target="_blank" rel="noopener">
                    {it.title}
                  </a>{' '}
                  <span className="d">{it.kind === 'paper' ? it.domain : `${it.domain}${it.when ? ` · ${it.when}` : ''}`}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  )
}
