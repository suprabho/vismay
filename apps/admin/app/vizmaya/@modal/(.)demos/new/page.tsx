'use client'

import NewDemoForm from '@/components/vizmaya/NewDemoForm'
import { RouteEditPanel } from '@/components/admin'

export default function NewDemoModal() {
  return (
    <RouteEditPanel label="New demo">
      <NewDemoForm />
    </RouteEditPanel>
  )
}
