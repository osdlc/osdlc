/**
 * The settings screen: what it shows, and the edits its keys make.
 *
 * Values come from `readSettings`, the reader `way config` and the web view
 * use, so all three show the same answer. Edits go through `writeSetting`.
 * Runners, discovery and excluded paths go to the project file, as the web
 * view saves them. The runner order goes to the layer that sets it, else the
 * user file.
 */

import type { RunnerReport, ToolDef } from '@osdlc/system-model/detect'
import type { ExecGate } from '@osdlc/trust-repo'

import { DISCOVERY_VALUES, type ConfigLayer, type Settings, type WritableLayer } from '../config.ts'
import {
  missingBinaryLabel,
  runnerLabel,
  withheldLabel,
  type WithheldReason,
} from '../vocabulary.ts'

/** A line the cursor can stop on, and what its keys change. */
export type SettingsItem =
  | { kind: 'runner'; runner: string }
  | { kind: 'discovery' }
  | { kind: 'path'; path: string }
  | { kind: 'add-path' }
  | { kind: 'trust' }

/** One line of the screen. */
export interface SettingsLine {
  text: string
  heading?: boolean | undefined
  /** Present on a line the cursor can stop on. */
  item?: SettingsItem | undefined
}

/** What the screen describes. */
export interface SettingsFacts {
  settings: Settings
  /** The execution decision for this run. */
  gate: Pick<ExecGate, 'allowExec' | 'trusted' | 'reason'>
  /** Whether a trust grant would change this run. */
  trustable: boolean
  /** The grant was removed in this run; execution stays as it was. */
  revoked: boolean
  /** The catalog's reports, in display order. */
  reports: readonly RunnerReport[]
  /** Why withheld runners are withheld, or null when nothing is. */
  withheld: WithheldReason | null
  /** The registered tools, for a runner's description and homepage. */
  tools: readonly ToolDef[]
}

const LAYER_WORDS: Record<ConfigLayer, string> = {
  default: 'default',
  user: 'your user config',
  project: 'this project',
}

/** `this project`, `your user config` or `default`. */
export function layerWords(layer: ConfigLayer): string {
  return LAYER_WORDS[layer]
}

function valueOf<T>(settings: Settings, key: string): { value: T; source: ConfigLayer } {
  const found = settings.settings.find((s) => s.key === key)
  return { value: found?.value as T, source: found?.source ?? 'default' }
}

/** The runner ids in display order: collected ones, then disabled ones. */
export function knownRunners(facts: Pick<SettingsFacts, 'settings' | 'reports'>): string[] {
  const disabled = valueOf<string[] | undefined>(facts.settings, 'runners.disabled').value ?? []
  const listed = facts.reports.map((r) => r.runner)
  return [...listed, ...disabled.filter((d) => !listed.includes(d)).sort()]
}

/**
 * What the settings screen says about a runner beyond on or off: its
 * ecosystem and homepage, when its tool declares them.
 */
export function runnerInfo(tools: readonly ToolDef[], runner: string): string {
  const tool = tools.find((t) => t.id === runner)
  if (tool === undefined) return ''
  return [tool.ecosystem?.id, tool.homepage].filter((s) => s !== undefined && s !== '').join('  ')
}

/** Why execution is off, in words, for the screen and the status line. */
export function execOffCause(settings: Settings, gate: Pick<ExecGate, 'reason'>): string {
  if (gate.reason === 'untrusted') return 'this repository is not trusted'
  const configured = valueOf<boolean | undefined>(settings, 'allowExec')
  if (configured.value === false) return `allowExec is false in ${layerWords(configured.source)}`
  return '--no-exec was given'
}

