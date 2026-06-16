/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { storiesApi } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { Story, ScopeKind } from '../types';

interface StoriesPageProps {
  onStoryClick: (id: string) => void;
  key?: string;
}

type ScopeFilter = 'all' | ScopeKind;

const SCOPE_PILLS: { id: ScopeFilter; label: string }[] = [
  { id: 'all',     label: 'All' },
  { id: 'session', label: 'Session' },
  { id: 'driver',  label: 'Drivers' },
  { id: 'team',    label: 'Teams' },
];

export function StoriesPage({ onStoryClick }: StoriesPageProps) {
  const { getIdToken, user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('all');
  const [secondaryFilter, setSecondaryFilter] = useState<string>('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = await getIdToken().catch(() => null);
        const api   = storiesApi(token ? () => Promise.resolve(token) : undefined);
        const base: Record<string, string | number | undefined> = { limit: 50 };
        if (scopeFilter !== 'all') base.scopeKind = scopeFilter;
        if (secondaryFilter && scopeFilter === 'driver') base.driverNumber = secondaryFilter;
        if (secondaryFilter && scopeFilter === 'team')   base.teamId       = secondaryFilter;

        const [pubRes, draftRes] = await Promise.all([
          api.list({ ...base, status: 'published' }) as Promise<{ stories: Story[] }>,
          isAdmin
            ? api.list({ ...base, status: 'draft' }) as Promise<{ stories: Story[] }>
            : Promise.resolve({ stories: [] }),
        ]);

        const merged = [
          ...(draftRes.stories ?? []),
          ...(pubRes.stories ?? []),
        ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        setStories(merged);
        setError('');
      } catch {
        setError('Could not load stories.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [scopeFilter, secondaryFilter, isAdmin, getIdToken]);

  // Build secondary chooser options from the loaded set
  const secondaryOptions = useMemo(() => {
    const opts = new Map<string, string>();
    for (const s of stories) {
      if (scopeFilter === 'driver' && s.scope?.driverNumber != null) {
        const key = String(s.scope.driverNumber);
        opts.set(key, `#${key}${s.scope.teamName ? ` · ${s.scope.teamName}` : ''}`);
      }
      if (scopeFilter === 'team' && s.scope?.teamId) {
        opts.set(s.scope.teamId, s.scope.teamName || s.scope.teamId);
      }
    }
    return Array.from(opts.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [stories, scopeFilter]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 w-full max-w-[720px] mx-auto px-6 py-12 flex flex-col gap-12"
    >
      <div className="mb-4">
        <h1 className="font-serif text-5xl md:text-6xl text-neutral-900 mb-6 tracking-tight">Archive</h1>
        <p className="font-sans text-lg text-neutral-500 max-w-lg leading-relaxed">
          The curated history of strategic decisions and technical evolution.
        </p>

        <div className="flex flex-wrap items-center gap-2 mt-8">
          {SCOPE_PILLS.map((pill) => (
            <button
              key={pill.id}
              onClick={() => { setScopeFilter(pill.id); setSecondaryFilter(''); }}
              className={`font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-all ${
                scopeFilter === pill.id
                  ? 'bg-neutral-900 text-white border-neutral-900'
                  : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
              }`}
            >
              {pill.label}
            </button>
          ))}

          {(scopeFilter === 'driver' || scopeFilter === 'team') && secondaryOptions.length > 0 && (
            <select
              value={secondaryFilter}
              onChange={(e) => setSecondaryFilter(e.target.value)}
              className="ml-2 font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-neutral-200 bg-white text-neutral-700"
            >
              <option value="">{scopeFilter === 'driver' ? 'All drivers' : 'All teams'}</option>
              {secondaryOptions.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 size={24} className="animate-spin text-neutral-300" />
        </div>
      )}

      {error && (
        <p className="font-mono text-xs text-red-500">{error}</p>
      )}

      <div className="grid grid-cols-1 gap-12 pb-32">
        {stories.map((story) => (
          <article
            key={story.id}
            className="group cursor-pointer flex flex-col md:flex-row gap-8 py-8 border-b border-neutral-100 last:border-0"
            onClick={() => onStoryClick(story.slug)}
          >
            <div className="w-full md:w-48 aspect-square overflow-hidden bg-neutral-50 shrink-0">
              {story.coverImage?.url && story.coverImage.url !== '/cover-default.jpg' ? (
                <img
                  src={story.coverImage.url}
                  alt={story.coverImage.alt}
                  className="w-full h-full object-cover grayscale transition-all duration-700 group-hover:grayscale-0 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
                  <span className="font-mono text-[10px] text-neutral-300 uppercase tracking-widest">
                    {story.category}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col justify-center gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {story.status === 'draft' && (
                  <span className="font-mono text-[8px] font-bold text-amber-700 bg-amber-50 border border-amber-300 px-1.5 py-0.5 uppercase tracking-widest">
                    Draft
                  </span>
                )}
                <span className="font-mono text-[10px] font-bold text-f1-red uppercase tracking-widest">
                  {story.category}
                </span>
                <span className="w-1 h-1 rounded-full bg-neutral-300" />
                <span className="font-mono text-[10px] font-bold text-neutral-400">
                  {story.publishedAt
                    ? new Date(story.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                    : new Date(story.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                {story.aiGenerated && (
                  <span className="font-mono text-[8px] text-blue-500 bg-blue-50 border border-blue-100 px-1.5 py-0.5 uppercase tracking-widest">
                    AI
                  </span>
                )}
                {story.scope?.kind === 'driver' && (
                  <span className="font-mono text-[8px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 uppercase tracking-widest">
                    Driver #{story.scope.driverNumber}
                  </span>
                )}
                {story.scope?.kind === 'team' && (
                  <span className="font-mono text-[8px] text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 uppercase tracking-widest">
                    Team · {story.scope.teamName ?? story.scope.teamId}
                  </span>
                )}
                {story.tags?.filter(t => t !== 'race_narrative').map(tag => (
                  <span key={tag} className="font-mono text-[8px] text-neutral-500 bg-neutral-100 border border-neutral-200 px-1.5 py-0.5 uppercase tracking-widest">
                    {tag.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
              <h3 className="font-serif text-3xl text-neutral-900 group-hover:text-f1-red transition-colors duration-300 tracking-tight leading-snug">
                {story.title}
              </h3>
              <p className="font-sans text-sm text-neutral-500 leading-relaxed line-clamp-2">
                {story.summary}
              </p>
              <div className="font-mono text-[9px] font-bold text-neutral-500 mt-2 tracking-widest uppercase">
                {story.readTimeMin} min read
              </div>
            </div>
          </article>
        ))}

        {!loading && stories.length === 0 && !error && (
          <p className="font-mono text-sm text-neutral-400 text-center py-16">
            {isAdmin ? 'No stories yet. Run a pipeline in the Admin panel.' : 'No published stories yet.'}
          </p>
        )}
      </div>
    </motion.div>
  );
}
