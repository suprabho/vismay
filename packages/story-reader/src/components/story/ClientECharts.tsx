'use client'

import { lazy, Suspense, useEffect, useState, type ComponentProps } from 'react'

// echarts-for-react reaches for the DOM at render, so it must stay client-only
// and lazily loaded. This is the framework-agnostic replacement for
// `next/dynamic(() => import('echarts-for-react'), { ssr: false })`: a mount
// gate (skips SSR) plus React.lazy (code-split, loads on first render). Keeping
// it framework-agnostic lets the reader blocks that chart with ECharts move
// into @vismay/story-reader without importing `next/*`.
const ReactECharts = lazy(() => import('echarts-for-react'))

export default function ClientECharts(props: ComponentProps<typeof ReactECharts>) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return (
    <Suspense fallback={null}>
      <ReactECharts {...props} />
    </Suspense>
  )
}
