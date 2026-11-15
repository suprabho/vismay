/**
 * The studio's own words, shown on /about (app/about/page.tsx). They were the
 * home page's until it became a wall of stories, Doom v Boom and the epics.
 */

export const STUDIO = {
  name: 'Vizmaya Labs',
  statement: 'We turn complex data into stories impossible to ignore.',
  deck: 'A two-person data-journalism studio. The map does the argument, the prose does the meaning — and we refuse to let the distance between what is true and what is understood be someone else’s problem.',
  motto: 'Sits at the border between what is true and what is understood.',
  email: 'vizmaya@promad.design',
  newsletter: 'https://theasymmetryletter.substack.com',
  youtube: 'https://www.youtube.com/@Vizmayaa',
  linkedin: 'https://www.linkedin.com/company/vizmaya/',
  x: 'https://x.com/VizmayaFyi',
}

/** How the studio works, in three steps. */
export const PROCESS = [
  { n: '01', title: 'A data brief', body: 'You bring findings worth publishing. We read the data the way a sceptical reader would.' },
  { n: '02', title: 'An editorial call', body: 'We agree the argument, the evidence and the one chart that carries it.' },
  { n: '03', title: 'Two to four weeks', body: 'Maps, charts and prose, built to travel: a scrolling story, a book, a board or a deck.' },
]

export const CONTACT = {
  title: 'Have data that deserves a better story?',
  body: 'We work with B2B data companies, research institutions and think tanks who have findings worth publishing but need the storytelling and design layer to make them travel. A typical engagement starts with a data brief and an editorial call. Turnaround is two to four weeks.',
}

/** The numbers the page shows; zeros (no epics, no editions yet) are left out. */
export function studioStats(counts: { stories: number; epics: number; mornings: number }): { n: number; label: string }[] {
  return [
    { n: counts.stories, label: 'stories published' },
    { n: counts.epics, label: 'running epics' },
    { n: counts.mornings, label: 'mornings scored' },
    { n: 2, label: 'people' },
  ].filter((s) => s.n > 0)
}