/** The screen's lines. */
export function settingsLines(facts: SettingsFacts): SettingsLine[] {
  const out: SettingsLine[] = []
  const { settings } = facts
  const disabled = new Set(valueOf<string[] | undefined>(settings, 'runners.disabled').value ?? [])
  const disabledSource = valueOf(settings, 'runners.disabled').source
  const order = valueOf<string[] | undefined>(settings, 'runners.order')

  out.push({ text: `RUNNERS  (on or off: ${layerWords(disabledSource)})`, heading: true })
  const runners = knownRunners(facts)
  if (runners.length === 0) out.push({ text: '  no runners found' })
  const pad = Math.max(0, ...runners.map((r) => runnerLabel(r).length))
  for (const runner of runners) {
    const report = facts.reports.find((r) => r.runner === runner)
    const off = disabled.has(runner)
    const note = off
      ? 'not collected'
      : report?.skippedForExec === true && facts.withheld !== null
        ? withheldLabel(facts.withheld)
        : report?.tool !== undefined && !report.tool.found
          ? missingBinaryLabel(report.tool.binary)
          : runnerInfo(facts.tools, runner)
    out.push({
      text: `${off ? 'off' : 'on '}  ${runnerLabel(runner).padEnd(pad)}  ${note}`.trimEnd(),
      item: { kind: 'runner', runner },
    })
  }
  out.push({
    text: `  order: ${order.value === undefined || order.value.length === 0 ? 'alphabetical' : order.value.join(' ')}  (${layerWords(order.source)})`,
  })
  out.push({ text: '' })

  out.push({ text: 'EXECUTION', heading: true })
  out.push({ text: trustText(facts), item: { kind: 'trust' } })
  out.push({
    text: `  this run: ${facts.gate.allowExec ? 'on' : `off — ${execOffCause(settings, facts.gate)}`}`,
  })
  const allowExec = valueOf<boolean>(settings, 'allowExec')
  out.push({
    text: `  allowExec: ${String(allowExec.value === true)}  (${layerWords(allowExec.source)})`,
  })
  out.push({ text: '  a project file can only turn execution off; trust is what turns it on' })
  out.push({ text: '' })

  const discovery = valueOf<string>(settings, 'discovery')
  out.push({ text: `DISCOVERY  (${layerWords(discovery.source)})`, heading: true })
  out.push({ text: `${String(discovery.value)}`, item: { kind: 'discovery' } })
  out.push({ text: '' })

  const excluded = valueOf<string[] | undefined>(settings, 'excludePaths')
  out.push({ text: `EXCLUDED PATHS  (${layerWords(excluded.source)})`, heading: true })
  for (const path of excluded.value ?? []) out.push({ text: path, item: { kind: 'path', path } })
  out.push({ text: '+ add a path', item: { kind: 'add-path' } })
  out.push({ text: '' })

  out.push({ text: `project file: ${settings.loaded.locations.project}` })
  out.push({ text: `user file: ${settings.loaded.locations.user}` })
  for (const warning of settings.warnings) out.push({ text: `warning: ${warning}` })
  return out
}

function trustText(facts: SettingsFacts): string {
  if (facts.revoked) return 'trust: removed; this run keeps its execution setting'
  if (facts.gate.trusted) return 'trust: trusted (u removes the grant)'
  if (facts.trustable) return 'trust: not trusted (t to trust)'
  return 'trust: not trusted'
}

/** A write the screen makes: which key, which layer, and the new value. */
export interface SettingsEdit {
  key: string
  layer: WritableLayer
  value: unknown
}

/** The edit that turns `runner` on or off. */
export function toggleRunner(settings: Settings, runner: string): SettingsEdit {
  const disabled = valueOf<string[] | undefined>(settings, 'runners.disabled').value ?? []
  const value = disabled.includes(runner)
    ? disabled.filter((d) => d !== runner)
    : [...disabled, runner]
  return { key: 'runners.disabled', layer: 'project', value }
}

/** The edit that moves `runner` by `step` places in the display order, or null at an end. */
export function moveRunner(
  facts: Pick<SettingsFacts, 'settings' | 'reports'>,
  runner: string,
  step: -1 | 1,
): SettingsEdit | null {
  const order = knownRunners(facts)
  const at = order.indexOf(runner)
  const to = at + step
  if (at === -1 || to < 0 || to >= order.length) return null
  order.splice(at, 1)
  order.splice(to, 0, runner)
  const source = valueOf(facts.settings, 'runners.order').source
  return { key: 'runners.order', layer: source === 'project' ? 'project' : 'user', value: order }
}

/** The edit that moves discovery to its next value. */
export function cycleDiscovery(settings: Settings): SettingsEdit {
  const now = valueOf<string>(settings, 'discovery').value
  const at = DISCOVERY_VALUES.indexOf(now as (typeof DISCOVERY_VALUES)[number])
  return {
    key: 'discovery',
    layer: 'project',
    value: DISCOVERY_VALUES[(at + 1) % DISCOVERY_VALUES.length],
  }
}

/** The edit that adds or removes an excluded path. Null when nothing would change. */
export function editPaths(
  settings: Settings,
  change: { add: string } | { remove: string },
): SettingsEdit | null {
  const now = valueOf<string[] | undefined>(settings, 'excludePaths').value ?? []
  let value: string[]
  if ('add' in change) {
    const path = change.add.trim()
    if (path === '' || now.includes(path)) return null
    value = [...now, path]
  } else {
    if (!now.includes(change.remove)) return null
    value = now.filter((p) => p !== change.remove)
  }
  return { key: 'excludePaths', layer: 'project', value }
}
