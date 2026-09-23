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
    "title": "Power committed today, by site",
    "caption": "Site- and campus-level power figures on the record today, in MW; the 200 GW ERCOT queue is a market-wide total left out to keep one readable scale.",
    "spec": {
      "chartType": "Bar Chart",
      "columns": [
        {
          "name": "Deal",
          "semanticType": "Name"
        },
        {
          "name": "Power (MW)",
          "semanticType": "Quantity"
        }
      ],
      "rows": [
        [
          "Microsoft nuclear uprate PPA (Ohio)",
          2500
        ],
        [
          "Oracle gas-plus-storage block (Abilene)",
          1200
        ],
        [
          "Reliance Jamnagar AI campus",
          1000
        ],
        [
          "Abu Dhabi solar-plus-storage tender",
          900
        ]
      ],
      "encodings": {
        "x": "Deal",
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 800 340\">\n<path d=\"M268.5 24L268.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M370.5 24L370.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M473.5 24L473.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M575.5 24L575.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M677.5 24L677.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M780.5 24L780.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M268.5 24L268.5 317.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-energy-cls-0\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(788 317.8)\" fill=\"#5f6b76\">Power (MW)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(260.34 60.725)\" fill=\"#8b98a5\">Microsoft nuclear uprate PPA (Ohio)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(260.34 134.175)\" fill=\"#8b98a5\">Oracle gas-plus-storage block (Abi...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(260.34 207.625)\" fill=\"#8b98a5\">Reliance Jamnagar AI campus</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(260.34 281.075)\" fill=\"#8b98a5\">Abu Dhabi solar-plus-storage tender</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(268.34 325.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(370.672 325.8)\" fill=\"#5f6b76\">500</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(473.004 325.8)\" fill=\"#5f6b76\">1,000</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(575.336 325.8)\" fill=\"#5f6b76\">1,500</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(677.668 325.8)\" fill=\"#5f6b76\">2,000</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(780 325.8)\" fill=\"#5f6b76\">2,500</text>\n<path d=\"M270.3 51.7L778 51.7A2 2 0 0 1 780 53.7L780 67.7A2 2 0 0 1 778 69.7L270.3 69.7A2 2 0 0 1 268.3 67.7L268.3 53.7A2 2 0 0 1 270.3 51.7\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M270.3 125.2L511.9 125.2A2 2 0 0 1 513.9 127.2L513.9 141.2A2 2 0 0 1 511.9 143.2L270.3 143.2A2 2 0 0 1 268.3 141.2L268.3 127.2A2 2 0 0 1 270.3 125.2\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M270.3 198.6L471 198.6A2 2 0 0 1 473 200.6L473 214.6A2 2 0 0 1 471 216.6L270.3 216.6A2 2 0 0 1 268.3 214.6L268.3 200.6A2 2 0 0 1 270.3 198.6\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M270.3 272.1L450.5 272.1A2 2 0 0 1 452.5 274.1L452.5 288.1A2 2 0 0 1 450.5 290.1L270.3 290.1A2 2 0 0 1 268.3 288.1L268.3 274.1A2 2 0 0 1 270.3 272.1\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(785 60.725)\" fill=\"#dbe7f0\">2500</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(518.9368 134.175)\" fill=\"#dbe7f0\">1200</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(478.004 207.625)\" fill=\"#dbe7f0\">1000</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(457.5376 281.075)\" fill=\"#dbe7f0\">900</text>\n</svg>",
    "width": 800,
    "height": 340,
    "rung": 1,
    "model": "anthropic/claude-opus-4.8",
    "generatedAt": "2026-09-23T09:41:28.183Z"
  },
  "dc": {
    "section": "dc",
    "title": "Data-center operators this window, by move",
    "caption": "5 of 7 tracked data-center operators rose over the window; the change is close to close on each company's home exchange, in its own currency.",
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
          "CoreWeave",
          7.9
        ],
        [
          "Vertiv",
          2.2
        ],
        [
          "Super Micro Computer",
          1.6
        ],
        [
          "Equinix",
          -1.1
        ],
        [
          "Digital Realty",
          -0.8
        ],
        [
          "SoftBank Group",
          0.7
        ],
        [
          "Hon Hai (Foxconn)",
          0.3
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M152.5 24L152.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M214.5 24L214.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M275.5 24L275.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M337.5 24L337.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M398.5 24L398.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M460.5 24L460.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M214.5 24L214.5 237.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-dc-cls-2\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 237.8)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(144.4 39.2714)\" fill=\"#8b98a5\">CoreWeave</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(144.4 69.8143)\" fill=\"#8b98a5\">Vertiv</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(144.4 100.3571)\" fill=\"#8b98a5\">Super Micro Computer</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(144.4 130.9)\" fill=\"#8b98a5\">Equinix</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(144.4 161.4429)\" fill=\"#8b98a5\">Digital Realty</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(144.4 191.9857)\" fill=\"#8b98a5\">SoftBank Group</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(144.4 222.5286)\" fill=\"#8b98a5\">Hon Hai (Foxconn)</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(152.4 245.8)\" fill=\"#5f6b76\">-2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(213.92 245.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(275.44 245.8)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(336.96 245.8)\" fill=\"#5f6b76\">4</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(398.48 245.8)\" fill=\"#5f6b76\">6</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(460 245.8)\" fill=\"#5f6b76\">8</text>\n<path d=\"M215.9 30.3L454.9 30.3A2 2 0 0 1 456.9 32.3L456.9 46.3A2 2 0 0 1 454.9 48.3L215.9 48.3A2 2 0 0 1 213.9 46.3L213.9 32.3A2 2 0 0 1 215.9 30.3\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<path d=\"M215.9 60.8L279.6 60.8A2 2 0 0 1 281.6 62.8L281.6 76.8A2 2 0 0 1 279.6 78.8L215.9 78.8A2 2 0 0 1 213.9 76.8L213.9 62.8A2 2 0 0 1 215.9 60.8\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<path d=\"M215.9 91.4L261.1 91.4A2 2 0 0 1 263.1 93.4L263.1 107.4A2 2 0 0 1 261.1 109.4L215.9 109.4A2 2 0 0 1 213.9 107.4L213.9 93.4A2 2 0 0 1 215.9 91.4\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<path d=\"M182.1 121.9L211.9 121.9A2 2 0 0 1 213.9 123.9L213.9 137.9A2 2 0 0 1 211.9 139.9L182.1 139.9A2 2 0 0 1 180.1 137.9L180.1 123.9A2 2 0 0 1 182.1 121.9\" fill=\"#f0a0a0\" class=\"ec-dc-cls-4\"></path>\n<path d=\"M191.3 152.4L211.9 152.4A2 2 0 0 1 213.9 154.4L213.9 168.4A2 2 0 0 1 211.9 170.4L191.3 170.4A2 2 0 0 1 189.3 168.4L189.3 154.4A2 2 0 0 1 191.3 152.4\" fill=\"#f0a0a0\" class=\"ec-dc-cls-4\"></path>\n<path d=\"M215.9 183L233.5 183A2 2 0 0 1 235.5 185L235.5 199A2 2 0 0 1 233.5 201L215.9 201A2 2 0 0 1 213.9 199L213.9 185A2 2 0 0 1 215.9 183\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<path d=\"M215.9 213.5L221.1 213.5A2 2 0 0 1 223.1 215.5L223.1 229.5A2 2 0 0 1 221.1 231.5L215.9 231.5A2 2 0 0 1 213.9 229.5L213.9 215.5A2 2 0 0 1 215.9 213.5\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(461.924 39.2714)\" fill=\"#dbe7f0\">7.9</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(286.592 69.8143)\" fill=\"#dbe7f0\">2.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(268.136 100.3571)\" fill=\"#dbe7f0\">1.6</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(175.084 130.9)\" fill=\"#dbe7f0\">-1.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(184.312 161.4429)\" fill=\"#dbe7f0\">-0.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(240.452 191.9857)\" fill=\"#dbe7f0\">0.7</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(228.148 222.5286)\" fill=\"#dbe7f0\">0.3</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:41:28.183Z"
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M111.5 24L111.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M155.5 24L155.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M198.5 24L198.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M242.5 24L242.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M285.5 24L285.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M329.5 24L329.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M373.5 24L373.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M416.5 24L416.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M460.5 24L460.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-5\"></path>\n<path d=\"M155.5 24L155.5 237.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-hyper-cls-5\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 237.8)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(103.48 45.38)\" fill=\"#8b98a5\">Oracle</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(103.48 88.14)\" fill=\"#8b98a5\">Alphabet</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(103.48 130.9)\" fill=\"#8b98a5\">Meta Platforms</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(103.48 173.66)\" fill=\"#8b98a5\">Microsoft</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(103.48 216.42)\" fill=\"#8b98a5\">Amazon</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(111.48 245.8)\" fill=\"#5f6b76\">-0.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(155.045 245.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(198.61 245.8)\" fill=\"#5f6b76\">0.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(242.175 245.8)\" fill=\"#5f6b76\">1</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(285.74 245.8)\" fill=\"#5f6b76\">1.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(329.305 245.8)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(372.87 245.8)\" fill=\"#5f6b76\">2.5</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(416.435 245.8)\" fill=\"#5f6b76\">3</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(460 245.8)\" fill=\"#5f6b76\">3.5</text>\n<path d=\"M157 36.4L431.9 36.4A2 2 0 0 1 433.9 38.4L433.9 52.4A2 2 0 0 1 431.9 54.4L157 54.4A2 2 0 0 1 155 52.4L155 38.4A2 2 0 0 1 157 36.4\" fill=\"#22d3ee\" class=\"ec-hyper-cls-6\"></path>\n<path d=\"M157 79.1L231.5 79.1A2 2 0 0 1 233.5 81.1L233.5 95.1A2 2 0 0 1 231.5 97.1L157 97.1A2 2 0 0 1 155 95.1L155 81.1A2 2 0 0 1 157 79.1\" fill=\"#22d3ee\" class=\"ec-hyper-cls-6\"></path>\n<path d=\"M157 121.9L205.3 121.9A2 2 0 0 1 207.3 123.9L207.3 137.9A2 2 0 0 1 205.3 139.9L157 139.9A2 2 0 0 1 155 137.9L155 123.9A2 2 0 0 1 157 121.9\" fill=\"#22d3ee\" class=\"ec-hyper-cls-6\"></path>\n<path d=\"M157 164.7L187.9 164.7A2 2 0 0 1 189.9 166.7L189.9 180.7A2 2 0 0 1 187.9 182.7L157 182.7A2 2 0 0 1 155 180.7L155 166.7A2 2 0 0 1 157 164.7\" fill=\"#22d3ee\" class=\"ec-hyper-cls-6\"></path>\n<path d=\"M130.9 207.4L153 207.4A2 2 0 0 1 155 209.4L155 223.4A2 2 0 0 1 153 225.4L130.9 225.4A2 2 0 0 1 128.9 223.4L128.9 209.4A2 2 0 0 1 130.9 207.4\" fill=\"#f0a0a0\" class=\"ec-hyper-cls-7\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(438.861 45.38)\" fill=\"#dbe7f0\">3.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(238.462 88.14)\" fill=\"#dbe7f0\">0.9</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(212.323 130.9)\" fill=\"#dbe7f0\">0.6</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(194.897 173.66)\" fill=\"#dbe7f0\">0.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(123.906 216.42)\" fill=\"#dbe7f0\">-0.3</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:41:28.183Z"
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M166.5 24L166.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-8\"></path>\n<path d=\"M225.5 24L225.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-8\"></path>\n<path d=\"M283.5 24L283.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-8\"></path>\n<path d=\"M342.5 24L342.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-8\"></path>\n<path d=\"M401.5 24L401.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-8\"></path>\n<path d=\"M460.5 24L460.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-8\"></path>\n<path d=\"M225.5 24L225.5 237.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-semi-cls-8\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 237.8)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 37.3625)\" fill=\"#8b98a5\">SK hynix</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 64.0875)\" fill=\"#8b98a5\">Micron Technology</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 90.8125)\" fill=\"#8b98a5\">NVIDIA</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 117.5375)\" fill=\"#8b98a5\">SMIC</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 144.2625)\" fill=\"#8b98a5\">Samsung Electronics</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 170.9875)\" fill=\"#8b98a5\">Intel</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 197.7125)\" fill=\"#8b98a5\">TSMC</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 224.4375)\" fill=\"#8b98a5\">Advanced Micro Devices</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(166.04 245.8)\" fill=\"#5f6b76\">-2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(224.832 245.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(283.624 245.8)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(342.416 245.8)\" fill=\"#5f6b76\">4</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(401.208 245.8)\" fill=\"#5f6b76\">6</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(460 245.8)\" fill=\"#5f6b76\">8</text>\n<path d=\"M226.8 28.4L422.7 28.4A2 2 0 0 1 424.7 30.4L424.7 44.4A2 2 0 0 1 422.7 46.4L226.8 46.4A2 2 0 0 1 224.8 44.4L224.8 30.4A2 2 0 0 1 226.8 28.4\" fill=\"#22d3ee\" class=\"ec-semi-cls-9\"></path>\n<path d=\"M226.8 55.1L372.8 55.1A2 2 0 0 1 374.8 57.1L374.8 71.1A2 2 0 0 1 372.8 73.1L226.8 73.1A2 2 0 0 1 224.8 71.1L224.8 57.1A2 2 0 0 1 226.8 55.1\" fill=\"#22d3ee\" class=\"ec-semi-cls-9\"></path>\n<path d=\"M226.8 81.8L293.4 81.8A2 2 0 0 1 295.4 83.8L295.4 97.8A2 2 0 0 1 293.4 99.8L226.8 99.8A2 2 0 0 1 224.8 97.8L224.8 83.8A2 2 0 0 1 226.8 81.8\" fill=\"#22d3ee\" class=\"ec-semi-cls-9\"></path>\n<path d=\"M226.8 108.5L278.7 108.5A2 2 0 0 1 280.7 110.5L280.7 124.5A2 2 0 0 1 278.7 126.5L226.8 126.5A2 2 0 0 1 224.8 124.5L224.8 110.5A2 2 0 0 1 226.8 108.5\" fill=\"#22d3ee\" class=\"ec-semi-cls-9\"></path>\n<path d=\"M226.8 135.3L264 135.3A2 2 0 0 1 266 137.3L266 151.3A2 2 0 0 1 264 153.3L226.8 153.3A2 2 0 0 1 224.8 151.3L224.8 137.3A2 2 0 0 1 226.8 135.3\" fill=\"#22d3ee\" class=\"ec-semi-cls-9\"></path>\n<path d=\"M191.6 162L222.8 162A2 2 0 0 1 224.8 164L224.8 178A2 2 0 0 1 222.8 180L191.6 180A2 2 0 0 1 189.6 178L189.6 164A2 2 0 0 1 191.6 162\" fill=\"#f0a0a0\" class=\"ec-semi-cls-10\"></path>\n<path d=\"M226.8 188.7L255.2 188.7A2 2 0 0 1 257.2 190.7L257.2 204.7A2 2 0 0 1 255.2 206.7L226.8 206.7A2 2 0 0 1 224.8 204.7L224.8 190.7A2 2 0 0 1 226.8 188.7\" fill=\"#22d3ee\" class=\"ec-semi-cls-9\"></path>\n<path d=\"M203.3 215.4L222.8 215.4A2 2 0 0 1 224.8 217.4L224.8 231.4A2 2 0 0 1 222.8 233.4L203.3 233.4A2 2 0 0 1 201.3 231.4L201.3 217.4A2 2 0 0 1 203.3 215.4\" fill=\"#f0a0a0\" class=\"ec-semi-cls-10\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(429.7248 37.3625)\" fill=\"#dbe7f0\">6.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(379.7516 64.0875)\" fill=\"#dbe7f0\">5.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(300.3824 90.8125)\" fill=\"#dbe7f0\">2.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(285.6844 117.5375)\" fill=\"#dbe7f0\">1.9</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(270.9864 144.2625)\" fill=\"#dbe7f0\">1.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(184.5568 170.9875)\" fill=\"#dbe7f0\">-1.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(262.1676 197.7125)\" fill=\"#dbe7f0\">1.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(196.3152 224.4375)\" fill=\"#dbe7f0\">-0.8</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:41:28.183Z"
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M132.5 24L132.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-11\"></path>\n<path d=\"M186.5 24L186.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-11\"></path>\n<path d=\"M241.5 24L241.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-11\"></path>\n<path d=\"M296.5 24L296.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-11\"></path>\n<path d=\"M350.5 24L350.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-11\"></path>\n<path d=\"M405.5 24L405.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-11\"></path>\n<path d=\"M460.5 24L460.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-11\"></path>\n<path d=\"M241.5 24L241.5 237.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-equip-cls-11\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 237.8)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(123.94 41.8167)\" fill=\"#8b98a5\">Advantest</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(123.94 77.45)\" fill=\"#8b98a5\">Tokyo Electron</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(123.94 113.0833)\" fill=\"#8b98a5\">Lam Research</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(123.94 148.7167)\" fill=\"#8b98a5\">Applied Materials</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(123.94 184.35)\" fill=\"#8b98a5\">ASML</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(123.94 219.9833)\" fill=\"#8b98a5\">KLA</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(131.94 245.8)\" fill=\"#5f6b76\">-2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(186.6167 245.8)\" fill=\"#5f6b76\">-1</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(241.2933 245.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(295.97 245.8)\" fill=\"#5f6b76\">1</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(350.6467 245.8)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(405.3233 245.8)\" fill=\"#5f6b76\">3</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(460 245.8)\" fill=\"#5f6b76\">4</text>\n<path d=\"M243.3 32.8L408.8 32.8A2 2 0 0 1 410.8 34.8L410.8 48.8A2 2 0 0 1 408.8 50.8L243.3 50.8A2 2 0 0 1 241.3 48.8L241.3 34.8A2 2 0 0 1 243.3 32.8\" fill=\"#22d3ee\" class=\"ec-equip-cls-12\"></path>\n<path d=\"M243.3 68.4L386.9 68.4A2 2 0 0 1 388.9 70.4L388.9 84.4A2 2 0 0 1 386.9 86.4L243.3 86.4A2 2 0 0 1 241.3 84.4L241.3 70.4A2 2 0 0 1 243.3 68.4\" fill=\"#22d3ee\" class=\"ec-equip-cls-12\"></path>\n<path d=\"M243.3 104.1L337.7 104.1A2 2 0 0 1 339.7 106.1L339.7 120.1A2 2 0 0 1 337.7 122.1L243.3 122.1A2 2 0 0 1 241.3 120.1L241.3 106.1A2 2 0 0 1 243.3 104.1\" fill=\"#22d3ee\" class=\"ec-equip-cls-12\"></path>\n<path d=\"M166.7 139.7L239.3 139.7A2 2 0 0 1 241.3 141.7L241.3 155.7A2 2 0 0 1 239.3 157.7L166.7 157.7A2 2 0 0 1 164.7 155.7L164.7 141.7A2 2 0 0 1 166.7 139.7\" fill=\"#f0a0a0\" class=\"ec-equip-cls-13\"></path>\n<path d=\"M210.5 175.4L239.3 175.4A2 2 0 0 1 241.3 177.4L241.3 191.4A2 2 0 0 1 239.3 193.4L210.5 193.4A2 2 0 0 1 208.5 191.4L208.5 177.4A2 2 0 0 1 210.5 175.4\" fill=\"#f0a0a0\" class=\"ec-equip-cls-13\"></path>\n<path d=\"M243.3 211L266.6 211A2 2 0 0 1 268.6 213L268.6 227A2 2 0 0 1 266.6 229L243.3 229A2 2 0 0 1 241.3 227L241.3 213A2 2 0 0 1 243.3 211\" fill=\"#22d3ee\" class=\"ec-equip-cls-12\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(415.791 41.8167)\" fill=\"#dbe7f0\">3.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(393.9203 77.45)\" fill=\"#dbe7f0\">2.7</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(344.7113 113.0833)\" fill=\"#dbe7f0\">1.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(159.746 148.7167)\" fill=\"#dbe7f0\">-1.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(203.4873 184.35)\" fill=\"#dbe7f0\">-0.6</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(273.6317 219.9833)\" fill=\"#dbe7f0\">0.5</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:41:28.183Z"
  },
  "research": {
    "section": "research",
    "title": "Reported gains today, in points",
    "caption": "4 of 8 kept papers report their headline result as a benchmark points over baseline; papers reporting in other units are not put on this axis.",
    "spec": {
      "chartType": "Lollipop Chart",
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 560 300\">\n<path d=\"M193.5 24L193.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-14\"></path>\n<path d=\"M262.5 24L262.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-14\"></path>\n<path d=\"M332.5 24L332.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-14\"></path>\n<path d=\"M401.5 24L401.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-14\"></path>\n<path d=\"M470.5 24L470.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-14\"></path>\n<path d=\"M540.5 24L540.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-14\"></path>\n<path d=\"M193.5 24L193.5 277.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-research-cls-14\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(548 277.8)\" fill=\"#5f6b76\">Gain (pts)</text>\n<path d=\"M193.5 277.8L193.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-14\"></path>\n<path d=\"M262.5 277.8L262.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-14\"></path>\n<path d=\"M332.5 277.8L332.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-14\"></path>\n<path d=\"M401.5 277.8L401.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-14\"></path>\n<path d=\"M470.5 277.8L470.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-14\"></path>\n<path d=\"M540.5 277.8L540.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-14\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 55.725)\" fill=\"#8b98a5\">Self-Play Curricula for...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 119.175)\" fill=\"#8b98a5\">VidGround-1FPS: Long-Vi...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 182.625)\" fill=\"#8b98a5\">Latent Scratchpads:… · ...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 246.075)\" fill=\"#8b98a5\">Router Distillation:… ·...</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(193.32 285.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(262.656 285.8)\" fill=\"#5f6b76\">3</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(331.992 285.8)\" fill=\"#5f6b76\">6</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(401.328 285.8)\" fill=\"#5f6b76\">9</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(470.664 285.8)\" fill=\"#5f6b76\">12</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(540 285.8)\" fill=\"#5f6b76\">15</text>\n<path d=\"M194.1 55L488.4 55A0.8 0.8 0 0 1 489.2 55.7A0.8 0.8 0 0 1 488.4 56.5L194.1 56.5A0.8 0.8 0 0 1 193.3 55.7A0.8 0.8 0 0 1 194.1 55\" fill=\"#22d3ee\" class=\"ec-research-cls-15\"></path>\n<path d=\"M194.1 118.4L419.1 118.4A0.8 0.8 0 0 1 419.8 119.2A0.8 0.8 0 0 1 419.1 119.9L194.1 119.9A0.8 0.8 0 0 1 193.3 119.2A0.8 0.8 0 0 1 194.1 118.4\" fill=\"#22d3ee\" class=\"ec-research-cls-15\"></path>\n<path d=\"M194.1 181.9L359 181.9A0.8 0.8 0 0 1 359.7 182.6A0.8 0.8 0 0 1 359 183.4L194.1 183.4A0.8 0.8 0 0 1 193.3 182.6A0.8 0.8 0 0 1 194.1 181.9\" fill=\"#22d3ee\" class=\"ec-research-cls-15\"></path>\n<path d=\"M194.1 245.3L287.3 245.3A0.8 0.8 0 0 1 288.1 246.1A0.8 0.8 0 0 1 287.3 246.8L194.1 246.8A0.8 0.8 0 0 1 193.3 246.1A0.8 0.8 0 0 1 194.1 245.3\" fill=\"#22d3ee\" class=\"ec-research-cls-15\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(494.1536 55.725)\" fill=\"#dbe7f0\">12.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(424.8176 119.175)\" fill=\"#dbe7f0\">9.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(364.7264 182.625)\" fill=\"#dbe7f0\">7.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(293.0792 246.075)\" fill=\"#dbe7f0\">4.1</text>\n</svg>",
    "width": 560,
    "height": 300,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T09:41:28.183Z"
  }
}

export const SAMPLE_CHART_SKIPS: EditionChartSkip[] = [
  {
    "section": "dc",
    "reason": "rung 4 (today's plan repeated energy)"
  },
  {
    "section": "hyper",
    "reason": "rung 4 (Only two power figures (2.5 GW nuclear PPA and 900 MW solar tender), and they differ in scope and status; the rest are counts and horizons of unlike kinds. Fewer than three honest, comparable figures on any one scale.)"
  },
  {
    "section": "semi",
    "reason": "rung 4 (Only three figures and they are different kinds (two counts, one share) with no subjects — nothing compares on one honest scale.)"
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
