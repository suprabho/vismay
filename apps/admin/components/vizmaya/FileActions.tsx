'use client'

import { useRef } from 'react'

interface Props {
  filename: string
  accept: string
  value: string
  onUpload: (text: string) => void
  mime?: string
}

export default function FileActions({
  filename,
  accept,
  value,
  onUpload,
  mime = 'text/plain;charset=utf-8',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  function download() {
    const blob = new Blob([value], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Reset so picking the same filename twice still fires onChange.
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    onUpload(text)
  }

  return (
    <div className="flex items-center gap-1 px-2 py-1.5 border-b border-white/5 bg-neutral-900/40 shrink-0">
      <button
        type="button"
        onClick={download}
        className="text-xs px-2 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/5"
        title={`Download ${filename}`}
      >
        ↓ Download
      </button>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-xs px-2 py-1 rounded text-neutral-400 hover:text-white hover:bg-white/5"
        title={`Replace contents from ${filename}`}
      >
        ↑ Upload
      </button>
      <span className="ml-1 font-mono text-xs text-neutral-600 truncate">{filename}</span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={pickFile}
        className="hidden"
      />
    </div>
  )
}
