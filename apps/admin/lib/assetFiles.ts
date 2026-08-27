export const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/
export const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/
export const ASSETS_BUCKET = 'story-assets'

export function sanitizeFilename(name: string): string {
  // Strip any directory traversal Supabase might allow through, replace
  // whitespace with hyphens, and lowercase the extension for predictability.
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
    case 'svg':
      return 'image/svg+xml'
    case 'mp4':
      return 'video/mp4'
    // Documents — compose source uploads. Keep in sync with the story-sources
    // bucket allowlist (migration 062) so a browser sending a generic
    // content-type still passes storage validation.
    case 'pdf':
      return 'application/pdf'
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    case 'xls':
      return 'application/vnd.ms-excel'
    case 'docx':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'doc':
      return 'application/msword'
    case 'pptx':
      return 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    case 'ppt':
      return 'application/vnd.ms-powerpoint'
    case 'epub':
      return 'application/epub+zip'
    case 'csv':
      return 'text/csv'
    case 'json':
      return 'application/json'
    case 'html':
    case 'htm':
      return 'text/html'
    case 'md':
    case 'markdown':
      return 'text/markdown'
    case 'txt':
      return 'text/plain'
    case 'eml':
      return 'message/rfc822'
    case 'riv':
      return 'application/octet-stream'
    default:
      return 'application/octet-stream'
  }
}
