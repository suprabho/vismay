import { GraphSpec } from '../../types';
import { ApexLineChart } from './ApexLineChart';
import { ApexMultiLineChart } from './ApexMultiLineChart';
import { ApexProjectionChart } from './ApexProjectionChart';
import { ApexBarChart } from './ApexBarChart';
import { ApexAnnotatedSVG } from './ApexAnnotatedSVG';
import { ApexTireMapChart } from './ApexTireMapChart';
import { ApexScatterChart } from './ApexScatterChart';
import { ApexHeatMapChart } from './ApexHeatMapChart';

interface GraphBlockProps {
  spec: GraphSpec;
  caption?: string;
  className?: string;
}

const DATA_POINT_TYPES = new Set([
  'line', 'area', 'sparkline', 'scatter', 'multi_line', 'comparison',
  'projection', 'bar', 'bar_grouped',
]);

export function GraphBlock({ spec, caption, className = '' }: GraphBlockProps) {
  const isEmpty = DATA_POINT_TYPES.has(spec.type) && !(spec.dataPoints?.length);

  return (
    <figure className={`bg-neutral-50 border border-neutral-200 p-5 space-y-4 ${className}`}>
      {spec.title && (
        <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
          <h3 className="font-mono text-[10px] font-bold text-neutral-900 uppercase tracking-[0.18em]">
            {spec.title}
          </h3>
          {spec.generatedByAI && (
            <span className="font-mono text-[8px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 tracking-widest">
              AI GENERATED
            </span>
          )}
        </div>
      )}

      <div className="w-full">
        {isEmpty && (
          <div className="flex items-center justify-center h-24 font-mono text-[10px] text-neutral-400 uppercase tracking-widest">
            {spec.generatedByAI ? 'Graph data is being processed' : 'No data available'}
          </div>
        )}
        {!isEmpty && (spec.type === 'line' || spec.type === 'area' || spec.type === 'sparkline') &&
          <ApexLineChart spec={spec} />}
        {!isEmpty && spec.type === 'scatter' &&
          <ApexScatterChart spec={spec} />}
        {!isEmpty && (spec.type === 'multi_line' || spec.type === 'comparison') &&
          <ApexMultiLineChart spec={spec} />}
        {!isEmpty && spec.type === 'projection' &&
          <ApexProjectionChart spec={spec} />}
        {!isEmpty && spec.type === 'bar' &&
          <ApexBarChart spec={spec} />}
        {!isEmpty && spec.type === 'bar_grouped' &&
          <ApexBarChart spec={spec} grouped />}
        {spec.type === 'tire_map' &&
          <ApexTireMapChart spec={spec} />}
        {spec.type === 'heat_map' &&
          <ApexHeatMapChart spec={spec} />}
        {spec.type === 'annotated_svg' &&
          <ApexAnnotatedSVG spec={spec} />}
      </div>

      {caption && (
        <figcaption className="font-mono text-[9px] text-neutral-400 tracking-widest uppercase border-t border-neutral-100 pt-2">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
