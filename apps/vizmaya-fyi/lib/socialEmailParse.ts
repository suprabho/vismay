/**
 * Parse a raw notification email from LinkedIn or X into a NormalizedEvent.
 *
 * LinkedIn's and X's web APIs are locked down or paid, so we route their
 * native notification emails through Claude (Haiku, via the AI Gateway) for
 * extraction. mailparser pulls out subject + text/html body; Haiku turns the
 * body into a structured event.
 *
 * Why an LLM and not regex: their email templates change often. An LLM
 * with a strict zod schema is more durable than a regex per template
 * version. We log parse failures so a misfire is recoverable.
 *
 * The event `type` enum stays inside the same Haiku call rather than going
 * to Jev: it falls straight out of reading the email (who did what to which
 * post), so splitting it into a separate decide() round trip would double the
 * latency of a live route for no gain. Platform is decided by the From:
 * header below, not by a model.
 */

import { type ParsedMail, simpleParser } from 'mailparser'
import { z } from 'zod'
import { generateText } from '@vismay/ai-gateway'
import type { NormalizedEvent, Platform } from '@vismay/content-source/socialEngagement'

export interface ParsedEmail {
  /** Detected platform from the From: header, or null if neither. */
  platform: Platform | null
  /** Stable id for dedupe — Message-ID if present, else hashed body. */
  messageId: string
  subject: string
  from: string
  receivedAt: string
  bodyText: string
}

/**
 * Inspect raw RFC822 email bytes and pull out the fields we hand to the
 * LLM. Doesn't decide if the email is worth ingesting — that's the
 * platform detection step.
 */
export async function parseRawEmail(raw: string | Buffer): Promise<ParsedEmail> {
  const m: ParsedMail = await simpleParser(raw)
  const fromAddr = m.from?.value?.[0]?.address ?? m.from?.text ?? ''
  const platform = detectPlatform(fromAddr, m.subject ?? '')
  const messageId =
    m.messageId?.replace(/^<|>$/g, '') ??
    `noid-${await sha256(`${fromAddr}|${m.subject ?? ''}|${m.date?.toISOString() ?? ''}`)}`
  return {
    platform,
    messageId,
    subject: m.subject ?? '',
    from: fromAddr,
    receivedAt: m.date?.toISOString() ?? new Date().toISOString(),
    bodyText: (m.text ?? stripHtml(m.html || '')).trim(),
  }
}

function detectPlatform(from: string, subject: string): Platform | null {
  const f = from.toLowerCase()
  const s = subject.toLowerCase()
  if (f.includes('linkedin.com') || s.includes('linkedin')) return 'linkedin'
  if (
    f.endsWith('@x.com') ||
    f.endsWith('@twitter.com') ||
    f.includes('postmaster@x.com') ||
    f.includes('info@x.com') ||
    s.includes(' on x ') ||
    s.startsWith('new on x')
  ) {
    return 'x'
  }
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function sha256(s: string): Promise<string> {
  const enc = new TextEncoder().encode(s)
  const buf = await crypto.subtle.digest('SHA-256', enc)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

const SYSTEM_PROMPT = `You extract engagement signals from social-network notification emails (LinkedIn or X).

Given the email body, fill in these fields:

- type: "mention" | "reply" | "comment" | "dm"
- author_handle: the person whose action triggered this email, e.g. @jane or Jane Doe
- content: verbatim text of their reply/comment/mention/DM
- parent_content: verbatim snippet of MY post they engaged with, if quoted in the email, else null
- source_url: the deep link to view this on the platform, usually under a 'View' or 'Reply' button

Rules:
- If a field can't be determined, use null.
- author_handle is the OTHER person, never me.
- For reactions/likes/follows with no text, use type:"mention" and content:null.
- source_url must be an https URL, not a tracking redirect summary like "Click here".`

const ExtractSchema = z.object({
  type: z.enum(['mention', 'reply', 'comment', 'dm']),
  author_handle: z.string().nullable(),
  content: z.string().nullable(),
  parent_content: z.string().nullable(),
  source_url: z.string().nullable(),
})

export type LlmExtract = z.infer<typeof ExtractSchema>

/**
 * Text extraction on the light Claude tier. The gateway client reads
 * AI_GATEWAY_API_KEY (or Vercel's OIDC token) itself; a missing credential
 * surfaces as a thrown error the route turns into a 500.
 */
export async function extractWithLlm(email: ParsedEmail): Promise<LlmExtract> {
  const userText = `Platform: ${email.platform}
Subject: ${email.subject}
From: ${email.from}

Body:
${email.bodyText.slice(0, 8000)}`
  const { result } = await generateText({
    model: 'text.haiku',
    system: SYSTEM_PROMPT,
    prompt: userText,
    schema: ExtractSchema,
    temperature: 0,
    metadata: { feature: 'social-email-ingest' },
  })
  return result
}

/**
 * End-to-end: raw email → NormalizedEvent ready for upsertEvents().
 * Returns null if we can't tell which platform the email is from
 * (so the caller can log + skip without inserting garbage).
 */
export async function emailToEvent(raw: string | Buffer): Promise<NormalizedEvent | null> {
  const email = await parseRawEmail(raw)
  if (!email.platform) return null
  const llm = await extractWithLlm(email)
  return {
    platform: email.platform,
    external_id: email.messageId,
    type: llm.type,
    source_url: llm.source_url,
    author_handle: llm.author_handle,
    author_metadata: null,
    content: llm.content,
    created_at: email.receivedAt,
    parent_external_id: null,
    parent_url: null,
    parent_content: llm.parent_content,
  }
}
