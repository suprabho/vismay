-- A story's category: the one subject area it is filed under, which is how
-- the vizmaya.fyi home page groups stories into sections.
--
-- Picked at publish (`category` on the publish API and the MCP tool) or in
-- the admin editor, and kept beside the document like the aura, never in it.
-- The ids are validated in code (packages/html-stories/src/categories.ts):
-- economy, ai-tech, politics, science, history, society. No check constraint,
-- so the list can change without a migration; a value the code does not know
-- reads as no category.
--
-- The backfill below files the vizmaya stories published as of 2026-11-15,
-- classified from their titles and descriptions. It only fills stories with
-- no category, so it never overrides one set by hand, and a slug that no
-- longer exists is skipped. Change any of them in the admin editor.

alter table html_stories add column if not exists category text;

create index if not exists idx_html_stories_category
  on html_stories(app_slug, category) where category is not null;

update html_stories set category = 'economy'
 where app_slug = 'vizmaya-fyi' and category is null and slug in (
  'brazil-s-stock-market-lost-18-after-betting-on-a-coin-flip',
  'nvidia-s-490b-drop-and-a-7-5b-chip-question',
  'hsbc-swiss-leaks-how-a-100bn-secret-got-out',
  'philipp-v-barclays-why-700-000-in-scam-payments-stays-lost',
  'abraaj-group-the-cash-that-was-only-there-on-check-day',
  'milton-friedman-s-nobel-money-matters-and-is-hard-to-aim',
  'can-digital-twins-judge-job-training-tested-on-37-trials',
  'roger-myerson-s-nobel-which-book-got-the-gold-star',
  'dubai-clothing-retail-why-mall-sales-fell-13-in-2026',
  'minimum-wage-and-skills-poverty-trap-or-gentle-hill',
  'owning-your-supplier-does-not-end-the-haggling',
  'uk-open-banking-70-data-calls-for-every-payment',
  'what-y-combinator-funded-in-2026-fewer-apps-more-atoms',
  'buy-now-pay-later-who-pays-when-money-runs-short',
  'auction-113-verizon-paid-88-5-a-loan-took-3-3b-of-3-57b',
  'steel-dynamics-aluminum-mill-the-breakeven-claim',
  'jio-ipo-debt-0-36x-on-the-front-page-1-73x-in-the-notes',
  'project-vault-s-first-copper-12-of-one-congo-promise',
  'copper-market-why-a-surplus-still-feels-like-a-shortage',
  'do-better-us-businesses-cost-more-mostly-priced-in',
  'new-york-taxes-empty-second-homes-not-rented-ones',
  'china-s-offshore-trust-tax-rule-explained-from-scratch',
  'tcs-outside-consultant-bill-up-48-in-six-quarters',
  'hormuz-and-the-family-offices-who-moved-their-money',
  'what-founders-do-with-their-money-after-they-sell',
  'arctic-lng-2-nobody-agrees-how-much-gas-it-ships',
  'prediction-markets-who-decides-if-a-sports-bet-is-a-bet',
  'rooftop-solar-who-pays-when-the-subsidy-ends',
  'coffee-prices-the-small-door-that-sets-the-benchmark',
  'evergreen-funds-who-decides-if-you-can-cash-out',
  'haleu-fuel-the-choke-point-behind-a-new-canadian-smr',
  'firmus-asx-ipo-withdrawal-what-the-public-never-saw',
  'budget-airlines-what-gets-cut-when-fuel-costs-jump',
  'does-timing-really-decide-which-startups-win',
  'private-credit-s-headline-stress-number-is-about-half-the-picture',
  'founders-blame-the-money-the-research-blames-something-else',
  'a-ship-tax-that-lasted-27-days',
  'grid-batteries-owners-pay-for-oversupply-households-pay-for-scarcity',
  'the-regulator-that-wants-gpu-futures-just-froze-them',
  'it-was-already-in-the-filings-what-the-court-record-said-about-satellite-interne',
  'who-owns-the-ship-now-decides-what-it-pays'
);

