// Vismay deck builder. Editorial-publication feel: warm cream paper, deep ink
// for chapter and close slides, terracotta accent for conviction notes, sage
// for supporting voice. Serif headers, sans body. No accent lines under titles.

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9"; // 10" x 5.625"
pres.author = "Supro";
pres.title = "Vismay";

// ── design tokens ─────────────────────────────────────────────────────────
const C = {
  ink:        "0F1419",
  inkSoft:    "2A2F3A",
  paper:      "F5F1E8",
  paperSoft:  "EBE3D2",
  paperDark:  "C9BFA8",
  terra:      "C84B31",
  terraSoft:  "E07A60",
  sage:       "5A7A6B",
  muted:      "6E635A",     // darker so italic captions on cream remain readable
  mutedLight: "B5A99C",     // for use on dark backgrounds only
  live:       "5D8B5C",
  prod:       "B88830",
  pipe:       "4F8C95",
  bench:      "B5A99C",
};

const FONT_HEAD = "Georgia";
const FONT_BODY = "Calibri";

const W = 10;
const H = 5.625;

// ── helpers ───────────────────────────────────────────────────────────────
function eyebrow(slide, text, color = C.terra, x = 0.6, y = 0.42) {
  slide.addText(text, {
    x, y, w: 8, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color, charSpacing: 6, margin: 0,
  });
}

function slideNumber(slide, n, total = 13, onDark = false) {
  slide.addText(`${String(n).padStart(2, "0")} / ${total}`, {
    x: W - 1.2, y: 0.42, w: 0.7, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9,
    color: onDark ? C.mutedLight : C.muted,
    align: "right", charSpacing: 2, margin: 0,
  });
}

