import { ScheduleList } from '@/components/ScheduleList'

export default function SchedulePage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-4 pb-12">
      <h1 className="mb-3 text-lg font-semibold text-text">Calendar</h1>
      <ScheduleList />
    </main>
  )
}
