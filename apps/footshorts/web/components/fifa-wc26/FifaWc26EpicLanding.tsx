'use client';

import { useFifaWc26Teams } from '@/lib/useFifaWc26';
import { resolveFifaWc26Theme, resolveFifaWc26MapStyle, FIFA_WC26_THEME_DEFAULTS } from './theme';
import FifaWc26Landing from './FifaWc26Landing';

interface EpicData {
  name: string;
  description: string | null;
  theme: Record<string, unknown>;
  stories: { slug: string; title: string }[];
}

// Bridges the Footshorts editorial epic fetch (name/description/theme/stories)
// to the ported FIFA landing, which also needs the 48 teams. Teams are
// public-read, so they load client-side via React Query.
export default function FifaWc26EpicLanding({ epic }: { epic: EpicData }) {
  const { data: teams, isLoading, error } = useFifaWc26Teams();

  const theme = resolveFifaWc26Theme(epic.theme);
  const mapStyle = resolveFifaWc26MapStyle(epic.theme);

  if (isLoading || (!teams && !error)) {
    return (
      <div
        className="flex h-screen items-center justify-center"
        style={{ background: FIFA_WC26_THEME_DEFAULTS.ink }}
      >
        <div
          className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: theme.accentHi, borderTopColor: 'transparent' }}
        />
      </div>
    );
  }

  if (error || !teams) {
    return (
      <div
        className="flex h-screen flex-col items-center justify-center px-4 text-center"
        style={{ background: theme.ink, color: theme.bone }}
      >
        <p className="mb-2 text-lg">Could not load teams</p>
        <p className="text-sm" style={{ color: theme.muted }}>
          {error instanceof Error ? error.message : 'Please try again.'}
        </p>
      </div>
    );
  }

  return (
    <FifaWc26Landing
      epic={{ name: epic.name, description: epic.description }}
      teams={teams}
      stories={epic.stories}
      theme={theme}
      mapStyle={mapStyle}
    />
  );
}
