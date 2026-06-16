import type { ProcessedLap, SectorBests } from '../config/api';

export type SectorColor = 'neutral' | 'pb' | 'purple';

/** Logical sector color → hex. Shared by the 2D SVG outline and the 3D ribbon. */
export const SECTOR_COLOR_HEX: Record<SectorColor, string> = {
  neutral: '#111827',
  pb:      '#22C55E',
  purple:  '#A855F7',
};

const APPROX_EQ = (a: number, b: number) => Math.abs(a - b) < 0.001;

/**
 * Classify the focused driver's current-lap sector times against their personal
 * best (green) and the session purple (purple). Shared between TrackViewport (2D)
 * and TrackViewport3D so both views color sectors identically.
 */
export function classifySectors(
  focusedDriver: number | null,
  focusedLaps:   ProcessedLap[],
  currentLap:    number,
  sectorBests:   SectorBests | null,
): [SectorColor, SectorColor, SectorColor] {
  if (focusedDriver == null || !sectorBests) return ['neutral', 'neutral', 'neutral'];
  const lap = focusedLaps.find(l => l.lap === currentLap);
  if (!lap) return ['neutral', 'neutral', 'neutral'];
  const dBest  = sectorBests.driverBests[focusedDriver];
  const purple = sectorBests.sessionPurple;
  const out: SectorColor[] = ['neutral', 'neutral', 'neutral'];
  const sectorKeys: Array<'s1' | 's2' | 's3'> = ['s1', 's2', 's3'];

  for (let i = 0; i < 3; i++) {
    const t = lap.sectors[i] ?? 0;
    if (t <= 0) continue;
    const key  = sectorKeys[i];
    const purp = purple[key];
    if (purp && APPROX_EQ(t, purp.time) && purp.driverNumber === focusedDriver) {
      out[i] = 'purple';
      continue;
    }
    if (dBest && APPROX_EQ(t, dBest[key])) {
      out[i] = 'pb';
    }
  }
  return out as [SectorColor, SectorColor, SectorColor];
}
