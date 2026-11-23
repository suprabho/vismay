import { redirect } from 'next/navigation'
import {
  ArrowRight,
  CheckCircle,
  PlugsConnected,
  Warning,
} from '@phosphor-icons/react/dist/ssr'
import { readMcpConsentRequest } from '@vismay/admin-core/mcpConsent'
import { isAuthed } from '@/lib/adminAuth'
import { createServerSupabase, isSupabaseConfigured } from '@/lib/supabaseServer'

/**
 * Consent page for the hosted Vismay MCP sign-in (packages/mcp/src/oauth.ts).
 *
 * An MCP client (Claude, Claude Code, Cursor) that connects to
 * vizmaya.fyi/api/mcp is sent here with a signed request
 * (@vismay/admin-core/mcpConsent) in the path; the path, not the query, so it
 * survives the login redirect, which keeps only the pathname. Allow posts to
 * /api/mcp/authorize, which signs an approval for exactly this request and
 * sends the browser back to vizmaya.fyi to finish. Framing is refused in
 * next.config.ts.
 */

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ request: string }>
}

const CAN_DO = [
  'Read story briefs and the randomizer pools',
  'Publish and update HTML stories on vizmaya.fyi, footshorts.com, vizf1.com, VizNBA and the travel site',
  'Host photos for those stories and generate AI illustrations (illustrations spend AI credits)',
  'Spin the story randomizers and save research',
]

/** Where the app really receives the sign-in: the origin for web and loopback URLs, scheme and host for a native app. */
function destination(uri: string): string {
  try {
    const u = new URL(uri)
    if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin
    return `${u.protocol}//${u.host}${u.pathname}`.slice(0, 120)
  } catch {
    return uri.slice(0, 120)
  }
}

async function signedInEmail(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null
  const supabase = await createServerSupabase()
  const { data } = await supabase.auth.getUser()
  return data.user?.email ?? null
}

export default async function McpAuthorizePage({ params }: Props) {
  const { request: token } = await params
  // The middleware only checks for a session; the admin allowlist is checked here.
  if (!(await isAuthed())) redirect(`/login?next=${encodeURIComponent(`/mcp/authorize/${token}`)}`)

  const request = readMcpConsentRequest(token)
  if (!request) {
    return (
      <main className="flex-1 overflow-y-auto flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6">
          <Warning size={28} weight="duotone" className="text-amber-300" aria-hidden />
          <h1 className="mt-3 text-lg font-semibold">This sign-in link has expired or isn’t valid</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Start connecting again from the app. A sign-in link lasts 15 minutes.
          </p>
        </div>
      </main>
    )
  }

  const email = await signedInEmail()
  const where = destination(request.redirectUri)

  return (
    <main className="flex-1 overflow-y-auto flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-neutral-900 p-6">
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <PlugsConnected size={20} weight="duotone" className="text-yellow-300" aria-hidden />
          Connect an app to the Vismay MCP
        </div>
        <h1 className="mt-3 text-xl font-semibold leading-snug">
          Allow <span className="text-yellow-300">{request.clientName}</span> to use the Vismay MCP?
        </h1>
        {email && <p className="mt-1 text-sm text-neutral-400">Signed in as {email}</p>}

        <section className="mt-5">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">It will be able to</h2>
          <ul className="mt-2 space-y-2">
            {CAN_DO.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-neutral-200">
                <CheckCircle size={18} weight="fill" className="mt-px shrink-0 text-emerald-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4">
          <h2 className="flex items-center gap-2 text-sm font-medium text-amber-200">
            <ArrowRight size={16} weight="bold" aria-hidden />
            The sign-in goes to
          </h2>
          <p className="mt-1 break-all font-mono text-sm text-neutral-100">{where}</p>
          <p className="mt-2 text-xs leading-relaxed text-neutral-400">
            The name above is the app’s own claim; this address is where the sign-in really goes. Only allow it if you
            just started connecting this app and the address fits it (claude.ai or claude.com for Claude, localhost for
            Claude Code).
          </p>
        </section>

        <form method="post" action="/api/mcp/authorize" className="mt-6 flex justify-end gap-3">
          <input type="hidden" name="request" value={token} />
          <button
            type="submit"
            name="decision"
            value="deny"
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-neutral-200 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="submit"
            name="decision"
            value="allow"
            className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-medium text-neutral-950 hover:bg-yellow-200"
          >
            Allow
          </button>
        </form>

        <p className="mt-5 text-xs leading-relaxed text-neutral-500">
          The app stays signed in for up to 90 days. To sign every app out, change MCP_TOKEN_GENERATION on the
          vizmaya-fyi project.
        </p>
      </div>
    </main>
  )
}
