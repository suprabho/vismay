"""Generate vizmaya-studio story SVGs from the Vismaya mark geometry
(public/vizmaya-logo-01.svg), recoloured to the story's bone palette."""
import json, os

OUT = "/Users/suprabhodhenki/Documents/Promad/Experiments/vismay/apps/vizmaya-fyi/public/content/stories/vizmaya-studio/images"
INK, MUTED, BONE, LINE = "#0f0e0c", "#6b665d", "#f5f1ea", "#d8d2c5"
GREEN, RED, INDIGO = "#2d6a4f", "#c4391c", "#5c4ba0"
FONT = "Inter, 'Helvetica Neue', Arial, sans-serif"
MONO = "'JetBrains Mono', Menlo, monospace"
SERIF = "Fraunces, Georgia, serif"

# Node centres + the three "leap" wedges, verbatim from vizmaya-logo-01.svg.
A, B, C = (316.43, 333.11), (816.34, 394.1), (513.59, 796.53)
DEFS = """<defs>
<radialGradient id="g1" cx="489.08" cy="736.38" r="340.35" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#f5f1ea" stop-opacity="0"/></radialGradient>
<radialGradient id="g2" cx="770.86" cy="454.6" r="376.42" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#f5f1ea" stop-opacity="0"/></radialGradient>
<radialGradient id="g3" cx="388.07" cy="341.62" r="350.66" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fffdf8"/><stop offset="1" stop-color="#f5f1ea" stop-opacity="0"/></radialGradient>
</defs>"""
LEAPS = f"""<g stroke="{INK}" stroke-width="1.5">
<path d="M489.12,739.01c-2.77,1.18-5.65.77-6.72-.88-.08-.13-.15-.26-.21-.4l-17.12-32.04-144.06-269.68c24-1.05,47.71-10.47,66.39-28.24l94.39,290.79,11.2,34.5s.02.03.02.05l.13.41c.47,1.92-1.23,4.29-4.02,5.48Z" fill="url(#g1)"/>
<path d="M778.76,444.05c-2.41-1.81-5.3-2.11-6.74-.76-.11.11-.21.22-.3.34l-24.32,26.99-204.64,227.16c23.05,6.79,43.79,21.63,57.65,43.37l161.51-259.59,19.16-30.8s.02-.03.04-.05l.23-.37c.92-1.75-.16-4.46-2.59-6.29Z" fill="url(#g2)"/>
<path d="M378.48,340.7c.36-2.99,2.16-5.28,4.12-5.38.16,0,.3,0,.45.01l36.3,1.19,305.58,10.08c-11.09,21.31-14.79,46.55-8.74,71.61l-299.03-63.65-35.48-7.55s-.04,0-.06,0l-.42-.09c-1.9-.55-3.1-3.21-2.74-6.23Z" fill="url(#g3)"/>
</g>"""


def node(c, color, filled=True):
    x, y = c
    if filled:
        return f'<circle cx="{x}" cy="{y}" r="103" fill="{color}"/>'
    return f'<circle cx="{x}" cy="{y}" r="93" fill="{BONE}" stroke="{color}" stroke-width="20"/>'


def label(x, y, title, sub, color, anchor="middle"):
    return (
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-family="{MONO}" font-size="30" '
        f'letter-spacing="5" fill="{color}" font-weight="600">{title}</text>'
        f'<text x="{x}" y="{y + 42}" text-anchor="{anchor}" font-family="{FONT}" font-size="28" fill="{MUTED}">{sub}</text>'
    )


def svg(body, vb):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{DEFS}{body}</svg>'


def write(name, s):
    with open(os.path.join(OUT, name), "w") as f:
        f.write(s)
    print("wrote", name, len(s))


# 1 · The full mark with Penrose's three worlds named.
write("mark-three-worlds.svg", svg(
    LEAPS + node(A, GREEN) + node(B, RED) + node(C, INDIGO)
    + label(A[0], 170, "PATTERN", "the data", GREEN)
    + label(B[0], 232, "MEANING", "the mind", RED)
    + label(C[0], 960, "FORM", "the design", INDIGO),
    "40 110 1000 920"))

