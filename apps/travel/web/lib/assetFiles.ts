// Copy of apps/admin/lib/assetFiles.ts trimmed to the media types the travel
// app uploads (images + mp4). Keep the validation identical so keys written
// here stay compatible with the admin asset panel.

export const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
export const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/
export const ASSETS_BUCKET = 'story-assets'

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const noSpaces = base.replace(/\s+/g, '-')
  const dot = noSpaces.lastIndexOf('.')
  if (dot <= 0) return noSpaces
  return noSpaces.slice(0, dot) + noSpaces.slice(dot).toLowerCase()
}

export function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'avif':
      return 'image/avif'
    case 'gif':
      return 'image/gif'
    case 'mp4':
      return 'video/mp4'
    default:
      return 'application/octet-stream'
  }
}
