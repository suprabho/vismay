/**
 * Wikipedia squad-article adapter.
 *
 * Source: https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_squads — one
 * consolidated article with a section per country and a standard `wikitable`
 * holding No/Pos/Player/DOB/Caps/Goals/Club columns.
 *
 * We fetch the rendered HTML once via the MediaWiki action=parse API and
 * cache it in memory so a multi-country CLI run is one network call. The
 * country-section heading text must match the `name` column on
 * fifa_wc26_teams (which itself mirrors the FIFA spelling).
 */

import * as cheerio from 'cheerio';
import { RawSquadEntry, SquadPosition } from '../types';

const SQUADS_ARTICLE = '2026_FIFA_World_Cup_squads';
const WP_API = 'https://en.wikipedia.org/w/api.php';

let cachedHtml: string | null = null;

async function fetchSquadsArticleHtml(): Promise<string> {
  if (cachedHtml) return cachedHtml;
  const url = `${WP_API}?action=parse&page=${encodeURIComponent(SQUADS_ARTICLE)}&format=json&prop=text&formatversion=2`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Footshorts/1.0 (squads ingest; hello@promad.design)' },
  });
  if (!res.ok) {
    throw new Error(`Wikipedia API ${res.status}: ${res.statusText}`);
  }
  const json: any = await res.json();
  const html: string | undefined = json?.parse?.text;
  if (!html) {
    throw new Error('Wikipedia API returned no HTML payload');
  }
  cachedHtml = html;
  return html;
}

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10', november: '11', december: '12',
};

function parseDob(text: string): string | undefined {
  // Wikipedia ages render via {{birth date and age}} template; HTML output
  // contains an ISO-ish span with class="bday" — prefer that when present.
  const iso = text.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const m = text.match(
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );
  if (m) {
    const [, dayRaw, monthRaw, yearRaw] = m;
    if (!dayRaw || !monthRaw || !yearRaw) return undefined;
    const month = MONTHS[monthRaw.toLowerCase()];
    if (!month) return undefined;
    return `${yearRaw}-${month}-${dayRaw.padStart(2, '0')}`;
  }
  return undefined;
}

function parseJersey(text: string): number | undefined {
  const m = text.replace(/\s+/g, '').match(/^(\d+)/);
  const captured = m?.[1];
  return captured ? parseInt(captured, 10) : undefined;
}

function parsePosition(text: string): SquadPosition | undefined {
  const m = text.toUpperCase().match(/(GK|DF|MF|FW)/);
  return m ? (m[1] as SquadPosition) : undefined;
}

function cleanText(s: string): string {
  return s.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
}

// Escape characters CSS selectors can't take literally (spaces, parens, etc.).
// Country names that map to IDs like "Cape_Verde" are safe; some federations
// (e.g. "Côte_d'Ivoire") need their apostrophes escaped.
function cssEscape(s: string): string {
  return s.replace(/['"\\.()[\]:!#@$%^&*+~=,/?;<>|{}]/g, '\\$&');
}

export async function fetchSquadFromWikipedia(
  countryName: string
): Promise<RawSquadEntry[]> {
  const html = await fetchSquadsArticleHtml();
  const $ = cheerio.load(html);

  // Wikipedia (parsoid output) wraps each heading in a <div class="mw-heading
  // mw-heading3"> alongside its edit-section span. The H3 itself carries the
  // id="<CountryName>". To find the squad table we look up the heading by id,
  // climb to that wrapper div, then walk forward through ITS siblings.
  const headingId = countryName.replace(/ /g, '_');
  let heading = $(`h2#${cssEscape(headingId)}, h3#${cssEscape(headingId)}, h4#${cssEscape(headingId)}`).first();
  if (!heading.length) {
    // Fallback: case-insensitive text match (covers Wikipedia using a slightly
    // different heading text than the FIFA spelling — e.g. "Korea Republic" vs "South Korea")
    heading = $('h2, h3, h4').filter((_, el) => {
      const text = $(el).text().trim();
      return text.toLowerCase() === countryName.toLowerCase();
    }).first();
  }

  if (!heading.length) {
    throw new Error(
      `No section for "${countryName}" in ${SQUADS_ARTICLE}. ` +
      `Country may not have announced yet, or the heading text differs ` +
      `from fifa_wc26_teams.name.`
    );
  }

  // Climb to the heading wrapper (<div class="mw-heading ...">). If the
  // article uses the older flat-heading layout we fall back to the heading
  // itself as the cursor origin.
  const wrapper = heading.closest('div.mw-heading');
  const originNode = (wrapper.length ? wrapper[0] : heading[0]) as any;
  if (!originNode) {
    throw new Error(`internal: heading match for ${countryName} dropped between checks`);
  }

  let cursor: any = originNode.nextSibling;
  let tableEl: cheerio.Cheerio<any> | null = null;
  while (cursor) {
    const node = $(cursor);
    if (node.is('table.wikitable')) {
      tableEl = node;
      break;
    }
    // Hit the next country's heading wrapper before finding a table
    if (node.is('div.mw-heading')) break;
    // Or, on the older flat layout, hit a bare heading element
    if (node.is('h2, h3, h4')) break;
    cursor = cursor.nextSibling;
  }

  if (!tableEl) {
    throw new Error(`Found section "${countryName}" but no squad table beneath it`);
  }

  const entries: RawSquadEntry[] = [];
  tableEl.find('tr').each((_, row) => {
    // Modern WC squad tables put the jersey number in a leading <th scope="row">,
    // with Pos/Player/DOB/Caps/Goals/Club following in <td>. Older renders use
    // all <td>. Grab every leaf cell and skip rows that are entirely scope="col"
    // headers.
    const allCells = $(row).find('th, td');
    if (allCells.length < 4) return;

    const isHeaderRow = allCells.toArray().every(
      (c) => (c as any).tagName === 'th' && (c as any).attribs?.scope === 'col'
    );
    if (isHeaderRow) return;

    const jerseyText = cleanText($(allCells[0]).text());
    const positionText = cleanText($(allCells[1]).text());
    const playerCell = $(allCells[2]);
    const dobCell = $(allCells[3]);
    const clubText = cleanText($(allCells[allCells.length - 1]).text());

    const playerRaw = playerCell.text();
    const isCaptain = /\(c\)|\(captain\)/i.test(playerRaw);
    const playerName = cleanText(playerRaw.replace(/\(c\)|\(captain\)/gi, ''));
    if (!playerName) return;

    // Prefer the explicit bday span when Wikipedia renders {{birth date and age}}.
    const bdaySpan = dobCell.find('.bday').first();
    const dob = bdaySpan.length ? bdaySpan.text().trim() : parseDob(cleanText(dobCell.text()));

    entries.push({
      name: playerName,
      jersey: parseJersey(jerseyText),
      position: parsePosition(positionText),
      date_of_birth: dob,
      club_name_raw: clubText || undefined,
      role: isCaptain ? 'captain' : null,
    });
  });

  return entries;
}

export function clearWikipediaCache() {
  cachedHtml = null;
}
