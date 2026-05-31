import { useState, useEffect, useCallback } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { API, fmt } from './shared';
import type { AuditEntry } from './types';

type TokenFactory = () => Promise<string | null>;

export function AuditPanel({ getToken }: { getToken: TokenFactory }) {
  const [logs, setLogs]         = useState<AuditEntry[]>([]);
  const [total, setTotal]       = useState(0);
  const [page, setPage]         = useState(1);
  const [resource, setResource] = useState('');
  const [loading, setLoading]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const t = await getToken();
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (resource) params.set('resource', resource);
      const res = await fetch(`${API}/api/admin/audit?${params}`, {
        headers: { Authorization: `Bearer ${t ?? ''}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setTotal(data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken, page, resource]);

  useEffect(() => { load(); }, [load]);

  const resources = ['Story', 'Signal', 'User', 'TelemetrySession', 'StoryRun'];

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <select
          value={resource}
          onChange={e => { setResource(e.target.value); setPage(1); }}
          className="border border-neutral-200 px-3 py-1.5 font-mono text-xs text-neutral-700 focus:outline-none focus:border-neutral-400 bg-white"
        >
          <option value="">All resources</option>
          {resources.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          className="p-1.5 border border-neutral-200 text-neutral-400 hover:text-neutral-700 transition-colors disabled:opacity-40">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
        <span className="font-mono text-[11px] text-neutral-400 ml-auto">{total} entries</span>
      </div>

      <div className="border border-neutral-200">
        <div className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-4 px-6 py-2.5 bg-neutral-50 border-b border-neutral-200">
          {['Time', 'Resource', 'Action', 'Actor'].map(h => (
            <span key={h} className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">{h}</span>
          ))}
        </div>

        {loading && logs.length === 0 ? (
          <div className="py-16 flex items-center justify-center"><Loader2 size={20} className="animate-spin text-neutral-300" /></div>
        ) : logs.length === 0 ? (
          <div className="py-16 text-center font-mono text-sm text-neutral-400">No audit entries found.</div>
        ) : (
          logs.map(entry => (
            <div key={entry._id}
              className="grid grid-cols-[1fr_1fr_1fr_2fr] gap-4 px-6 py-3 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors">
              <span className="font-mono text-[11px] text-neutral-500">{fmt(entry.createdAt)}</span>
              <span className="font-mono text-xs text-neutral-700">{entry.resource}</span>
              <span className="font-mono text-xs text-neutral-600">{entry.action}</span>
              <span className="font-mono text-[11px] text-neutral-400 truncate">{entry.actorId}</span>
            </div>
          ))
        )}
      </div>

      {total > 20 && (
        <div className="flex items-center justify-between mt-4">
          <span className="font-mono text-[11px] text-neutral-400">Page {page}</span>
          <div className="flex gap-2">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 border border-neutral-200 font-mono text-xs text-neutral-600 disabled:opacity-30 hover:border-neutral-400 transition-colors">
              ← Prev
            </button>
            <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 border border-neutral-200 font-mono text-xs text-neutral-600 disabled:opacity-30 hover:border-neutral-400 transition-colors">
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
