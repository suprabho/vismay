import { EditorialMagazine } from '@/components/EditorialMagazine'

export default function EditorialPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-4 pb-12">
      <h1 className="mb-3 text-lg font-semibold text-text">Editorial</h1>
      <p className="mb-4 text-xs text-muted">Vizmaya stories and epics — F1.</p>
      <EditorialMagazine />
    </main>
  )
}
