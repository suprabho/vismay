import { redirect } from 'next/navigation'

// The calendar now lives on the For You feed; keep old /schedule links working.
export default function SchedulePage() {
  redirect('/feed')
}
