/**
 * Centralized status/priority color maps. Each map has a `light` (main app)
 * and `dark` (admin panels) variant so the duplicated per-file maps collapse here.
 */

export type Theme = 'light' | 'dark';

export const RUN_STATUS_COLOR: Record<Theme, Record<string, string>> = {
  light: {
    queued:  'text-neutral-400 bg-neutral-100 border-neutral-200',
    running: 'text-amber-600 bg-amber-50 border-amber-200',
    done:    'text-emerald-600 bg-emerald-50 border-emerald-200',
    failed:  'text-red-600 bg-red-50 border-red-200',
  },
  dark: {
    queued:  'text-neutral-400 bg-neutral-800/40 border-neutral-700',
    running: 'text-amber-400 bg-amber-950/30 border-amber-700',
    done:    'text-emerald-400 bg-emerald-950/30 border-emerald-700',
    failed:  'text-red-400 bg-red-950/30 border-red-700',
  },
};

export const TELEMETRY_STATUS_COLOR: Record<Theme, Record<string, string>> = {
  light: {
    pending:    'text-neutral-500 bg-neutral-100 border-neutral-200',
    processing: 'text-amber-600 bg-amber-50 border-amber-200',
    done:       'text-emerald-600 bg-emerald-50 border-emerald-200',
    failed:     'text-red-600 bg-red-50 border-red-200',
  },
  dark: {
    pending:    'text-neutral-500 bg-neutral-800/40 border-neutral-700',
    processing: 'text-amber-400 bg-amber-950/30 border-amber-700',
    done:       'text-emerald-400 bg-emerald-950/30 border-emerald-700',
    failed:     'text-red-400 bg-red-950/30 border-red-700',
  },
};

export const PRIORITY_COLOR_MAP: Record<Theme, Record<string, string>> = {
  light: {
    high: 'text-red-600 border-red-200 bg-red-50',
    med:  'text-amber-600 border-amber-200 bg-amber-50',
    low:  'text-neutral-500 border-neutral-200 bg-neutral-100',
  },
  dark: {
    high: 'text-red-400 border-red-700 bg-red-950/30',
    med:  'text-amber-400 border-amber-700 bg-amber-950/30',
    low:  'text-neutral-400 border-neutral-700 bg-neutral-800/40',
  },
};

export function runStatusColor(status: string, theme: Theme = 'light'): string {
  return RUN_STATUS_COLOR[theme][status] ?? RUN_STATUS_COLOR[theme].queued;
}

export function telemetryStatusColor(status: string, theme: Theme = 'light'): string {
  return TELEMETRY_STATUS_COLOR[theme][status] ?? TELEMETRY_STATUS_COLOR[theme].pending;
}

export function priorityColor(priority: string, theme: Theme = 'light'): string {
  return PRIORITY_COLOR_MAP[theme][priority] ?? PRIORITY_COLOR_MAP[theme].low;
}
