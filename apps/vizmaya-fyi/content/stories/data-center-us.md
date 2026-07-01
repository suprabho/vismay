---
title: "So You Want to Build a Data Center"
subtitle: "A walk-through of what a 1-gigawatt AI facility actually costs — from the term sheet to the first year of operations."
byline: "Vizmaya · July 2026 · Based on Epoch AI's cost model"
date: "2026-07-01"
status: "draft"
listed: false
format: "deck"
theme:
  colors:
    background: "#f6f4ef"
    text: "#1a1c22"
    accent: "#2f4b7c"
    accent2: "#d4612a"
    teal: "#2a9d8f"
    surface: "#ffffff"
    muted: "#6b7280"
    positive: "#2a9d8f"
    amber: "#e0a13c"
    red: "#c0432f"
    line: "#e2ddd3"
  fonts:
    serif: "Fraunces"
    sans: "Inter"
    mono: "JetBrains Mono"
---

## So You Want to Build a Data Center

Congratulations — you've decided to build a one-gigawatt AI data center. Before you break ground, here's the number nobody puts on the glossy investor deck: **$38 billion** before a single chip runs a job, and **$8.5 billion** every year after that just to keep it running.

Epoch AI researchers Amelia Michael and Ben Cottier modeled the full cost of a stylized US hyperscaler facility built on NVIDIA GB200 NVL72 hardware. The line item that will surprise you isn't power — it's the servers, which alone eat 60% of the annual bill.

---

## Before You Sign Anything

Here are the numbers your term sheet needs before you sign: **$38B** up front, **$8.5B** a year after — down from a prior estimate of $10.8M per megawatt to $8.5M per megawatt.

Servers alone eat 60% of that annual bill ($5B/yr). The cost you probably budgeted hardest for — energy — is just 7% ($594M/yr). Scope: US-average inputs, GB200 NVL72 hardware, grid power only.

---

## The Line Item That Will Blindside You

You budgeted for power. You should have budgeted for servers. They cost $5,021M a year — 59% of your total annualized spend — against just $594M/yr for energy, the largest single operating line. That 8.5× gap inverts the assumption baked into most data-center pitch decks.

Facility ($1,387M/yr, 16.3%) and network infrastructure ($1,167M/yr, 13.7%) are the only other lines that matter. Labor, at $40M/yr, barely registers. And because capital costs ($7.6B/yr) outweigh operating costs ($0.9B/yr) 8 to 1, you're financing a hardware refresh cycle — not a utility bill.

---

## Where the First $38 Billion Actually Goes

Of the $37.9 billion you need before you can turn anything on, $21.2 billion — 55.9% — goes to servers alone.

Facility construction is next at $11.4 billion (30.2%), priced on Turner & Townsend's US-market index, including a 7–10% liquid-cooling premium. Networking claims $4.9 billion (13%). Land and utility works together cost you less than 1% combined — $336 million, a rounding error next to the hardware.

---

## Welcome to Your Mortgage

Annualized capital costs run $7,607M a year — 89.3% of everything you'll spend annually. Operating costs are just $907M/year (10.7%), and even within that, energy is the biggest slice at $594M.

A facility drawing enough electricity to power a small city is, on paper, still a capital story — not an energy story. Servers depreciate on a 5-year capital recovery factor of 0.24; facilities stretch to 14 years at 0.13. Change those lifespan assumptions and the whole mortgage resizes — which is exactly what the next chart shows.

---

## The One Decision That Costs You $6 Billion

Refresh your servers every 3 years and your annual bill jumps to ~$13B. Stretch it to 7 years and it falls to ~$7B. That ~$6B swing dwarfs every other line item in the model.

The base case — 5 years, grounded in Alphabet's own 10-K depreciation disclosures — lands at $8.5B/yr. Facility lifespan stays fixed at 14 years across every scenario. No procurement call you make moves the needle more than this one.

---

## Read the Fine Print Before You Break Ground

Epoch AI flags six limits before you take this model to your board: this is a stylized model, not any real facility; it assumes grid-only power and an all-GB200 NVL72 server fleet — swap the architecture or the power source and networking, cooling, and power costs all shift.

Inputs use US averages; your actual costs will vary by state. Tax abatement estimates carry real uncertainty — many incentive agreements are incomplete or not directly comparable to whatever your state offers.

The $8.5B/year base case assumes a 5-year IT lifespan. That figure climbs to ~$13B at 3 years and falls to ~$7B at 7 years. Treat this model as a floor, not a ceiling.

---

## So, Are You Still Building One?

The dominant cost of frontier AI infrastructure was never going to be electricity — it's capital, locked into hardware that depreciates faster than your construction loan matures. Servers alone consume 60% of the annual bill; energy, despite running one gigawatt continuously, is just 7%.

The $38B is your entry ticket — the minimum buy-in. The $8.5B/year that follows is the mortgage payment, and it swings by $6B depending entirely on how long you can make the hardware last, from ~$13B/yr at 3 years to ~$7B/yr at 7 years.

Full model: docs.google.com/spreadsheets/d/1-iqUky_cR4Kvmv9pLs67ChQLlCfSXVqV955ARmx2ypc — CC BY 4.0, Epoch AI (Amelia Michael & Ben Cottier, May 14, 2026).
