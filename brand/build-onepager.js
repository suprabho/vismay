// Vismay one-pager — A4 portrait, single page. Editorial publication feel,
// matched to the deck's design language. Disciplined: each section budgets a
// fixed height; no overflow into the footer.

const pptxgen = require("pptxgenjs");

const pres = new pptxgen();
pres.defineLayout({ name: "A4P", width: 8.27, height: 11.69 });
pres.layout = "A4P";
pres.author = "Supro";
pres.title = "Vismay — One-pager";

const C = {
  ink:        "0F1419",
  inkSoft:    "2A2F3A",
  paper:      "F5F1E8",
  paperSoft:  "EBE3D2",
  paperDark:  "C9BFA8",
  terra:      "C84B31",
  terraSoft:  "E07A60",
  sage:       "5A7A6B",
  muted:      "6E635A",
  mutedLight: "B5A99C",
  live:       "5D8B5C",
  prod:       "B88830",
  pipe:       "4F8C95",
};

const FONT_HEAD = "Georgia";
const FONT_BODY = "Calibri";

const W = 8.27;
const H = 11.69;
const M = 0.55;

const s = pres.addSlide();
s.background = { color: C.paper };

// ── MASTHEAD (dark band, 2.05") ───────────────────────────────────────────
const mastH = 2.05;
s.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: 0, w: W, h: mastH,
  fill: { color: C.ink }, line: { type: "none" },
});

s.addText("V.", {
  x: M, y: 0.3, w: 0.5, h: 0.35,
  fontFace: FONT_HEAD, fontSize: 17, color: C.terraSoft, margin: 0,
});
s.addText("VISMAY  ·  A STUDIO FOR HUMAN-BUILT IP", {
  x: M + 0.4, y: 0.34, w: 7, h: 0.3,
  fontFace: FONT_BODY, fontSize: 9, bold: true,
  color: C.terraSoft, charSpacing: 5, margin: 0,
});

s.addText("Vismay.", {
  x: M, y: 0.7, w: W - 2 * M, h: 0.85,
  fontFace: FONT_HEAD, fontSize: 60, color: C.paper, margin: 0,
});

s.addText(
  "A studio for human-built IP on a reclaimed internet.",
  {
    x: M, y: 1.5, w: W - 2 * M, h: 0.4,
    fontFace: FONT_HEAD, fontSize: 13, italic: true,
    color: C.paperSoft, margin: 0,
  }
);

s.addShape(pres.shapes.RECTANGLE, {
  x: M, y: mastH - 0.15, w: 1.0, h: 0.025,
  fill: { color: C.terra }, line: { type: "none" },
});

// ── BODY 2-col layout ─────────────────────────────────────────────────────
const bodyTop = mastH + 0.3;
const colGap = 0.35;
const colW = (W - 2 * M - colGap) / 2;
const leftX = M;
const rightX = M + colW + colGap;

function eyebrowAt(x, y, w, text, color = C.terra) {
  s.addText(text, {
    x, y, w, h: 0.22,
    fontFace: FONT_BODY, fontSize: 8, bold: true,
    color, charSpacing: 4, margin: 0,
  });
}

function h2At(x, y, w, text, opts = {}) {
  s.addText(text, {
    x, y, w, h: opts.h || 0.4,
    fontFace: FONT_HEAD, fontSize: 14, color: C.ink, margin: 0,
    ...opts,
  });
}

function paraAt(x, y, w, h, text, opts = {}) {
  s.addText(text, {
    x, y, w, h,
    fontFace: FONT_HEAD, fontSize: 9, color: C.inkSoft,
    margin: 0, paraSpaceAfter: 2, ...opts,
  });
}

// ── LEFT COLUMN ───────────────────────────────────────────────────────────
let lY = bodyTop;

// 1) WHY (block height ~1.65)
eyebrowAt(leftX, lY, colW, "WHY");
h2At(leftX, lY + 0.22, colW, "The internet stopped being ours.");
paraAt(leftX, lY + 0.65, colW, 1.0,
  "The internet, distribution, and attention are owned by a handful of feudal techlords. Every feed is shaped by algorithms optimizing for something other than us. AI is eating the parts of work that were never the point."
);
s.addText("Vismay is my answer — it's my life's work.", {
  x: leftX, y: lY + 1.65, w: colW, h: 0.25,
  fontFace: FONT_HEAD, fontSize: 10, italic: true, color: C.ink, margin: 0,
});
lY += 2.05;

