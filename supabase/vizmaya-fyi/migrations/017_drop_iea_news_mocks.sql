-- Drop the 8 mock seed rows inserted by migration 015.
-- Real news arrives from the Google News scraper (scripts/iea/scrape-news.ts)
-- and uses long Google redirect URLs, not the iea.org/news/mock-N shape,
-- so this pattern only matches the seeds.
delete from iea_news
where source_url like 'https://www.iea.org/news/mock-%';
