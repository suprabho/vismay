/**
 * Parse a raw notification email from LinkedIn or X into a NormalizedEvent.
 *
 * LinkedIn's and X's web APIs are locked down or paid, so we route their
 * native notification emails through Gemini for extraction. mailparser
 * pulls out subject + text/html body; Gemini turns the body into a
 * structured event.
 *
 * Why Gemini and not regex: their email templates change often. An LLM
 * with a strict JSON schema prompt is more durable than a regex per
 * template version. We log parse failures so a misfire is recoverable.
 */

import { type ParsedMail, simpleParser } from 'mailparser'
import { GoogleGenAI } from '@google/genai'
import type { NormalizedEvent, Platform } from './socialEngagement'

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

Given the email body, return a single JSON object with these fields:

{
  "type": "mention" | "reply" | "comment" | "dm",
  "author_handle": "the person whose action triggered this email, e.g. @jane or Jane Doe",
  "content": "verbatim text of their reply/comment/mention/DM",
  "parent_content": "verbatim snippet of MY post they engaged with, if quoted in the email, else null",
  "source_url": "the deep link to view this on the platform, usually under a 'View' or 'Reply' button"
}

Rules:
- Return ONLY the JSON object, no markdown fences, no commentary.
- If a field can't be determined, use null.
- author_handle is the OTHER person, never me.
- For reactions/likes/follows with no text, use type:"mention" and content:null.
- source_url must be an https URL, not a tracking redirect summary like "Click here".`

export interface LlmExtract {
  type: 'mention' | 'reply' | 'comment' | 'dm'
  author_handle: string | null
  content: string | null
  parent_content: string | null
  source_url: string | null
}

export async function extractWithGemini(
  email: ParsedEmail,
  apiKey: string = process.env.GEMINI_API_KEY ?? ''
): Promise<LlmExtract> {
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')
  const genai = new GoogleGenAI({ apiKey })
  const userText = `Platform: ${email.platform}
Subject: ${email.subject}
From: ${email.from}

Body:
${email.bodyText.slice(0, 8000)}`
  const response = await genai.models.generateContent({
    model: 'gemma-4-26b-a4b-it',
    contents: `${SYSTEM_PROMPT}\n\n${userText}`,
  })
  const text = response.text ?? ''
  // Same idiom as scripts/energy-profile/scrape-news.ts — Gemma doesn't
  // honour responseSchema, so scrape the first JSON object.
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) {
    throw new Error(`LLM returned no JSON: ${text.slice(0, 200)}`)
  }
  const parsed = JSON.parse(match[0]) as Partial<LlmExtract>
  return {
    type: (parsed.type as LlmExtract['type']) ?? 'mention',
    author_handle: parsed.author_handle ?? null,
    content: parsed.content ?? null,
    parent_content: parsed.parent_content ?? null,
    source_url: parsed.source_url ?? null,
  }
}

/**
 * End-to-end: raw email → NormalizedEvent ready for upsertEvents().
 * Returns null if we can't tell which platform the email is from
 * (so the caller can log + skip without inserting garbage).
 */
export async function emailToEvent(raw: string | Buffer): Promise<NormalizedEvent | null> {
  const email = await parseRawEmail(raw)
  if (!email.platform) return null
  const llm = await extractWithGemini(email)
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
