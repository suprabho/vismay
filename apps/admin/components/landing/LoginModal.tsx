'use client'

import { useEffect, useState } from 'react'
import AdminLoginForm from '@/components/AdminLoginForm'

interface Props {
  next?: string
  label?: string
  variant?: 'primary' | 'ghost' | 'link'
}

export function LoginModal({ next = '/', label = 'Sign in', variant = 'primary' }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open])

  const triggerClass =
    variant === 'primary'
      ? 'inline-flex items-center gap-2 rounded-full bg-[#E07A60] px-6 py-3 text-sm font-medium text-neutral-950 transition-colors hover:bg-[#f08e75]'
      : variant === 'ghost'
        ? 'inline-flex items-center gap-2 rounded-full border border-white/20 px-5 py-2 text-sm text-neutral-200 transition-colors hover:border-white/40 hover:text-white'
        : 'text-sm text-neutral-400 transition-colors hover:text-white'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClass}>
        {label}
        {variant === 'primary' && <span aria-hidden>→</span>}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="login-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-neutral-950/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-neutral-900 p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-neutral-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
            <div id="login-modal-title" className="sr-only">
              Sign in to Vismay admin
            </div>
            <AdminLoginForm
              next={next}
              loginEndpoint="/api/login"
              title="Sign in"
              subtitle="Vismay admin"
            />
          </div>
        </div>
      )}
    </>
  )
}

export default LoginModal
