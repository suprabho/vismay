import { useCallback, useState } from 'react';
import { Clock, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { telemetryApi } from '../../config/api';
import { Badge } from '../ui';
import {
  PRIORITY_COLOR_MAP,
  runStatusColor,
  telemetryStatusColor,
} from '../ui/colors';
import type { RunStatus, RunPipeline, TelemetryStatus } from './types';

type TokenFactory = () => Promise<string | null>;

export const API = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

// Admin panels are dark-themed; delegate to the centralized map in ui/colors.ts.
export const PRIORITY_COLOR: Record<string, string> = PRIORITY_COLOR_MAP.dark;

export async function pollAngleStory(
  getToken: TokenFactory,
  runId: string,
  angleId: string,
  timeoutMs = 600_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const run = await fetch(`${API}/api/admin/runs/${runId}`, { headers })
        .then(r => r.ok ? r.json() : null) as { status: string } | null;
      if (!run) continue;
      if (run.status === 'failed') return null;
      if (run.status === 'done') {
        const data = await fetch(`${API}/api/analysis-angles?runId=${runId}`, { headers })
          .then(r => r.ok ? r.json() : { angles: [] }) as { angles: Array<{ id: string; storyId?: string | null }> };
        const angle = data.angles.find(a => a.id === angleId);
        return angle?.storyId ?? null;
      }
    } catch { /* retry */ }
  }
  return null;
}

export function statusColor(status: RunStatus) {
  return runStatusColor(status, 'light');
}

export function StatusIcon({ status }: { status: RunStatus }) {
  switch (status) {
    case 'queued':  return <Clock size={12} />;
    case 'running': return <Loader2 size={12} className="animate-spin" />;
    case 'done':    return <CheckCircle size={12} />;
    case 'failed':  return <AlertCircle size={12} />;
  }
}

export function pipelineLabel(p: RunPipeline) {
  switch (p) {
    case 'langraph_telemetry': return 'LangGraph · Telemetry';
    case 'crew_story':         return 'CrewAI · Story';
    case 'full':               return 'Full Pipeline';
  }
}

export function fmt(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function shortId(id: string) {
  return id.slice(-6).toUpperCase();
}

export function fmtDuration(ms: number | null | undefined) {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

export function telemetryBadgeColor(s: TelemetryStatus) {
  return telemetryStatusColor(s, 'light');
}

export function TelemetryBadge({ status }: { status: TelemetryStatus }) {
  return (
    <Badge tone={telemetryBadgeColor(status)}>
      {status === 'processing' && <Loader2 size={9} className="animate-spin" />}
      {status}
    </Badge>
  );
}

/**
 * Hook for retrying Phase 2 telemetry and Phase 3 positions enrichment for failed sessions.
 * Tracks which session keys are currently retrying for spinner UI.
 * After successful dispatch, calls `onSettled` so caller can refetch session list.
 */
export function useEnrichmentRetry(getToken: TokenFactory, onSettled?: () => void) {
  const api = telemetryApi(getToken);
  const [retryingTelemetry, setRetryingTelemetry] = useState<Set<string>>(new Set());
  const [retryingPositions, setRetryingPositions] = useState<Set<string>>(new Set());

  const retryTelemetry = useCallback(async (sessionKey: string) => {
    setRetryingTelemetry(prev => new Set(prev).add(sessionKey));
    try {
      await api.retryEnrichment(sessionKey);
      onSettled?.();
    } catch (err) {
      console.warn('[admin] telemetry retry failed', err);
    } finally {
      setRetryingTelemetry(prev => {
        const next = new Set(prev);
        next.delete(sessionKey);
        return next;
      });
    }
  }, [api, onSettled]);

  const retryPositions = useCallback(async (sessionKey: string) => {
    setRetryingPositions(prev => new Set(prev).add(sessionKey));
    try {
      await api.retryPositions(sessionKey);
      onSettled?.();
    } catch (err) {
      console.warn('[admin] position retry failed', err);
    } finally {
      setRetryingPositions(prev => {
        const next = new Set(prev);
        next.delete(sessionKey);
        return next;
      });
    }
  }, [api, onSettled]);

  return { retryTelemetry, retryPositions, retryingTelemetry, retryingPositions };
}
