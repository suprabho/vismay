-- Drop the Canva Connect bridge tables created in 024_canva.sql.
--
-- The Canva integration (admin "Send to Canva" button + bootstrap flow) has
-- been removed from the app. These tables hold no data referenced anywhere
-- else, so they can be dropped outright.

drop table if exists canva_designs;
drop table if exists canva_tokens;
