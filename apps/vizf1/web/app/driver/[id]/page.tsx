interface RouteParams {
  params: Promise<{ id: string }>
}

// TODO(vizf1-scaffold): driver profile page — biography, current standing,
// season-by-season results, recent races.
export default async function DriverPage({ params }: RouteParams) {
  const { id } = await params
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-semibold text-text">{id}</h1>
      <p className="mt-2 text-sm text-muted">Driver profile — TODO</p>
    </main>
  )
}