update html_stories set category = 'ai-tech'
 where app_slug = 'vizmaya-fyi' and category is null and slug in (
  'robotaxis-tesla-s-2m-miles-vs-waymo-s-4m-a-week',
  'swarmevolve-how-small-ai-swarms-out-search-big-models',
  'timearch-why-ai-built-software-needs-a-paper-trail',
  'plain-ai-science-summaries-more-understood-less-smart',
  'ai-simplified-science-readers-learn-more-trust-is-mixed',
  'will-androids-outnumber-humans-the-2050-and-2100-math',
  'airoa-0-a-robot-taught-by-16-151-hours-of-human-hands',
  'depthgraft-reusing-memory-made-an-ai-model-score-higher',
  'why-ai-forgets-vizmaya',
  'gpu-utilization-what-the-busy-number-really-means',
  'specopd-how-ai-guessers-learn-from-their-own-mistakes',
  'ai-trip-planning-10-right-alone-100-valid-with-rules',
  'specpilot-how-an-ai-loop-sped-up-llm-decoding-2-13x',
  'cua-master-a-small-ai-a-terminal-and-a-6-6-to-43-9-jump',
  'perceptrl-why-an-ai-magnifying-glass-missed-and-the-fix',
  'tsinghua-preprint-teaching-vision-ai-where-to-look',
  'pdscope-why-home-ai-reads-fast-but-writes-slow',
  'rimuru-the-gpu-memory-wall-that-capped-ai-chats-at-34',
  'diffusion-ai-agents-waste-compute-after-tool-calls',
  'apple-synthapi-why-ai-agents-learn-from-variety',
  'ai-buildout-news-skips-a-quarter-of-the-world-economy',
  'evolving-agent-teams-how-ai-coders-get-unstuck',
  'how-ai-search-learns-from-its-own-wrong-turns',
  'karma-the-ad-ai-that-improved-without-retraining',
  'phone-ai-memory-why-flash-is-1-333x-too-slow',
  'speculative-decoding-energy-when-the-speed-trick-backfires',
  'google-s-finland-data-centres-forest-cut-wolves-hyped',
  'would-ai-have-told-alexander-graham-bell-no',
  'entry-level-jobs-and-ai-one-lab-s-numbers-vs-the-market',
  'your-ai-agent-bought-the-wrong-thing-guess-who-gets-the-box',
  'the-biggest-seller-of-ai-memory-lost-8-points-of-share-in-a-quarter-its-sales-ro'
);

update html_stories set category = 'politics'
 where app_slug = 'vizmaya-fyi' and category is null and slug in (
  'us-midterms-2026-democrats-win-the-house-and-senate',
  'brazil-election-2026-how-lula-overturned-a-first-round-loss',
  'sweden-s-locked-riksdag-176-seats-zero-governments',
  'israel-s-2026-knesset-election-the-53-48-19-deadlock',
  'us-federal-it-a-75-7b-ask-and-a-dark-scoreboard',
  'us-munitions-noncompetitive-missile-deal-meets-a-new-rule',
  'a-sacred-city-a-different-ballot',
  'the-asymmetric-penalty-of-drone-warfare'
);

update html_stories set category = 'science'
 where app_slug = 'vizmaya-fyi' and category is null and slug in (
  'the-quantum-internet-s-waiting-problem',
  'why-martin-karplus-won',
  'fish-farm-feed-efficiency-what-breeding-actually-delivered',
  'how-do-you-watch-a-tricky-dance',
  'vector-balancing-in-polynomial-time-8272-beaten-by-99',
  'pendulum-chain-turbulence-20-rods-no-water',
  '24-boo-b-the-planet-that-survived-its-star-s-swelling',
  'ashoke-sen-s-work-dualities-branes-and-black-holes',
  'did-an-asteroid-kill-the-dinosaurs-the-evidence',
  'rias-how-rising-seas-drowned-river-valleys',
  'moondust-smells-like-gunpowder-and-nobody-knows-why',
  'finland-s-land-from-carbon-sink-to-carbon-source',
  'how-a-pond-alga-gave-us-a-light-switch-for-the-brain'
);

