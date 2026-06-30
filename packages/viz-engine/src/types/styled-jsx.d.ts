// Ambient augmentation for styled-jsx's `<style jsx global>` syntax used by
// MapboxBackground. Next injects these types during its own builds; this local
// copy lets `tsc` typecheck the package standalone (pnpm doesn't hoist
// styled-jsx to a resolvable path). The members are optional, so this merges
// harmlessly with Next's identical declaration when an app compiles the engine.
import 'react'

declare module 'react' {
  interface StyleHTMLAttributes<T> {
    jsx?: boolean
    global?: boolean
  }
}
