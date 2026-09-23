import type { EditionChartSkip, EditionCharts } from '@vismay/content-source/dcEditionTypes'

/**
 * The sample edition's planned charts. Generated from the fixture stories by
 * `pnpm ai-data-centers:sample-charts` (scripts/ai-data-centers/sample-charts.ts),
 * which runs the real planner + renderer against fixture.ts and writes this
 * file; empty means the sample draws its templates.
 *
 * Model: anthropic/claude-opus-4.8 · 2026-09-22
 */
export const SAMPLE_CHARTS: EditionCharts = {
  "energy": {
    "section": "energy",
    "title": "Power committed today, by project",
    "caption": "Site- and campus-scale power deals announced today, in MW; the 200 GW ERCOT queue and national IEA figures are left out as market-scale outliers.",
    "spec": {
      "chartType": "Bar Chart",
      "columns": [
        {
          "name": "Project",
          "semanticType": "Name"
        },
        {
          "name": "Power (MW)",
          "semanticType": "Quantity"
        }
      ],
      "rows": [
        [
          "Microsoft Ohio nuclear PPA",
          2500
        ],
        [
          "Oracle Abilene gas-plus-storage",
          1200
        ],
        [
          "Reliance Jamnagar campus",
          1000
        ],
        [
          "Abu Dhabi solar-plus-storage",
          900
        ]
      ],
      "encodings": {
        "x": "Project",
        "y": [
          "Power (MW)"
        ]
      }
    },
    "sources": [
      {
        "name": "Reuters",
        "url": "https://www.reuters.com"
      },
      {
        "name": "Bloomberg",
        "url": "https://www.bloomberg.com"
      },
      {
        "name": "Economic Times",
        "url": "https://economictimes.indiatimes.com"
      },
      {
        "name": "The National",
        "url": "https://www.thenationalnews.com"
      }
    ],
    "storyIds": [
      1,
      2,
      22,
      23
    ],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 800 340\">\n<path d=\"M161.5 24L161.5 314\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M284.5 24L284.5 314\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M408.5 24L408.5 314\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M532.5 24L532.5 314\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M656.5 24L656.5 314\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M780.5 24L780.5 314\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M161.5 24L161.5 314\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-energy-cls-0\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(788 314)\" fill=\"#5f6b76\">Power (MW)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(152.76 60.25)\" fill=\"#8b98a5\">Microsoft Ohio nuclear PPA</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(152.76 132.75)\" fill=\"#8b98a5\">Oracle Abilene gas-plus-sto...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(152.76 205.25)\" fill=\"#8b98a5\">Reliance Jamnagar campus</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(152.76 277.75)\" fill=\"#8b98a5\">Abu Dhabi solar-plus-storage</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(160.76 322)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(284.608 322)\" fill=\"#5f6b76\">500</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(408.456 322)\" fill=\"#5f6b76\">1,000</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(532.304 322)\" fill=\"#5f6b76\">1,500</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(656.152 322)\" fill=\"#5f6b76\">2,000</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(780 322)\" fill=\"#5f6b76\">2,500</text>\n<path d=\"M162.8 51.3L778 51.3A2 2 0 0 1 780 53.3L780 67.3A2 2 0 0 1 778 69.3L162.8 69.3A2 2 0 0 1 160.8 67.3L160.8 53.3A2 2 0 0 1 162.8 51.3\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M162.8 123.8L456 123.8A2 2 0 0 1 458 125.8L458 139.8A2 2 0 0 1 456 141.8L162.8 141.8A2 2 0 0 1 160.8 139.8L160.8 125.8A2 2 0 0 1 162.8 123.8\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M162.8 196.3L406.5 196.3A2 2 0 0 1 408.5 198.3L408.5 212.3A2 2 0 0 1 406.5 214.3L162.8 214.3A2 2 0 0 1 160.8 212.3L160.8 198.3A2 2 0 0 1 162.8 196.3\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M162.8 268.8L381.7 268.8A2 2 0 0 1 383.7 270.8L383.7 284.8A2 2 0 0 1 381.7 286.8L162.8 286.8A2 2 0 0 1 160.8 284.8L160.8 270.8A2 2 0 0 1 162.8 268.8\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(785 60.25)\" fill=\"#dbe7f0\">2500</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(462.9952 132.75)\" fill=\"#dbe7f0\">1200</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(413.456 205.25)\" fill=\"#dbe7f0\">1000</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(388.6864 277.75)\" fill=\"#dbe7f0\">900</text>\n</svg>",
    "width": 800,
    "height": 340,
    "model": "anthropic/claude-opus-4.8",
    "generatedAt": "2026-09-22T18:24:44.163Z"
  }
}

export const SAMPLE_CHART_SKIPS: EditionChartSkip[] = [
  {
    "section": "equip",
    "reason": "no story states a figure"
  },
  {
    "section": "dc",
    "reason": "Only three site-scale power figures compare, and CoreWeave's 250 MW against Oracle's 1,200 MW plus the 200 GW ERCOT queue breaks the readable-scale rule; remaining figures are different kinds."
  },
  {
    "section": "hyper",
    "reason": "Only two committed power figures (Microsoft 2,500 MW, Abu Dhabi 900 MW); the rest are counts and horizons of different kinds."
  },
  {
    "section": "semi",
    "reason": "Three figures but different kinds — a multiple, a count and a percentage — with no common scale."
  }
]
