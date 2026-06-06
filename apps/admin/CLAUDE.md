# Claude context for apps/admin

## AI gateway integration

All text + image generation in admin routes through [@vismay/ai-gateway](../../packages/ai-gateway/README.md),
which wraps the Vercel AI Gateway. Do not import `@google/genai`, `@anthropic-ai/sdk`,
`openai`, or any provider SDK directly — add a model alias to
`packages/ai-gateway/src/models.ts` instead, then call `generateText` /
`generateImage` from the new alias.

**Env:**
- Local dev — `AI_GATEWAY_API_KEY` in `apps/admin/.env.local` (get the key from
  the Vercel dashboard → AI → API Keys).
- Vercel prod — leave the var unset; the runtime injects an OIDC token the SDK
  picks up automatically.

**Active features:**
- **Prompt-to-image** in the Assets tab (`✨ Generate` button) — see
  [components/vizmaya/GenerateImagePanel.tsx](components/vizmaya/GenerateImagePanel.tsx)
  and [app/api/vizmaya/stories/[slug]/assets/generate/route.ts](app/api/vizmaya/stories/[slug]/assets/generate/route.ts).
  Generated images land in the `story-assets` Supabase bucket the same as
  manual uploads, and every call writes a row to `ai_generations` (migration
  [043_ai_generations.sql](../../supabase/vizmaya-fyi/migrations/043_ai_generations.sql))
  for audit + future "Regenerate" affordances.

**Planned (not built yet):**
- Prompt-to-text in the markdown editor (same pattern, `kind: 'text'` in the
  audit table).
- Resolver step that turns YAML `prompt:` fields into cached generations at
  build time.
