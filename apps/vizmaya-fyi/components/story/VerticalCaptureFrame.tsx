'use client'

import type { ComponentProps } from 'react'
import { VerticalCaptureFrame as BaseVerticalCaptureFrame } from '@vismay/story-reader'
import AuraBackground from '@/components/AuraBackground'

/** Vizmaya binding: injects the aura iframe used in the 9:16 compose frame. */
export default function VerticalCaptureFrame(
  props: ComponentProps<typeof BaseVerticalCaptureFrame>
) {
  return <BaseVerticalCaptureFrame {...props} AuraComponent={AuraBackground} />
}
