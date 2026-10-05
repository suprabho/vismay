-- Aura backgrounds for HTML stories.
--
-- An aura scene (aura.promad.design, by slug) is picked for a story after its
-- HTML is written, in the admin editor or as `aura` on the publish API / MCP
-- tool. It isn't part of the document: the /s/<slug> route lays it behind the
-- page when serving it (packages/html-stories/src/branding.ts) and the home
-- grid / archive card shows it as the card background, the way a viz-engine
-- story's frontmatter `aura` does. Null means no aura (the card keeps its
-- og:image thumbnail).

alter table html_stories add column if not exists aura text;
