'use client';

import { useRouter } from 'next/navigation';

/**
 * Circular "go back" button that only shows on mobile (`md:hidden`).
 * On larger screens the sidebar/nav makes it redundant.
 */
export function BackButton({ className = '' }: { className?: string }) {
  const router = useRouter();

  return (
    <button
      type="button"
      onClick={() => router.back()}
      aria-label="Go back"
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text hover:border-muted md:hidden ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className="h-5 w-5"
      >
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
