/**
 * Landing page. Deliberately minimal: every trip is password-gated and
 * reached by its direct link (`/t/<slug>`), so there is no public trip
 * listing here — just the brand mark and a hint of what this place is.
 */
export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="text-6xl" aria-hidden>
        🧭
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">Trips</h1>
      <p className="max-w-md text-base leading-relaxed opacity-70">
        Travel journeys shared with friends and family — a map of every stop,
        and the story of the trip in photos. If someone sent you here, open the
        link they shared and use the trip password.
      </p>
    </main>
  )
}
