-- Denormalize the per-story `aura` slug (an aura.promad.design embed id, kept
-- in story frontmatter) into a column, mirroring how title/status/listed are
-- already denormalized from frontmatter on save. Footshorts's editorial feed
-- reads stories straight from this table and skips the markdown body in list
-- views, so the aura needs to live as a column to be available to cards.
--
-- Going forward, contentSource.writeMarkdown keeps this in sync on every save.
-- This migration adds the column and best-effort backfills existing rows by
-- extracting `aura:` from the leading frontmatter block.

alter table stories add column if not exists aura text;

-- Best-effort backfill from the frontmatter fence. Pulls the block between the
-- first pair of `---` lines, then the value of its `aura:` key (the capture
-- excludes surrounding quotes; btrim drops stray spaces). Rows without an aura
-- key are left null. Dollar-quoted regex strings ($re$...$re$) avoid quote
-- escaping. The write-sync path is authoritative once stories are next saved.
update stories
set aura = nullif(
  btrim((
    regexp_match(
      substring(markdown from $re$^---[\r\n]+(.*?)[\r\n]+---$re$),
      $re$aura:[ \t]*["']?([^"'\r\n]+)$re$
    )
  )[1]),
  ''
)
where aura is null
  and markdown like '---%';
