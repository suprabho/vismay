import { useState } from 'react';
import { View } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Circle, Defs, Path, RadialGradient, Stop, Text as SvgText } from 'react-native-svg';
import { findTeam, slugify } from '../data/teams';

/**
 * Team crest — native port of data/Crest.tsx, with the same deterministic
 * fallback chain:
 *   1. explicit `crestUrl` prop (per-fixture override), else
 *   2. the bundled palette crest (football-data.org, via findTeam), else
 *   3. an SVG monogram badge (react-native-svg).
 *
 * If the resolved image fails to load (blocked host, 404, wrong id) the
 * `onError` handler drops to the monogram, so a crest is never a broken image.
 */
interface Props {
  team: string;
  /** Box size in px. */
  size?: number;
  crestUrl?: string;
  /** Override the monogram badge's primary fill (defaults to the bundled palette
   *  color). Ignored once a crest image loads. */
  color?: string;
  /** Override the monogram badge's secondary (stroke + text) color. */
  secondary?: string;
  style?: any;
}

export function Crest({ team, size = 48, crestUrl, color, secondary, style }: Props) {
  const entry = findTeam(team);
  const resolvedUrl = crestUrl ?? entry?.crest;
  const [imgFailed, setImgFailed] = useState(false);

  if (resolvedUrl && !imgFailed) {
    // Fixed square box around the flag/crest. Flags ship at their native
    // aspect ratio (3:2, near-square, etc.); the box sizes the slot and the
    // image `contain`s inside it, keeping the whole flag visible and centered
    // so odd-aspect crests never break column alignment.
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          },
          style,
        ]}
      >
        <Image
          source={{ uri: resolvedUrl }}
          style={{ width: '100%', height: '100%' }}
          contentFit="contain"
          onError={() => setImgFailed(true)}
        />
      </View>
    );
  }

  const fill = color ?? entry?.color ?? '#404040';
  const stroke = secondary ?? entry?.secondary ?? '#FFFFFF';
  const monogram = entry?.monogram ?? team.slice(0, 3).toUpperCase();
  // viewBox is 64; keep the web renderer's historical 0.32× ratio.
  const fontSize = Math.round(size * 0.32);
  // Key the gradient id off the team identity *and* the fill so two clubs that
  // share a monogram — or the same club previewed in two colors — don't
  // collide on a single shared <Defs> id (SVG gradient ids are global).
  const gradId = `crest-bg-${slugify(entry?.name ?? team)}-${fill.replace(/[^a-z0-9]/gi, '')}`;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" style={style}>
      <Defs>
        <RadialGradient id={gradId} cx="35%" cy="30%" r="80%">
          <Stop offset="0%" stopColor={fill} stopOpacity={1} />
          <Stop offset="100%" stopColor={fill} stopOpacity={0.85} />
        </RadialGradient>
      </Defs>
      <Circle cx={32} cy={32} r={30} fill={`url(#${gradId})`} stroke={stroke} strokeWidth={1.5} />
      <Path d="M2 32 a30 30 0 0 0 60 0" fill={stroke} fillOpacity={0.18} />
      <SvgText
        x={32}
        y={32}
        textAnchor="middle"
        alignmentBaseline="central"
        fill={stroke}
        fontSize={fontSize}
        fontWeight="700"
        letterSpacing={fontSize * 0.05}
      >
        {monogram}
      </SvgText>
    </Svg>
  );
}
