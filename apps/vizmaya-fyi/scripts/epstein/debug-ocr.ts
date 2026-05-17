import 'dotenv/config';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('usage: debug-ocr.ts <pdf-url>'); process.exit(1); }

  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EpsteinVizBot/1.0; research purposes)',
      'Cookie': 'justiceGovAgeVerified=true',
    },
    redirect: 'follow',
  });
  if (!res.ok) { console.error(`HTTP ${res.status}`); process.exit(1); }
  const ab = await res.arrayBuffer();
  const buffer = Buffer.from(ab);
  console.log(`PDF size: ${buffer.byteLength} bytes`);

  const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const out = await genai.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: 'application/pdf', data: buffer.toString('base64') } },
          { text: 'Transcribe every legible word from this document, top-to-bottom, left-to-right. Preserve paragraph breaks. Include hand-written notes, letterheads, and stamps when readable. Do not summarize, explain, or add commentary. If a page is blank or unreadable, output "[blank page]". Output raw text only.' },
        ],
      },
    ],
  });
  console.log('--- OCR OUTPUT ---');
  console.log(out.text ?? '(empty)');
  console.log('--- length:', (out.text ?? '').length);
}
main().catch((e) => { console.error(e); process.exit(1); });
