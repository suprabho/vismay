import { GoogleGenAI } from '@google/genai';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface ContentBlock {
  type: 'paragraph' | 'heading' | 'quote' | 'stat' | 'graph_embed';
  text?: string;
  meta?: Record<string, unknown>;
}

// Fallback: generate story content via Gemini when AI worker is not available
export async function generateStoryDraft(
  title: string,
  context: string,
  category: string,
): Promise<ContentBlock[]> {
  const apiKey = env.GEMINI_API_KEY;

  // If no API key, return placeholder blocks
  if (!apiKey) {
    logger.warn('GEMINI_API_KEY not set — returning placeholder story blocks');
    return [
      { type: 'heading', text: title },
      { type: 'paragraph', text: `[AI generation unavailable — set GEMINI_API_KEY in Backend/.env]\n\nContext: ${context}` },
      { type: 'paragraph', text: 'Edit this paragraph with your story content.' },
    ];
  }

  const ai = new GoogleGenAI({ apiKey });

  const prompt = `You are a premium motorsport journalist writing for Apex, an F1 intelligence platform.

Write a compelling story for the category "${category}" with the title: "${title}".
Topic/context: ${context}

Requirements:
- 500–800 words total
- Start with an immediate, high-intensity lead (no background-setting first sentence)
- Every factual claim must cite a specific lap, corner, or metric
- Tone: clinical precision combined with narrative tension — think The Race or Autosport long-form
- No clichés

Output ONLY a JSON array of content blocks. No markdown, no explanation. Schema:
[
  { "type": "heading", "text": "..." },
  { "type": "paragraph", "text": "..." },
  { "type": "quote", "text": "..." },
  { "type": "stat", "text": "label", "meta": { "value": "..." } },
  { "type": "paragraph", "text": "..." }
]

Use 1 heading, 3-5 paragraphs, optionally 1 quote block and 1 stat block.
Return ONLY the JSON array.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });

    const raw = response.text ?? '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in Gemini response');

    const blocks = JSON.parse(jsonMatch[0]) as ContentBlock[];
    return blocks;
  } catch (err) {
    logger.error('Gemini story generation failed', err);
    return [
      { type: 'heading', text: title },
      { type: 'paragraph', text: `[AI generation failed — edit this paragraph]\n\nContext: ${context}` },
      { type: 'paragraph', text: 'Add your story content here.' },
    ];
  }
}

// Ollama fallback for local testing
export async function generateStoryDraftOllama(
  title: string,
  context: string,
  category: string,
  model = 'llama3',
): Promise<ContentBlock[]> {
  const ollamaUrl = env.OLLAMA_BASE_URL;

  const prompt = `You are a motorsport journalist. Write a story for category "${category}", title: "${title}". Context: ${context}.

Output ONLY a JSON array of content blocks:
[{"type":"heading","text":"..."},{"type":"paragraph","text":"..."},{"type":"paragraph","text":"..."},{"type":"paragraph","text":"..."}]

Return ONLY the JSON array, no other text.`;

  try {
    const res = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false }),
    });

    if (!res.ok) throw new Error(`Ollama error ${res.status}`);
    const data = await res.json() as { response: string };
    const jsonMatch = data.response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON in Ollama response');

    return JSON.parse(jsonMatch[0]) as ContentBlock[];
  } catch (err) {
    logger.error('Ollama story generation failed', err);
    return [
      { type: 'heading', text: title },
      { type: 'paragraph', text: `[Ollama generation failed — edit this]\n\nContext: ${context}` },
    ];
  }
}
