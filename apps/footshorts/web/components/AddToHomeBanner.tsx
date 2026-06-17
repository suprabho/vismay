'use client';

import { useCallback, useEffect, useState } from 'react';

// Bottom "Add to Home Screen" prompt, mobile-web only. Two flavours:
//  • Android/Chromium — we capture the native `beforeinstallprompt` event and
//    drive it from an Install button (the only way to show the OS install UI).
//  • iOS Safari — there's no install API, so we just show the manual recipe
//    (Share → Add to Home Screen). Other iOS browsers / in-app webviews can't
//    install at all, so we don't show there.
// Dismissals are snoozed in localStorage so we don't nag, and the banner never
// shows once the app is already running standalone (i.e. already installed).

const DISMISS_KEY = 'fs:a2hs-dismissed-at';
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000; // re-offer after two weeks

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function recentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return !!raw && Date.now() - Number(raw) < SNOOZE_MS;
  } catch {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* private mode / storage disabled — just skip the snooze */
  }
}

export function AddToHomeBanner() {
  const [variant, setVariant] = useState<'android' | 'ios' | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  const close = useCallback(() => {
    markDismissed();
    setVariant(null);
    setDeferred(null);
  }, []);

  useEffect(() => {
    if (isStandalone() || recentlyDismissed()) return;

    const onPrompt = (e: Event) => {
      // Stop Chrome's mini-infobar; we surface our own Install button instead.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVariant('android');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', close);

    // iOS Safari has no install event, so fall back to the manual recipe.
    // (Chrome/Firefox/Edge on iOS and in-app webviews can't install — skip
    // them.) Deferred a frame so we don't setState synchronously in the effect;
    // `?? 'ios'` yields if `beforeinstallprompt` already claimed the banner.
    const ua = window.navigator.userAgent;
    const isIOSSafari =
      /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
    const raf = isIOSSafari
      ? window.requestAnimationFrame(() => setVariant((v) => v ?? 'ios'))
      : 0;

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', close);
      if (raf) window.cancelAnimationFrame(raf);
    };
  }, [close]);

  const install = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore — either way we retire this prompt */
    }
    close();
  }, [deferred, close]);

  if (!variant) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-surface/95 px-3.5 py-3 shadow-lg backdrop-blur">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text">Add Footshorts to your home screen</p>
          {variant === 'ios' ? (
            <p className="text-xs leading-snug text-muted">
              Tap <ShareIcon /> Share, then “Add to Home Screen”.
            </p>
          ) : (
            <p className="text-xs leading-snug text-muted">
              Install the app for a faster, fullscreen experience.
            </p>
          )}
        </div>
        {variant === 'android' && (
          <button
            type="button"
            onClick={install}
            className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg"
          >
            Install
          </button>
        )}
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1.5 text-muted hover:text-text"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Apple's share glyph, shown inline in the iOS instructions.
function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="inline-block h-3.5 w-3.5 -translate-y-px align-middle text-text"
      aria-hidden="true"
    >
      <path d="M12 3v12M12 3l-3.5 3.5M12 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" strokeLinecap="round" />
    </svg>
  );
}
