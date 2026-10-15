#!/usr/bin/env bash
# Core free datasets for the "Football seasons since 2002" book. Re-runnable.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FD="$ROOT/raw/football-data-co-uk"
LEAGUES="E0 E1 SP1 I1 D1 F1 N1 P1 SC0"   # EPL, Championship, LaLiga, Serie A, Bundesliga, Ligue 1, Eredivisie, Primeira, Scottish Prem
CURRENT="2627"
tmp="$HOME/.fd_tmp.csv"
for y in $(seq ${FROM:-2} ${TO:-26}); do
  s=$(printf "%02d%02d" $y $((y+1)))
  mkdir -p "$FD/$s"
  for L in $LEAGUES; do
    f="$FD/$s/$L.csv"
    if head -c 6 "$f" 2>/dev/null | grep -q "Div" && [ "$s" != "$CURRENT" ]; then continue; fi
    code=$(curl -sL -m 30 -o "$tmp" -w '%{http_code}' "https://www.football-data.co.uk/mmz4281/$s/$L.csv")
    if [ "$code" = "200" ] && head -c 6 "$tmp" | grep -q "Div"; then cat "$tmp" > "$f"; else echo "MISS $s $L ($code)"; : > "$f"; fi
    sleep 0.2
  done
  echo "done $s"
done
[ "${TO:-26}" = "26" ] || exit 0
for n in results goalscorers shootouts; do
  curl -sL -m 60 -o "$ROOT/raw/international/$n.csv" "https://raw.githubusercontent.com/martj42/international_results/master/$n.csv"
done
curl -sL -m 60 -o "$ROOT/raw/statsbomb/competitions.json" https://raw.githubusercontent.com/statsbomb/open-data/master/data/competitions.json
echo ALL_DONE
