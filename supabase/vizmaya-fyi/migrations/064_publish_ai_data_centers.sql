-- Publish the AI Data Centers epic. Migration 063 seeded it as draft + hidden
-- while the data was loaded and the explorer verified; the dc_facilities /
-- dc_facility_timeline tables are now populated from Epoch AI (67 facilities,
-- ~1,100 timeline rows) so the /ai-data-centers landing has real data.
--
-- Flipping status → 'published' makes getEpic('ai-data-centers') return the
-- row (enabling the SEO block + JSON-LD on the landing) and show_on_home →
-- true surfaces it on the home grid via listPublishedEpics.

update epics
  set status = 'published',
      show_on_home = true,
      updated_at = now()
  where slug = 'ai-data-centers';