update html_stories set category = 'history'
 where app_slug = 'vizmaya-fyi' and category is null and slug in (
  'regalianus-the-emperor-who-stamped-his-face-on-old-coins',
  'romila-thapar-s-asoka-a-verified-number-not-a-count',
  'aristotle-ranks-13-and-needed-a-lot-of-explaining',
  'ten-strange-facts-to-tell-a-friend',
  'roman-gladiators-did-they-really-fight-to-the-death',
  'tutankhamun-s-curse-how-the-newspapers-invented-it',
  'patrick-stewart-how-a-yorkshire-boy-became-captain-picard',
  'new-deal-and-the-great-depression-did-it-slow-recovery',
  'francis-bacon-for-kids-why-keep-the-boat-that-sinks',
  'charlemagne-s-empire-how-it-was-built-and-why-it-broke',
  'nigeria-s-board-game-craze-why-nigerians-rule-scrabble',
  'great-sphinx-of-giza-who-really-broke-its-nose',
  'lincoln-s-war-aims-from-saving-the-union-to-ending-slavery',
  'vasco-da-gama-didn-t-kill-the-spice-road-he-undercut-it',
  'vizmaya-s-first-100-stories-the-map-the-lens-the-sentence',
  'aboriginal-craft-in-australia-five-sites-one-dating-fight',
  'portobelo-the-silver-port-built-beside-black-rebels',
  'mokha-s-coffee-saint-a-tomb-in-a-port-with-no-coffee',
  'chitrakoot-one-ramayana-hill-counted-twice-by-india',
  'austria-488-ad-the-romans-who-did-not-leave',
  'tuonela-the-kalevala-s-land-of-the-dead-what-is-there',
  'kanesh-turkiye-the-first-writing-was-letters-home',
  'montenegro-s-roman-capital-got-a-railway-the-sea-got-the-visitors',
  'thousands-of-people-once-lived-on-palau-s-rock-islands-nobody-agrees-when-they-l',
  'vizmaya-studio',
  'peru-imported-100-000-chinese-workers-its-census-left-them-no-box',
  'the-poem-never-says-bodh-gaya',
  'timbers-tied-to-the-1288-battle-date-to-566-bce-a-2026-paper-says',
  'cumae-s-own-park-says-the-sibyl-s-cave-can-t-be-virgil-s',
  'indraprastha-the-asi-says-identified-its-own-paper-says-possible',
  'married-out-married-in-how-marriage-and-men-s-votes-decided-who-counted-as-a-lie',
  'ithaki-s-ancient-claim-to-odysseus',
  'iceland-let-its-first-national-day-go-shop-clerks-islanders-and-emigrants-kept-i'
);

update html_stories set category = 'society'
 where app_slug = 'vizmaya-fyi' and category is null and slug in (
  'martha-nussbaum-on-how-institutions-shape-intimate-life',
  'facebook-s-rollout-points-to-mental-health-harm',
  'school-phone-bans-and-gcse-scores-who-actually-gained',
  'teen-social-media-checking-and-the-brain-which-came-first',
  'finance-apps-and-life-satisfaction-in-south-korea',
  'american-geography-literacy-why-the-nile-seems-to-flow-up',
  'work-kills-more-people-than-war-the-numbers-job-by-job',
  'why-europeans-close-shop-in-august',
  'heat-deaths-the-us-disaster-list-leaves-out',
  'goals-vs-systems-why-long-game-winners-build-habits',
  'the-skill-that-gets-paid',
  'the-tariff-skips-the-cheap-pills-the-shortages-don-t'
);
