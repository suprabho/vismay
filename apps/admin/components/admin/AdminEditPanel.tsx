'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

interface AdminPanelContextValue {
  setDirty: (dirty: boolean) => void
  isPanel: boolean
}

const AdminPanelContext = createContext<AdminPanelContextValue>({
  setDirty: () => undefined,
  isPanel: false,
})

export function useAdminPanel() {
  return useContext(AdminPanelContext)
}

interface AdminEditPanelProps {
  children: React.ReactNode
  onClose: () => void
  size?: 'standard' | 'wide'
  label?: string
}

/** Responsive route-intercepted editor shell. */
export function AdminEditPanel({
  children,
  onClose,
  size = 'standard',
  label = 'Edit record',
}: AdminEditPanelProps) {
  const [dirty, setDirty] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousActiveElement = useRef<HTMLElement | null>(null)

  const closeIfAllowed = useCallback(() => {
    if (dirty && !window.confirm('Discard unsaved changes?')) return
    onClose()
  }, [dirty, onClose])

  const context = useMemo<AdminPanelContextValue>(
    () => ({ setDirty, isPanel: true }),
    [setDirty],
  )

  useEffect(() => {
    previousActiveElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    return () => {
      previousActiveElement.current?.focus()
    }
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeIfAllowed()
        return
      }

      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null)
      if (focusable.length === 0) {
        event.preventDefault()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [closeIfAllowed])

  return (
    <div
      data-admin-edit-panel
      className="fixed inset-0 z-[80] flex items-stretch justify-end bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) closeIfAllowed()
      }}
    >
      <div
        ref={panelRef}
        className={`relative flex h-full min-h-0 w-full flex-col overflow-hidden border-l border-white/10 bg-neutral-950 text-neutral-100 shadow-2xl ${
          size === 'wide' ? 'max-w-[56rem]' : 'max-w-[36rem]'
        } max-md:max-w-none max-md:border-l-0`}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={closeIfAllowed}
          className="absolute right-3 top-3 z-30 rounded-md border border-white/10 bg-neutral-900/90 px-2.5 py-1 text-lg leading-none text-neutral-400 shadow hover:bg-white/10 hover:text-white"
          aria-label="Close panel"
        >
          ×
        </button>
        <AdminPanelContext.Provider value={context}>
          {children}
        </AdminPanelContext.Provider>
      </div>
    </div>
  )
}
