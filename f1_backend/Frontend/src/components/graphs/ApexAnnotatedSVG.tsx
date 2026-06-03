import { GraphSpec } from '../../types';

export function ApexAnnotatedSVG({ spec }: { spec: GraphSpec }) {
  return (
    <div className="relative h-64 w-full bg-white border border-neutral-100 overflow-hidden">
      <svg className="w-full h-full px-4" viewBox="0 0 100 40" preserveAspectRatio="none">
        {/* Grid lines */}
        {[10, 20, 30].map(y => (
          <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#f5f5f5" strokeWidth="0.1" />
        ))}
        {/* Annotation bands and lines */}
        {spec.annotations?.map((ann, i) => {
          if (ann.type === 'band' && ann.xRange) {
            return (
              <rect key={i}
                x={Number(ann.xRange[0])} y={0}
                width={Number(ann.xRange[1]) - Number(ann.xRange[0])} height={40}
                fill={ann.color} fillOpacity={0.06}
              />
            );
          }
          if (ann.type === 'line' && ann.xValue != null) {
            return (
              <line key={i}
                x1={Number(ann.xValue)} y1={0}
                x2={Number(ann.xValue)} y2={40}
                stroke={ann.color} strokeWidth={0.2} strokeDasharray="1,1"
              />
            );
          }
          if (ann.type === 'point' && ann.xValue != null) {
            return (
              <circle key={i}
                cx={Number(ann.xValue)} cy={20}
                r={1.5} fill={ann.color}
              />
            );
          }
          if (ann.type === 'label' && ann.xValue != null) {
            return (
              <text key={i}
                x={Number(ann.xValue)} y={4}
                fontSize={3} fill={ann.color}
                fontFamily="monospace" textAnchor="middle"
              >
                {ann.label}
              </text>
            );
          }
          return null;
        })}
        {/* Dynamic SVG series paths */}
        {spec.svgPaths?.map((p, i) => (
          <path key={i} d={p.d} fill={p.fill} stroke={p.stroke} strokeWidth={p.strokeWidth} />
        ))}
      </svg>
    </div>
  );
}
