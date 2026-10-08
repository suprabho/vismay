import { gameDetail } from '@/lib/espn'

/**
 * "Remind me": an .ics event for the game with a 30-minute alarm, so the
 * reminder lives in the viewer's own calendar app — no account or push.
 */

function icsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escape(s: string): string {
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n')
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await gameDetail(id, 900)
  if (!detail) return new Response('Game not found', { status: 404 })
  const { game } = detail
  const start = new Date(game.date)
  const end = new Date(start.getTime() + 150 * 60_000)
  const title = `${game.away.team.name} @ ${game.home.team.name}`
  const url = new URL(`/game/${game.id}`, req.url).toString()
  const body = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VizNBA//Remind//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:viznba-${game.id}@viznba`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(start)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${escape(title)}`,
    game.venue ? `LOCATION:${escape([game.venue, game.city].filter(Boolean).join(', '))}` : null,
    `DESCRIPTION:${escape(`Live stats on VizNBA: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escape(`${title} tips off in 30 minutes`)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n')
  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${game.away.team.abbr}-at-${game.home.team.abbr}.ics"`,
    },
  })
}
