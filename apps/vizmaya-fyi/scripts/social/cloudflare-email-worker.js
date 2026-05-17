/**
 * Cloudflare Email Worker — forwards inbound notification emails from
 * LinkedIn and X to the vizmaya-fyi /api/ingest/email endpoint.
 *
 * Deploy:
 *   1. Add a route in Cloudflare for a subdomain you control, e.g.
 *      social-ingest@in.promad.design. Cloudflare provisions MX records.
 *   2. `wrangler init` a Workers project, paste this file as `src/worker.js`.
 *      Set the worker name (e.g. `social-ingest`) and add two secrets:
 *        wrangler secret put INGEST_URL    # https://vizmaya.fyi/api/ingest/email
 *        wrangler secret put INGEST_SECRET # same value as SOCIAL_INGEST_SECRET in Vercel
 *   3. In the Cloudflare dashboard, point the email route at this Worker.
 *   4. Forward LinkedIn / X notification emails from your main inbox to
 *      social-ingest@<subdomain>. (Or change the LinkedIn/X notification
 *      address directly if you prefer.)
 *
 * Why this exists: Cloudflare Email Workers are free; their inbound
 * tier is generous; and they let the Vercel runtime stay platform-agnostic.
 * The Worker does no parsing — just streams the raw RFC822 bytes over to
 * /api/ingest/email with a shared-secret bearer header.
 */

export default {
  async email(message, env, ctx) {
    // message.raw is a ReadableStream of the full RFC822 email bytes.
    const reader = message.raw.getReader()
    const chunks = []
    let total = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      chunks.push(value)
      total += value.byteLength
      // Hard cap at 5 MB so a giant forwarded thread can't pin the Worker.
      if (total > 5 * 1024 * 1024) {
        await message.setReject('Email too large')
        return
      }
    }
    const buf = new Uint8Array(total)
    let offset = 0
    for (const c of chunks) {
      buf.set(c, offset)
      offset += c.byteLength
    }

    const res = await fetch(env.INGEST_URL, {
      method: 'POST',
      headers: {
        'authorization': `Bearer ${env.INGEST_SECRET}`,
        'content-type': 'message/rfc822',
        'x-mail-from': message.from ?? '',
        'x-mail-to': message.to ?? '',
      },
      body: buf,
    })

    // Surface non-2xx as a delivery error so Cloudflare retries.
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`ingest endpoint ${res.status}: ${body.slice(0, 300)}`)
    }
  },
}