# 2 · Per-step variants: the active world filled, the others as outlines.
for name, active in (("pattern", A), ("meaning", B), ("form", C)):
    colors = {A: GREEN, B: RED, C: INDIGO}
    body = LEAPS + "".join(node(c, col if c == active else LINE, filled=(c == active)) for c, col in colors.items())
    write(f"mark-{name}.svg", svg(body, "180 200 780 740"))

# 3 · The studio: two people, one story — the mark's three nodes re-cast.
write("mark-studio.svg", svg(
    LEAPS + node(A, GREEN) + node(B, INDIGO) + node(C, RED)
    + label(A[0], 170, "SHASHANK", "words · data", GREEN)
    + label(B[0], 232, "SUPRABHO", "design · code", INDIGO)
    + label(C[0], 960, "THE STORY", "what we make together", RED),
    "40 110 1000 920"))

# 4 · Belief — rigour and beauty as one drawing: a smooth curve that is only
# allowed to pass through measured points. Data: US petrol pump price (US$/L),
# yearly means from india-fuel-prices-2026/charts/decoupled-from-crude.json.
src = json.load(open("/Users/suprabhodhenki/Documents/Promad/Experiments/vismay/apps/vizmaya-fyi/content/stories/india-fuel-prices-2026/charts/decoupled-from-crude.json"))
us = next(s for s in src["steps"][0]["option"]["series"] if s["name"] == "United States")["data"]
chunks = [c for c in (us[i:i + 6] for i in range(0, len(us), 6)) if len(c) == 6]
pts = [sum(c) / len(c) for c in chunks]
W, H, PAD = 1000, 740, 90
lo, hi = 0.3, 1.4
xy = [(PAD + i * (W - 2 * PAD) / (len(pts) - 1), H - PAD - (v - lo) / (hi - lo) * (H - 2 * PAD)) for i, v in enumerate(pts)]


def catmull(points):
    d = f"M{points[0][0]:.1f},{points[0][1]:.1f}"
    for i in range(len(points) - 1):
        p0 = points[max(i - 1, 0)]; p1 = points[i]; p2 = points[i + 1]; p3 = points[min(i + 2, len(points) - 1)]
        c1 = (p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6)
        c2 = (p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6)
        d += f" C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {p2[0]:.1f},{p2[1]:.1f}"
    return d


grid = "".join(
    f'<line x1="{PAD}" x2="{W - PAD}" y1="{y:.1f}" y2="{y:.1f}" stroke="{LINE}" stroke-width="2"/>'
    for y in [H - PAD - k * (H - 2 * PAD) / 4 for k in range(5)])
ticks = "".join(
    f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{y:.1f}" y2="{H - PAD}" stroke="{MUTED}" stroke-width="1.5" stroke-dasharray="4 6"/>'
    f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="{BONE}" stroke="{INK}" stroke-width="3"/>'
    for x, y in xy)
years = "".join(
    f'<text x="{x:.1f}" y="{H - PAD + 44}" text-anchor="middle" font-family="{MONO}" font-size="22" fill="{MUTED}">{2015 + i}</text>'
    for i, (x, _) in enumerate(xy) if i % 2 == 0)
belief = (
    f'<rect width="{W}" height="{H + 60}" fill="none"/>' + grid
    + f'<path d="{catmull(xy)}" fill="none" stroke="{RED}" stroke-width="7" stroke-linecap="round"/>'
    + ticks + years
    + f'<text x="{PAD}" y="34" font-family="{MONO}" font-size="22" letter-spacing="4" fill="{GREEN}">RIGOUR · every point measured</text>'
    + f'<text x="{PAD}" y="68" font-family="{MONO}" font-size="22" letter-spacing="4" fill="{RED}">BEAUTY · one line through all of them</text>'
)
write("belief-rigour-beauty.svg", f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H + 60}">{belief}</svg>')