// 2) THE MODEL (~1.95)
eyebrowAt(leftX, lY, colW, "THE MODEL");
h2At(leftX, lY + 0.22, colW, "Partner brings taste — I bring the engine.");
paraAt(leftX, lY + 0.65, colW, 1.3,
  "I pair with a friend who has a real, durable obsession in a domain — football, finance, F1, fashion, kids, music, travel, food, manufacturing — and we build an IP together. They bring voice, taste, and obsession. I bring the engine, the production pipeline, and the time horizon."
);
s.addText("They own the brand. They grow it. I grow with them.", {
  x: leftX, y: lY + 1.95, w: colW, h: 0.25,
  fontFace: FONT_HEAD, fontSize: 10, italic: true, color: C.ink, margin: 0,
});
lY += 2.35;

// 3) THE REPEATABLE PROCESS (~2.0)
eyebrowAt(leftX, lY, colW, "THE REPEATABLE PROCESS");
h2At(leftX, lY + 0.22, colW, "Same pipeline for every IP.");
const pipY = lY + 0.7;
const pipH = 0.95;
s.addShape(pres.shapes.RECTANGLE, {
  x: leftX, y: pipY, w: colW, h: pipH,
  fill: { color: C.paperSoft }, line: { type: "none" },
});
s.addShape(pres.shapes.RECTANGLE, {
  x: leftX, y: pipY, w: 0.05, h: pipH,
  fill: { color: C.terra }, line: { type: "none" },
});
const stages = [
  { label: "INGEST",     color: C.terra },
  { label: "STORE",      color: C.sage  },
  { label: "AUTHOR",     color: C.inkSoft },
  { label: "RENDER",     color: C.terra },
  { label: "PUBLISH",    color: C.sage  },
];
const stageInsetX = leftX + 0.15;
const stageInsetW = colW - 0.25;
const stageW = (stageInsetW - 4 * 0.06) / 5;
const stageY = pipY + 0.15;
const stageH = 0.55;
stages.forEach((st, i) => {
  const x = stageInsetX + i * (stageW + 0.06);
  s.addShape(pres.shapes.RECTANGLE, {
    x, y: stageY, w: stageW, h: stageH,
    fill: { color: "FFFFFF" }, line: { color: C.paperDark, width: 0.5 },
  });
  s.addShape(pres.shapes.RECTANGLE, {
    x, y: stageY, w: stageW, h: 0.06,
    fill: { color: st.color }, line: { type: "none" },
  });
  s.addText(st.label, {
    x, y: stageY + 0.15, w: stageW, h: 0.3,
    fontFace: FONT_BODY, fontSize: 7, bold: true,
    color: C.ink, align: "center", valign: "middle", charSpacing: 1.5, margin: 0,
  });
});
s.addText("Ingest changes per IP — storage, engine, surfaces are shared infrastructure.", {
  x: stageInsetX, y: stageY + stageH + 0.04, w: stageInsetW, h: 0.18,
  fontFace: FONT_HEAD, fontSize: 7.5, italic: true,
  color: C.muted, align: "center", margin: 0,
});
lY += 0.7 + pipH + 0.2;

// 4) THE ENGINE (~1.55)
eyebrowAt(leftX, lY, colW, "THE ENGINE");
h2At(leftX, lY + 0.22, colW, "@vismay/viz-engine — one runtime, many stories.", { h: 0.35 });
paraAt(leftX, lY + 0.6, colW, 1.1,
  "A registry-based runtime for scroll-driven, three-layer data stories: persistent map (Mapbox), foreground chart that transitions in place (ECharts), snap-locked text that drives both. Verticals plug in as tree-shaken bundles. Three render pipelines — autoplay MP4, story PDF, TTS audio — dispatched through GitHub Actions."
);
s.addShape(pres.shapes.LINE, {
  x: leftX, y: lY + 1.75, w: colW, h: 0,
  line: { color: C.paperDark, width: 0.5 },
});
s.addText("Next.js 16 · React 19 · Supabase · Mapbox GL · Apache ECharts · GSAP · Rive · Playwright · Gemini", {
  x: leftX, y: lY + 1.78, w: colW, h: 0.3,
  fontFace: FONT_BODY, fontSize: 7.5, color: C.muted,
  charSpacing: 0.5, margin: 0,
});

// ── RIGHT COLUMN ──────────────────────────────────────────────────────────
let rY = bodyTop;

// 1) THE PORTFOLIO (~5.0)
eyebrowAt(rightX, rY, colW, "THE PORTFOLIO");
h2At(rightX, rY + 0.22, colW, "What's running, what's coming.");
rY += 0.7;

