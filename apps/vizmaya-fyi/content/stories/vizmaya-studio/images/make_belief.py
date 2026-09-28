"""Belief slide art: rigour (every one of our 33 published stories measured on
a drafting grid) and beauty (one line through every point). Data: words per
section for each listed vizmaya-fyi story (stories table, 2026-09-29), sorted.
Usage: python3 make_belief.py <portfolio.json> <out.svg>"""
import json, sys
o = json.load(open(sys.argv[1]))
v = sorted(round(x['words'] / max(x['secs'], 1)) for x in o)
INK, MUTED, LINE, GRID, GREEN, RED = "#0f0e0c", "#6b665d", "#d8d2c5", "#e6e0d4", "#2d6a4f", "#c4391c"
MONO, SERIF = "'JetBrains Mono', Menlo, monospace", "Fraunces, Georgia, serif"
W, H = 800, 1300
L, R, T, B = 90, 770, 300, 1080         # plot box (tall: fills the hero's left column)
ymax = 400
X = lambda i: L + i * (R - L) / (len(v) - 1)
Y = lambda val: B - val / ymax * (B - T)
pts = [(X(i), Y(val)) for i, val in enumerate(v)]
s = []
# graph paper
for k in range(0, 21):
    y = B - k * (B - T) / 20
    s.append(f'<line x1="{L}" x2="{R}" y1="{y:.1f}" y2="{y:.1f}" stroke="{GRID if k % 5 else LINE}" stroke-width="{1 if k % 5 else 1.5}"/>')
for i in range(len(v)):
    s.append(f'<line x1="{X(i):.1f}" x2="{X(i):.1f}" y1="{T}" y2="{B}" stroke="{GRID}" stroke-width="1"/>')
for k in range(0, 5):
    val = k * 100; y = Y(val)
    s.append(f'<text x="{L - 12}" y="{y + 7:.1f}" text-anchor="end" font-family="{MONO}" font-size="26" fill="{MUTED}">{val}</text>')
# rigour: a measured stem + point per story
for (x, y) in pts:
    s.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="{y:.1f}" y2="{B}" stroke="{GREEN}" stroke-width="2" stroke-dasharray="3 5" opacity=".7"/>')
# beauty: one smooth line through every point (Catmull-Rom → cubic Bézier)
n = len(pts); xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
dx = [xs[i + 1] - xs[i] for i in range(n - 1)]; m = [(ys[i + 1] - ys[i]) / dx[i] for i in range(n - 1)]
t = [m[0]] + [0 if m[i - 1] * m[i] <= 0 else (m[i - 1] + m[i]) / 2 for i in range(1, n - 1)] + [m[-1]]
for i in range(n - 1):
    if m[i] == 0: t[i] = t[i + 1] = 0; continue
    a, b = t[i] / m[i], t[i + 1] / m[i]; h = a * a + b * b
    if h > 9: k = 3 / h ** 0.5; t[i], t[i + 1] = k * a * m[i], k * b * m[i]
d = f"M{xs[0]:.1f},{ys[0]:.1f}"
for i in range(n - 1):
    d += f" C{xs[i] + dx[i] / 3:.1f},{ys[i] + t[i] * dx[i] / 3:.1f} {xs[i + 1] - dx[i] / 3:.1f},{ys[i + 1] - t[i + 1] * dx[i] / 3:.1f} {xs[i + 1]:.1f},{ys[i + 1]:.1f}"
s.append(f'<path d="{d}" fill="none" stroke="{RED}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>')
for (x, y) in pts:
    s.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="#f5f1ea" stroke="{INK}" stroke-width="2.5"/>')
# labels
s.append(f'<text x="{L}" y="90" font-family="{MONO}" font-size="40" font-weight="600" letter-spacing="5" fill="{GREEN}">RIGOUR</text>')
s.append(f'<text x="{L}" y="146" font-family="{SERIF}" font-size="40" fill="{INK}">Every story measured. All {len(v)}.</text>')
s.append(f'<text x="{L}" y="1170" font-family="{MONO}" font-size="40" font-weight="600" letter-spacing="5" fill="{RED}">BEAUTY</text>')
s.append(f'<text x="{L}" y="1226" font-family="{SERIF}" font-size="40" fill="{INK}">One line through every point.</text>')
s.append(f'<text x="{R}" y="{T - 18}" text-anchor="end" font-family="{MONO}" font-size="24" fill="{MUTED}">words per section, our published stories</text>')
open(sys.argv[2], 'w').write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">' + ''.join(s) + '</svg>')
print('points', len(v), 'min', v[0], 'max', v[-1])
