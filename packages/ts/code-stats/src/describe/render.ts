import { code, codeCell, signed, table } from '../report/markdown.ts'
import { renderDiff } from '../report/render.ts'
import type { DiffReport } from '../report/schema.ts'
import { STATS_SECTION, type MarkedSection } from '../report/splice.ts'
import type { PackageMap } from './packages.ts'

/**
 * The markers and heading of the Packages block of a PR description.
 *
 * @experimental
 */
export const PACKAGES_SECTION: MarkedSection = {
  start: '<!-- code-stats:packages:start -->',
  end: '<!-- code-stats:packages:end -->',
  heading: '## Packages',
}
/**
 * The markers and heading of the Risk block of a PR description.
 *
 * @experimental
 */
export const RISK_SECTION: MarkedSection = {
  start: '<!-- code-stats:risk:start -->',
  end: '<!-- code-stats:risk:end -->',
  heading: '## Risk',
}

/** Mermaid label text: quotes and angle brackets escaped, so a name cannot end the label. */
const label = (s: string): string =>
  s.replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;')

/**
 * A Mermaid flowchart of the packages a change touches and those that depend
 * on them, an arrow from each package to what it depends on, and a table of
 * the lines per package.
 *
 * @experimental
 */
export function renderPackageMap(map: PackageMap): string {
  const out = [PACKAGES_SECTION.start, '']
  if (map.nodes.length === 0) {
    out.push('_No package changed._', '', PACKAGES_SECTION.end)
    return out.join('\n')
  }
  const id = new Map(map.nodes.map((n, i) => [n.dir, `p${i}`]))
  out.push('```mermaid', 'flowchart LR')
  for (const n of map.nodes) {
    const lines = n.status === 'changed' ? `<br/>+${n.added} −${n.removed}` : '<br/>depends on it'
    out.push(`  ${id.get(n.dir)}["${label(n.label)}${lines}"]:::${n.status}`)
  }
  for (const e of map.edges) out.push(`  ${id.get(e.from)} --> ${id.get(e.to)}`)
  out.push(
    '  classDef changed stroke-width:2px',
    '  classDef affected stroke-dasharray:4 3',
    '```',
    '',
    ...table(
      ['Package', 'Directory', 'Files', 'Added', 'Removed', 'Logic lines'],
      'llrrrr',
      map.nodes
        .filter((n) => n.status === 'changed')
        .map((n) => [
          codeCell(n.label),
          codeCell(n.dir === '' ? '.' : n.dir),
          ...[n.files, n.added, n.removed, n.logic].map(String),
        ]),
    ),
    '',
    '_Solid boxes changed; dashed boxes depend on a changed package. An arrow points at what a package depends on._',
  )
  const hidden: string[] = []
  if (map.omitted > 0) hidden.push(`${map.omitted} more changed package(s)`)
  if (map.omittedDependents > 0) hidden.push(`${map.omittedDependents} more dependent package(s)`)
  if (hidden.length > 0) out.push('', `_Not shown: ${hidden.join(' and ')}._`)
  out.push('', PACKAGES_SECTION.end)
  return out.join('\n')
}

/**
 * Facts a reviewer weighs, read from the report alone; no judgement and no thresholds.
 *
 * @experimental
 */
export function riskSignals(r: DiffReport): string[] {
  const out: string[] = []
  const files = (paths: readonly string[]) =>
    `${paths.slice(0, 3).map(code).join(', ')}${paths.length > 3 ? ', …' : ''}`
  const broken = r.api.changes.filter((c) => c.removed.length + c.changed.length > 0)
  if (broken.length > 0) {
    const entries = broken.filter((c) => c.entry).length
    out.push(
      `Exported API removed or changed in ${broken.length} file(s)` +
        (entries > 0 ? `, ${entries} of them a package entry point` : '') +
        `: ${files(broken.map((c) => c.file))}`,
    )
  }
  const added = r.api.changes.filter((c) => c.added.length > 0 && !broken.includes(c))
  if (added.length > 0) out.push(`New exports only, in ${added.length} file(s)`)
  for (const d of r.dependencies) {
    const parts = (['added', 'removed', 'bumped'] as const).flatMap((k) =>
      d[k].length > 0 ? [`${d[k].length} ${k}`] : [],
    )
    out.push(`Dependencies in ${code(d.file)}: ${parts.join(', ')}`)
  }
  const deleted = r.fileList.filter((f) => f.status === 'deleted').length
  if (deleted > 0) out.push(`${deleted} file(s) deleted`)
  const cx = r.complexity
  // The movers are the largest changes either way, capped: the first riser among them is the
  // largest rise, but none there does not mean none rose, and their count is not the total.
  const net = cx.totalAfter - cx.totalBefore
  const largest = cx.movers.find((m) => m.delta > 0)
  if (cx.status === 'ok' && (net > 0 || largest !== undefined)) {
    out.push(
      `Cyclomatic complexity ${signed(net)} net across ${cx.functionsChanged} changed function(s)` +
        (largest === undefined
          ? ''
          : `; largest rise in ${code(largest.name)} (+${largest.delta})`),
    )
  }
  const sourceLogic = r.fileList
    .filter((f) => f.group === 'source')
    .reduce((n, f) => {
      const l = f.kindOperations?.logic
      return n + (l === undefined ? 0 : l.added + l.changed + l.removed)
    }, 0)
  if (sourceLogic > 0 && r.groups.tests.files === 0) {
    out.push(`Source logic changed (${sourceLogic} lines) with no test file changed`)
  }
  if (r.groups.instructions.files > 0) {
    out.push(
      `${r.groups.instructions.files} agent instruction file(s) changed, which changes what agents do`,
    )
  }
  if (r.groups.generated.files > 0) {
    out.push(
      `${r.groups.generated.files} generated file(s) changed; check they were regenerated, not edited`,
    )
  }
  return out
}

/**
 * The risk signals of a report as a marked Markdown list, or "No risk signals found." when there
 * are none.
 *
 * @experimental
 */
export function renderRisk(r: DiffReport): string {
  const signals = riskSignals(r)
  const lines = signals.length === 0 ? ['_No risk signals found._'] : signals.map((s) => `- ${s}`)
  return [RISK_SECTION.start, '', ...lines, '', RISK_SECTION.end].join('\n')
}

/** A prompt the author replaces; invisible in the rendered body until they do. */
const prompt = (text: string): string => `<!-- ${text} -->`

/**
 * A PR description: prompts for the sections only the author can write, and
 * the generated statistics, package map and risk signals, each in a marked
 * block that `code-stats describe --write` refreshes without touching the
 * author's text.
 *
 * @experimental
 */
export function renderDescription(report: DiffReport, map: PackageMap): string {
  return [
    '## Summary',
    '',
    prompt('What this change does, in plain language: the outcome, not the steps.'),
    '',
    '## Why',
    '',
    prompt('The problem it solves, or what it unblocks.'),
    '',
    '## Changes',
    '',
    prompt('The notable changes, in the order a reviewer should read them.'),
    '',
    STATS_SECTION.heading,
    '',
    renderDiff(report),
    '',
    PACKAGES_SECTION.heading,
    '',
    renderPackageMap(map),
    '',
    '## Testing',
    '',
    prompt('What you ran, and what it showed.'),
    '',
    RISK_SECTION.heading,
    '',
    renderRisk(report),
    '',
    prompt('Anything else a reviewer should weigh: rollout, migration, what could break.'),
    '',
  ].join('\n')
}
