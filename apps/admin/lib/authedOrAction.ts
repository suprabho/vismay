import { isAuthed } from '@/lib/adminAuth'
import {
  verifyActionToken,
  ACTION_TOKEN_HEADER,
} from '@vismay/admin-core/actionToken'

/**
 * Gate a mutating API route. Returns true if the request carries either:
 *   - a valid admin session cookie (same-origin admin UI), or
 *   - a valid `x-action-token` header with matching scope + subject
 *     (cross-TLD editor running on a consumer domain).
 *
 * Two-path auth in one helper so route handlers stay short:
 *
 *   if (!(await authedOrAction(req, 'edit-story-map', slug))) {
 *     return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
 *   }
 *
 * Scope is the action this endpoint represents; subject is whatever resource
 * the action operates on (story slug today, possibly a richer identity later
 * when admin becomes multi-user). The token is minted on the page that hosts
 * the editor via `signActionToken({ scope, subject })`. See docs/auth.md.
 */
export async function authedOrAction(
  req: Request,
  scope: string,
  subject: string
): Promise<boolean> {
  if (await isAuthed()) return true
  const token = req.headers.get(ACTION_TOKEN_HEADER)
  return verifyActionToken(token, { scope, subject })
}
