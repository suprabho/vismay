interface RouteParams {
  params: Promise<{ id: string }>
}

// TODO(vizf1-scaffold): constructor profile page — entrants, season points,
// championship history, season-by-season standings.
export default async function TeamPage({ params }: RouteParams) {
  const { id } = await params
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold text-text">{id}</h1>
      <p className="mt-2 text-sm text-muted">Constructor profile — TODO</p>
    </main>
  )
}
