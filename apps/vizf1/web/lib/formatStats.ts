/**
 * Tiny formatting helpers shared by the per-driver and per-constructor season
 * stats pages. Kept here (rather than inlined) so both pages render flags,
 * dates, ordinals, and DNF labels identically.
 */

// Limited F1-calendar mapping. Supabase circuits don't store a country code,
// so we map the country names that appear on the calendar to ISO-3166 alpha-2
// codes and convert those into regional-indicator emoji flags. Unknown
// countries return empty — the surrounding label still reads fine.
const COUNTRY_CODES: Record<string, string> = {
  Australia: 'AU',
  Austria: 'AT',
  Azerbaijan: 'AZ',
  Bahrain: 'BH',
  Belgium: 'BE',
  Brazil: 'BR',
  Canada: 'CA',
  China: 'CN',
  France: 'FR',
  Germany: 'DE',
  Hungary: 'HU',
  Italy: 'IT',
  Japan: 'JP',
  Mexico: 'MX',
  Monaco: 'MC',
  Netherlands: 'NL',
  Portugal: 'PT',
  Qatar: 'QA',
  'Saudi Arabia': 'SA',
  Singapore: 'SG',
  Spain: 'ES',
  'United Arab Emirates': 'AE',
  UAE: 'AE',
  'United Kingdom': 'GB',
  UK: 'GB',
  USA: 'US',
  'United States': 'US',
  Miami: 'US',
  'Las Vegas': 'US',
  Vietnam: 'VN',
}

export function flagFor(country: string): string {
  const code = COUNTRY_CODES[country]
  if (!code) return ''
  // 0x1F1E6 = 'A' regional-indicator. Each ISO letter maps to its symbol.
  return [...code].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('')
}

export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  const day = String(d.getUTCDate()).padStart(2, '0')
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return `${day} ${month}`
}

/** Numeric position when classified, otherwise a DNF/DNS/DSQ label. */
export function positionLabel(position: number | null, status: string | null): string {
  if (position != null) return String(position)
  if (status) {
    // Retired/Accident/Collision all collapse to DNF. DSQ and DNS stay
    // distinct since they're meaningfully different outcomes.
    const s = status.toLowerCase()
    if (s.includes('dns')) return 'DNS'
    if (s.includes('dsq') || s.includes('disqual')) return 'DSQ'
    return 'DNF'
  }
  return '—'
}

export function formatOrdinal(n: number): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}