function portfolioGroup(y, headColor, headDot, head, items) {
  // dot + head
  s.addShape(pres.shapes.OVAL, {
    x: rightX, y: y + 0.05, w: 0.1, h: 0.1,
    fill: { color: headDot }, line: { type: "none" },
  });
  s.addText(head, {
    x: rightX + 0.18, y, w: colW - 0.18, h: 0.22,
    fontFace: FONT_BODY, fontSize: 8, bold: true,
    color: headColor, charSpacing: 4, margin: 0,
  });

  let yy = y + 0.28;
  for (const [name, partner] of items) {
    s.addText(name, {
      x: rightX, y: yy, w: colW - 1.5, h: 0.22,
      fontFace: FONT_HEAD, fontSize: 10, color: C.ink,
      bold: true, margin: 0, valign: "middle",
    });
    s.addText(partner || "OPEN", {
      x: rightX + colW - 1.6, y: yy, w: 1.6, h: 0.22,
      fontFace: FONT_BODY, fontSize: 7.5, bold: true,
      color: partner ? C.terra : C.mutedLight,
      align: "right", charSpacing: 2, margin: 0, valign: "middle",
    });
    yy += 0.23;
  }
  return yy + 0.08;
}

rY = portfolioGroup(rY, C.live, C.live, "LIVE", [
  ["vizmaya.fyi",  "STEWARD · SUPRO"],
  ["Footshorts",    "STEWARD · SUPRO"],
]);
rY = portfolioGroup(rY, C.prod, C.prod, "IN PRODUCTION", [
  ["Kidzovo  ·  kids",                ""],
  ["Protrip  ·  travel",              ""],
  ["F1  ·  formula 1",                "ROHIT"],
  ["Enterprise + Finance",            "SHASHANK"],
]);
rY = portfolioGroup(rY, C.pipe, C.pipe, "IN PIPELINE", [
  ["Skincare + Beauty",   "VANSHIKA"],
  ["Fashion + Styling",   "VANSHIKA"],
  ["Music & Events",      "RETRO BLXXD"],
]);
rY = portfolioGroup(rY, C.muted, C.mutedLight, "ON THE BENCH", [
  ["Architecture",                       ""],
  ["Cricket",                            "SACHIN / SHUBHAM"],
  ["Spirituality",                       "ROHIT"],
  ["Art · Entertainment · Food · Pets",  ""],
  ["Manufacturing — India",              "PADMA"],
]);

// 2) PROOF (~1.3)
eyebrowAt(rightX, rY + 0.1, colW, "PROOF  ·  VIZMAYA.FYI");
h2At(rightX, rY + 0.32, colW, "17+ live stories. One engine.");
paraAt(rightX, rY + 0.75, colW, 0.85,
  "Currency rankings · America's debt holders · Population 2050 · World Cup 2026 atlas · India fuel prices · Korea GPU-hour · European AI adoption · Prediction markets · Great Nicobar · Press freedom · GDP 2026 · Largest armies — and more.",
  { fontSize: 8.5 }
);

// ── FOOTER ────────────────────────────────────────────────────────────────
const footH = 1.0;
const footY = H - footH;
s.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: footY, w: W, h: footH,
  fill: { color: C.ink }, line: { type: "none" },
});
s.addShape(pres.shapes.RECTANGLE, {
  x: 0, y: footY, w: W, h: 0.04,
  fill: { color: C.terra }, line: { type: "none" },
});
s.addText("Supro", {
  x: M, y: footY + 0.2, w: 3, h: 0.4,
  fontFace: FONT_HEAD, fontSize: 18, color: C.paper, margin: 0,
});
s.addText("hello@promad.design", {
  x: M, y: footY + 0.58, w: 3, h: 0.3,
  fontFace: FONT_BODY, fontSize: 9.5, color: C.terraSoft,
  charSpacing: 3, margin: 0,
});
s.addText(
  [
    { text: "Friends with a real obsession.",            options: { breakLine: true } },
    { text: "Collaborators on the engine.",              options: { breakLine: true } },
    { text: "People who want a piece of the internet back.", options: {} },
  ],
  {
    x: W - M - 4, y: footY + 0.2, w: 4, h: 0.7,
    fontFace: FONT_BODY, fontSize: 8.5, color: C.mutedLight,
    charSpacing: 2, align: "right", margin: 0,
  }
);

pres.writeFile({ fileName: "vismay-one-pager.pptx" }).then((p) => console.log("wrote", p));
