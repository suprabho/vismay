import { StoryContentBlock } from '../types';
import { GraphBlock } from './graphs/GraphBlock';

interface StoryRendererProps {
  blocks: StoryContentBlock[];
}

const FENCE_RE = /```[\s\S]*?```/g;
const GRAPHID_RE = /"?graphId"?\s*[:=]/i;

function sanitizeProse(text: string | undefined): string {
  if (!text) return '';
  if (GRAPHID_RE.test(text) && (text.includes('```') || text.includes('['))) return '';
  return text.replace(FENCE_RE, '').replace(/`([^`\n]+)`/g, '$1').trim();
}

export function StoryRenderer({ blocks }: StoryRendererProps) {
  return (
    <div className="space-y-7">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'paragraph': {
            const clean = sanitizeProse(block.text);
            if (!clean) return null;
            return (
              <p key={i} className="font-sans text-lg text-neutral-500 leading-relaxed">
                {clean}
              </p>
            );
          }

          case 'heading':
            return (
              <h2 key={i} className="font-serif text-2xl text-neutral-900 tracking-tight pt-2">
                {block.text}
              </h2>
            );

          case 'quote':
            return (
              <blockquote
                key={i}
                className="border-l-4 border-[#E10600] pl-6 py-1 italic font-serif text-xl text-neutral-700"
              >
                {block.text}
              </blockquote>
            );

          case 'stat':
            return (
              <div key={i} className="bg-neutral-50 border border-neutral-200 p-6">
                <span className="font-mono text-4xl font-bold text-neutral-900">
                  {block.meta?.value as string}
                </span>
                <span className="font-mono text-[10px] text-neutral-400 block mt-1 tracking-widest uppercase">
                  {block.text}
                </span>
              </div>
            );

          case 'graph_embed':
            return block.graphSpec ? (
              <GraphBlock
                key={i}
                spec={block.graphSpec}
                caption={block.meta?.caption as string | undefined}
              />
            ) : null;

          default:
            return null;
        }
      })}
    </div>
  );
}
