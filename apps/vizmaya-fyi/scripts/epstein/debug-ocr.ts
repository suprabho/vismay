import 'dotenv/config';
import { generateText, hasGatewayCredentials } from '@vismay/ai-gateway';

async function main() {
  const url = process.argv[2];
  if (!url) { console.error('usage: debug-ocr.ts <pdf-url>'); process.exit(1); }
  if (!hasGatewayCredentials()) { console.error('AI_GATEWAY_API_KEY not set'); process.exit(1); }

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

  // Same OCR path as ingest.ts: Claude Haiku reading the PDF natively.
  const { result, modelUsed } = await generateText({
    model: 'text.haiku',
    prompt: 'Transcribe every legible word from this document, top-to-bottom, left-to-right. Preserve paragraph breaks. Include hand-written notes, letterheads, and stamps when readable. Do not summarize, explain, or add commentary. If a page is blank or unreadable, output "[blank page]". Output raw text only.',
    files: [{ data: buffer.toString('base64'), mimeType: 'application/pdf' }],
    maxOutputTokens: 32_000,
  });
  console.log(`--- OCR OUTPUT (${modelUsed}) ---`);
  console.log(result || '(empty)');
  console.log('--- length:', result.length);
}
main().catch((e) => { console.error(e); process.exit(1); });
