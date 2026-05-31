/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Loader2, AlertCircle } from 'lucide-react';
import { storiesApi, graphsApi } from '../config/api';
import { useAuth } from '../contexts/AuthContext';
import { StoryRenderer } from '../components/StoryRenderer';
import { Story, StoryContentBlock, GraphSpec } from '../types';

interface StoryDetailPageProps {
  storyId: string | null;
  key?: string;
}

export function StoryDetailPage({ storyId }: StoryDetailPageProps) {
  const { getIdToken } = useAuth();
  const [story, setStory]   = useState<Story | null>(null);
  const [blocks, setBlocks] = useState<StoryContentBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!storyId) return;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const token = await getIdToken().catch(() => null);
        const stApi = storiesApi(token ? () => Promise.resolve(token) : undefined);
        const gApi  = graphsApi(token ? () => Promise.resolve(token) : undefined);

        const fetched = await stApi.get(storyId!) as Story;
        setStory(fetched);

        // Resolve graph_embed blocks: fetch GraphSpec for each graphId
        const resolved: StoryContentBlock[] = await Promise.all(
          (fetched.content ?? []).map(async (block: StoryContentBlock) => {
            if (block.type === 'graph_embed' && block.graphId) {
              try {
                const spec = await gApi.get(block.graphId) as GraphSpec;
                return { ...block, graphSpec: spec };
              } catch {
                return block;
              }
            }
            return block;
          })
        );
        setBlocks(resolved);
      } catch {
        setError('Story not found.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [storyId]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-neutral-300" />
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="flex-1 flex items-center justify-center py-24">
        <div className="text-center">
          <AlertCircle size={24} className="text-neutral-300 mx-auto mb-3" />
          <p className="font-mono text-sm text-neutral-500">{error || 'Story not found.'}</p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.02 }}
      className="flex-1 w-full max-w-[720px] mx-auto px-6 py-12 flex flex-col gap-16 pb-32"
    >
      {story.status === 'draft' && (
        <div className="font-mono text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-4 py-2 uppercase tracking-widest">
          Draft — not yet published · visible to admins only
        </div>
      )}
      <article className="space-y-12">
        {/* Header */}
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold text-f1-red uppercase tracking-[0.2em]">
              Signal Analysis / {story.category}
            </span>
            {story.scope?.kind === 'driver' && (
              <span className="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 uppercase tracking-widest">
                Driver · #{story.scope.driverNumber}
                {story.scope.teamName ? ` · ${story.scope.teamName}` : ''}
              </span>
            )}
            {story.scope?.kind === 'team' && (
              <span className="font-mono text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-1 uppercase tracking-widest">
                Team · {story.scope.teamName ?? story.scope.teamId}
              </span>
            )}
            {story.scope?.kind === 'session' && story.parentStoryId == null && (
              <span className="font-mono text-[10px] font-bold text-neutral-600 bg-neutral-100 border border-neutral-200 px-2 py-1 uppercase tracking-widest">
                Session
              </span>
            )}
          </div>
          <h1 className="font-serif text-5xl md:text-7xl text-neutral-900 leading-[1.1] tracking-tight">
            {story.title}
          </h1>
          {story.summary && (
            <p className="font-sans text-lg md:text-xl text-neutral-500 max-w-2xl leading-relaxed">
              {story.summary}
            </p>
          )}
          {story.parentStoryId && (
            <p className="font-mono text-[10px] text-neutral-400 uppercase tracking-widest">
              Part of session analysis
            </p>
          )}
        </div>

        {/* Cover image */}
        {story.coverImage?.url && story.coverImage.url !== '/cover-default.jpg' && (
          <div className="w-full aspect-video bg-neutral-100 border border-neutral-200 relative overflow-hidden group">
            <img
              src={story.coverImage.url}
              alt={story.coverImage.alt}
              className="w-full h-full object-cover grayscale opacity-80 mix-blend-multiply group-hover:scale-105 transition-transform duration-[2000ms]"
            />
            <div className="absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] text-white mix-blend-difference tracking-[0.3em] font-bold">
              <span>
                {story.publishedAt
                  ? new Date(story.publishedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                  : new Date(story.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              <span>READ TIME: {story.readTimeMin} MIN</span>
            </div>
          </div>
        )}

        {/* Story content — block-based renderer */}
        <section className="relative border-l-2 border-f1-red pl-10">
          {blocks.length > 0 ? (
            <StoryRenderer blocks={blocks} />
          ) : (
            <p className="font-mono text-sm text-neutral-400">
              This story has no content yet. Edit it in the Admin panel.
            </p>
          )}
        </section>

        {/* Meta footer */}
        {story.aiGenerated && (
          <div className="border-t border-neutral-100 pt-6">
            <span className="font-mono text-[9px] text-neutral-300 uppercase tracking-widest">
              AI-generated analysis · Apex Intelligence Platform
            </span>
          </div>
        )}
      </article>
    </motion.div>
  );
}
