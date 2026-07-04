/**
 * Curated map coordinates for Epoch AI Frontier Data Centers facilities,
 * keyed by the importer's slugified facility name.
 *
 * Epoch's data_centers.csv carries a street Address but (as of the first
 * import) no lat/lng columns, so the /ai-data-centers map pins come from this
 * table instead. Same pattern as lib/energy-profile/countryCentroids.ts: the
 * importer reads this file and the weekly upsert never overwrites the values.
 *
 * Coordinates are approximate campus locations compiled from public reporting
 * and permit filings — good enough to drop a pin on a US-scale map, not
 * parcel-grade. To add entries for new facilities, run the importer with
 * --geocode (needs MAPBOX_TOKEN) and paste the suggestions it prints, or look
 * the site up by its Address column.
 */

export interface FacilityCoord {
  lat: number
  lng: number
}

export const FACILITY_COORDS: Record<string, FacilityCoord> = {
  // OpenAI/Oracle/Crusoe Stargate campus, Abilene TX
  'stargate-abilene': { lat: 32.5227, lng: -99.8034 },
  // xAI Colossus, Memphis TN (former Electrolux plant)
  'xai-colossus': { lat: 35.0537, lng: -90.1479 },
  'colossus': { lat: 35.0537, lng: -90.1479 },
  // Microsoft Fairwater, Mount Pleasant WI
  'microsoft-fairwater': { lat: 42.7128, lng: -87.8721 },
  'fairwater': { lat: 42.7128, lng: -87.8721 },
  // Meta Hyperion, Richland Parish LA
  'meta-hyperion': { lat: 32.4483, lng: -91.7337 },
  'hyperion': { lat: 32.4483, lng: -91.7337 },
  // Meta Prometheus, New Albany OH
  'meta-prometheus': { lat: 40.0898, lng: -82.7885 },
  'prometheus': { lat: 40.0898, lng: -82.7885 },
  // Amazon/Anthropic Project Rainier, New Carlisle IN
  'project-rainier': { lat: 41.7128, lng: -86.5264 },
  'anthropic-project-rainier': { lat: 41.7128, lng: -86.5264 },
}
