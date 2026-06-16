/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Activity, History, AlertCircle, Flag, Box, Video } from 'lucide-react';

import { Spinner, EmptyState, ErrorBoundary, useToast } from '../components/ui';
import { SessionPicker } from '../components/race/SessionPicker';
import { TrackViewport } from '../components/race/TrackViewport';
import { DriverToggleList } from '../components/race/DriverToggleList';
import { PlaybackControls, type PlaybackSpeed } from '../components/race/PlaybackControls';
import { FocusedDriverCard } from '../components/race/FocusedDriverCard';
import { RaceSignalsTab } from '../components/race/RaceSignalsTab';
import { LapHistoryTab } from '../components/race/LapHistoryTab';
import { useRaceData } from '../hooks/useRaceData';
import { computeLiveStandings, findFrameIndex, timeAtLapStart } from '../utils/trackProjection';
import { telemetryApi, type ProcessedLap } from '../config/api';

// Lazy so three.js (~250 KB gz) only loads when the user opens the 3D view.
const TrackViewport3D = lazy(() => import('../components/race/three/TrackViewport3D'));

export type StandingsSortMode = 'championship' | 'live';

interface RacePageProps {
  onStoryClick?: (slug: string) => void;
}

export function RacePage({ onStoryClick }: RacePageProps = {}) {
  const [sessionKey,   setSessionKey]    = useState<string | null>(null);
  const [activeSidebar, setActiveSidebar] = useState<'signals' | 'history'>('signals');
  const [viewMode,      setViewMode]      = useState<'2d' | '3d'>('2d');
  const [chaseCam,      setChaseCam]      = useState(false);
  const { toast } = useToast();

  const race = useRaceData(sessionKey);

  // ── Playback state ──────────────────────────────────────────────────────────
  const [playing,       setPlaying]       = useState(false);
  const [speed,         setSpeed]         = useState<PlaybackSpeed>(1);
  const [redrawSignal,  setRedrawSignal]  = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const currentTimeRef = useRef(0);

  const [lapFrom, setLapFrom] = useState(1);
  const [lapTo,   setLapTo]   = useState(1);

  const [visibleDrivers, setVisibleDrivers] = useState<Set<number>>(new Set());
  const [focusedDriver,  setFocusedDriver]  = useState<number | null>(null);
  const [sortMode,       setSortMode]       = useState<StandingsSortMode>('live');
  const [sortModeUserSet, setSortModeUserSet] = useState(false);
  const [signalsScope,   setSignalsScope]   = useState<'session' | 'driver' | 'team'>('session');

  // ── Focused driver laps (sector classification + LapHistoryTab) ─────────────
  const [focusedLaps,         setFocusedLaps]         = useState<ProcessedLap[]>([]);
  const [focusedLapsLoading,  setFocusedLapsLoading]  = useState(false);
  const [focusedLapsError,    setFocusedLapsError]    = useState<string | null>(null);

  useEffect(() => {
    if (!sessionKey || focusedDriver == null) {
      setFocusedLaps([]); setFocusedLapsError(null);
      return;
    }
    let cancelled = false;
    setFocusedLapsLoading(true); setFocusedLapsError(null);
    telemetryApi().driverLaps(sessionKey, focusedDriver)
      .then(res => !cancelled && setFocusedLaps(res.laps ?? []))
      .catch(e   => !cancelled && setFocusedLapsError(String(e)))
      .finally(()=> !cancelled && setFocusedLapsLoading(false));
    return () => { cancelled = true; };
  }, [sessionKey, focusedDriver]);

  const withPositions = useMemo(
    () => new Set(race.tracks.keys()),
    [race.tracks],
  );

  // Reset playback state when a new session loads
  useEffect(() => {
    if (!race.bounds || race.tracks.size === 0) return;
    currentTimeRef.current = race.bounds.t0Ms;
    setCurrentTimeMs(race.bounds.t0Ms);
    setPlaying(false);
    setLapFrom(1);
    setLapTo(race.totalLaps || 1);
    setVisibleDrivers(new Set(race.tracks.keys()));
    setFocusedDriver(null);
    setSortMode('live');
    setSortModeUserSet(false);
    setRedrawSignal(s => s + 1);
  }, [race.bounds, race.tracks, race.totalLaps]);

  // ── Animation loop ──────────────────────────────────────────────────────────
  const rafRef    = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    if (!playing || !race.bounds) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      return;
    }

    const lapWindowEndMs = (() => {
      let end = race.bounds.t0Ms;
      for (const track of race.tracks.values()) {
        const lapEnd = timeAtLapStart(track, lapTo + 1) ?? track.tEndMs;
        if (lapEnd > end) end = lapEnd;
      }
      return Math.min(end, race.bounds.tEndMs);
    })();

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;

      currentTimeRef.current += dt * speed;
      if (currentTimeRef.current >= lapWindowEndMs) {
        currentTimeRef.current = lapWindowEndMs;
        setCurrentTimeMs(currentTimeRef.current);
        setPlaying(false);
        setRedrawSignal(s => s + 1);
        return;
      }

      setRedrawSignal(s => s + 1);
      if (Math.floor(currentTimeRef.current / 100) !== Math.floor(currentTimeMs / 100)) {
        setCurrentTimeMs(currentTimeRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, race.bounds, race.tracks, lapTo]);

  // ── Derived: current lap from an anchor driver ──────────────────────────────
  const currentLap = useMemo(() => {
    if (race.tracks.size === 0) return 0;
    const anchor = race.tracks.values().next().value;
    if (!anchor) return 0;
    const idx = findFrameIndex(anchor.frames.t, currentTimeMs);
    return idx >= 0 ? anchor.frames.lap[idx] : 0;
  }, [currentTimeMs, race.tracks]);

  const focusedDriverObj = useMemo(
    () => race.session?.drivers.find(d => d.driverNumber === focusedDriver) ?? null,
    [race.session, focusedDriver],
  );

  // Live race position per driver, recomputed at the 100 ms cadence of currentTimeMs.
  const liveStandings = useMemo(
    () => computeLiveStandings(race.tracks, currentTimeMs, race.circuit),
    [race.tracks, currentTimeMs, race.circuit],
  );

  // Auto-switch to live ordering on first play; respect manual override afterwards.
  useEffect(() => {
    if (playing && !sortModeUserSet) setSortMode('live');
  }, [playing, sortModeUserSet]);

  const handleSortModeChange = useCallback((m: StandingsSortMode) => {
    setSortMode(m);
    setSortModeUserSet(true);
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSeek = useCallback((t: number) => {
    currentTimeRef.current = t;
    setCurrentTimeMs(t);
    setRedrawSignal(s => s + 1);
  }, []);

  const handleSkipToStart = useCallback(() => {
    if (!race.bounds || race.tracks.size === 0) return;
    const anchor = race.tracks.values().next().value;
    const t = (anchor && timeAtLapStart(anchor, lapFrom)) ?? race.bounds.t0Ms;
    handleSeek(t);
  }, [race.bounds, race.tracks, lapFrom, handleSeek]);

  const handleSkipToEnd = useCallback(() => {
    if (!race.bounds || race.tracks.size === 0) return;
    let end = race.bounds.t0Ms;
    for (const track of race.tracks.values()) {
      const lapEnd = timeAtLapStart(track, lapTo + 1) ?? track.tEndMs;
      if (lapEnd > end) end = lapEnd;
    }
    handleSeek(Math.min(end, race.bounds.tEndMs));
  }, [race.bounds, race.tracks, lapTo, handleSeek]);

  const toggleDriver = useCallback((dn: number) => {
    setVisibleDrivers(prev => {
      const next = new Set(prev);
      if (next.has(dn)) next.delete(dn); else next.add(dn);
      return next;
    });
    setRedrawSignal(s => s + 1);
  }, []);

  const toggleAllDrivers = useCallback((on: boolean) => {
    setVisibleDrivers(on ? new Set(withPositions) : new Set());
    setRedrawSignal(s => s + 1);
  }, [withPositions]);

  const handleFocus = useCallback((dn: number | null) => {
    setFocusedDriver(dn);
    if (dn != null) setActiveSidebar('history');
  }, []);

  const handleLapRange = useCallback((from: number, to: number) => {
    setLapFrom(from);
    setLapTo(to);
    if (!race.bounds || race.tracks.size === 0) return;
    const anchor = race.tracks.values().next().value;
    if (!anchor) return;
    const fromT = timeAtLapStart(anchor, from) ?? race.bounds.t0Ms;
    const toT   = timeAtLapStart(anchor, to + 1) ?? race.bounds.tEndMs;
    if (currentTimeRef.current < fromT || currentTimeRef.current > toT) {
      handleSeek(fromT);
    }
  }, [race.bounds, race.tracks, handleSeek]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="flex-1 flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-shrink-0">
        <SessionPicker value={sessionKey} onChange={setSessionKey} />
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 flex flex-col min-w-0 bg-neutral-50">
          <div className="flex-1 flex min-h-0">
            <div className="flex-1 flex flex-col p-5 min-w-0 relative">
              {race.loading && (
                <div className="flex-1 flex items-center justify-center">
                  <Spinner size={16} label="Loading positions…" />
                </div>
              )}

              {!race.loading && race.error && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-neutral-500">
                  <AlertCircle size={20} className="text-f1-red" />
                  <span className="font-mono text-xs">{race.error}</span>
                </div>
              )}

              {!race.loading && !race.error && !sessionKey && (
                <div className="flex-1 flex items-center justify-center">
                  <EmptyState icon={Flag} message="Pick a session above to load track data." />
                </div>
              )}

              {!race.loading && !race.error && sessionKey && race.tracks.size > 0 && (
                <>
                  {/* 2D / 3D view toggle */}
                  <div className="absolute top-7 right-7 z-10 flex items-center gap-2">
                    {viewMode === '3d' && (
                      <button
                        onClick={() => setChaseCam(c => !c)}
                        disabled={focusedDriver == null}
                        title={focusedDriver == null ? 'Focus a driver to enable chase cam' : 'Toggle chase camera'}
                        className={`flex items-center gap-1 px-2 py-1 font-mono text-[9px] uppercase tracking-widest border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          chaseCam
                            ? 'bg-f1-red text-white border-f1-red'
                            : 'bg-white/80 text-neutral-600 border-neutral-300 hover:border-neutral-500'
                        }`}
                      >
                        <Video size={11} /> Chase
                      </button>
                    )}
                    <div className="flex border border-neutral-300 bg-white/80 overflow-hidden">
                      {(['2d', '3d'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => setViewMode(mode)}
                          className={`flex items-center gap-1 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest transition-colors ${
                            viewMode === mode
                              ? 'bg-neutral-900 text-white'
                              : 'text-neutral-500 hover:text-neutral-900'
                          }`}
                        >
                          {mode === '3d' && <Box size={11} />}
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  {viewMode === '2d' ? (
                    <TrackViewport
                      circuit={race.circuit}
                      drivers={race.session?.drivers ?? []}
                      tracks={race.tracks}
                      visibleDrivers={visibleDrivers}
                      focusedDriver={focusedDriver}
                      focusedLaps={focusedLaps}
                      sectorBests={race.sectorBests}
                      currentLap={currentLap}
                      aggregates={race.aggregates}
                      currentTimeRef={currentTimeRef}
                      redrawSignal={redrawSignal}
                    />
                  ) : (
                    <ErrorBoundary
                      onError={() => { setViewMode('2d'); toast('3D view failed to render — reverted to 2D.', 'error'); }}
                      fallback={() => <div className="flex-1 w-full h-full min-h-0" />}
                    >
                      <Suspense
                        fallback={
                          <div className="flex-1 w-full h-full min-h-0 flex items-center justify-center border border-neutral-800 bg-neutral-950">
                            <Spinner size={16} label="Loading 3D view…" />
                          </div>
                        }
                      >
                        <TrackViewport3D
                          circuit={race.circuit}
                          drivers={race.session?.drivers ?? []}
                          tracks={race.tracks}
                          visibleDrivers={visibleDrivers}
                          focusedDriver={focusedDriver}
                          focusedLaps={focusedLaps}
                          sectorBests={race.sectorBests}
                          currentLap={currentLap}
                          currentTimeRef={currentTimeRef}
                          chaseCam={chaseCam}
                        />
                      </Suspense>
                    </ErrorBoundary>
                  )}
                  {focusedDriverObj && (
                    <FocusedDriverCard
                      driver={focusedDriverObj}
                      currentLap={currentLap}
                      aggregates={race.aggregates}
                      onClose={() => setFocusedDriver(null)}
                    />
                  )}
                </>
              )}
            </div>

            {race.session && race.tracks.size > 0 && (
              <div className="w-[280px] p-5 pl-0 hidden lg:block">
                <DriverToggleList
                  drivers={race.session.drivers}
                  withPositions={withPositions}
                  visible={visibleDrivers}
                  focusedDriver={focusedDriver}
                  liveStandings={liveStandings}
                  sortMode={sortMode}
                  onSortModeChange={handleSortModeChange}
                  onToggle={toggleDriver}
                  onToggleAll={toggleAllDrivers}
                  onFocus={handleFocus}
                />
              </div>
            )}
          </div>

          {race.bounds && race.tracks.size > 0 && (
            <PlaybackControls
              playing={playing}
              speed={speed}
              currentTimeMs={currentTimeMs}
              t0Ms={race.bounds.t0Ms}
              tEndMs={race.bounds.tEndMs}
              currentLap={currentLap}
              totalLaps={race.totalLaps}
              lapFrom={lapFrom}
              lapTo={lapTo}
              onPlayPause={() => setPlaying(p => !p)}
              onSeek={handleSeek}
              onSpeedChange={setSpeed}
              onLapRange={handleLapRange}
              onSkipToStart={handleSkipToStart}
              onSkipToEnd={handleSkipToEnd}
            />
          )}
        </div>

        {/* Intelligence Sidebar — real data now */}
        <aside className="hidden md:flex w-[380px] flex-col bg-white border-l border-neutral-200 overflow-hidden min-h-0">
          <div className="p-4 border-b border-neutral-200 bg-neutral-900 text-white flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-gain-green animate-pulse" />
              <span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase">Race Control</span>
            </div>
            <div className="font-mono text-[9px] font-bold text-neutral-400">
              LAP {currentLap || '—'} / {race.totalLaps || '—'}
            </div>
          </div>

          <div className="flex border-b border-neutral-100 bg-neutral-50/30">
            <button
              onClick={() => setActiveSidebar('signals')}
              className={`flex-1 py-3 flex flex-col items-center gap-1.5 transition-all relative ${
                activeSidebar === 'signals' ? 'text-f1-red bg-white' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <Activity size={16} />
              <span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase">Signals</span>
              {activeSidebar === 'signals' && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-f1-red" />
              )}
            </button>
            <button
              onClick={() => setActiveSidebar('history')}
              className={`flex-1 py-3 flex flex-col items-center gap-1.5 transition-all relative ${
                activeSidebar === 'history' ? 'text-f1-red bg-white' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              <History size={16} />
              <span className="font-mono text-[9px] font-bold tracking-[0.2em] uppercase">Lap History</span>
              {activeSidebar === 'history' && (
                <motion.div layoutId="tab-underline" className="absolute bottom-0 left-0 right-0 h-0.5 bg-f1-red" />
              )}
            </button>
          </div>

          <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <AnimatePresence mode="wait">
              {activeSidebar === 'signals' ? (
                <motion.div
                  key="signals"
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  {sessionKey ? (
                    <>
                      <div className="flex items-center gap-1 px-5 pt-2 pb-2 border-b border-neutral-100">
                        {(['session', 'driver', 'team'] as const).map((s) => {
                          const disabled =
                            (s === 'driver' && focusedDriver == null) ||
                            (s === 'team' && (focusedDriverObj?.teamId == null));
                          return (
                            <button
                              key={s}
                              onClick={() => !disabled && setSignalsScope(s)}
                              disabled={disabled}
                              className={`font-mono text-[9px] uppercase tracking-widest px-2 py-1 border transition-all ${
                                signalsScope === s
                                  ? 'bg-neutral-900 text-white border-neutral-900'
                                  : disabled
                                    ? 'bg-neutral-50 text-neutral-300 border-neutral-100 cursor-not-allowed'
                                    : 'bg-white text-neutral-500 border-neutral-200 hover:border-neutral-400'
                              }`}
                              title={
                                s === 'driver' && focusedDriver == null
                                  ? 'Focus a driver first'
                                  : s === 'team' && focusedDriverObj?.teamId == null
                                    ? 'Focus a driver first'
                                    : undefined
                              }
                            >
                              {s}
                            </button>
                          );
                        })}
                      </div>
                      <RaceSignalsTab
                        sessionKey={sessionKey}
                        currentLap={currentLap}
                        drivers={race.session?.drivers ?? []}
                        scopeKind={signalsScope}
                        driverNumber={signalsScope === 'driver' ? focusedDriver : null}
                        teamId={signalsScope === 'team' ? focusedDriverObj?.teamId ?? null : null}
                        onStoryClick={onStoryClick}
                      />
                    </>
                  ) : (
                    <p className="p-6 font-mono text-xs text-neutral-400">Pick a session first.</p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="history"
                  initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}
                  className="flex-1 flex flex-col min-h-0 overflow-hidden"
                >
                  <LapHistoryTab
                    driver={focusedDriverObj}
                    laps={focusedLaps}
                    loading={focusedLapsLoading}
                    error={focusedLapsError}
                    currentLap={currentLap}
                    sectorBests={race.sectorBests}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </aside>
      </div>
    </motion.div>
  );
}
