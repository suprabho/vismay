/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, Gauge, Settings2, Wind, type LucideIcon } from 'lucide-react';
import { MAGAZINE_CONTENT } from '../constants';
import { Page, Story } from '../types';
import { storiesApi, telemetryApi } from '../config/api';
import { useAuth } from '../contexts/AuthContext';

interface MagazinePageProps {
  onPageChange: (page: Page) => void;
  onStoryClick: (id: string) => void;
  key?: string;
}

export function MagazinePage({ onPageChange: _onPageChange, onStoryClick }: MagazinePageProps) {
  const { getIdToken } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [latestSession, setLatestSession] = useState<{ sessionName?: string; circuitName?: string } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const token = await getIdToken().catch(() => null);
        const api = storiesApi(token ? () => Promise.resolve(token) : undefined);
        const res = await api.list({ status: 'published', limit: 3 }) as { stories: Story[] };
        setStories(res.stories ?? []);
      } catch { /* silent — homepage degrades gracefully */ }

      try {
        const res = await telemetryApi().sessions() as { sessions: { sessionName?: string; circuitName?: string }[] };
        if (res.sessions?.length > 0) setLatestSession(res.sessions[0]);
      } catch { /* silent */ }
    }
    load();
  }, [getIdToken]);

  const statIcons: Record<string, LucideIcon> = {
    'trending-up': TrendingUp,
    gauge: Gauge,
    'settings-2': Settings2,
    wind: Wind
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex-1 w-full max-w-[720px] mx-auto px-6 py-12 flex flex-col gap-20"
    >
      {/* Hero Thought */}
      <section className="flex flex-col items-center text-center space-y-6 pt-12">
        <h1 className="font-serif text-5xl md:text-7xl text-neutral-900 max-w-2xl leading-[1.1] tracking-tight">
          {MAGAZINE_CONTENT.heroTitleLines[0]} <br />
          {MAGAZINE_CONTENT.heroTitleLines[1]}
        </h1>
        <p className="font-sans text-lg md:text-xl text-neutral-500 max-w-md leading-relaxed">
          {MAGAZINE_CONTENT.heroDescription}
        </p>
      </section>

      {/* Live Race Snapshot */}
      <section className="border border-neutral-200 p-6 relative bg-white overflow-hidden">
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-f1-red"></div>
        <div className="flex justify-between items-center mb-8">
          <div>
            <h2 className="font-mono text-xs font-bold text-f1-red uppercase tracking-[0.2em] mb-1">{MAGAZINE_CONTENT.liveSignalLabel}</h2>
            <h3 className="font-sans text-3xl font-bold text-neutral-900">
              {latestSession
                ? (`${latestSession.circuitName ?? ''} ${latestSession.sessionName ?? ''}`).trim() || MAGAZINE_CONTENT.liveSignalTitle
                : MAGAZINE_CONTENT.liveSignalTitle}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-f1-red animate-pulse"></span>
            <span className="font-mono text-xs font-medium text-neutral-500">{MAGAZINE_CONTENT.liveStatusLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Track Mini Map */}
          <div className="md:col-span-1 border border-neutral-100 p-4 flex items-center justify-center bg-neutral-50 h-48 rounded-sm">
            <img 
              alt="Track Map" 
              className="w-full h-full object-contain opacity-40 grayscale"
              src={MAGAZINE_CONTENT.trackMapImage}
            />
          </div>

          {/* Telemetry Data */}
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            {MAGAZINE_CONTENT.liveStats.map((stat) => {
              const Icon = statIcons[stat.icon];

              return (
                <div key={stat.label} className="border border-neutral-100 p-4 flex flex-col justify-between rounded-sm">
                  <span className="font-mono text-[10px] font-bold text-neutral-400 uppercase tracking-widest">{stat.label}</span>
                  <div className="flex items-baseline gap-2 mt-2">
                    <span className={`font-mono text-2xl font-bold ${stat.valueClass}`}>{stat.value}</span>
                    <Icon size={14} className={stat.valueClass} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Curated Stories */}
      <section className="space-y-12 pb-20">
        <div className="flex items-center gap-4">
          <span className="h-[1px] flex-1 bg-neutral-200"></span>
          <h2 className="font-mono text-[10px] font-bold text-neutral-400 uppercase tracking-[0.3em]">{MAGAZINE_CONTENT.latestAnalysisHeading}</h2>
          <span className="h-[1px] flex-1 bg-neutral-200"></span>
        </div>

        {stories.length === 0 && (
          <p className="font-mono text-xs text-neutral-400 text-center py-8">
            No published stories yet.
          </p>
        )}
        {stories.map((story) => (
          <article
            key={story.id}
            className="group cursor-pointer"
            onClick={() => onStoryClick(story.slug)}
          >
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="w-full md:w-1/3 aspect-[4/3] overflow-hidden bg-neutral-100">
                {story.coverImage?.url && story.coverImage.url !== '/cover-default.jpg' ? (
                  <img
                    alt={story.coverImage.alt}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
                    src={story.coverImage.url}
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-100 flex items-center justify-center">
                    <span className="font-mono text-[10px] text-neutral-300 uppercase tracking-widest">{story.category}</span>
                  </div>
                )}
              </div>
              <div className="w-full md:w-2/3 flex flex-col gap-4">
                <span className="font-mono text-xs font-bold text-f1-red uppercase tracking-widest">{story.category}</span>
                <h3 className="font-serif text-3xl md:text-4xl text-neutral-900 group-hover:text-f1-red transition-colors duration-300 tracking-tight">
                  {story.title}
                </h3>
                <p className="font-sans text-base text-neutral-500 leading-relaxed line-clamp-3">
                  {story.summary}
                </p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="font-mono text-[10px] font-bold text-neutral-500 border border-neutral-200 px-3 py-1.5 tracking-widest">
                    READ TIME: {story.readTimeMin} MIN
                  </span>
                </div>
              </div>
            </div>
            <div className="h-[1px] w-full bg-neutral-100 mt-12"></div>
          </article>
        ))}

        <div className="flex justify-center pt-8">
          <button className="bg-neutral-900 text-white font-mono text-xs font-bold px-10 py-5 hover:bg-f1-red transition-all duration-300 tracking-[0.2em]">
            LOAD MORE ARCHIVES
          </button>
        </div>
      </section>
    </motion.div>
  );
}
