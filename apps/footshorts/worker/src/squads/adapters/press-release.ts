/**
 * Press-release adapter. Fetches a federation announcement URL (HTML), strips
 * boilerplate, and hands the visible body text to Gemini for structured
 * extraction.
 *
 * PDF press releases aren't handled here — the worker would need pdf-parse
 * which is heavy. For PDFs, paste the extracted text via the `manual` adapter.
 */

import * as cheerio from 'cheerio';
import { RawSquadEntry } from '../types';
import { extractSquadFromText } from './gemini-extract';

export async function fetchSquadFromPressRelease(url: string): Promise<RawSquadEntry[]> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Footshorts/1.0 (squads ingest; hello@promad.design)' },
  });
  if (!res.ok) {
    throw new Error(`Press-release fetch ${res.status}: ${res.statusText} (${url})`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/pdf')) {
    throw new Error(
      `URL returned a PDF (${url}). PDFs aren't supported by the press-release ` +
      `adapter — extract the text manually and use --source=manual instead.`
    );
  }

  const html = await res.text();
  const $ = cheerio.load(html);
  $('script, style, nav, header, footer, noscript').remove();
  // Prefer <article>/<main> if present so we discard chrome.
  const root = $('article').length ? $('article') : $('main').length ? $('main') : $('body');
  const text = root.text().replace(/\s+/g, ' ').trim();

  if (text.length < 200) {
    throw new Error(`Press-release page contained <200 chars of text. Bad URL or JS-rendered page?`);
  }

  return extractSquadFromText(text);
}
