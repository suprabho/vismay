/**
 * GitHub Actions job summary + annotations for the match-facts scripts, so a
 * run's outcome reads off its summary page instead of the raw log. Both are
 * harmless outside Actions (no $GITHUB_STEP_SUMMARY → nothing written).
 */
import { appendFileSync } from 'node:fs';

/** Append markdown to the job summary. Never throws: a summary must not fail a run. */
export function writeStepSummary(markdown: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (!file) return;
  try {
    appendFileSync(file, `${markdown.trimEnd()}\n\n`);
  } catch (e) {
    console.warn(`[summary] could not write the job summary: ${e instanceof Error ? e.message : e}`);
  }
}

/** A workflow-command annotation on the run page. */
export function annotate(level: 'error' | 'warning' | 'notice', title: string, message: string): void {
  const data = (v: string) => v.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const prop = (v: string) => data(v).replace(/:/g, '%3A').replace(/,/g, '%2C');
  console.log(`::${level} title=${prop(title)}::${data(message)}`);
}

/** A markdown table; cell pipes and newlines are escaped. */
export function markdownTable(headers: string[], rows: string[][]): string {
  const cell = (v: string) => v.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  const line = (cells: string[]) => `| ${cells.map(cell).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}
