import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data } = await s
    .from('epstein_documents')
    .select('source_url, raw_text')
    .limit(10000);

  const tiny = (data ?? []).filter((d: any) => (d.raw_text?.length ?? 0) < 200);
  // Sample 5 evenly across the list
  const stride = Math.floor(tiny.length / 5);
  const sample = [0, 1, 2, 3, 4].map((i) => tiny[i * stride]).filter(Boolean);

  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

  for (const doc of sample as any[]) {
    console.log(`\n=== ${doc.source_url} ===`);
    try {
      const res = await fetch(doc.source_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EpsteinVizBot/1.0; research purposes)',
          'Cookie': 'justiceGovAgeVerified=true',
        },
        redirect: 'follow',
      });
      const buffer = Buffer.from(await res.arrayBuffer());
      console.log(`  PDF size: ${buffer.byteLength} bytes`);
      const out = await genai.models.generateContent({
        model: 'gemini-2.0-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
              { text: 'Transcribe every legible word from this document, top-to-bottom, left-to-right. Preserve paragraph breaks. Include hand-written notes, letterheads, and stamps when readable. If a page is blank or unreadable, output "[blank page]". Output raw text only.' },
            ],
          },
        ],
      });
      const text = (out.text ?? '').trim();
      console.log(`  OCR len: ${text.length}`);
      console.log(`  Preview: ${text.slice(0, 300).replace(/\n/g, ' | ')}`);
      // 5s pacing to avoid rate limit
      await new Promise((r) => setTimeout(r, 5000));
    } catch (e) {
      console.log(`  ERROR: ${(e as Error).message}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
