import type { EditionChartSkip, EditionCharts } from '@vismay/content-source/dcEditionTypes'

/**
 * The sample edition's planned charts. Generated from the fixture stories by
 * `pnpm ai-data-centers:sample-charts` (scripts/ai-data-centers/sample-charts.ts),
 * which runs the real planner + renderer against fixture.ts and writes this
 * file; empty means the sample draws its templates.
 *
 * Model: anthropic/claude-opus-4.8 · 2026-09-23
 */
export const SAMPLE_CHARTS: EditionCharts = {
  "energy": {
    "section": "energy",
    "title": "Power committed per AI site today",
    "caption": "Site-scale power figures for four projects announced today; the 200 GW ERCOT queue is left out as a market-wide total that would dwarf every bar.",
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
    "rung": 1,
    "model": "anthropic/claude-opus-4.8",
    "generatedAt": "2026-09-23T09:17:46.014Z"
  },
  "dc": {
    "section": "dc",
    "title": "Data-center power committed today, by site",
    "caption": "Three committed site-level power blocks announced today, in MW; ERCOT's 200 GW market-wide queue is left out as an outlier that would dwarf every bar.",
    "spec": {
      "chartType": "Bar Chart",
      "columns": [
        {
          "name": "Site",
          "semanticType": "Name"
        },
        {
          "name": "Capacity (MW)",
          "semanticType": "Quantity"
        }
      ],
      "rows": [
        [
          "Oracle Abilene block",
          1200
        ],
        [
          "Reliance Jamnagar campus",
          1000
        ],
        [
          "CoreWeave West Texas",
          250
        ]
      ],
      "encodings": {
        "x": "Site",
        "y": [
          "Capacity (MW)"
        ]
      }
    },
    "sources": [
      {
        "name": "Bloomberg",
        "url": "https://www.bloomberg.com"
      },
      {
        "name": "Economic Times",
        "url": "https://economictimes.indiatimes.com"
      },
      {
        "name": "DCD",
        "url": "https://www.datacenterdynamics.com"
      }
    ],
    "storyIds": [
      2,
      22,
      3
    ],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M152.5 24L152.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M204.5 24L204.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M255.5 24L255.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M306.5 24L306.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M357.5 24L357.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M409.5 24L409.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M460.5 24L460.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M152.5 24L152.5 234\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-dc-cls-2\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 234)\" fill=\"#5f6b76\">Capacity (MW)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(144.73 59)\" fill=\"#8b98a5\">Oracle Abilene block</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(144.73 129)\" fill=\"#8b98a5\">Reliance Jamnagar campus</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(144.73 199)\" fill=\"#8b98a5\">CoreWeave West Texas</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(152.73 242)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(203.9417 242)\" fill=\"#5f6b76\">200</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(255.1533 242)\" fill=\"#5f6b76\">400</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(306.365 242)\" fill=\"#5f6b76\">600</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(357.5767 242)\" fill=\"#5f6b76\">800</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(408.7883 242)\" fill=\"#5f6b76\">1,000</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(460 242)\" fill=\"#5f6b76\">1,200</text>\n<path d=\"M154.7 50L458 50A2 2 0 0 1 460 52L460 66A2 2 0 0 1 458 68L154.7 68A2 2 0 0 1 152.7 66L152.7 52A2 2 0 0 1 154.7 50\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<path d=\"M154.7 120L406.8 120A2 2 0 0 1 408.8 122L408.8 136A2 2 0 0 1 406.8 138L154.7 138A2 2 0 0 1 152.7 136L152.7 122A2 2 0 0 1 154.7 120\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<path d=\"M154.7 190L214.7 190A2 2 0 0 1 216.7 192L216.7 206A2 2 0 0 1 214.7 208L154.7 208A2 2 0 0 1 152.7 206L152.7 192A2 2 0 0 1 154.7 190\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(465 59)\" fill=\"#dbe7f0\">1200</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(413.7883 129)\" fill=\"#dbe7f0\">1000</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(221.7446 199)\" fill=\"#dbe7f0\">250</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 1,
    "model": "anthropic/claude-opus-4.8",
    "generatedAt": "2026-09-23T09:17:46.014Z"
  },
  "hyper": {
    "section": "hyper",
    "title": "Hyperscalers this window, by move",
    "caption": "4 of 5 tracked hyperscalers rose over the window; the change is close to close on each company's home exchange, in its own currency.",
    "spec": {
      "chartType": "Bar Chart",
      "columns": [
        {
          "name": "Company",
          "semanticType": "Name"
        },
        {
          "name": "Change (%)",
          "semanticType": "PercentageChange"
        }
      ],
      "rows": [
        [
          "Oracle",
          3.2
        ],
        [
          "Alphabet",
          0.9
        ],
        [
          "Meta Platforms",
          0.6
        ],
        [
          "Microsoft",
          0.4
        ],
        [
          "Amazon",
          -0.3
        ]
      ],
      "encodings": {
        "x": "Company",
        "y": [
          "Change (%)"
        ]
      }
    },
    "sources": [
      {
        "name": "Tracked stocks · home-exchange closes",
        "url": "https://www.vizmaya.fyi/ai-data-centers"
      }
    ],
    "storyIds": [],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M90.5 24L90.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M136.5 24L136.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M182.5 24L182.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M229.5 24L229.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M275.5 24L275.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M321.5 24L321.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M367.5 24L367.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M414.5 24L414.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M460.5 24L460.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-4\"></path>\n<path d=\"M136.5 24L136.5 234\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-hyper-cls-4\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 234)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(82.14 45)\" fill=\"#8b98a5\">Oracle</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(82.14 87)\" fill=\"#8b98a5\">Alphabet</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(82.14 129)\" fill=\"#8b98a5\">Meta Platforms</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(82.14 171)\" fill=\"#8b98a5\">Microsoft</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(82.14 213)\" fill=\"#8b98a5\">Amazon</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(90.14 242)\" fill=\"#5f6b76\">-0.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(136.3725 242)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(182.605 242)\" fill=\"#5f6b76\">0.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(228.8375 242)\" fill=\"#5f6b76\">1</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(275.07 242)\" fill=\"#5f6b76\">1.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(321.3025 242)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(367.535 242)\" fill=\"#5f6b76\">2.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(413.7675 242)\" fill=\"#5f6b76\">3</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(460 242)\" fill=\"#5f6b76\">3.5</text>\n<path d=\"M138.4 36L430.3 36A2 2 0 0 1 432.3 38L432.3 52A2 2 0 0 1 430.3 54L138.4 54A2 2 0 0 1 136.4 52L136.4 38A2 2 0 0 1 138.4 36\" fill=\"#22d3ee\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M138.4 78L217.6 78A2 2 0 0 1 219.6 80L219.6 94A2 2 0 0 1 217.6 96L138.4 96A2 2 0 0 1 136.4 94L136.4 80A2 2 0 0 1 138.4 78\" fill=\"#22d3ee\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M138.4 120L189.9 120A2 2 0 0 1 191.9 122L191.9 136A2 2 0 0 1 189.9 138L138.4 138A2 2 0 0 1 136.4 136L136.4 122A2 2 0 0 1 138.4 120\" fill=\"#22d3ee\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M138.4 162L171.4 162A2 2 0 0 1 173.4 164L173.4 178A2 2 0 0 1 171.4 180L138.4 180A2 2 0 0 1 136.4 178L136.4 164A2 2 0 0 1 138.4 162\" fill=\"#22d3ee\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M110.6 204L134.4 204A2 2 0 0 1 136.4 206L136.4 220A2 2 0 0 1 134.4 222L110.6 222A2 2 0 0 1 108.6 220L108.6 206A2 2 0 0 1 110.6 204\" fill=\"#22d3ee\" class=\"ec-hyper-cls-5\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(437.2605 45)\" fill=\"#dbe7f0\">3.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(224.591 87)\" fill=\"#dbe7f0\">0.9</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(196.8515 129)\" fill=\"#dbe7f0\">0.6</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(178.3585 171)\" fill=\"#dbe7f0\">0.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(141.3725 213)\" fill=\"#dbe7f0\">-0.3</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:17:46.014Z"
  },
  "semi": {
    "section": "semi",
    "title": "Chipmakers this window, by move",
    "caption": "6 of 8 tracked chipmakers rose over the window; the change is close to close on each company's home exchange, in its own currency.",
    "spec": {
      "chartType": "Bar Chart",
      "columns": [
        {
          "name": "Company",
          "semanticType": "Name"
        },
        {
          "name": "Change (%)",
          "semanticType": "PercentageChange"
        }
      ],
      "rows": [
        [
          "SK hynix",
          6.8
        ],
        [
          "Micron Technology",
          5.1
        ],
        [
          "NVIDIA",
          2.4
        ],
        [
          "SMIC",
          1.9
        ],
        [
          "Samsung Electronics",
          1.4
        ],
        [
          "Intel",
          -1.2
        ],
        [
          "TSMC",
          1.1
        ],
        [
          "Advanced Micro Devices",
          -0.8
        ]
      ],
      "encodings": {
        "x": "Company",
        "y": [
          "Change (%)"
        ]
      }
    },
    "sources": [
      {
        "name": "Tracked stocks · home-exchange closes",
        "url": "https://www.vizmaya.fyi/ai-data-centers"
      }
    ],
    "storyIds": [],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M137.5 24L137.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-6\"></path>\n<path d=\"M202.5 24L202.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-6\"></path>\n<path d=\"M266.5 24L266.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-6\"></path>\n<path d=\"M331.5 24L331.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-6\"></path>\n<path d=\"M395.5 24L395.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-6\"></path>\n<path d=\"M460.5 24L460.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-6\"></path>\n<path d=\"M202.5 24L202.5 234\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-semi-cls-6\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 234)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(129.33 37.125)\" fill=\"#8b98a5\">SK hynix</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(129.33 63.375)\" fill=\"#8b98a5\">Micron Technology</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(129.33 89.625)\" fill=\"#8b98a5\">NVIDIA</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(129.33 115.875)\" fill=\"#8b98a5\">SMIC</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(129.33 142.125)\" fill=\"#8b98a5\">Samsung Electronics</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(129.33 168.375)\" fill=\"#8b98a5\">Intel</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(129.33 194.625)\" fill=\"#8b98a5\">TSMC</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(129.33 220.875)\" fill=\"#8b98a5\">Advanced Micro Devices</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(137.33 242)\" fill=\"#5f6b76\">-2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(201.864 242)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(266.398 242)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(330.932 242)\" fill=\"#5f6b76\">4</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(395.466 242)\" fill=\"#5f6b76\">6</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(460 242)\" fill=\"#5f6b76\">8</text>\n<path d=\"M203.9 28.1L419.3 28.1A2 2 0 0 1 421.3 30.1L421.3 44.1A2 2 0 0 1 419.3 46.1L203.9 46.1A2 2 0 0 1 201.9 44.1L201.9 30.1A2 2 0 0 1 203.9 28.1\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<path d=\"M203.9 54.4L364.4 54.4A2 2 0 0 1 366.4 56.4L366.4 70.4A2 2 0 0 1 364.4 72.4L203.9 72.4A2 2 0 0 1 201.9 70.4L201.9 56.4A2 2 0 0 1 203.9 54.4\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<path d=\"M203.9 80.6L277.3 80.6A2 2 0 0 1 279.3 82.6L279.3 96.6A2 2 0 0 1 277.3 98.6L203.9 98.6A2 2 0 0 1 201.9 96.6L201.9 82.6A2 2 0 0 1 203.9 80.6\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<path d=\"M203.9 106.9L261.2 106.9A2 2 0 0 1 263.2 108.9L263.2 122.9A2 2 0 0 1 261.2 124.9L203.9 124.9A2 2 0 0 1 201.9 122.9L201.9 108.9A2 2 0 0 1 203.9 106.9\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<path d=\"M203.9 133.1L245 133.1A2 2 0 0 1 247 135.1L247 149.1A2 2 0 0 1 245 151.1L203.9 151.1A2 2 0 0 1 201.9 149.1L201.9 135.1A2 2 0 0 1 203.9 133.1\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<path d=\"M165.1 159.4L199.9 159.4A2 2 0 0 1 201.9 161.4L201.9 175.4A2 2 0 0 1 199.9 177.4L165.1 177.4A2 2 0 0 1 163.1 175.4L163.1 161.4A2 2 0 0 1 165.1 159.4\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<path d=\"M203.9 185.6L235.4 185.6A2 2 0 0 1 237.4 187.6L237.4 201.6A2 2 0 0 1 235.4 203.6L203.9 203.6A2 2 0 0 1 201.9 201.6L201.9 187.6A2 2 0 0 1 203.9 185.6\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<path d=\"M178.1 211.9L199.9 211.9A2 2 0 0 1 201.9 213.9L201.9 227.9A2 2 0 0 1 199.9 229.9L178.1 229.9A2 2 0 0 1 176.1 227.9L176.1 213.9A2 2 0 0 1 178.1 211.9\" fill=\"#22d3ee\" class=\"ec-semi-cls-7\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(426.2796 37.125)\" fill=\"#dbe7f0\">6.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(371.4257 63.375)\" fill=\"#dbe7f0\">5.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(284.3048 89.625)\" fill=\"#dbe7f0\">2.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(268.1713 115.875)\" fill=\"#dbe7f0\">1.9</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(252.0378 142.125)\" fill=\"#dbe7f0\">1.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(206.864 168.375)\" fill=\"#dbe7f0\">-1.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(242.3577 194.625)\" fill=\"#dbe7f0\">1.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(206.864 220.875)\" fill=\"#dbe7f0\">-0.8</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:17:46.014Z"
  },
  "equip": {
    "section": "equip",
    "title": "Toolmakers this window, by move",
    "caption": "4 of 6 tracked toolmakers rose over the window; the change is close to close on each company's home exchange, in its own currency.",
    "spec": {
      "chartType": "Bar Chart",
      "columns": [
        {
          "name": "Company",
          "semanticType": "Name"
        },
        {
          "name": "Change (%)",
          "semanticType": "PercentageChange"
        }
      ],
      "rows": [
        [
          "Advantest",
          3.1
        ],
        [
          "Tokyo Electron",
          2.7
        ],
        [
          "Lam Research",
          1.8
        ],
        [
          "Applied Materials",
          -1.4
        ],
        [
          "ASML",
          -0.6
        ],
        [
          "KLA",
          0.5
        ]
      ],
      "encodings": {
        "x": "Company",
        "y": [
          "Change (%)"
        ]
      }
    },
    "sources": [
      {
        "name": "Tracked stocks · home-exchange closes",
        "url": "https://www.vizmaya.fyi/ai-data-centers"
      }
    ],
    "storyIds": [],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M100.5 24L100.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-8\"></path>\n<path d=\"M160.5 24L160.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-8\"></path>\n<path d=\"M220.5 24L220.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-8\"></path>\n<path d=\"M280.5 24L280.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-8\"></path>\n<path d=\"M340.5 24L340.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-8\"></path>\n<path d=\"M400.5 24L400.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-8\"></path>\n<path d=\"M460.5 24L460.5 234\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-8\"></path>\n<path d=\"M220.5 24L220.5 234\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-equip-cls-8\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 234)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(92.59 41.5)\" fill=\"#8b98a5\">Advantest</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(92.59 76.5)\" fill=\"#8b98a5\">Tokyo Electron</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(92.59 111.5)\" fill=\"#8b98a5\">Lam Research</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(92.59 146.5)\" fill=\"#8b98a5\">Applied Materials</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(92.59 181.5)\" fill=\"#8b98a5\">ASML</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(92.59 216.5)\" fill=\"#8b98a5\">KLA</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(100.59 242)\" fill=\"#5f6b76\">-2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(160.4917 242)\" fill=\"#5f6b76\">-1</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(220.3933 242)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(280.295 242)\" fill=\"#5f6b76\">1</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(340.1967 242)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(400.0983 242)\" fill=\"#5f6b76\">3</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(460 242)\" fill=\"#5f6b76\">4</text>\n<path d=\"M222.4 32.5L404.1 32.5A2 2 0 0 1 406.1 34.5L406.1 48.5A2 2 0 0 1 404.1 50.5L222.4 50.5A2 2 0 0 1 220.4 48.5L220.4 34.5A2 2 0 0 1 222.4 32.5\" fill=\"#22d3ee\" class=\"ec-equip-cls-9\"></path>\n<path d=\"M222.4 67.5L380.1 67.5A2 2 0 0 1 382.1 69.5L382.1 83.5A2 2 0 0 1 380.1 85.5L222.4 85.5A2 2 0 0 1 220.4 83.5L220.4 69.5A2 2 0 0 1 222.4 67.5\" fill=\"#22d3ee\" class=\"ec-equip-cls-9\"></path>\n<path d=\"M222.4 102.5L326.2 102.5A2 2 0 0 1 328.2 104.5L328.2 118.5A2 2 0 0 1 326.2 120.5L222.4 120.5A2 2 0 0 1 220.4 118.5L220.4 104.5A2 2 0 0 1 222.4 102.5\" fill=\"#22d3ee\" class=\"ec-equip-cls-9\"></path>\n<path d=\"M138.5 137.5L218.4 137.5A2 2 0 0 1 220.4 139.5L220.4 153.5A2 2 0 0 1 218.4 155.5L138.5 155.5A2 2 0 0 1 136.5 153.5L136.5 139.5A2 2 0 0 1 138.5 137.5\" fill=\"#22d3ee\" class=\"ec-equip-cls-9\"></path>\n<path d=\"M186.5 172.5L218.4 172.5A2 2 0 0 1 220.4 174.5L220.4 188.5A2 2 0 0 1 218.4 190.5L186.5 190.5A2 2 0 0 1 184.5 188.5L184.5 174.5A2 2 0 0 1 186.5 172.5\" fill=\"#22d3ee\" class=\"ec-equip-cls-9\"></path>\n<path d=\"M222.4 207.5L248.3 207.5A2 2 0 0 1 250.3 209.5L250.3 223.5A2 2 0 0 1 248.3 225.5L222.4 225.5A2 2 0 0 1 220.4 223.5L220.4 209.5A2 2 0 0 1 222.4 207.5\" fill=\"#22d3ee\" class=\"ec-equip-cls-9\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(411.0885 41.5)\" fill=\"#dbe7f0\">3.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(387.1278 76.5)\" fill=\"#dbe7f0\">2.7</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(333.2163 111.5)\" fill=\"#dbe7f0\">1.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(225.3933 146.5)\" fill=\"#dbe7f0\">-1.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(225.3933 181.5)\" fill=\"#dbe7f0\">-0.6</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(255.3442 216.5)\" fill=\"#dbe7f0\">0.5</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:17:46.014Z"
  },
  "research": {
    "section": "research",
    "title": "Reported gains today, in points",
    "caption": "4 of 8 kept papers report their headline result as a benchmark points over baseline; papers reporting in other units are not put on this axis.",
    "spec": {
      "chartType": "Bar Chart",
      "columns": [
        {
          "name": "Paper",
          "semanticType": "Name"
        },
        {
          "name": "Gain (pts)",
          "semanticType": "Quantity"
        }
      ],
      "rows": [
        [
          "Self-Play Curricula for… · WebArena",
          12.8
        ],
        [
          "VidGround-1FPS: Long-Video… · Charades-STA…",
          9.8
        ],
        [
          "Latent Scratchpads:… · GPQA Diamond",
          7.2
        ],
        [
          "Router Distillation:… · MMLU-Pro",
          4.1
        ]
      ],
      "encodings": {
        "x": "Paper",
        "y": [
          "Gain (pts)"
        ]
      }
    },
    "sources": [
      {
        "name": "arXiv · papers kept for this edition",
        "url": "https://arxiv.org"
      }
    ],
    "storyIds": [],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 560 300\">\n<path d=\"M161.5 24L161.5 274\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-10\"></path>\n<path d=\"M237.5 24L237.5 274\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-10\"></path>\n<path d=\"M312.5 24L312.5 274\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-10\"></path>\n<path d=\"M388.5 24L388.5 274\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-10\"></path>\n<path d=\"M464.5 24L464.5 274\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-10\"></path>\n<path d=\"M540.5 24L540.5 274\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-10\"></path>\n<path d=\"M161.5 24L161.5 274\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-research-cls-10\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(548 274)\" fill=\"#5f6b76\">Gain (pts)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(153.09 55.25)\" fill=\"#8b98a5\">Self-Play Curricula for… ·...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(153.09 117.75)\" fill=\"#8b98a5\">VidGround-1FPS: Long-Vid...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(153.09 180.25)\" fill=\"#8b98a5\">Latent Scratchpads:… · G...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(153.09 242.75)\" fill=\"#8b98a5\">Router Distillation:… · MM...</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(161.09 282)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(236.872 282)\" fill=\"#5f6b76\">3</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(312.654 282)\" fill=\"#5f6b76\">6</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(388.436 282)\" fill=\"#5f6b76\">9</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(464.218 282)\" fill=\"#5f6b76\">12</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"5\" transform=\"translate(540 282)\" fill=\"#5f6b76\">15</text>\n<path d=\"M163.1 46.3L482.4 46.3A2 2 0 0 1 484.4 48.3L484.4 62.3A2 2 0 0 1 482.4 64.3L163.1 64.3A2 2 0 0 1 161.1 62.3L161.1 48.3A2 2 0 0 1 163.1 46.3\" fill=\"#22d3ee\" class=\"ec-research-cls-11\"></path>\n<path d=\"M163.1 108.8L406.6 108.8A2 2 0 0 1 408.6 110.8L408.6 124.8A2 2 0 0 1 406.6 126.8L163.1 126.8A2 2 0 0 1 161.1 124.8L161.1 110.8A2 2 0 0 1 163.1 108.8\" fill=\"#22d3ee\" class=\"ec-research-cls-11\"></path>\n<path d=\"M163.1 171.3L341 171.3A2 2 0 0 1 343 173.3L343 187.3A2 2 0 0 1 341 189.3L163.1 189.3A2 2 0 0 1 161.1 187.3L161.1 173.3A2 2 0 0 1 163.1 171.3\" fill=\"#22d3ee\" class=\"ec-research-cls-11\"></path>\n<path d=\"M163.1 233.8L262.7 233.8A2 2 0 0 1 264.7 235.8L264.7 249.8A2 2 0 0 1 262.7 251.8L163.1 251.8A2 2 0 0 1 161.1 249.8L161.1 235.8A2 2 0 0 1 163.1 233.8\" fill=\"#22d3ee\" class=\"ec-research-cls-11\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(489.4265 55.25)\" fill=\"#dbe7f0\">12.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(413.6445 117.75)\" fill=\"#dbe7f0\">9.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(347.9668 180.25)\" fill=\"#dbe7f0\">7.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(269.6587 242.75)\" fill=\"#dbe7f0\">4.1</text>\n</svg>",
    "width": 560,
    "height": 300,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:17:46.014Z"
  }
}

export const SAMPLE_CHART_SKIPS: EditionChartSkip[] = [
  {
    "section": "hyper",
    "reason": "rung 4 (Only two power figures (2500 MW nuclear PPA, 900 MW solar tender) and they differ in status/scope; the rest are horizons and counts of different kinds — no honest set of 3+ comparable figures.)"
  },
  {
    "section": "semi",
    "reason": "rung 4 (Only three figures and they are all different kinds (two counts, one share) with no shared subject or scope — nothing compares honestly on one scale.)"
  },
  {
    "section": "equip",
    "reason": "rung 4 (no story states a figure)"
  },
  {
    "section": "research",
    "reason": "rung 4 (papers are charted from the record)"
  }
]
