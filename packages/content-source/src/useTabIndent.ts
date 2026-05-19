'use client'

import { useCallback } from 'react'

const INDENT = '  '

export function useTabIndent() {
  return useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Tab' || e.nativeEvent.isComposing) return
    e.preventDefault()
    const ta = e.currentTarget
    const { selectionStart: s, selectionEnd: end, value } = ta
    const lineStart = value.lastIndexOf('\n', s - 1) + 1
    const multiLine = value.slice(s, end).includes('\n')

    if (e.shiftKey) {
      const block = value.slice(lineStart, end)
      const replaced = block.replace(/^ {1,2}/gm, '')
      const removedBeforeS =
        block.slice(0, Math.max(0, s - lineStart)).match(/^ {1,2}/gm)?.join('').length ?? 0
      const removedTotal = block.length - replaced.length
      ta.setSelectionRange(lineStart, end)
      document.execCommand('insertText', false, replaced)
      ta.setSelectionRange(Math.max(lineStart, s - removedBeforeS), end - removedTotal)
      return
    }

    if (multiLine) {
      const block = value.slice(lineStart, end)
      // Don't indent the empty position after a trailing \n — selection that
      // ends at start of next line should leave that next line alone.
      const trailNL = block.endsWith('\n')
      const work = trailNL ? block.slice(0, -1) : block
      const replaced = work.replace(/^/gm, INDENT) + (trailNL ? '\n' : '')
      const linesBeforeS = value.slice(lineStart, s).split('\n').length - 1
      ta.setSelectionRange(lineStart, end)
      document.execCommand('insertText', false, replaced)
      const addedBeforeS = INDENT.length * linesBeforeS
      ta.setSelectionRange(s + INDENT.length + addedBeforeS, end + (replaced.length - block.length))
      return
    }

    document.execCommand('insertText', false, INDENT)
  }, [])
}
