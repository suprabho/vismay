export type SessionType = 'R' | 'Q' | 'SS' | 'SQ' | 'S' | 'FP1' | 'FP2' | 'FP3';

export const SESSION_TYPES: { value: SessionType; label: string }[] = [
  { value: 'R',   label: 'Race' },
  { value: 'Q',   label: 'Qualifying' },
  { value: 'SS',  label: 'Sprint Shootout' },
  { value: 'SQ',  label: 'Sprint Qualifying' },
  { value: 'S',   label: 'Sprint' },
  { value: 'FP1', label: 'Practice 1' },
  { value: 'FP2', label: 'Practice 2' },
  { value: 'FP3', label: 'Practice 3' },
];

export function slugifyGp(gpName: string): string {
  return gpName.toLowerCase().replace(/[\s-]+/g, '_');
}

export function makeSessionKey(year: number, gpName: string, sessionType: string): string {
  return `${year}_${slugifyGp(gpName)}_${sessionType}`;
}
