'use client'

/**
 * Browser-side upload helpers shared by the /upload panel and /curate:
 * on-device downscale (which also strips GPS EXIF), then sign → PUT straight
 * to Supabase Storage (Vercel 413s proxied bodies over ~4.5 MB).
 */

export const MAX_EDGE = 2560
export const JPEG_QUALITY = 0.82
export const SKIP_RESIZE_UNDER_BYTES = 500 * 1024

export interface UploadedFile {
  filename: string
  assetRef: string
  url: string
  contentType: string
}

export async function downscaleImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  return await new Promise<Blob>((resolve) =>
    canvas.toBlob((b) => resolve(b ?? file), 'image/jpeg', JPEG_QUALITY)
  )
}

/** Downscale (when it's a large image), sign, and PUT one file. Throws on failure. */
export async function uploadOne(slug: string, file: File): Promise<UploadedFile> {
  const isImage = file.type.startsWith('image/')
  const shouldResize =
    isImage && file.type !== 'image/gif' && file.size > SKIP_RESIZE_UNDER_BYTES

  let body: Blob = file
  let filename = file.name
  let contentType = file.type || 'application/octet-stream'
  if (shouldResize) {
    body = await downscaleImage(file)
    filename = filename.replace(/\.[^.]+$/, '') + '.jpg'
    contentType = 'image/jpeg'
  }

  const signRes = await fetch('/api/upload/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug, filename, contentType }),
  })
  if (!signRes.ok) {
    const b = await signRes.json().catch(() => null)
    throw new Error(b?.error ?? `sign failed (HTTP ${signRes.status})`)
  }
  const signed = (await signRes.json()) as UploadedFile & { signedUrl: string }
  const putRes = await fetch(signed.signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': signed.contentType, 'x-upsert': 'true' },
    body,
  })
  if (!putRes.ok) {
    const b = await putRes.json().catch(() => null)
    throw new Error(b?.message ?? b?.error ?? `upload failed (HTTP ${putRes.status})`)
  }
  return {
    filename: signed.filename,
    assetRef: signed.assetRef,
    url: signed.url,
    contentType: signed.contentType,
  }
}
