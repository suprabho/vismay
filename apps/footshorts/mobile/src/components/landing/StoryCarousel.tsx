import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { terrace } from '@footshorts/brand';
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

/** How long each slide holds before auto-advancing. */
const SLIDE_MS = 5000;
/** Presses shorter than this navigate; anything longer is a hold-to-pause. */
const HOLD_THRESHOLD_MS = 180;
/** Horizontal travel that commits a swipe rather than snapping back. */
const SWIPE_COMMIT = 56;
/** Resistance applied when dragging past the first or last slide. */
const RUBBER = 0.35;
/** Fraction of the width that steps backwards when tapped. */
const BACK_ZONE = 0.3;
const SETTLE_MS = 420;
const SETTLE_EASING = Easing.bezier(0.22, 1, 0.36, 1);

/**
 * Story-style carousel for the landing screen: progress bars across the top,
 * 5s auto-advance, drag to swipe with rubber-banding at the ends, tap the left
 * third to step back and the rest to step forward.
 *
 * Auto-advance and taps wrap around; swipes clamp at the ends. Press-and-hold
 * pauses the countdown and resumes where it left off, matching `app/story.tsx`.
 */
export function StoryCarousel({ slides }: { slides: ReactNode[] }) {
  const count = slides.length;
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  const progress = useSharedValue(0);
  const translateX = useSharedValue(0);
  const indexSV = useSharedValue(0);
  const widthSV = useSharedValue(width);

  const pressStartRef = useRef(0);
  const didSwipeRef = useRef(false);
  // The auto-advance callback is re-created every render, but the countdown's
  // completion handler is captured by a worklet — which can't reach into a ref.
  // `advance` is a stable indirection that does the ref read back on the JS
  // thread, so the worklet only ever closes over one unchanging function.
  const advanceRef = useRef<() => void>(() => {});
  const advance = useCallback(() => advanceRef.current(), []);

  /**
   * Cancel any running countdown and start a new one. `fromCurrent` resumes
   * the remaining time (hold-release); otherwise the bar restarts.
   *
   * Every pause/resume path funnels through here, which makes a redundant
   * resume right after a navigation a no-op rather than a double-advance.
   */
  const restartHold = useCallback(
    (fromCurrent: boolean) => {
      cancelAnimation(progress);
      const from = fromCurrent ? progress.value : 0;
      progress.value = from;
      progress.value = withTiming(
        1,
        { duration: SLIDE_MS * (1 - from), easing: Easing.linear },
        (finished) => {
          if (finished) runOnJS(advance)();
        },
      );
    },
    [advance, progress],
  );

  const goTo = useCallback(
    (next: number) => {
      setIndex(next);
      indexSV.value = next;
      translateX.value = withTiming(-next * widthSV.value, {
        duration: SETTLE_MS,
        easing: SETTLE_EASING,
      });
    },
    [indexSV, translateX, widthSV],
  );

  /** Move by `delta`, wrapping (auto-advance, taps) or clamping (swipes). */
  const step = useCallback(
    (delta: number, wrap: boolean) => {
      const raw = index + delta;
      const next = wrap
        ? ((raw % count) + count) % count
        : Math.min(count - 1, Math.max(0, raw));
      if (next === index) {
        // Already at the end the gesture pushed towards — just resume.
        restartHold(true);
        return;
      }
      goTo(next);
    },
    [count, goTo, index, restartHold],
  );

  advanceRef.current = () => step(1, true);

  // Restart the countdown whenever the slide changes.
  useEffect(() => {
    restartHold(false);
    return () => cancelAnimation(progress);
  }, [index, progress, restartHold]);

  // Keep the track aligned when the window resizes (rotation, split view).
  useEffect(() => {
    widthSV.value = width;
    translateX.value = -indexSV.value * width;
  }, [indexSV, translateX, width, widthSV]);

  const onSwipeEnd = useCallback(
    (dx: number) => {
      if (Math.abs(dx) > SWIPE_COMMIT) {
        const next = Math.min(count - 1, Math.max(0, index + (dx < 0 ? 1 : -1)));
        if (next !== index) {
          goTo(next);
          return;
        }
      }
      // Under the threshold, or already at the end the drag pushed towards:
      // unwind the rubber-banding and pick the countdown back up.
      translateX.value = withTiming(-index * widthSV.value, {
        duration: SETTLE_MS,
        easing: SETTLE_EASING,
      });
      restartHold(true);
    },
    [count, goTo, index, restartHold, translateX, widthSV],
  );

  const pauseHold = useCallback(() => {
    pressStartRef.current = Date.now();
    cancelAnimation(progress);
  }, [progress]);

  const markSwiped = useCallback(() => {
    didSwipeRef.current = true;
  }, []);

  const beginTouch = useCallback(() => {
    didSwipeRef.current = false;
    pauseHold();
  }, [pauseHold]);

  /** Shared by both tap zones: short press navigates, long press resumes. */
  const releaseTap = useCallback(
    (delta: number, wrap: boolean) => {
      // A real swipe already handled this interaction.
      if (didSwipeRef.current) return;
      if (Date.now() - pressStartRef.current < HOLD_THRESHOLD_MS) {
        step(delta, wrap);
        return;
      }
      restartHold(true);
    },
    [restartHold, step],
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      runOnJS(beginTouch)();
    })
    .onStart(() => {
      runOnJS(markSwiped)();
    })
    .onUpdate((e) => {
      const max = (count - 1) * widthSV.value;
      let offset = indexSV.value * widthSV.value - e.translationX;
      if (offset < 0) offset *= RUBBER;
      else if (offset > max) offset = max + (offset - max) * RUBBER;
      translateX.value = -offset;
    })
    .onEnd((e) => {
      runOnJS(onSwipeEnd)(e.translationX);
    });

  const trackStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <>
      <View className="flex-row px-6 pb-3.5" style={{ gap: 5 }}>
        {slides.map((_, i) => (
          <ProgressBar
            key={i}
            state={i < index ? 'done' : i === index ? 'active' : 'pending'}
            progress={progress}
          />
        ))}
      </View>

      <View className="flex-1 overflow-hidden">
        <GestureDetector gesture={pan}>
          <View className="flex-1">
            <Animated.View
              style={[
                { width: count * width, height: '100%', flexDirection: 'row' },
                trackStyle,
              ]}
            >
              {slides.map((slide, i) => (
                <View key={i} className="h-full justify-center px-6" style={{ width, gap: 22 }}>
                  {slide}
                </View>
              ))}
            </Animated.View>

            <Pressable
              onPressIn={beginTouch}
              onPressOut={() => releaseTap(-1, false)}
              style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${BACK_ZONE * 100}%` }}
            />
            <Pressable
              onPressIn={beginTouch}
              onPressOut={() => releaseTap(1, true)}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: `${(1 - BACK_ZONE) * 100}%`,
              }}
            />
          </View>
        </GestureDetector>
      </View>
    </>
  );
}

function ProgressBar({
  state,
  progress,
}: {
  state: 'done' | 'active' | 'pending';
  progress: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: state === 'active' ? progress.value : state === 'done' ? 1 : 0 }],
  }));

  return (
    <View className="flex-1 bg-border overflow-hidden" style={{ height: 2 }}>
      <Animated.View
        style={[
          {
            height: '100%',
            width: '100%',
            // Reanimated drives this off the UI thread, so the fill colour is
            // the literal terrace token rather than a NativeWind class.
            backgroundColor: terrace.colors.brand,
            transformOrigin: 'left',
          },
          style,
        ]}
      />
    </View>
  );
}
