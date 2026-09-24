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
    "title": "Site power committed today, by project",
    "caption": "Four project-level power figures on one MW scale; the 200 GW ERCOT queue is a market total and is left out to keep the bars readable.",
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
          "Oracle Abilene gas+storage",
          1200
        ],
        [
          "Reliance Jamnagar campus",
          1000
        ],
        [
          "Abu Dhabi solar+storage tender",
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 800 340\">\n<path d=\"M220.5 20L220.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M332.5 20L332.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M444.5 20L444.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M556.5 20L556.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M668.5 20L668.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M780.5 20L780.5 317.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-energy-cls-0\"></path>\n<path d=\"M220.5 20L220.5 317.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-energy-cls-0\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(788 317.8)\" fill=\"#5f6b76\">Power (MW)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(212.6 57.225)\" fill=\"#8b98a5\">Microsoft Ohio nuclear PPA</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(212.6 131.675)\" fill=\"#8b98a5\">Oracle Abilene gas+storage</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(212.6 206.125)\" fill=\"#8b98a5\">Reliance Jamnagar campus</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(212.6 280.575)\" fill=\"#8b98a5\">Abu Dhabi solar+storage tender</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(220.6 325.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(332.48 325.8)\" fill=\"#5f6b76\">500</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(444.36 325.8)\" fill=\"#5f6b76\">1,000</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(556.24 325.8)\" fill=\"#5f6b76\">1,500</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(668.12 325.8)\" fill=\"#5f6b76\">2,000</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(780 325.8)\" fill=\"#5f6b76\">2,500</text>\n<path d=\"M222.6 48.2L778 48.2A2 2 0 0 1 780 50.2L780 64.2A2 2 0 0 1 778 66.2L222.6 66.2A2 2 0 0 1 220.6 64.2L220.6 50.2A2 2 0 0 1 222.6 48.2\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M222.6 122.7L487.1 122.7A2 2 0 0 1 489.1 124.7L489.1 138.7A2 2 0 0 1 487.1 140.7L222.6 140.7A2 2 0 0 1 220.6 138.7L220.6 124.7A2 2 0 0 1 222.6 122.7\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M222.6 197.1L442.4 197.1A2 2 0 0 1 444.4 199.1L444.4 213.1A2 2 0 0 1 442.4 215.1L222.6 215.1A2 2 0 0 1 220.6 213.1L220.6 199.1A2 2 0 0 1 222.6 197.1\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<path d=\"M222.6 271.6L420 271.6A2 2 0 0 1 422 273.6L422 287.6A2 2 0 0 1 420 289.6L222.6 289.6A2 2 0 0 1 220.6 287.6L220.6 273.6A2 2 0 0 1 222.6 271.6\" fill=\"#c8e66b\" class=\"ec-energy-cls-1\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(785 57.225)\" fill=\"#dbe7f0\">2500</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(494.112 131.675)\" fill=\"#dbe7f0\">1200</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(449.36 206.125)\" fill=\"#dbe7f0\">1000</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(426.984 280.575)\" fill=\"#dbe7f0\">900</text>\n</svg>",
    "width": 800,
    "height": 340,
    "rung": 1,
    "model": "anthropic/claude-opus-4.8",
    "generatedAt": "2026-09-23T10:41:29.608Z"
  },
  "dc": {
    "section": "dc",
    "title": "Frontier AI sites: power against capital cost",
    "caption": "Each point is a site in Epoch AI's frontier register with both a stated power capacity and a stated capital cost — the further above the trend, the more each megawatt cost to build.",
    "spec": {
      "chartType": "Scatter Plot",
      "columns": [
        {
          "name": "Site",
          "semanticType": "Name"
        },
        {
          "name": "Power (MW)",
          "semanticType": "Quantity"
        },
        {
          "name": "Capital cost (USD bn)",
          "semanticType": "Amount"
        }
      ],
      "rows": [
        [
          "Colossus 2",
          946,
          35.84
        ],
        [
          "Anthropic-Amazon New…",
          910,
          34.47
        ],
        [
          "Microsoft Fairwater…",
          636,
          24.09
        ],
        [
          "Meta Prometheus",
          562,
          21.29
        ],
        [
          "OpenAI Stargate…",
          421,
          15.95
        ],
        [
          "Microsoft Fairwater…",
          369,
          13.98
        ],
        [
          "Google Pryor (North)",
          368,
          13.94
        ],
        [
          "Colossus 1",
          340,
          12.88
        ]
      ],
      "encodings": {
        "x": "Power (MW)",
        "y": [
          "Capital cost (USD bn)"
        ],
        "color": "Site"
      }
    },
    "sources": [
      {
        "name": "Epoch AI · Frontier Data Centers Hub",
        "url": "https://epoch.ai/data/ai-data-centers"
      }
    ],
    "storyIds": [],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M28.4 238.5L460 238.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 201.5L460 201.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 165.5L460 165.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 129.5L460 129.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 92.5L460 92.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 56.5L460 56.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 20.5L460 20.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.5 20L28.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M90.5 20L90.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M151.5 20L151.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M213.5 20L213.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M275.5 20L275.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M336.5 20L336.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M398.5 20L398.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M460.5 20L460.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"-3.1\" transform=\"matrix(0,-1,1,0,-11.6,128.9)\" fill=\"#5f6b76\">Capital cost (USD bn)</text>\n<path d=\"M28.5 237.8L28.5 20\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-dc-cls-2\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(244.2 263.8)\" fill=\"#5f6b76\">Power (MW)</text>\n<path d=\"M28.4 238.5L460 238.5\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 238.5L23.4 238.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 201.5L23.4 201.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 165.5L23.4 165.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 129.5L23.4 129.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 92.5L23.4 92.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 56.5L23.4 56.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.4 20.5L23.4 20.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M28.5 237.8L28.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M90.5 237.8L90.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M151.5 237.8L151.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M213.5 237.8L213.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M275.5 237.8L275.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M336.5 237.8L336.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M398.5 237.8L398.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<path d=\"M460.5 237.8L460.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-dc-cls-2\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(20.4 237.8)\" fill=\"#8b98a5\">10</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(20.4 201.5)\" fill=\"#8b98a5\">15</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(20.4 165.2)\" fill=\"#8b98a5\">20</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(20.4 128.9)\" fill=\"#8b98a5\">25</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(20.4 92.6)\" fill=\"#8b98a5\">30</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(20.4 56.3)\" fill=\"#8b98a5\">35</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(20.4 20)\" fill=\"#8b98a5\">40</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(28.4 245.8)\" fill=\"#8b98a5\">300</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(90.0571 245.8)\" fill=\"#8b98a5\">400</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(151.7143 245.8)\" fill=\"#8b98a5\">500</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(213.3714 245.8)\" fill=\"#8b98a5\">600</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(275.0286 245.8)\" fill=\"#8b98a5\">700</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(336.6857 245.8)\" fill=\"#8b98a5\">800</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(398.3429 245.8)\" fill=\"#8b98a5\">900</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(460 245.8)\" fill=\"#8b98a5\">1,000</text>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,426.7051,50.2016)\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,404.5086,60.1478)\" fill=\"#5eead4\" class=\"ec-dc-cls-4\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,235.568,135.5066)\" fill=\"#14a3ba\" class=\"ec-dc-cls-5\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,70.9434,208.9052)\" fill=\"#14a3ba\" class=\"ec-dc-cls-5\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,189.9417,155.8346)\" fill=\"#d4705f\" class=\"ec-dc-cls-6\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,103.0051,194.603)\" fill=\"#a5f3fc\" class=\"ec-dc-cls-7\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,70.3269,209.1956)\" fill=\"#8b98a5\" class=\"ec-dc-cls-8\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5.5,0,0,5.5,53.0629,216.8912)\" fill=\"#22d3ee\" class=\"ec-dc-cls-3\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(437.2051 50.2016)\" fill=\"#8b98a5\">Colossus 2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(415.0086 60.1478)\" fill=\"#8b98a5\">Anthropic-Amazon New…</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(246.068 135.5066)\" fill=\"#8b98a5\">Microsoft Fairwater…</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(81.4434 208.9052)\" fill=\"#8b98a5\">Microsoft Fairwater…</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(200.4417 155.8346)\" fill=\"#8b98a5\">Meta Prometheus</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(113.5051 194.603)\" fill=\"#8b98a5\">OpenAI Stargate…</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(63.5629 216.8912)\" fill=\"#8b98a5\">Colossus 1</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T10:41:29.608Z"
  },
  "hyper": {
    "section": "hyper",
    "title": "Hyperscalers, indexed over the last 10 sessions",
    "caption": "Closing prices on each company's home exchange, indexed to 100 at the first session shown, for the 5 hyperscalers that moved most over the window.",
    "spec": {
      "chartType": "Line Chart",
      "columns": [
        {
          "name": "Session",
          "semanticType": "Category"
        },
        {
          "name": "Company",
          "semanticType": "Category"
        },
        {
          "name": "Index (first session = 100)",
          "semanticType": "Quantity"
        }
      ],
      "rows": [
        [
          "8 Sep",
          "Meta Platforms",
          100
        ],
        [
          "9 Sep",
          "Meta Platforms",
          106.55
        ],
        [
          "10 Sep",
          "Meta Platforms",
          105.04
        ],
        [
          "11 Sep",
          "Meta Platforms",
          105.63
        ],
        [
          "14 Sep",
          "Meta Platforms",
          108.5
        ],
        [
          "15 Sep",
          "Meta Platforms",
          109.25
        ],
        [
          "16 Sep",
          "Meta Platforms",
          109.75
        ],
        [
          "17 Sep",
          "Meta Platforms",
          111.22
        ],
        [
          "18 Sep",
          "Meta Platforms",
          108.52
        ],
        [
          "21 Sep",
          "Meta Platforms",
          120.83
        ],
        [
          "8 Sep",
          "Oracle",
          100
        ],
        [
          "9 Sep",
          "Oracle",
          99.45
        ],
        [
          "10 Sep",
          "Oracle",
          94.11
        ],
        [
          "11 Sep",
          "Oracle",
          92.47
        ],
        [
          "14 Sep",
          "Oracle",
          89.09
        ],
        [
          "15 Sep",
          "Oracle",
          86.36
        ],
        [
          "16 Sep",
          "Oracle",
          88.09
        ],
        [
          "17 Sep",
          "Oracle",
          92.66
        ],
        [
          "18 Sep",
          "Oracle",
          90.83
        ],
        [
          "21 Sep",
          "Oracle",
          91.41
        ],
        [
          "8 Sep",
          "Microsoft",
          100
        ],
        [
          "9 Sep",
          "Microsoft",
          99.53
        ],
        [
          "10 Sep",
          "Microsoft",
          99.69
        ],
        [
          "11 Sep",
          "Microsoft",
          100.34
        ],
        [
          "14 Sep",
          "Microsoft",
          102.32
        ],
        [
          "15 Sep",
          "Microsoft",
          100.64
        ],
        [
          "16 Sep",
          "Microsoft",
          99.26
        ],
        [
          "17 Sep",
          "Microsoft",
          100.77
        ],
        [
          "18 Sep",
          "Microsoft",
          99.97
        ],
        [
          "21 Sep",
          "Microsoft",
          101.55
        ],
        [
          "8 Sep",
          "Alphabet",
          100
        ],
        [
          "9 Sep",
          "Alphabet",
          97.72
        ],
        [
          "10 Sep",
          "Alphabet",
          98.3
        ],
        [
          "11 Sep",
          "Alphabet",
          100.04
        ],
        [
          "14 Sep",
          "Alphabet",
          103.26
        ],
        [
          "15 Sep",
          "Alphabet",
          101.96
        ],
        [
          "16 Sep",
          "Alphabet",
          101.33
        ],
        [
          "17 Sep",
          "Alphabet",
          102.65
        ],
        [
          "18 Sep",
          "Alphabet",
          103.3
        ],
        [
          "21 Sep",
          "Alphabet",
          104.91
        ],
        [
          "8 Sep",
          "Amazon",
          100
        ],
        [
          "9 Sep",
          "Amazon",
          98.22
        ],
        [
          "10 Sep",
          "Amazon",
          98.02
        ],
        [
          "11 Sep",
          "Amazon",
          99.93
        ],
        [
          "14 Sep",
          "Amazon",
          98.67
        ],
        [
          "15 Sep",
          "Amazon",
          96.67
        ],
        [
          "16 Sep",
          "Amazon",
          95.72
        ],
        [
          "17 Sep",
          "Amazon",
          97.75
        ],
        [
          "18 Sep",
          "Amazon",
          98.73
        ],
        [
          "21 Sep",
          "Amazon",
          100.58
        ]
      ],
      "encodings": {
        "x": "Session",
        "y": [
          "Index (first session = 100)"
        ],
        "color": "Company"
      }
    },
    "sources": [
      {
        "name": "Tracked stocks · home-exchange closes",
        "url": "https://www.vizmaya.fyi/ai-data-centers"
      }
    ],
    "storyIds": [],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M34.6 238.5L376 238.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 210.5L376 210.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 183.5L376 183.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 156.5L376 156.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 129.5L376 129.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 101.5L376 101.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 74.5L376 74.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 47.5L376 47.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 20.5L376 20.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"-3.1\" transform=\"matrix(0,-1,1,0,-5.4,128.9)\" fill=\"#5f6b76\">Index (first session = 100)</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(205.3 263.8)\" fill=\"#5f6b76\">Session</text>\n<path d=\"M34.6 238.5L376 238.5\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 238.5L29.6 238.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 210.5L29.6 210.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 183.5L29.6 183.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 156.5L29.6 156.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 129.5L29.6 129.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 101.5L29.6 101.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 74.5L29.6 74.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 47.5L29.6 47.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M34.6 20.5L29.6 20.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M51.5 237.8L51.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M120.5 237.8L120.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M188.5 237.8L188.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M256.5 237.8L256.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<path d=\"M325.5 237.8L325.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-hyper-cls-9\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 237.8)\" fill=\"#8b98a5\">85</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 210.575)\" fill=\"#8b98a5\">90</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 183.35)\" fill=\"#8b98a5\">95</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 156.125)\" fill=\"#8b98a5\">100</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 128.9)\" fill=\"#8b98a5\">105</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 101.675)\" fill=\"#8b98a5\">110</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 74.45)\" fill=\"#8b98a5\">115</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 47.225)\" fill=\"#8b98a5\">120</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 20)\" fill=\"#8b98a5\">125</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(51.67 245.8)\" fill=\"#8b98a5\">8 Sep</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(119.95 245.8)\" fill=\"#8b98a5\">10 Sep</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(188.23 245.8)\" fill=\"#8b98a5\">14 Sep</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(256.51 245.8)\" fill=\"#8b98a5\">16 Sep</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(324.79 245.8)\" fill=\"#8b98a5\">18 Sep</text>\n<g clip-path=\"url(#ec-hyper-c0)\">\n<path d=\"M51.7 156.1L85.8 120.5L119.9 128.7L154.1 125.5L188.2 109.8L222.4 105.8L256.5 103L290.6 95L324.8 109.7L358.9 42.7\" fill=\"none\" stroke=\"#22d3ee\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-hyper-cls-11\"></path>\n</g>\n<g clip-path=\"url(#ec-hyper-c1)\">\n<path d=\"M51.7 156.1L85.8 159.1L119.9 188.2L154.1 197.1L188.2 215.5L222.4 230.4L256.5 221L290.6 196.1L324.8 206.1L358.9 202.9\" fill=\"none\" stroke=\"#5eead4\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-hyper-cls-11\"></path>\n</g>\n<g clip-path=\"url(#ec-hyper-c2)\">\n<path d=\"M51.7 156.1L85.8 158.7L119.9 157.8L154.1 154.3L188.2 143.5L222.4 152.6L256.5 160.2L290.6 151.9L324.8 156.3L358.9 147.7\" fill=\"none\" stroke=\"#14a3ba\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-hyper-cls-11\"></path>\n</g>\n<g clip-path=\"url(#ec-hyper-c3)\">\n<path d=\"M51.7 156.1L85.8 168.5L119.9 165.4L154.1 155.9L188.2 138.4L222.4 145.5L256.5 148.9L290.6 141.7L324.8 138.2L358.9 129.4\" fill=\"none\" stroke=\"#d4705f\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-hyper-cls-11\"></path>\n</g>\n<g clip-path=\"url(#ec-hyper-c4)\">\n<path d=\"M51.7 156.1L85.8 165.8L119.9 166.9L154.1 156.5L188.2 163.4L222.4 174.3L256.5 179.4L290.6 168.4L324.8 163L358.9 153\" fill=\"none\" stroke=\"#a5f3fc\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-hyper-cls-11\"></path>\n</g>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(366.93 42.7057)\" fill=\"#8b98a5\">Meta Platforms</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(366.93 202.8976)\" fill=\"#8b98a5\">Oracle</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(366.93 147.6853)\" fill=\"#8b98a5\">Microsoft</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(366.93 129.39)\" fill=\"#8b98a5\">Alphabet</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(366.93 152.9669)\" fill=\"#8b98a5\">Amazon</text>\n<defs >\n<clipPath id=\"ec-hyper-c0\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-hyper-cls-10\"></path>\n</clipPath>\n<clipPath id=\"ec-hyper-c1\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-hyper-cls-10\"></path>\n</clipPath>\n<clipPath id=\"ec-hyper-c2\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-hyper-cls-10\"></path>\n</clipPath>\n<clipPath id=\"ec-hyper-c3\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-hyper-cls-10\"></path>\n</clipPath>\n<clipPath id=\"ec-hyper-c4\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-hyper-cls-10\"></path>\n</clipPath>\n</defs>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T10:41:29.608Z"
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M166.5 20L166.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-12\"></path>\n<path d=\"M225.5 20L225.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-12\"></path>\n<path d=\"M283.5 20L283.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-12\"></path>\n<path d=\"M342.5 20L342.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-12\"></path>\n<path d=\"M401.5 20L401.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-12\"></path>\n<path d=\"M460.5 20L460.5 237.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-semi-cls-12\"></path>\n<path d=\"M225.5 20L225.5 237.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-semi-cls-12\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(468 237.8)\" fill=\"#5f6b76\">Change (%)</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 33.6125)\" fill=\"#8b98a5\">SK hynix</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 60.8375)\" fill=\"#8b98a5\">Micron Technology</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 88.0625)\" fill=\"#8b98a5\">NVIDIA</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 115.2875)\" fill=\"#8b98a5\">SMIC</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 142.5125)\" fill=\"#8b98a5\">Samsung Electronics</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 169.7375)\" fill=\"#8b98a5\">Intel</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" transform=\"translate(158.04 196.9625)\" fill=\"#8b98a5\">TSMC</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(158.04 224.1875)\" fill=\"#8b98a5\">Advanced Micro Devices</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(166.04 245.8)\" fill=\"#5f6b76\">-2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(224.832 245.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(283.624 245.8)\" fill=\"#5f6b76\">2</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(342.416 245.8)\" fill=\"#5f6b76\">4</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(401.208 245.8)\" fill=\"#5f6b76\">6</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(460 245.8)\" fill=\"#5f6b76\">8</text>\n<path d=\"M226.8 24.6L422.7 24.6A2 2 0 0 1 424.7 26.6L424.7 40.6A2 2 0 0 1 422.7 42.6L226.8 42.6A2 2 0 0 1 224.8 40.6L224.8 26.6A2 2 0 0 1 226.8 24.6\" fill=\"#22d3ee\" class=\"ec-semi-cls-13\"></path>\n<path d=\"M226.8 51.8L372.8 51.8A2 2 0 0 1 374.8 53.8L374.8 67.8A2 2 0 0 1 372.8 69.8L226.8 69.8A2 2 0 0 1 224.8 67.8L224.8 53.8A2 2 0 0 1 226.8 51.8\" fill=\"#22d3ee\" class=\"ec-semi-cls-13\"></path>\n<path d=\"M226.8 79.1L293.4 79.1A2 2 0 0 1 295.4 81.1L295.4 95.1A2 2 0 0 1 293.4 97.1L226.8 97.1A2 2 0 0 1 224.8 95.1L224.8 81.1A2 2 0 0 1 226.8 79.1\" fill=\"#22d3ee\" class=\"ec-semi-cls-13\"></path>\n<path d=\"M226.8 106.3L278.7 106.3A2 2 0 0 1 280.7 108.3L280.7 122.3A2 2 0 0 1 278.7 124.3L226.8 124.3A2 2 0 0 1 224.8 122.3L224.8 108.3A2 2 0 0 1 226.8 106.3\" fill=\"#22d3ee\" class=\"ec-semi-cls-13\"></path>\n<path d=\"M226.8 133.5L264 133.5A2 2 0 0 1 266 135.5L266 149.5A2 2 0 0 1 264 151.5L226.8 151.5A2 2 0 0 1 224.8 149.5L224.8 135.5A2 2 0 0 1 226.8 133.5\" fill=\"#22d3ee\" class=\"ec-semi-cls-13\"></path>\n<path d=\"M191.6 160.7L222.8 160.7A2 2 0 0 1 224.8 162.7L224.8 176.7A2 2 0 0 1 222.8 178.7L191.6 178.7A2 2 0 0 1 189.6 176.7L189.6 162.7A2 2 0 0 1 191.6 160.7\" fill=\"#f0a0a0\" class=\"ec-semi-cls-14\"></path>\n<path d=\"M226.8 188L255.2 188A2 2 0 0 1 257.2 190L257.2 204A2 2 0 0 1 255.2 206L226.8 206A2 2 0 0 1 224.8 204L224.8 190A2 2 0 0 1 226.8 188\" fill=\"#22d3ee\" class=\"ec-semi-cls-13\"></path>\n<path d=\"M203.3 215.2L222.8 215.2A2 2 0 0 1 224.8 217.2L224.8 231.2A2 2 0 0 1 222.8 233.2L203.3 233.2A2 2 0 0 1 201.3 231.2L201.3 217.2A2 2 0 0 1 203.3 215.2\" fill=\"#f0a0a0\" class=\"ec-semi-cls-14\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(429.7248 33.6125)\" fill=\"#dbe7f0\">6.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(379.7516 60.8375)\" fill=\"#dbe7f0\">5.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(300.3824 88.0625)\" fill=\"#dbe7f0\">2.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(285.6844 115.2875)\" fill=\"#dbe7f0\">1.9</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(270.9864 142.5125)\" fill=\"#dbe7f0\">1.4</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(184.5568 169.7375)\" fill=\"#dbe7f0\">-1.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(262.1676 196.9625)\" fill=\"#dbe7f0\">1.1</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(196.3152 224.1875)\" fill=\"#dbe7f0\">-0.8</text>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T10:41:29.608Z"
  },
  "equip": {
    "section": "equip",
    "title": "Toolmakers from window open to close",
    "caption": "1 of 6 tracked toolmakers closed the window above where they opened it; each line is one company's close, indexed to 100 at the open.",
    "spec": {
      "chartType": "Slope Chart",
      "columns": [
        {
          "name": "Point",
          "semanticType": "Category"
        },
        {
          "name": "Company",
          "semanticType": "Category"
        },
        {
          "name": "Index (open = 100)",
          "semanticType": "Quantity"
        }
      ],
      "rows": [
        [
          "Window open",
          "Advantest",
          100
        ],
        [
          "Window close",
          "Advantest",
          87.65
        ],
        [
          "Window open",
          "Tokyo Electron",
          100
        ],
        [
          "Window close",
          "Tokyo Electron",
          92.42
        ],
        [
          "Window open",
          "Applied Materials",
          100
        ],
        [
          "Window close",
          "Applied Materials",
          95.88
        ],
        [
          "Window open",
          "Lam Research",
          100
        ],
        [
          "Window close",
          "Lam Research",
          97.46
        ],
        [
          "Window open",
          "ASML",
          100
        ],
        [
          "Window close",
          "ASML",
          98.34
        ],
        [
          "Window open",
          "KLA",
          100
        ],
        [
          "Window close",
          "KLA",
          101.32
        ]
      ],
      "encodings": {
        "x": "Point",
        "y": [
          "Index (open = 100)"
        ],
        "color": "Company"
      }
    },
    "sources": [
      {
        "name": "Tracked stocks · home-exchange closes",
        "url": "https://www.vizmaya.fyi/ai-data-centers"
      }
    ],
    "storyIds": [],
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 480 260\">\n<path d=\"M34.6 238.5L376 238.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 194.5L376 194.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 150.5L376 150.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 107.5L376 107.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 63.5L376 63.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 20.5L376 20.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"-3.1\" transform=\"matrix(0,-1,1,0,-5.4,128.9)\" fill=\"#5f6b76\">Index (open = 100)</text>\n<path d=\"M34.6 238.5L376 238.5\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 238.5L29.6 238.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 194.5L29.6 194.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 150.5L29.6 150.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 107.5L29.6 107.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 63.5L29.6 63.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M34.6 20.5L29.6 20.5\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M120.5 237.8L120.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<path d=\"M290.5 237.8L290.5 242.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-equip-cls-15\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 237.8)\" fill=\"#8b98a5\">87</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 194.24)\" fill=\"#8b98a5\">90</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 150.68)\" fill=\"#8b98a5\">93</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 107.12)\" fill=\"#8b98a5\">96</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 63.56)\" fill=\"#8b98a5\">99</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(26.6 20)\" fill=\"#8b98a5\">102</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(119.95 245.8)\" fill=\"#8b98a5\">Window open</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" y=\"3.1\" transform=\"translate(290.65 245.8)\" fill=\"#8b98a5\">Window close</text>\n<g clip-path=\"url(#ec-equip-c0)\">\n<path d=\"M119.9 49L290.6 228.4\" fill=\"none\" stroke=\"#22d3ee\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-equip-cls-17\"></path>\n</g>\n<g clip-path=\"url(#ec-equip-c1)\">\n<path d=\"M119.9 49L290.6 159.1\" fill=\"none\" stroke=\"#5eead4\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-equip-cls-17\"></path>\n</g>\n<g clip-path=\"url(#ec-equip-c2)\">\n<path d=\"M119.9 49L290.6 108.9\" fill=\"none\" stroke=\"#14a3ba\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-equip-cls-17\"></path>\n</g>\n<g clip-path=\"url(#ec-equip-c3)\">\n<path d=\"M119.9 49L290.6 85.9\" fill=\"none\" stroke=\"#d4705f\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-equip-cls-17\"></path>\n</g>\n<g clip-path=\"url(#ec-equip-c4)\">\n<path d=\"M119.9 49L290.6 73.1\" fill=\"none\" stroke=\"#a5f3fc\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-equip-cls-17\"></path>\n</g>\n<g clip-path=\"url(#ec-equip-c5)\">\n<path d=\"M119.9 49L290.6 29.9\" fill=\"none\" stroke=\"#8b98a5\" stroke-width=\"2\" stroke-linejoin=\"bevel\" class=\"ec-equip-cls-17\"></path>\n</g>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,119.95,49.04)\" fill=\"#22d3ee\" class=\"ec-equip-cls-18\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,290.65,228.362)\" fill=\"#22d3ee\" class=\"ec-equip-cls-18\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,119.95,49.04)\" fill=\"#5eead4\" class=\"ec-equip-cls-19\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,290.65,159.1016)\" fill=\"#5eead4\" class=\"ec-equip-cls-19\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,119.95,49.04)\" fill=\"#14a3ba\" class=\"ec-equip-cls-20\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,290.65,108.8624)\" fill=\"#14a3ba\" class=\"ec-equip-cls-20\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,119.95,49.04)\" fill=\"#d4705f\" class=\"ec-equip-cls-21\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,290.65,85.9208)\" fill=\"#d4705f\" class=\"ec-equip-cls-21\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,119.95,49.04)\" fill=\"#a5f3fc\" class=\"ec-equip-cls-22\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,290.65,73.1432)\" fill=\"#a5f3fc\" class=\"ec-equip-cls-22\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,119.95,49.04)\" fill=\"#8b98a5\" class=\"ec-equip-cls-23\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(2.5,0,0,2.5,290.65,29.8736)\" fill=\"#8b98a5\" class=\"ec-equip-cls-23\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(298.65 228.362)\" fill=\"#8b98a5\">Advantest</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(298.65 159.1016)\" fill=\"#8b98a5\">Tokyo Electron</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(298.65 108.8624)\" fill=\"#8b98a5\">Applied Materials</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(298.65 85.9208)\" fill=\"#8b98a5\">Lam Research</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(298.65 73.1432)\" fill=\"#8b98a5\">ASML</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(298.65 29.8736)\" fill=\"#8b98a5\">KLA</text>\n<defs >\n<clipPath id=\"ec-equip-c0\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-equip-cls-16\"></path>\n</clipPath>\n<clipPath id=\"ec-equip-c1\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-equip-cls-16\"></path>\n</clipPath>\n<clipPath id=\"ec-equip-c2\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-equip-cls-16\"></path>\n</clipPath>\n<clipPath id=\"ec-equip-c3\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-equip-cls-16\"></path>\n</clipPath>\n<clipPath id=\"ec-equip-c4\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-equip-cls-16\"></path>\n</clipPath>\n<clipPath id=\"ec-equip-c5\">\n<path d=\"M33 19l345 0l0 219.8l-345 0Z\" fill=\"#000\" class=\"ec-equip-cls-16\"></path>\n</clipPath>\n</defs>\n</svg>",
    "width": 480,
    "height": 260,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T10:41:29.608Z"
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
    "svg": "<svg width=\"100%\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\" version=\"1.1\" baseProfile=\"full\" viewBox=\"0 0 560 300\">\n<path d=\"M193.5 20L193.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-24\"></path>\n<path d=\"M262.5 20L262.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-24\"></path>\n<path d=\"M332.5 20L332.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-24\"></path>\n<path d=\"M401.5 20L401.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-24\"></path>\n<path d=\"M470.5 20L470.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-24\"></path>\n<path d=\"M540.5 20L540.5 277.8\" fill=\"none\" stroke=\"#232b33\" class=\"ec-research-cls-24\"></path>\n<path d=\"M193.5 20L193.5 277.8\" fill=\"none\" stroke=\"#232b33\" stroke-linecap=\"round\" class=\"ec-research-cls-24\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:10px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(548 277.8)\" fill=\"#5f6b76\">Gain (pts)</text>\n<path d=\"M193.5 277.8L193.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-24\"></path>\n<path d=\"M262.5 277.8L262.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-24\"></path>\n<path d=\"M332.5 277.8L332.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-24\"></path>\n<path d=\"M401.5 277.8L401.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-24\"></path>\n<path d=\"M470.5 277.8L470.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-24\"></path>\n<path d=\"M540.5 277.8L540.5 282.8\" fill=\"none\" stroke=\"#54555a\" class=\"ec-research-cls-24\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 52.225)\" fill=\"#8b98a5\">Self-Play Curricula for...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 116.675)\" fill=\"#8b98a5\">VidGround-1FPS: Long-Vi...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 181.125)\" fill=\"#8b98a5\">Latent Scratchpads:… · ...</text>\n<text dominant-baseline=\"central\" text-anchor=\"end\" style=\"font-size:11px;font-family:EditionMono;\" xml:space=\"preserve\" transform=\"translate(185.32 245.575)\" fill=\"#8b98a5\">Router Distillation:… ·...</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(193.32 285.8)\" fill=\"#5f6b76\">0</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(262.656 285.8)\" fill=\"#5f6b76\">3</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(331.992 285.8)\" fill=\"#5f6b76\">6</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(401.328 285.8)\" fill=\"#5f6b76\">9</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(470.664 285.8)\" fill=\"#5f6b76\">12</text>\n<text dominant-baseline=\"central\" text-anchor=\"middle\" style=\"font-size:10px;font-family:EditionMono;\" y=\"3.1\" transform=\"translate(540 285.8)\" fill=\"#5f6b76\">15</text>\n<path d=\"M193.3 51.5l295.8 0l0 1.5l-295.8 0Z\" fill=\"#22d3ee\" class=\"ec-research-cls-25\"></path>\n<path d=\"M193.3 115.9l226.5 0l0 1.5l-226.5 0Z\" fill=\"#22d3ee\" class=\"ec-research-cls-25\"></path>\n<path d=\"M193.3 180.4l166.4 0l0 1.5l-166.4 0Z\" fill=\"#22d3ee\" class=\"ec-research-cls-25\"></path>\n<path d=\"M193.3 244.8l94.8 0l0 1.5l-94.8 0Z\" fill=\"#22d3ee\" class=\"ec-research-cls-25\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5,0,0,5,489.1536,52.225)\" fill=\"#5eead4\" fill-opacity=\"0.8\" stroke=\"#fff\" stroke-width=\"0\" stroke-opacity=\"0.8\" class=\"ec-research-cls-26\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5,0,0,5,419.8176,116.675)\" fill=\"#5eead4\" fill-opacity=\"0.8\" stroke=\"#fff\" stroke-width=\"0\" stroke-opacity=\"0.8\" class=\"ec-research-cls-26\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5,0,0,5,359.7264,181.125)\" fill=\"#5eead4\" fill-opacity=\"0.8\" stroke=\"#fff\" stroke-width=\"0\" stroke-opacity=\"0.8\" class=\"ec-research-cls-26\"></path>\n<path d=\"M1 0A1 1 0 1 1 1 -0.1A1 1 0 0 1 1 0\" transform=\"matrix(5,0,0,5,288.0792,245.575)\" fill=\"#5eead4\" fill-opacity=\"0.8\" stroke=\"#fff\" stroke-width=\"0\" stroke-opacity=\"0.8\" class=\"ec-research-cls-26\"></path>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(502.1536 52.225)\" fill=\"#dbe7f0\" fill-opacity=\"0.8\">12.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(432.8176 116.675)\" fill=\"#dbe7f0\" fill-opacity=\"0.8\">9.8</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(372.7264 181.125)\" fill=\"#dbe7f0\" fill-opacity=\"0.8\">7.2</text>\n<text dominant-baseline=\"central\" text-anchor=\"start\" style=\"font-size:10px;font-family:EditionMono;\" transform=\"translate(301.0792 245.575)\" fill=\"#dbe7f0\" fill-opacity=\"0.8\">4.1</text>\n</svg>",
    "width": 560,
    "height": 300,
    "rung": 4,
    "model": "record",
    "generatedAt": "2026-09-23T10:41:29.608Z"
  }
}

export const SAMPLE_CHART_SKIPS: EditionChartSkip[] = [
  {
    "section": "dc",
    "reason": "rung 4 (today's plan repeated energy)"
  },
  {
    "section": "hyper",
    "reason": "rung 4 (Only two power figures (2.5 GW nuclear PPA and 900 MW solar-plus-storage tender); the rest are counts and horizons of different kinds, so fewer than three figures compare honestly on one scale.)"
  },
  {
    "section": "semi",
    "reason": "rung 4 (Only three figures and they are different kinds (two counts, one share) with no subjects to compare on one scale.)"
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
