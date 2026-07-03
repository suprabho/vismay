import { useMemo, useState } from 'react';
import { ScrollView, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type {
  Bracket as BracketModel,
  BracketRound,
  BracketSlot,
  BracketTie,
  FixtureTeamRef,
} from '../types';
import { advanceBracket } from '../advanceBracket';
import { stageLabel } from '../stageLabel';
import { findTeam } from '../data/teams';
import { getCompetitionDisplayName, resolveCompetitionColor } from '../competitionMeta';
import { Crest } from './Crest';

/**
 * Tournament bracket — native port of web/BracketTree.tsx.
 *
 * Responsive: by default (`orientation="auto"`) it renders the classic
 * broadcast-style mirrored draw — outer rounds flowing inward on the left
 * (R16 → QF → SF), a centre final + competition emblem, and the right half
 * mirrored — but on narrow layouts it switches to a vertical top-to-bottom
 * cascade that fits a phone without horizontal scrolling. `orientation` can
 * force either layout. One team's run can be highlighted via
 * `highlightTeamId`.
 *
 * Implementation: both layouts are absolutely-positioned Views over a single
 * react-native-svg connector layer — the same geometry as the web renderer,
 * copied verbatim (it is pure math). NativeWind can't style SVG strokes, so
 * the accent/line colors arrive as explicit props instead of CSS vars.
 */

export type BracketOrientation = 'auto' | 'horizontal' | 'vertical';

type Props = {
  bracket: BracketModel;
  highlightTeamId?: string;
  title?: string;
  competitionSlug?: string;
  /** Competition brand color override (the league's `entities.primary_color`).
   *  Falls back to the bundled palette by slug when omitted. */
  competitionColor?: string;
  /** 'auto' (default) picks vertical on narrow layouts; otherwise forced. */
  orientation?: BracketOrientation;
  /** Highlight color for cells + connector strokes — replaces the web
   *  renderer's `--sf-color-accent` CSS var. */
  accentColor?: string;
  /** Base connector stroke color — replaces `--sf-color-muted` at 50%. */
  lineColor?: string;
};

type TreeProps = Omit<Props, 'orientation' | 'accentColor' | 'lineColor'> & {
  accentColor: string;
  lineColor: string;
};

const CELL_W = 184;
const CELL_H = 52;

// Horizontal (mirrored tree) geometry.
const COL_GAP = 44;
const ROW_GAP = 20;
const PAD = 20;
const HEADER_H = 30;
const COL_W = CELL_W + COL_GAP;
const SLOT = CELL_H + ROW_GAP;
const TOP = PAD + HEADER_H;

// Vertical (mirrored, portrait) geometry: rounds stack top → centre → bottom,
// ties spread horizontally within each round, and the two halves converge on a
// central final. Roughly half the width of the horizontal mirror, so it suits a
// portrait/mobile canvas.
const V_BOX_W = 160;
const V_BOX_H = CELL_H;
const V_H_GAP = 14;
const V_ROW_GAP = 54;
const V_FINAL_GAP = 44;
const V_PAD = 10;
const V_ARROW = 7;
const V_RADIUS = 10;

type Pt = { x: number; y: number };

// Polyline → SVG path with rounded corners of radius `r` at interior vertices.
function roundPath(pts: Pt[], r: number): string {
  if (pts.length < 2) return '';
  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
  let d = `M ${pts[0]!.x},${pts[0]!.y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const d1 = Math.min(r, dist(p0, p1) / 2);
    const d2 = Math.min(r, dist(p1, p2) / 2);
    const u1 = { x: (p0.x - p1.x) / (dist(p0, p1) || 1), y: (p0.y - p1.y) / (dist(p0, p1) || 1) };
    const u2 = { x: (p2.x - p1.x) / (dist(p1, p2) || 1), y: (p2.y - p1.y) / (dist(p1, p2) || 1) };
    const a = { x: p1.x + u1.x * d1, y: p1.y + u1.y * d1 };
    const b = { x: p1.x + u2.x * d2, y: p1.y + u2.y * d2 };
    d += ` L ${a.x},${a.y} Q ${p1.x},${p1.y} ${b.x},${b.y}`;
  }
  const last = pts[pts.length - 1]!;
  d += ` L ${last.x},${last.y}`;
  return d;
}

// Chevron arrowhead at (x,y); dir +1 points down, -1 points up.
function arrowHead(x: number, y: number, dir: number): string {
  const a = V_ARROW;
  return `M ${x - a},${y - dir * a} L ${x},${y} L ${x + a},${y - dir * a}`;
}

// Below this measured width the mirrored tree forces horizontal scrolling, so
// an `auto` bracket falls back to the vertical layout (the native analogue of
// web's `(max-width: 640px)` media query).
const NARROW_WIDTH = 640;

type Side = 'left' | 'right';

function tieInvolves(tie: BracketTie, teamId: string | undefined): boolean {
  if (!teamId) return false;
  return tie.teamA?.id === teamId || tie.teamB?.id === teamId;
}

function teamShort(ref: FixtureTeamRef, fallback: string): string {
  const key = ref?.slug ?? ref?.name ?? fallback;
  const t = findTeam(key);
  return t?.shortName ?? t?.name ?? ref?.name ?? fallback;
}

// Derive the two render slots for a tie. Incomplete brackets carry explicit
// `slotA`/`slotB` (team / placeholder / tbd); fixture-derived ties don't, so we
// synthesise team slots from the aggregate + winner fields — keeping both paths
// on one rendering code path.
function tieSlots(tie: BracketTie): [BracketSlot, BracketSlot] {
  if (tie.slotA && tie.slotB) return [tie.slotA, tie.slotB];
  const a: BracketSlot = {
    kind: 'team',
    team: tie.teamA,
    name: tie.teamAName,
    score: tie.aggregate?.a ?? null,
    winner: !!tie.winnerTeamId && tie.winnerTeamId === tie.teamA?.id,
  };
  const b: BracketSlot = {
    kind: 'team',
    team: tie.teamB,
    name: tie.teamBName,
    score: tie.aggregate?.b ?? null,
    winner: !!tie.winnerTeamId && tie.winnerTeamId === tie.teamB?.id,
  };
  return [a, b];
}

function SlotLine({ slot }: { slot: BracketSlot }) {
  if (slot.kind !== 'team') {
    // Placeholder ("Winner Group I") or a blank TBD slot — no crest, dimmed and
    // italicised so it reads as "not yet decided" next to confirmed teams.
    const label = slot.kind === 'placeholder' ? slot.label : 'TBD';
    return (
      <View className="flex-row items-center gap-1.5 px-2" style={{ height: CELL_H / 2 }}>
        <View
          className="rounded-full border border-dashed border-border"
          style={{ width: 18, height: 18, flexShrink: 0 }}
        />
        <Text className="flex-1 text-[12px] italic text-text/40" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-[12px] text-text/30" style={{ fontVariant: ['tabular-nums'] }}>
          –
        </Text>
      </View>
    );
  }
  const slug = slot.team?.slug ?? slot.name;
  const tone = slot.winner ? 'font-semibold text-text' : 'text-text/55';
  return (
    <View className="flex-row items-center gap-1.5 px-2" style={{ height: CELL_H / 2 }}>
      <Crest team={slug} crestUrl={slot.team?.crest_url ?? undefined} size={18} />
      <Text className={`flex-1 text-[12px] ${tone}`} numberOfLines={1}>
        {teamShort(slot.team, slot.name)}
      </Text>
      <Text className={`text-[12px] ${tone}`} style={{ fontVariant: ['tabular-nums'] }}>
        {slot.score ?? '–'}
      </Text>
    </View>
  );
}

function TieCell({
  tie,
  x,
  top,
  highlight,
  accentColor,
  w = CELL_W,
}: {
  tie: BracketTie;
  x: number;
  top: number;
  highlight: boolean;
  accentColor: string;
  w?: number;
}) {
  const [slotA, slotB] = tieSlots(tie);
  return (
    <View
      // No overflow-hidden (unlike web): iOS clips shadows on masked views and
      // the highlight glow would vanish. Nothing inside overflows the cell.
      className="justify-center rounded-md border border-border bg-surface"
      style={{
        position: 'absolute',
        left: x,
        top,
        width: w,
        height: CELL_H,
        zIndex: 10,
        ...(highlight
          ? {
              borderColor: accentColor,
              shadowColor: accentColor,
              shadowOpacity: 0.8,
              shadowRadius: 7,
              shadowOffset: { width: 0, height: 0 },
              elevation: 6,
            }
          : null),
      }}
    >
      <SlotLine slot={slotA} />
      <View className="border-t border-border" />
      <SlotLine slot={slotB} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Horizontal: the classic mirrored tournament tree.
// ---------------------------------------------------------------------------

function HorizontalTree({
  bracket,
  highlightTeamId,
  title,
  competitionSlug,
  competitionColor,
  accentColor,
  lineColor,
}: TreeProps) {
  const slug = competitionSlug ?? bracket.competition_slug;
  const emblemColor = resolveCompetitionColor(slug, competitionColor) ?? '#0E1E5B';
  const compName = getCompetitionDisplayName(slug);

  // Identify the final (explicit FINAL stage, else a trailing single-tie round).
  const lastRound = bracket.rounds[bracket.rounds.length - 1];
  const finalRound: BracketRound | undefined =
    bracket.rounds.find((r) => r.stage === 'FINAL') ??
    (lastRound && lastRound.ties.length === 1 ? lastRound : undefined);
  const outerRounds = bracket.rounds.filter((r) => r !== finalRound);
  const nDepth = outerRounds.length;

  // Split each outer round into left (first half) / right (second half).
  const sideCols = (side: Side): BracketTie[][] =>
    outerRounds.map((round) => {
      const half = Math.ceil(round.ties.length / 2);
      return side === 'left' ? round.ties.slice(0, half) : round.ties.slice(half);
    });

  // Vertical centres: R16 evenly spaced; each later cell on the midpoint of its
  // two feeder cells (standard bracket recursion).
  const yCentersForSide = (cols: BracketTie[][]): number[][] => {
    const ys: number[][] = [];
    cols.forEach((col, d) => {
      if (d === 0) {
        ys.push(col.map((_, i) => TOP + i * SLOT + CELL_H / 2));
      } else {
        const prev = ys[d - 1]!;
        ys.push(
          col.map((_, j) => {
            const a = prev[2 * j];
            const b = prev[2 * j + 1];
            if (a != null && b != null) return (a + b) / 2;
            if (a != null) return a;
            return TOP + j * SLOT * Math.pow(2, d) + CELL_H / 2;
          }),
        );
      }
    });
    return ys;
  };

  const leftCols = sideCols('left');
  const rightCols = sideCols('right');
  const leftYs = yCentersForSide(leftCols);
  const rightYs = yCentersForSide(rightCols);

  const leftX = (d: number) => PAD + d * COL_W;
  const finalX = PAD + nDepth * COL_W;
  const rightX = (d: number) => finalX + COL_W + (nDepth - 1 - d) * COL_W;

  // The centre emblem + title sit above the final cell. In a shallow draw the
  // final sits high enough that they'd collide with it, so shift the whole tree
  // down to reserve headroom (deep draws already have room → extraTop = 0).
  const naturalFinalY =
    leftYs[nDepth - 1]?.[0] != null && rightYs[nDepth - 1]?.[0] != null
      ? (leftYs[nDepth - 1]![0]! + rightYs[nDepth - 1]![0]!) / 2
      : TOP + 2 * SLOT;
  const EMBLEM_HEADROOM = PAD + HEADER_H + CELL_H / 2 + 78;
  const extraTop = Math.max(0, EMBLEM_HEADROOM - naturalFinalY);
  if (extraTop > 0) {
    for (const col of leftYs) for (let i = 0; i < col.length; i++) col[i] = col[i]! + extraTop;
    for (const col of rightYs) for (let i = 0; i < col.length; i++) col[i] = col[i]! + extraTop;
  }

  // Final cell centre = midpoint of the two semifinal cells.
  const sfLeftY = leftYs[nDepth - 1]?.[0];
  const sfRightY = rightYs[nDepth - 1]?.[0];
  const finalY = sfLeftY != null && sfRightY != null ? (sfLeftY + sfRightY) / 2 : naturalFinalY + extraTop;

  // Canvas size.
  let maxBottom = finalY + CELL_H / 2;
  const allYs = [...leftYs.flat(), ...rightYs.flat()];
  for (const y of allYs) maxBottom = Math.max(maxBottom, y + CELL_H / 2);
  const totalW = rightX(0) + CELL_W + PAD;
  const totalH = maxBottom + PAD;

  // Connector paths.
  type Conn = { key: string; d: string; on: boolean };
  const conns: Conn[] = [];
  const elbow = (fx: number, fy: number, px: number, py: number) => {
    const mx = (fx + px) / 2;
    return `M ${fx},${fy} H ${mx} V ${py} H ${px}`;
  };
  // Left side: feeders to the left of the parent.
  for (let d = 1; d < nDepth; d++) {
    leftCols[d]!.forEach((parent, j) => {
      const px = leftX(d);
      const py = leftYs[d]![j]!;
      for (const f of [2 * j, 2 * j + 1]) {
        const feeder = leftCols[d - 1]?.[f];
        const fy = leftYs[d - 1]?.[f];
        if (!feeder || fy == null) continue;
        conns.push({
          key: `lc-${d}-${j}-${f}`,
          d: elbow(leftX(d - 1) + CELL_W, fy, px, py),
          on: tieInvolves(parent, highlightTeamId) && tieInvolves(feeder, highlightTeamId),
        });
      }
    });
  }
  // Right side: feeders to the right of the parent (mirrored).
  for (let d = 1; d < nDepth; d++) {
    rightCols[d]!.forEach((parent, j) => {
      const px = rightX(d) + CELL_W;
      const py = rightYs[d]![j]!;
      for (const f of [2 * j, 2 * j + 1]) {
        const feeder = rightCols[d - 1]?.[f];
        const fy = rightYs[d - 1]?.[f];
        if (!feeder || fy == null) continue;
        conns.push({
          key: `rc-${d}-${j}-${f}`,
          d: elbow(rightX(d - 1), fy, px, py),
          on: tieInvolves(parent, highlightTeamId) && tieInvolves(feeder, highlightTeamId),
        });
      }
    });
  }
  // Semifinal → final.
  const finalTie = finalRound?.ties[0];
  if (nDepth >= 1 && finalTie) {
    const sfL = leftCols[nDepth - 1]?.[0];
    const sfR = rightCols[nDepth - 1]?.[0];
    if (sfL && sfLeftY != null) {
      conns.push({
        key: 'fin-l',
        d: elbow(leftX(nDepth - 1) + CELL_W, sfLeftY, finalX, finalY),
        on: tieInvolves(sfL, highlightTeamId) && tieInvolves(finalTie, highlightTeamId),
      });
    }
    if (sfR && sfRightY != null) {
      conns.push({
        key: 'fin-r',
        d: elbow(rightX(nDepth - 1), sfRightY, finalX + CELL_W, finalY),
        on: tieInvolves(sfR, highlightTeamId) && tieInvolves(finalTie, highlightTeamId),
      });
    }
  }

  // Column headers (left, centre, right).
  const headers: { key: string; x: number; label: string }[] = [];
  outerRounds.forEach((round, d) => {
    headers.push({ key: `hl-${d}`, x: leftX(d) + CELL_W / 2, label: stageLabel(round.stage) });
    headers.push({ key: `hr-${d}`, x: rightX(d) + CELL_W / 2, label: stageLabel(round.stage) });
  });
  headers.push({ key: 'hf', x: finalX + CELL_W / 2, label: 'Final' });

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ width: '100%' }}
      contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
    >
      <View style={{ width: totalW, height: totalH }}>
        {/* connector layer */}
        <Svg
          width={totalW}
          height={totalH}
          style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}
          pointerEvents="none"
        >
          {conns.map((c) => (
            <Path
              key={c.key}
              d={c.d}
              fill="none"
              stroke={c.on ? accentColor : lineColor}
              strokeWidth={c.on ? 2 : 1}
            />
          ))}
        </Svg>

        {/* column headers */}
        {headers.map((h) => (
          <Text
            key={h.key}
            className="text-center text-[10px] font-bold uppercase text-text/70"
            style={{
              position: 'absolute',
              left: h.x - CELL_W / 2,
              top: PAD,
              width: CELL_W,
              letterSpacing: 1.6,
              zIndex: 5,
            }}
            numberOfLines={1}
          >
            {h.label}
          </Text>
        ))}

        {/* centre emblem */}
        <View
          style={{
            position: 'absolute',
            left: finalX + CELL_W / 2 - 100,
            width: 200,
            top: Math.max(PAD + HEADER_H, finalY - CELL_H / 2 - 78),
            zIndex: 6,
            alignItems: 'center',
          }}
        >
          <View
            className="items-center justify-center rounded-full"
            style={{
              width: 52,
              height: 52,
              backgroundColor: emblemColor,
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.25)',
              shadowColor: '#000',
              shadowOpacity: 0.6,
              shadowRadius: 9,
              shadowOffset: { width: 0, height: 6 },
              elevation: 6,
            }}
            accessibilityLabel={compName}
          >
            <Text className="text-[15px] font-bold text-white">★</Text>
          </View>
          {title ? (
            <Text className="mt-1.5 text-[11px] font-semibold text-text/80" numberOfLines={1}>
              {title}
            </Text>
          ) : null}
        </View>

        {/* tie cells */}
        {(['left', 'right'] as Side[]).map((side) => {
          const cols = side === 'left' ? leftCols : rightCols;
          const ys = side === 'left' ? leftYs : rightYs;
          return cols.flatMap((col, d) =>
            col.map((tie, i) => (
              <TieCell
                key={`${side}-${d}-${i}-${tie.legs.map((l) => l.id).join('|')}`}
                tie={tie}
                x={side === 'left' ? leftX(d) : rightX(d)}
                top={ys[d]![i]! - CELL_H / 2}
                highlight={tieInvolves(tie, highlightTeamId)}
                accentColor={accentColor}
              />
            )),
          );
        })}

        {/* final cell */}
        {finalTie ? (
          <TieCell
            tie={finalTie}
            x={finalX}
            top={finalY - CELL_H / 2}
            highlight={tieInvolves(finalTie, highlightTeamId)}
            accentColor={accentColor}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Vertical: a portrait, vertically-mirrored bracket.
//
// The horizontal tree rotated a quarter turn: rounds stack top → centre →
// bottom, the ties within a round spread horizontally, and the two halves of
// the draw converge on a central final (top half flows down, bottom half flows
// up). Pairs of feeders merge into their parent through a rounded bracket with
// a chevron arrowhead; the two semi-finalists feed the final with straight
// arrows. Half the width of the horizontal mirror, so it suits a phone.
// ---------------------------------------------------------------------------

type VHalf = 'top' | 'bottom';

function VerticalTree({
  bracket,
  highlightTeamId,
  title,
  competitionSlug,
  competitionColor,
  accentColor,
  lineColor,
}: TreeProps) {
  const slug = competitionSlug ?? bracket.competition_slug;
  const emblemColor = resolveCompetitionColor(slug, competitionColor) ?? '#0E1E5B';
  const compName = getCompetitionDisplayName(slug);

  const involves = (tie: BracketTie | undefined) => !!tie && tieInvolves(tie, highlightTeamId);

  // Identify the final (explicit FINAL stage, else a trailing single-tie round).
  const lastRound = bracket.rounds[bracket.rounds.length - 1];
  const finalRound: BracketRound | undefined =
    bracket.rounds.find((r) => r.stage === 'FINAL') ??
    (lastRound && lastRound.ties.length === 1 ? lastRound : undefined);
  const outerRounds = bracket.rounds.filter((r) => r !== finalRound);
  const nDepth = outerRounds.length;
  const deepest = nDepth - 1;
  const finalTie = finalRound?.ties[0];

  // Split each outer round into a top half (first) and bottom half (second).
  const halfOf = (round: BracketRound, side: VHalf): BracketTie[] => {
    const h = Math.ceil(round.ties.length / 2);
    return side === 'top' ? round.ties.slice(0, h) : round.ties.slice(h);
  };
  const topCols = outerRounds.map((r) => halfOf(r, 'top'));
  const bottomCols = outerRounds.map((r) => halfOf(r, 'bottom'));

  // Canvas width is set by the widest (outermost) round.
  const count0 = Math.max(topCols[0]?.length ?? 1, bottomCols[0]?.length ?? 1, 1);
  const rowSpan0 = count0 * V_BOX_W + (count0 - 1) * V_H_GAP;
  const totalW = rowSpan0 + 2 * V_PAD;
  const centerX = totalW / 2;

  // Tie x-centres within a half: outermost round evenly spread + centred, each
  // later cell on the midpoint of its two feeders (standard bracket recursion).
  const xCentersForHalf = (cols: BracketTie[][]): number[][] => {
    const xs: number[][] = [];
    cols.forEach((col, d) => {
      if (d === 0) {
        const n = col.length;
        const span = n * V_BOX_W + (n - 1) * V_H_GAP;
        const start = centerX - span / 2 + V_BOX_W / 2;
        xs.push(col.map((_, i) => start + i * (V_BOX_W + V_H_GAP)));
      } else {
        const prev = xs[d - 1]!;
        xs.push(
          col.map((_, j) => {
            const a = prev[2 * j];
            const b = prev[2 * j + 1];
            if (a != null && b != null) return (a + b) / 2;
            if (a != null) return a;
            return centerX;
          }),
        );
      }
    });
    return xs;
  };
  const topXs = xCentersForHalf(topCols);
  const bottomXs = xCentersForHalf(bottomCols);

  // Vertical bands: top rounds descend (d small = outermost = top edge), the
  // final sits at the centre, bottom rounds ascend from it.
  const ROW_STEP = V_BOX_H + V_ROW_GAP;
  const FINAL_STEP = V_BOX_H + V_FINAL_GAP;
  const topY = (d: number) => V_PAD + d * ROW_STEP;
  const aY = nDepth > 0 ? topY(deepest) : V_PAD; // top half's deepest band (semi-final)
  const bY = nDepth > 0 ? aY + FINAL_STEP : V_PAD; // the final
  const cY = bY + FINAL_STEP; // bottom half's deepest band (semi-final)
  const bottomY = (d: number) => cY + (deepest - d) * ROW_STEP;
  const totalH = (nDepth > 0 ? bottomY(0) : bY) + V_BOX_H + V_PAD;

  const rowY = (side: VHalf, d: number) => (side === 'top' ? topY(d) : bottomY(d));
  const colsFor = (side: VHalf) => (side === 'top' ? topCols : bottomCols);
  const xsFor = (side: VHalf) => (side === 'top' ? topXs : bottomXs);

  type Seg = { key: string; d: string; on: boolean };
  const segs: Seg[] = [];

  // Merge bracket: two feeders → one parent, with rounded arms + a chevron.
  const pushMerge = (
    key: string,
    xL: number,
    xR: number,
    xC: number,
    feederEdgeY: number,
    parentEdgeY: number,
    onL: boolean,
    onR: boolean,
  ) => {
    const dir = Math.sign(parentEdgeY - feederEdgeY) || 1;
    const barY = feederEdgeY + (parentEdgeY - feederEdgeY) * 0.55;
    segs.push({ key: `${key}-l`, d: roundPath([{ x: xL, y: feederEdgeY }, { x: xL, y: barY }, { x: xC, y: barY }, { x: xC, y: parentEdgeY }], V_RADIUS), on: onL });
    segs.push({ key: `${key}-r`, d: roundPath([{ x: xR, y: feederEdgeY }, { x: xR, y: barY }, { x: xC, y: barY }, { x: xC, y: parentEdgeY }], V_RADIUS), on: onR });
    segs.push({ key: `${key}-h`, d: arrowHead(xC, parentEdgeY, dir), on: onL || onR });
  };

  // Straight arrow (single feeder → parent).
  const pushArrow = (key: string, xFrom: number, xTo: number, fromY: number, toY: number, on: boolean) => {
    const dir = Math.sign(toY - fromY) || 1;
    segs.push({ key: `${key}-l`, d: `M ${xFrom},${fromY} L ${xTo},${toY}`, on });
    segs.push({ key: `${key}-h`, d: arrowHead(xTo, toY, dir), on });
  };

  // Feeder pairs → parent, for each half.
  for (const side of ['top', 'bottom'] as VHalf[]) {
    const cols = colsFor(side);
    const xs = xsFor(side);
    for (let d = 1; d <= deepest; d++) {
      cols[d]!.forEach((parent, j) => {
        const fL = cols[d - 1]?.[2 * j];
        const fR = cols[d - 1]?.[2 * j + 1];
        const xfL = xs[d - 1]?.[2 * j];
        const xfR = xs[d - 1]?.[2 * j + 1];
        const xC = xs[d]![j]!;
        // Feeders sit on the outer side; the edges that face the parent.
        const feederEdgeY = side === 'top' ? rowY(side, d - 1) + V_BOX_H : rowY(side, d - 1);
        const parentEdgeY = side === 'top' ? rowY(side, d) : rowY(side, d) + V_BOX_H;
        if (fL && fR && xfL != null && xfR != null) {
          pushMerge(`${side}-${d}-${j}`, xfL, xfR, xC, feederEdgeY, parentEdgeY, involves(parent) && involves(fL), involves(parent) && involves(fR));
        } else {
          const f = fL ?? fR;
          const xf = xfL ?? xfR;
          if (f && xf != null) pushArrow(`${side}-${d}-${j}`, xf, xC, feederEdgeY, parentEdgeY, involves(parent) && involves(f));
        }
      });
    }
  }

  // Semi-finals → final (straight arrows converging on the centre).
  const topSF = topCols[deepest]?.[0];
  const bottomSF = bottomCols[deepest]?.[0];
  const topSFx = topXs[deepest]?.[0] ?? centerX;
  const bottomSFx = bottomXs[deepest]?.[0] ?? centerX;
  if (finalTie && deepest >= 0) {
    if (topSF) pushArrow('fin-top', topSFx, centerX, aY + V_BOX_H, bY, involves(topSF) && involves(finalTie));
    if (bottomSF) pushArrow('fin-bottom', bottomSFx, centerX, cY, bY + V_BOX_H, involves(bottomSF) && involves(finalTie));
  }

  // Paint non-highlighted connectors first so the accent path sits on top.
  segs.sort((a, b) => Number(a.on) - Number(b.on));

  // Tie cells for both halves + the central final.
  const cells: { key: string; tie: BracketTie; x: number; y: number }[] = [];
  for (const side of ['top', 'bottom'] as VHalf[]) {
    const cols = colsFor(side);
    const xs = xsFor(side);
    cols.forEach((col, d) =>
      col.forEach((tie, i) => {
        cells.push({ key: `${side}-${d}-${i}`, tie, x: xs[d]![i]! - V_BOX_W / 2, y: rowY(side, d) });
      }),
    );
  }
  if (finalTie) cells.push({ key: 'final', tie: finalTie, x: centerX - V_BOX_W / 2, y: bY });

  return (
    <View style={{ width: '100%' }}>
      {/* header: competition emblem + title */}
      <View className="mb-3 flex-row items-center justify-center gap-2 px-1">
        <View
          className="items-center justify-center rounded-full"
          style={{
            width: 28,
            height: 28,
            flexShrink: 0,
            backgroundColor: emblemColor,
            borderWidth: 2,
            borderColor: 'rgba(255,255,255,0.25)',
            shadowColor: '#000',
            shadowOpacity: 0.6,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 4 },
            elevation: 4,
          }}
          accessibilityLabel={compName}
        >
          <Text className="text-[11px] font-bold text-white">★</Text>
        </View>
        <View style={{ flexShrink: 1 }}>
          <Text className="text-center text-[12px] font-semibold text-text/85" numberOfLines={1}>
            {title ?? compName}
          </Text>
          {title ? (
            <Text className="text-center text-[10px] text-text/55" numberOfLines={1}>
              {compName}
            </Text>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ width: '100%' }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}
      >
        <View style={{ width: totalW, height: totalH }}>
          {/* connector layer */}
          <Svg
            width={totalW}
            height={totalH}
            style={{ position: 'absolute', top: 0, left: 0, zIndex: 0 }}
            pointerEvents="none"
          >
            {segs.map((s) => (
              <Path
                key={s.key}
                d={s.d}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                stroke={s.on ? accentColor : lineColor}
                strokeWidth={s.on ? 2.5 : 1.5}
              />
            ))}
          </Svg>

          {/* tie cells */}
          {cells.map((c) => (
            <TieCell
              key={`${c.key}-${c.tie.legs.map((l) => l.id).join('|')}`}
              tie={c.tie}
              x={c.x}
              top={c.y}
              w={V_BOX_W}
              highlight={tieInvolves(c.tie, highlightTeamId)}
              accentColor={accentColor}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export function BracketTree({
  orientation = 'auto',
  bracket,
  accentColor = '#00D26A',
  lineColor = 'rgba(255,255,255,0.45)',
  ...rest
}: Props) {
  // 'auto' measures the container via onLayout (native has no CSS media
  // queries). Until a real width lands (width === 0) we render the VERTICAL
  // tree — phones must never flash the wide mirrored tree.
  const [width, setWidth] = useState(0);
  // Complete the structure (so every connector draws) and advance decided
  // winners into the next round before either layout lays out the tree.
  const tree = useMemo(() => advanceBracket(bracket) ?? bracket, [bracket]);
  const treeProps = { ...rest, accentColor, lineColor, bracket: tree };
  if (tree.rounds.length === 0) return null;
  if (orientation === 'vertical') return <VerticalTree {...treeProps} />;
  if (orientation === 'horizontal') return <HorizontalTree {...treeProps} />;

  return (
    <View
      style={{ width: '100%' }}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
    >
      {width >= NARROW_WIDTH ? <HorizontalTree {...treeProps} /> : <VerticalTree {...treeProps} />}
    </View>
  );
}
