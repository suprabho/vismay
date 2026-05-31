import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT:                  z.string().default('4000'),
  NODE_ENV:              z.enum(['development', 'test', 'production']).default('development'),
  FRONTEND_URL:          z.string().url(),
  MONGODB_URI:           z.string().min(1),
  FIREBASE_PROJECT_ID:   z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY:  z.string().min(1),
  AI_WORKER_URL:         z.string().url().default('http://localhost:8000'),
  AI_WORKER_SECRET:      z.string().default('dev-secret'),
  GEMINI_API_KEY:        z.string().optional(),
  OLLAMA_BASE_URL:       z.string().url().default('http://localhost:11434'),
  LLM_PROVIDER:         z.enum(['gemini', 'ollama', 'none']).default('none'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