function title(slide, text, opts = {}) {
  slide.addText(text, {
    x: 0.6, y: 0.85, w: 8.8, h: 0.9,
    fontFace: FONT_HEAD, fontSize: 34, color: C.ink,
    align: "left", valign: "top", margin: 0, ...opts,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 1. TITLE
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.ink };

  // small mark top-left
  s.addText("V.", {
    x: 0.6, y: 0.45, w: 0.6, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 22, color: C.terraSoft, margin: 0,
  });
  s.addText("VISMAY  ·  A STUDIO FOR HUMAN-BUILT IP", {
    x: 1.15, y: 0.5, w: 7, h: 0.3,
    fontFace: FONT_BODY, fontSize: 9, bold: true,
    color: C.terraSoft, charSpacing: 5, margin: 0,
  });

  // centered wordmark
  s.addText("Vismay.", {
    x: 0, y: 1.8, w: W, h: 1.8,
    fontFace: FONT_HEAD, fontSize: 120, color: C.paper,
    align: "center", margin: 0,
  });

  // centered dek
  s.addText("A studio for human-built IP on a reclaimed internet.", {
    x: 0, y: 3.7, w: W, h: 0.5,
    fontFace: FONT_HEAD, fontSize: 19, italic: true,
    color: C.paperSoft, align: "center", margin: 0,
  });

  // bottom rule + foot
  s.addShape(pres.shapes.LINE, {
    x: 4.4, y: 4.55, w: 1.2, h: 0,
    line: { color: C.terra, width: 1.5 },
  });
  s.addText("SUPRO  ·  2026", {
    x: 0, y: H - 0.7, w: W, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10,
    color: C.mutedLight, align: "center", charSpacing: 4, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 2. WHY NOW
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "WHY NOW");
  slideNumber(s, 2);
  title(s, "The internet stopped being ours.");

  const lines = [
    "Distribution is owned by a handful of feudal techlords.",
    "Every feed is algorithm-shaped, optimizing for something other than you.",
    "AI is eating the parts of work that were never the point.",
    "The opposite move — slow, human, named, obsessed with one thing — is suddenly available again.",
  ];

  let y = 2.1;
  for (const line of lines) {
    s.addShape(pres.shapes.OVAL, {
      x: 0.65, y: y + 0.16, w: 0.12, h: 0.12,
      fill: { color: C.terra }, line: { type: "none" },
    });
    s.addText(line, {
      x: 0.95, y, w: 8.4, h: 0.55,
      fontFace: FONT_HEAD, fontSize: 16,
      color: C.inkSoft, margin: 0, valign: "top",
    });
    y += 0.6;
  }

  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: H - 0.85, w: 0.8, h: 0,
    line: { color: C.terra, width: 1.2 },
  });
  s.addText("The conditions for this kind of work haven't been this good in fifteen years.", {
    x: 0.6, y: H - 0.7, w: 8.8, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 12, italic: true,
    color: C.muted, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 3. THESIS
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "THE THESIS");
  slideNumber(s, 3);

  // small quote mark, decoratively
  s.addText("“", {
    x: 0.6, y: 0.65, w: 1.0, h: 1.0,
    fontFace: FONT_HEAD, fontSize: 72, color: C.terra,
    margin: 0, valign: "top",
  });

  // pull quote — moved well below the quote glyph
  s.addText(
    "Reclaim a piece of the internet by\nbuilding IP with people who actually care.",
    {
      x: 0.6, y: 1.95, w: 8.8, h: 1.7,
      fontFace: FONT_HEAD, fontSize: 30, color: C.ink,
      margin: 0, paraSpaceAfter: 6,
    }
  );

  // amplification
  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: 4.1, w: 0.8, h: 0,
    line: { color: C.terra, width: 1.5 },
  });
  s.addText(
    "Pair a friend who has a real, durable obsession in a domain — with a shared engine that handles everything below the craft. Build the brand together, for the long run.",
    {
      x: 0.6, y: 4.25, w: 8.8, h: 1.0,
      fontFace: FONT_HEAD, fontSize: 14, italic: true,
      color: C.inkSoft, margin: 0,
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 4. THE DEAL
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "THE DEAL");
  slideNumber(s, 4);
  title(s, "Partner brings taste — I bring the engine.");

  const colY = 2.0;
  const rowGap = 0.55;
  const colH = 0.4 + 3 * rowGap + 0.1; // bounded
  const leftX = 0.6;
  const midX = 5.2;
  const colW = 4.2;

  // left column — Partner
  s.addText("THE PARTNER", {
    x: leftX, y: colY, w: colW, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.sage, charSpacing: 6, margin: 0,
  });
  const partnerLines = [
    "Voice, taste, obsession.",
    "Editorial direction.",
    "Owns the brand and the community.",
  ];
  partnerLines.forEach((t, i) => {
    s.addText(t, {
      x: leftX, y: colY + 0.45 + i * rowGap, w: colW, h: 0.45,
      fontFace: FONT_HEAD, fontSize: 16, color: C.ink,
      margin: 0, valign: "top",
    });
  });

  // divider — spans content area only
  s.addShape(pres.shapes.LINE, {
    x: 5.0, y: colY, w: 0, h: colH,
    line: { color: C.paperDark, width: 1 },
  });

  // right column — Vismay
  s.addText("VISMAY", {
    x: midX, y: colY, w: colW, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.terra, charSpacing: 6, margin: 0,
  });
  const vismayLines = [
    "Engine, ingest, render pipelines.",
    "Production value of a major publication.",
    "Time horizon and infrastructure.",
  ];
  vismayLines.forEach((t, i) => {
    s.addText(t, {
      x: midX, y: colY + 0.45 + i * rowGap, w: colW, h: 0.45,
      fontFace: FONT_HEAD, fontSize: 16, color: C.ink,
      margin: 0, valign: "top",
    });
  });

  // bottom pull — padded
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: H - 1.15, w: W, h: 1.15,
    fill: { color: C.paperSoft }, line: { type: "none" },
  });
  s.addText("They grow the IP. I grow with them.", {
    x: 0.6, y: H - 0.92, w: 8.8, h: 0.5,
    fontFace: FONT_HEAD, fontSize: 20, italic: true,
    color: C.ink, margin: 0, valign: "middle",
  });
  s.addText("That's what success looks like to me.", {
    x: 0.6, y: H - 0.45, w: 8.8, h: 0.32,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.muted, charSpacing: 4, margin: 0, valign: "middle",
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 5. THE PROCESS — pipeline diagram
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "THE PROCESS");
  slideNumber(s, 5);
  title(s, "Same pipeline for every IP.");

  const stages = [
    { label: "INGEST",     sub: "scraping +\ntagging",         color: C.terra },
    { label: "STORE",      sub: "supabase\npostgres",          color: C.sage  },
    { label: "AUTHOR",     sub: "human\ninstructions",         color: C.inkSoft },
    { label: "RENDER",     sub: "the engine",                  color: C.terra },
    { label: "DISTRIBUTE", sub: "video · pdf\nsocial · web",        color: C.sage },
  ];

  const startX = 0.6;
  const endX = W - 0.6;
  const boxH = 1.5;
  const boxY = 2.45;
  const totalW = endX - startX;
  const boxW = 1.55;
  const gap = (totalW - boxW * stages.length) / (stages.length - 1);

  stages.forEach((st, i) => {
    const x = startX + i * (boxW + gap);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: boxY, w: boxW, h: boxH,
      fill: { color: "FFFFFF" }, line: { color: C.paperDark, width: 1 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: boxY, w: boxW, h: 0.12,
      fill: { color: st.color }, line: { type: "none" },
    });
    s.addText(st.label, {
      x, y: boxY + 0.22, w: boxW, h: 0.35,
      fontFace: FONT_BODY, fontSize: 11, bold: true, color: C.ink,
      align: "center", charSpacing: 4, margin: 0,
    });
    s.addText(st.sub, {
      x: x + 0.08, y: boxY + 0.65, w: boxW - 0.16, h: 0.8,
      fontFace: FONT_HEAD, fontSize: 11, italic: true,
      color: C.muted, align: "center", margin: 0,
    });
    // chunkier arrows
    if (i < stages.length - 1) {
      const ax = x + boxW + 0.04;
      s.addShape(pres.shapes.LINE, {
        x: ax, y: boxY + boxH / 2, w: gap - 0.08, h: 0,
        line: { color: C.inkSoft, width: 1.5, endArrowType: "triangle" },
      });
    }
  });

  // input feeder above INGEST
  s.addText("Internet  ·  existing data + new / news", {
    x: startX, y: 1.95, w: boxW * 2.6, h: 0.4,
    fontFace: FONT_BODY, fontSize: 9, bold: true,
    color: C.muted, charSpacing: 3, margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: startX + boxW / 2, y: 2.28, w: 0, h: 0.13,
    line: { color: C.muted, width: 1, endArrowType: "triangle" },
  });

  // bottom captions
  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: H - 1.0, w: 0.8, h: 0,
    line: { color: C.terra, width: 1.2 },
  });
  s.addText("Ingest is the only thing that changes per IP.", {
    x: 0.6, y: H - 0.85, w: 9, h: 0.32,
    fontFace: FONT_HEAD, fontSize: 13, italic: true,
    color: C.inkSoft, margin: 0,
  });
  s.addText("Storage, engine, and surfaces are shared infrastructure — partners never touch code.", {
    x: 0.6, y: H - 0.5, w: 9, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10,
    color: C.muted, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 6. PORTFOLIO — LIVE
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "PORTFOLIO  ·  LIVE");
  slideNumber(s, 6);
  title(s, "Two IPs running today.");

  function bigTile(x, name, domain, since, stories, owner) {
    const tileY = 2.0;
    const tileW = 4.3;
    const tileH = 2.85;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: tileY, w: tileW, h: tileH,
      fill: { color: "FFFFFF" }, line: { color: C.paperDark, width: 1 },
    });
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
      x: x + 0.3, y: tileY + 0.3, w: 0.65, h: 0.28,
      fill: { color: C.live }, line: { type: "none" }, rectRadius: 0.14,
    });
    s.addText("LIVE", {
      x: x + 0.3, y: tileY + 0.3, w: 0.65, h: 0.28,
      fontFace: FONT_BODY, fontSize: 9, bold: true, color: "FFFFFF",
      align: "center", valign: "middle", charSpacing: 4, margin: 0,
    });
    s.addText(name, {
      x: x + 0.3, y: tileY + 0.75, w: tileW - 0.6, h: 0.7,
      fontFace: FONT_HEAD, fontSize: 30, color: C.ink, margin: 0,
    });
    s.addText(domain, {
      x: x + 0.3, y: tileY + 1.5, w: tileW - 0.6, h: 0.5,
      fontFace: FONT_HEAD, fontSize: 13, italic: true,
      color: C.inkSoft, margin: 0,
    });
    // stat row
    s.addShape(pres.shapes.LINE, {
      x: x + 0.3, y: tileY + 2.05, w: tileW - 0.6, h: 0,
      line: { color: C.paperDark, width: 1 },
    });
    s.addText(stories, {
      x: x + 0.3, y: tileY + 2.15, w: tileW - 0.6, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, color: C.muted,
      charSpacing: 2, margin: 0,
    });
    s.addText(owner, {
      x: x + 0.3, y: tileY + tileH - 0.45, w: tileW - 0.6, h: 0.3,
      fontFace: FONT_BODY, fontSize: 10, bold: true, color: C.terra,
      charSpacing: 3, margin: 0,
    });
  }

  bigTile(0.55, "vizmaya.fyi", "Geopolitics · Economics · Technology", "Since 2025", "17+ published stories  ·  2 live epics", "STEWARD  ·  SUPRO");
  bigTile(5.15, "Footshort",    "Football",                              "Since 2025", "Web · Mobile · Native vertical bundle",         "STEWARD  ·  SUPRO");

  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: H - 0.65, w: 0.8, h: 0,
    line: { color: C.terra, width: 1.2 },
  });
  s.addText("Started with the two I could run alone — to harden the engine on real production load before bringing partners in.", {
    x: 0.6, y: H - 0.5, w: 9, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 12, italic: true,
    color: C.muted, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 7. PORTFOLIO — IN MOTION (in production + in pipeline)
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "PORTFOLIO  ·  IN MOTION");
  slideNumber(s, 7);
  title(s, "The next wave is partner-led.");

  function tile(x, y, w, h, statusColor, name, domain, partner) {
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w, h,
      fill: { color: "FFFFFF" }, line: { color: C.paperDark, width: 1 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.08, h,
      fill: { color: statusColor }, line: { type: "none" },
    });
    s.addText(name, {
      x: x + 0.22, y: y + 0.18, w: w - 0.35, h: 0.4,
      fontFace: FONT_HEAD, fontSize: 15, color: C.ink, margin: 0,
    });
    s.addText(domain, {
      x: x + 0.22, y: y + 0.6, w: w - 0.35, h: 0.3,
      fontFace: FONT_HEAD, fontSize: 11, italic: true,
      color: C.inkSoft, margin: 0,
    });
    s.addText(partner || "OPEN PARTNER", {
      x: x + 0.22, y: y + h - 0.35, w: w - 0.35, h: 0.25,
      fontFace: FONT_BODY, fontSize: 9, bold: true,
      color: partner ? C.terra : C.mutedLight,
      charSpacing: 3, margin: 0,
    });
  }

  // IN PRODUCTION — 4 tiles
  s.addText("IN PRODUCTION", {
    x: 0.6, y: 1.85, w: 4, h: 0.25,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.prod, charSpacing: 5, margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: 2.1, w: W - 1.2, h: 0,
    line: { color: C.paperDark, width: 0.5 },
  });
  const prodTiles = [
    ["Kidzovo",            "Kids",            ""],
    ["Protrip",            "Travel",          ""],
    ["F1",                 "Formula 1",       "ROHIT"],
    ["Enterprise + Finance","Markets",        "SHASHANK"],
  ];
  const pY = 2.2;
  const pH = 1.2;
  const pCols = 4;
  const startX = 0.6;
  const totalW = W - 1.2;
  const pGap = 0.15;
  const pW = (totalW - pGap * (pCols - 1)) / pCols;
  prodTiles.forEach(([name, domain, partner], i) => {
    const x = startX + i * (pW + pGap);
    tile(x, pY, pW, pH, C.prod, name, domain, partner);
  });

  // IN PIPELINE — 3 tiles + ghost 4th
  s.addText("IN PIPELINE", {
    x: 0.6, y: 3.65, w: 4, h: 0.25,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.pipe, charSpacing: 5, margin: 0,
  });
  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: 3.9, w: W - 1.2, h: 0,
    line: { color: C.paperDark, width: 0.5 },
  });
  const pipeTiles = [
    ["Skincare + Beauty",  "Beauty",  "VANSHIKA"],
    ["Fashion + Styling",  "Style",   "VANSHIKA"],
    ["Music & Events",     "Culture", "RETRO BLXXD"],
  ];
  const qY = 4.0;
  pipeTiles.forEach(([name, domain, partner], i) => {
    const x = startX + i * (pW + pGap);
    tile(x, qY, pW, pH, C.pipe, name, domain, partner);
  });
  // ghost 4th slot
  const ghostX = startX + 3 * (pW + pGap);
  s.addShape(pres.shapes.RECTANGLE, {
    x: ghostX, y: qY, w: pW, h: pH,
    fill: { color: C.paperSoft }, line: { color: C.paperDark, width: 0.5, dashType: "dash" },
  });
  s.addText("+ MORE\nIN DEVELOPMENT", {
    x: ghostX, y: qY, w: pW, h: pH,
    fontFace: FONT_BODY, fontSize: 9, bold: true,
    color: C.mutedLight, align: "center", valign: "middle",
    charSpacing: 3, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 8. PORTFOLIO — ON THE BENCH
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "PORTFOLIO  ·  ON THE BENCH");
  slideNumber(s, 8);
  title(s, "Domains I want to do, partner pending.");

  // intro caption — comfortably below title
  s.addText("Some have a person attached. The rest are open invitations to the right person.", {
    x: 0.6, y: 2.05, w: 8.8, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 12, italic: true,
    color: C.muted, margin: 0,
  });

  const items = [
    ["Architecture",          ""],
    ["Cricket",               "SACHIN / SHUBHAM"],
    ["Spirituality",          "ROHIT"],
    ["Art",                   ""],
    ["Entertainment",         ""],
    ["Food & Recipe",         ""],
    ["Science / Space",       ""],
    ["Pets",                  ""],
    ["Manufacturing — India", "PADMA"],
  ];

  const cols = 3;
  const tileW = 2.9;
  const tileH = 0.78;
  const startX = 0.6;
  const startY = 2.5;
  const gapX = (W - 2 * 0.6 - tileW * cols) / (cols - 1);
  const gapY = 0.13;

  items.forEach(([name, partner], i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = startX + c * (tileW + gapX);
    const y = startY + r * (tileH + gapY);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: tileW, h: tileH,
      fill: { color: C.paperSoft }, line: { color: C.paperDark, width: 1 },
    });
    s.addText(name, {
      x: x + 0.22, y: y + 0.12, w: tileW - 0.35, h: 0.35,
      fontFace: FONT_HEAD, fontSize: 15, color: C.ink, margin: 0,
    });
    s.addText(partner || "OPEN  ·  LOOKING FOR THE RIGHT PERSON", {
      x: x + 0.22, y: y + 0.5, w: tileW - 0.35, h: 0.3,
      fontFace: FONT_BODY, fontSize: 8, bold: true,
      color: partner ? C.terra : C.mutedLight,
      charSpacing: 3, margin: 0,
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 9. THE ENGINE (dark)
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.ink };

  s.addText("THE ENGINE", {
    x: 0.6, y: 0.42, w: 8, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.terraSoft, charSpacing: 6, margin: 0,
  });
  slideNumber(s, 9, 13, true);

  s.addText("@vismay/viz-engine", {
    x: 0.6, y: 0.85, w: 9, h: 0.65,
    fontFace: FONT_HEAD, fontSize: 32, color: C.paper, margin: 0,
  });
  s.addText("One runtime, three persistent layers.", {
    x: 0.6, y: 1.42, w: 9, h: 0.45,
    fontFace: FONT_HEAD, fontSize: 15, italic: true,
    color: C.paperSoft, margin: 0,
  });

  // Left column — three-layer diagram
  s.addText("THE STACK", {
    x: 0.6, y: 2.05, w: 4, h: 0.25,
    fontFace: FONT_BODY, fontSize: 9, bold: true,
    color: C.terraSoft, charSpacing: 5, margin: 0,
  });
  const layers = [
    { label: "TEXT CARDS",     sub: "markdown · snap-locked",         color: C.terra },
    { label: "FOREGROUND VIZ", sub: "ECharts · transitions in-place", color: C.sage  },
    { label: "BACKGROUND VIZ", sub: "Mapbox GL · persistent context", color: C.pipe  },
  ];
  const lY = 2.4;
  const lH = 0.55;
  const lGap = 0.1;
  layers.forEach((L, i) => {
    const y = lY + i * (lH + lGap);
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y, w: 4.3, h: lH,
      fill: { color: C.inkSoft }, line: { type: "none" },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y, w: 0.1, h: lH,
      fill: { color: L.color }, line: { type: "none" },
    });
    s.addText(L.label, {
      x: 0.85, y: y + 0.06, w: 2.5, h: 0.22,
      fontFace: FONT_BODY, fontSize: 10, bold: true,
      color: C.paper, charSpacing: 4, margin: 0,
    });
    s.addText(L.sub, {
      x: 0.85, y: y + 0.28, w: 4.0, h: 0.25,
      fontFace: FONT_HEAD, fontSize: 10, italic: true,
      color: C.mutedLight, margin: 0,
    });
  });
  s.addText("Driven by IntersectionObserver. Persistent WebGL across the whole story.", {
    x: 0.6, y: 4.3, w: 4.4, h: 0.45,
    fontFace: FONT_BODY, fontSize: 9, italic: true,
    color: C.mutedLight, margin: 0,
  });

  // Right column
  const rX = 5.4;
  s.addText("WHAT IT CARRIES", {
    x: rX, y: 2.05, w: 3.5, h: 0.25,
    fontFace: FONT_BODY, fontSize: 9, bold: true,
    color: C.terraSoft, charSpacing: 5, margin: 0,
  });
  const carries = [
    "Module registry — map · chart · image · video · embed · rive",
    "Verticals as tree-shaken plugins",
    "Render pipelines — MP4 · PDF · TTS audio",
    "/admin authoring — no redeploys",
  ];
  carries.forEach((c, i) => {
    s.addShape(pres.shapes.OVAL, {
      x: rX, y: 2.5 + i * 0.55, w: 0.08, h: 0.08,
      fill: { color: C.terra }, line: { type: "none" },
    });
    s.addText(c, {
      x: rX + 0.2, y: 2.42 + i * 0.55, w: 4.2, h: 0.4,
      fontFace: FONT_HEAD, fontSize: 12, color: C.paper, margin: 0,
    });
  });

  // tech stack strip
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: H - 0.7, w: W, h: 0.7,
    fill: { color: "060A0E" }, line: { type: "none" },
  });
  s.addText(
    "Next.js 16  ·  React 19  ·  TypeScript  ·  Supabase  ·  Mapbox GL  ·  Apache ECharts  ·  GSAP  ·  Rive  ·  Playwright  ·  Gemini",
    {
      x: 0.6, y: H - 0.55, w: 8.8, h: 0.4,
      fontFace: FONT_BODY, fontSize: 10, color: C.mutedLight,
      charSpacing: 1, align: "center", margin: 0, valign: "middle",
    }
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 10. PROOF — vizmaya.fyi stories
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "PROOF  ·  VIZMAYA.FYI");
  slideNumber(s, 10);
  title(s, "17+ live stories. One engine.");

  const stories = [
    "Currency rankings 2026",
    "Who owns America's debt",
    "Projected population 2050",
    "World Cup 2026 atlas",
    "India fuel prices 2026",
    "South Korea GPU-hour",
    "European AI adoption",
    "Prediction markets illusion",
    "The Great Nicobar project",
    "Press freedom 2026",
    "GDP growth 2026",
    "Largest armies 2026",
  ];

  const cols = 3;
  const tileW = 2.93;
  const tileH = 0.4;
  const startX = 0.6;
  const startY = 1.85;
  const gapX = (W - 1.2 - tileW * cols) / (cols - 1);
  const gapY = 0.09;

  stories.forEach((t, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const x = startX + c * (tileW + gapX);
    const y = startY + r * (tileH + gapY);
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: tileW, h: tileH,
      fill: { color: "FFFFFF" }, line: { color: C.paperDark, width: 1 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: 0.06, h: tileH,
      fill: { color: C.terra }, line: { type: "none" },
    });
    s.addText(t, {
      x: x + 0.18, y, w: tileW - 0.3, h: tileH,
      fontFace: FONT_HEAD, fontSize: 11, color: C.ink,
      valign: "middle", margin: 0,
    });
  });

  // grid ends at startY + 4*tileH + 3*gapY = 1.85 + 1.6 + 0.27 = 3.72
  // +more line
  s.addText("+ five more on geopolitics, housing, delimitation, AI adoption, and economic divides", {
    x: 0.6, y: 3.85, w: 8.8, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, italic: true,
    color: C.muted, margin: 0,
  });

  // epics callout — single row, well within bounds
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 4.4, w: W, h: 1.225,
    fill: { color: C.paperSoft }, line: { type: "none" },
  });
  s.addText("EPICS", {
    x: 0.6, y: 4.5, w: 1, h: 0.25,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.sage, charSpacing: 5, margin: 0,
  });
  // /energy-profile
  s.addText("/energy-profile", {
    x: 0.6, y: 4.78, w: 2.0, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 13, bold: true, color: C.ink, margin: 0,
  });
  s.addText("daily IEA news ingest + 33-country OWID energy data", {
    x: 2.55, y: 4.8, w: 6.8, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 11, italic: true, color: C.inkSoft, margin: 0,
  });
  // /epstein
  s.addText("/epstein", {
    x: 0.6, y: 5.18, w: 2.0, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 13, bold: true, color: C.ink, margin: 0,
  });
  s.addText("curated story set with a bespoke landing", {
    x: 2.55, y: 5.2, w: 6.8, h: 0.3,
    fontFace: FONT_HEAD, fontSize: 11, italic: true, color: C.inkSoft, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 11. WHY IT SCALES
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "THE MODEL");
  slideNumber(s, 11);
  title(s, "Breadth is a feature, not a tradeoff.");

  const rows = [
    { num: "01", label: "Engine carries production value",         sub: "every IP launches with publication-grade rendering" },
    { num: "02", label: "Partner carries authenticity",            sub: "the voice is the human, not the platform" },
    { num: "03", label: "Pipeline keeps ingest honest",            sub: "each domain has its own scrapers and tagging" },
    { num: "04", label: "I stay close enough to keep taste high",  sub: "craft work at scale, not factory work" },
  ];

  let y = 2.0;
  for (const r of rows) {
    s.addText(r.num, {
      x: 0.6, y, w: 0.9, h: 0.5,
      fontFace: FONT_HEAD, fontSize: 26, color: C.terra,
      margin: 0, valign: "top",
    });
    s.addText(r.label, {
      x: 1.5, y: y + 0.04, w: 7.9, h: 0.35,
      fontFace: FONT_HEAD, fontSize: 16, color: C.ink, margin: 0,
    });
    s.addText(r.sub, {
      x: 1.5, y: y + 0.38, w: 7.9, h: 0.3,
      fontFace: FONT_BODY, fontSize: 11, italic: true,
      color: C.muted, margin: 0,
    });
    y += 0.7;
  }

  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: 5.05, w: 0.8, h: 0,
    line: { color: C.terra, width: 1.2 },
  });
  s.addText("A small label with a shared studio — the opposite of a content farm.", {
    x: 0.6, y: 5.2, w: 8.8, h: 0.35,
    fontFace: FONT_HEAD, fontSize: 12, italic: true,
    color: C.muted, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 12. ROADMAP
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.paper };
  eyebrow(s, "ROADMAP");
  slideNumber(s, 12);
  title(s, "What's next.");

  const sections = [
    {
      head: "ENGINE",
      color: C.terra,
      body: "Extract data-bound football components into @vismay/footshort-viz. Decide on a native React Native engine when mobile editorial usage justifies it.",
    },
    {
      head: "IPs",
      color: C.sage,
      body: "Bring the four in-production partners — Kidzovo, Protrip, F1, Enterprise & Finance — to first launch.",
    },
    {
      head: "TOOLING",
      color: C.pipe,
      body: "Admin polish, validation, type-narrowed YAML so partners self-serve more.",
    },
    {
      head: "PEOPLE",
      color: C.prod,
      body: "Fill the open partner slots on the bench. Right person beats fast person.",
    },
  ];

  const blockH = 0.62;
  const gap = 0.1;
  let y = 1.95;
  for (const sec of sections) {
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.6, y, w: 0.1, h: blockH,
      fill: { color: sec.color }, line: { type: "none" },
    });
    s.addText(sec.head, {
      x: 0.85, y: y + 0.02, w: 2.0, h: 0.28,
      fontFace: FONT_BODY, fontSize: 10, bold: true,
      color: sec.color, charSpacing: 5, margin: 0,
    });
    s.addText(sec.body, {
      x: 0.85, y: y + 0.3, w: 8.5, h: 0.32,
      fontFace: FONT_HEAD, fontSize: 12, color: C.inkSoft, margin: 0,
    });
    y += blockH + gap;
  }
  // y now = 1.95 + 4*0.62 + 3*0.1 = 4.73

  s.addShape(pres.shapes.LINE, {
    x: 0.6, y: 5.1, w: 0.8, h: 0,
    line: { color: C.terra, width: 1.2 },
  });
  s.addText("Triggers are explicit — don't pull a roadmap item early just because there's capacity.", {
    x: 0.6, y: 5.22, w: 9, h: 0.35,
    fontFace: FONT_HEAD, fontSize: 12, italic: true,
    color: C.muted, margin: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────
// 13. INVITATION (dark)
// ─────────────────────────────────────────────────────────────────────────
{
  const s = pres.addSlide();
  s.background = { color: C.ink };

  s.addText("INVITATION", {
    x: 0.6, y: 0.5, w: 7, h: 0.3,
    fontFace: FONT_BODY, fontSize: 10, bold: true,
    color: C.terraSoft, charSpacing: 6, margin: 0,
  });

  s.addText("Who I'm looking for.", {
    x: 0.6, y: 0.95, w: 9, h: 1.0,
    fontFace: FONT_HEAD, fontSize: 38, color: C.paper, margin: 0,
  });

  const asks = [
    { head: "FRIENDS WITH A REAL OBSESSION",                sub: "in a domain on (or off) the list — pets, manufacturing, food, science, art, architecture, sport." },
    { head: "COLLABORATORS ON THE ENGINE",                  sub: "verticals, native rendering, content tooling, admin DX." },
    { head: "PEOPLE WHO WANT A PIECE OF THE INTERNET BACK", sub: "named, slow, human, built for the long run." },
  ];

  let y = 2.4;
  for (const a of asks) {
    s.addShape(pres.shapes.OVAL, {
      x: 0.65, y: y + 0.16, w: 0.14, h: 0.14,
      fill: { color: C.terra }, line: { type: "none" },
    });
    s.addText(a.head, {
      x: 0.95, y, w: 8.5, h: 0.35,
      fontFace: FONT_BODY, fontSize: 12, bold: true,
      color: C.paper, charSpacing: 4, margin: 0,
    });
    s.addText(a.sub, {
      x: 0.95, y: y + 0.35, w: 8.5, h: 0.3,
      fontFace: FONT_HEAD, fontSize: 12, italic: true,
      color: C.mutedLight, margin: 0,
    });
    y += 0.7;
  }

  // contact strip
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: H - 0.95, w: W, h: 0.95,
    fill: { color: "060A0E" }, line: { type: "none" },
  });
  s.addText("Supro", {
    x: 0.6, y: H - 0.82, w: 4, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 20, color: C.paper, margin: 0, valign: "middle",
  });
  s.addText("hello@promad.design", {
    x: 0.6, y: H - 0.4, w: 4, h: 0.3,
    fontFace: FONT_BODY, fontSize: 11, color: C.terraSoft,
    charSpacing: 3, margin: 0, valign: "middle",
  });
  s.addText("vismay  ·  vizmaya.fyi", {
    x: W - 4.4, y: H - 0.6, w: 3.8, h: 0.4,
    fontFace: FONT_BODY, fontSize: 11, color: C.mutedLight,
    charSpacing: 4, align: "right", margin: 0, valign: "middle",
  });
}

// ──────────────────────────────────────────────────────────────────────
pres.writeFile({ fileName: "vismay-deck.pptx" })
  .then((p) => console.log("wrote", p));
