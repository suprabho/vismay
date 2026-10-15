import { PALETTE, type ChartForm } from '@/lib/seasonBooks/system'

/** A low-fi stand-in for a chart form, for thumbnails before there's a sketch or data. */
export function ChartGlyph({ form, className }: { form: ChartForm; className?: string }) {
  const ink = PALETTE.ink
  const muted = PALETTE.muted
  const accent = PALETTE.accent
  const base = <line x1={10} y1={170} x2={290} y2={170} stroke={ink} strokeWidth={1.5} />
  let body: React.ReactNode
  switch (form) {
    case 'line-race':
      body = <>
        <polyline points="10,165 60,140 110,120 160,95 210,70 290,30" fill="none" stroke={accent} strokeWidth={5} />
        <polyline points="10,165 60,135 110,110 160,100 210,90 290,60" fill="none" stroke={PALETTE.second} strokeWidth={5} />
        <polyline points="10,165 60,150 110,130 160,125 210,115 290,100" fill="none" stroke={muted} strokeWidth={3} />
      </>
      break
    case 'bar':
      body = [130, 105, 90, 70, 60, 45].map((h, i) => <rect key={i} x={18 + i * 46} y={170 - h} width={34} height={h} fill={i === 0 ? accent : muted} />)
      break
    case 'slope':
      body = <>
        <line x1={60} y1={40} x2={240} y2={130} stroke={accent} strokeWidth={5} />
        <line x1={60} y1={120} x2={240} y2={50} stroke={PALETTE.second} strokeWidth={5} />
        <line x1={60} y1={80} x2={240} y2={95} stroke={muted} strokeWidth={3} />
        <line x1={60} y1={20} x2={60} y2={170} stroke={PALETTE.rule} strokeWidth={2} />
        <line x1={240} y1={20} x2={240} y2={170} stroke={PALETTE.rule} strokeWidth={2} />
      </>
      break
    case 'strip':
      body = Array.from({ length: 19 }, (_, i) => <rect key={i} x={10 + i * 15} y={75} width={11} height={30} fill={[ink, ink, PALETTE.draw, ink, accent][i % 5]} />)
      break
    case 'scatter':
      body = [[40, 140], [70, 120], [90, 130], [120, 100], [150, 90], [170, 105], [200, 70], [230, 60], [260, 40]].map(([x, y], i) =>
        <circle key={i} cx={x} cy={y} r={8} fill={i === 8 ? accent : muted} />)
      break
    case 'small-multiples':
      body = [0, 1, 2, 3, 4, 5].map(i => {
        const x = 15 + (i % 3) * 95
        const y = 15 + Math.floor(i / 3) * 80
        return <g key={i}>
          <rect x={x} y={y} width={80} height={65} fill="none" stroke={PALETTE.rule} strokeWidth={1.5} />
          <polyline points={`${x + 5},${y + 58} ${x + 30},${y + 40 - i * 3} ${x + 55},${y + 30} ${x + 75},${y + 12 + i * 4}`} fill="none" stroke={i === 0 ? accent : ink} strokeWidth={3} />
        </g>
      })
      break
    case 'pitch':
      body = <>
        <rect x={20} y={15} width={260} height={150} fill="none" stroke={ink} strokeWidth={2} />
        <line x1={150} y1={15} x2={150} y2={165} stroke={ink} strokeWidth={2} />
        <circle cx={150} cy={90} r={22} fill="none" stroke={ink} strokeWidth={2} />
        <rect x={240} y={55} width={40} height={70} fill="none" stroke={ink} strokeWidth={2} />
        {[[250, 80], [235, 100], [255, 95], [225, 70], [260, 110]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={6} fill={i < 2 ? accent : muted} />)}
      </>
      break
    case 'timeline':
      body = <>
        <line x1={10} y1={95} x2={290} y2={95} stroke={ink} strokeWidth={3} />
        {[30, 80, 120, 190, 250].map((x, i) => <g key={i}>
          <circle cx={x} cy={95} r={7} fill={i === 3 ? accent : ink} />
          <rect x={x - 22} y={i % 2 ? 110 : 50} width={44} height={10} fill={muted} />
        </g>)}
      </>
      break
    case 'table':
    case 'heat-table':
      body = Array.from({ length: 10 }, (_, r) => <g key={r}>
        <rect x={10} y={10 + r * 16} width={20} height={9} fill={muted} />
        <rect x={40} y={10 + r * 16} width={140} height={9} fill={r === 0 ? accent : muted} opacity={0.8} />
        {[0, 1, 2].map(c => <rect key={c} x={200 + c * 32} y={10 + r * 16} width={24} height={9}
          fill={form === 'heat-table' ? accent : muted} opacity={form === 'heat-table' ? 0.15 + ((r * 3 + c) % 7) / 8 : 0.8} />)}
      </g>)
      break
    case 'big-number':
      body = <text x={150} y={135} textAnchor="middle" fontSize={130} fontWeight={800} fill={ink}>49</text>
      break
    case 'image':
      body = <>
        <rect x={10} y={10} width={280} height={160} fill={PALETTE.rule} />
        <line x1={10} y1={10} x2={290} y2={170} stroke={PALETTE.paper} strokeWidth={2} />
        <line x1={290} y1={10} x2={10} y2={170} stroke={PALETTE.paper} strokeWidth={2} />
      </>
      break
  }
  const framed = form === 'image' || form === 'pitch' || form === 'small-multiples' || form === 'table' || form === 'heat-table' || form === 'big-number' || form === 'timeline'
  return (
    <svg viewBox="0 0 300 180" className={className} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {body}
      {!framed && base}
    </svg>
  )
}
