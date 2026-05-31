import { useEffect, useState } from 'react';
import { Loader2, ChevronDown } from 'lucide-react';
import { telemetryApi } from '../../config/api';

interface SessionRow {
  sessionKey:      string;
  sessionName?:    string;
  circuitName?:    string;
  country?:        string;
  year?:           number;
  dateStart?:      string | null;
  positionsStatus?: 'pending' | 'processing' | 'done' | 'failed';
}

interface Props {
  value:    string | null;
  onChange: (sessionKey: string) => void;
}

export function SessionPicker({ value, onChange }: Props) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    telemetryApi().sessions()
      .then(d => {
        if (cancelled) return;
        const list = ((d as { sessions: SessionRow[] }).sessions ?? [])
          .filter(s => s.positionsStatus === 'done')
          .sort((a, b) => (b.dateStart ?? '').localeCompare(a.dateStart ?? ''));
        setSessions(list);
        if (!value && list.length > 0) onChange(list[0].sessionKey);
      })
      .catch(e => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = sessions.find(s => s.sessionKey === value);

  return (
    <div className="flex items-center gap-4 px-5 py-3 border-b border-neutral-200 bg-white">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">Session</span>
        {loading ? (
          <Loader2 size={13} className="animate-spin text-neutral-400" />
        ) : (
          <div className="relative">
            <select
              value={value ?? ''}
              onChange={e => onChange(e.target.value)}
              disabled={sessions.length === 0}
              className="appearance-none border border-neutral-200 pl-3 pr-8 py-1.5 font-mono text-xs text-neutral-900 bg-white focus:outline-none focus:border-f1-red transition-colors disabled:opacity-50"
            >
              {sessions.length === 0 ? (
                <option value="">— None ingested with positions —</option>
              ) : (
                sessions.map(s => (
                  <option key={s.sessionKey} value={s.sessionKey}>
                    {s.year} · {s.circuitName || s.sessionKey} · {s.sessionName}
                  </option>
                ))
              )}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none" />
          </div>
        )}
      </div>

      {current && (
        <div className="flex items-center gap-4 font-mono text-[11px] text-neutral-500">
          <span>Track: <span className="text-neutral-900">{current.circuitName || '—'}</span></span>
          {current.country && <span>· {current.country}</span>}
        </div>
      )}

      {error && (
        <span className="font-mono text-[11px] text-red-500 ml-auto">Sessions load failed: {error}</span>
      )}
    </div>
  );
}
