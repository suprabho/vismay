-- Wallet Geography epic. Surfaces the off-chain geolocation signal described
-- in the Tracker PRD as a vizmaya story: per-country wallet-address counts
-- (choropleth), per-country breakdowns by IP type / platform / dataset, and
-- a daily observation calendar.
--
-- The underlying dataset on Tracker is gated to LEA customers; the numbers
-- rendered here on vizmaya.fyi are a synthesized real-shape mock anchored to
-- public reports (Chainalysis Geography of Cryptocurrency adoption ranking +
-- VPN-adoption percentages by country). All breakdown / observation data is
-- generated client-side from a deterministic seed in
-- lib/wallet-geo/data.ts — only the epic row and stories rail live in the DB.

insert into epics (slug, name, description, landing_component, status, app_slug)
  values (
    'wallet-geo',
    'Wallet Geography',
    'Off-chain geolocation signal for crypto wallets — country totals, IP type, platform, and observation patterns over time.',
    'wallet-geo-map',
    'published',
    'vizmaya-fyi'
  )
  on conflict (slug) do update set
    name              = excluded.name,
    description       = excluded.description,
    landing_component = excluded.landing_component,
    status            = excluded.status,
    app_slug          = excluded.app_slug,
    updated_at        = now();
