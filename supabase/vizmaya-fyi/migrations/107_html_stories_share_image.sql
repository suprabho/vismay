-- A story's generated link-preview card (og:image / twitter:image).
--
-- Rendered by .github/workflows/render-html-story-og.yml
-- (packages/html-stories/scripts/generate-share-image.ts): a screenshot of the
-- story's first screen beside its title and description, in its own palette,
-- 1200×630, uploaded to the public story-assets bucket under
-- html-story-og/<slug>/. Publishing (the publish API and the admin editor)
-- queues it whenever the page, title, description or aura changed.
--
-- og_image_url stays the author's cover: the listing cards and the JSON-LD
-- image use it. The served page's og:image and twitter:image use the card
-- instead whenever there is one (packages/html-stories/src/seo.ts).
--
-- share_image_hash is the hash of what the card was made from, so an
-- unchanged re-post doesn't render it again.

alter table html_stories add column if not exists share_image_url text;
alter table html_stories add column if not exists share_image_hash text;
