import type { FeedCardEntity } from '@footshorts/shared/schemas';
import type { LandingBrief } from '@/lib/useLandingContent';

/**
 * Offline state for the brief slides.
 *
 * `useLandingBriefs` serves real published briefs, but the landing screen is
 * the first thing a cold install renders — often before the network settles,
 * sometimes with no connection at all. These stand in until the query lands so
 * the deck never shows an empty card. Copy is representative, in the same
 * register as a real 60-word brief; `imageUrl` and the crests are deliberately
 * null so this path makes no network requests, which puts each card on the
 * two-club colour band with monogram badges.
 *
 * Four of them, not three: the deck shows two cards behind the front one, so
 * with any fewer the card being dealt away is also the one needed at the back
 * and it has to pop into place instead of sliding off.
 */

function entity(
  slug: string,
  name: string,
  primary_color: string,
  type: FeedCardEntity['type'] = 'team',
): FeedCardEntity {
  return { id: `fallback-${slug}`, type, slug, name, crest_url: null, league_slug: null, primary_color };
}

/** Fixed offsets from mount so the bylines read plausibly without a live clock. */
const HOURS = 60 * 60 * 1000;

export function fallbackBriefs(): LandingBrief[] {
  const now = Date.now();
  return [
    {
      id: 'fallback-anfield',
      headline: "Slot's midfield gamble finally pays at Anfield",
      summary:
        "Liverpool pressed a back three into a diamond and Tottenham never solved it. Two goals inside eleven minutes, both from turnovers in the middle third. Spurs' 63% possession bought them one shot on target.",
      publisher: 'The Athletic',
      publishedAt: new Date(now - 2 * HOURS).toISOString(),
      imageUrl: null,
      entities: [
        entity('liverpool', 'Liverpool', '#C8102E'),
        entity('tottenham-hotspur', 'Tottenham', '#132257'),
      ],
    },
    {
      id: 'fallback-emirates',
      headline: 'Arsenal grind out a win without their front three',
      summary:
        'A patched-up attack managed nine shots and needed only one. Chelsea had the better chances either side of half time and took none of them. Arsenal go top on goal difference with a game in hand.',
      publisher: 'Guardian',
      publishedAt: new Date(now - 5 * HOURS).toISOString(),
      imageUrl: null,
      entities: [
        entity('arsenal', 'Arsenal', '#EF0107'),
        entity('chelsea', 'Chelsea', '#034694'),
      ],
    },
    {
      id: 'fallback-clasico',
      headline: 'Barcelona press cost them the Clasico in eight minutes',
      summary:
        'Two balls in behind a high line, two goals, and the game was gone before the hour. Barcelona finished with 21 shots and an expected-goals edge that flattered them. Real Madrid stretch the lead to four points.',
      publisher: 'Marca',
      publishedAt: new Date(now - 9 * HOURS).toISOString(),
      imageUrl: null,
      entities: [
        entity('barcelona', 'Barcelona', '#A50044'),
        entity('real-madrid', 'Real Madrid', '#00529F'),
      ],
    },
    {
      id: 'fallback-signing',
      headline: 'Dortmund settle on a fee for the winger they wanted in January',
      summary:
        'Nine months of talks ended at a shade under 40m with add-ons. He arrives as a direct replacement rather than a rotation option, which is why the fee moved at all. Medical is booked for Thursday.',
      publisher: 'Sky Sports',
      publishedAt: new Date(now - 14 * HOURS).toISOString(),
      imageUrl: null,
      entities: [
        entity('borussia-dortmund', 'Borussia Dortmund', '#FDE100'),
        entity('bayer-leverkusen', 'Bayer Leverkusen', '#E32221'),
      ],
    },
  ];
}
