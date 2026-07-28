/**
 * Curated coordinates for historical / imprecise places the food-history
 * enrichment worker meets that Mapbox can't (or shouldn't) geocode —
 * vanished polities, regions, and continent-scale areas. Keyed by the
 * normalized place string (lowercase, trimmed). Same curated-override idiom
 * as lib/ai-data-centers/facilityCoords.ts.
 *
 * Populate via `pnpm searching-for-umami:enrich-history --geocode`, which
 * prints ready-to-paste suggestions for unresolved places (and flags the
 * ones that need a judgment call). Coordinates are representative centroids
 * for map pins, not precise claims.
 */

export interface PlaceCoord {
  lat: number
  lng: number
}

export const HISTORY_PLACE_COORDS: Record<string, PlaceCoord> = {
  // Vanished / historical polities
  persia: { lat: 32.4, lng: 53.7 }, // modern Iran centroid
  mesopotamia: { lat: 33.1, lng: 44.2 }, // Tigris–Euphrates basin
  'ancient egypt': { lat: 26.8, lng: 30.8 },
  mesoamerica: { lat: 17.5, lng: -92.0 },
  'the andes': { lat: -13.5, lng: -72.0 },
  'indian subcontinent': { lat: 22.0, lng: 79.0 },
  'southeast asia': { lat: 5.0, lng: 110.0 },
  'east asia': { lat: 32.0, lng: 110.0 },
  'south india': { lat: 12.5, lng: 78.0 },
  'north india': { lat: 28.5, lng: 77.5 },
  'new world': { lat: 15.0, lng: -85.0 },
  'spice islands': { lat: -1.5, lng: 127.5 }, // Maluku Islands
  'maluku islands': { lat: -1.5, lng: 127.5 },
}
