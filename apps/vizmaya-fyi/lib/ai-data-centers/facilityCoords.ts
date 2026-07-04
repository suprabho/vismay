/**
 * Curated map-coordinate OVERRIDES for Epoch AI Frontier Data Centers
 * facilities, keyed by the importer's slugified facility name.
 *
 * Epoch's data_centers.csv carries a street Address but no lat/lng, so the
 * importer geocodes that Address via Mapbox to place map pins (see
 * geocodeMissing in scripts/ai-data-centers/import-data-centers.ts). This file
 * is the override layer: entries here win over both CSV coordinates and
 * geocoding, so use it to correct any facility Mapbox places poorly and to pin
 * the marquee campuses precisely even when no token is available.
 *
 * Slugs must match Epoch's real names (lowercased, punctuation → "-"). The
 * values below are approximate campus locations from public reporting.
 */

export interface FacilityCoord {
  lat: number
  lng: number
}

export const FACILITY_COORDS: Record<string, FacilityCoord> = {
  // OpenAI / Oracle / Crusoe — Lancium Clean Campus, Abilene TX
  'openai-stargate-abilene': { lat: 32.5227, lng: -99.8034 },
  'crusoe-abilene-expansion': { lat: 32.5227, lng: -99.8034 },
  // xAI Colossus — former Electrolux plant, southwest Memphis TN
  'colossus-1': { lat: 35.0537, lng: -90.1479 },
  // Microsoft Fairwater — Mount Pleasant WI
  'microsoft-fairwater-wisconsin': { lat: 42.7089, lng: -87.879 },
  // Amazon (Anthropic) Project Rainier — New Carlisle IN
  'anthropic-amazon-new-carlisle': { lat: 41.7017, lng: -86.5089 },
}
