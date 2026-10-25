/**
 * The two files devlink keeps per tool, in the config home of the tool's
 * standalone tier (`<config>/<name>/`, under the `xdg` convention):
 *
 *   home             the active link: one absolute checkout path, or absent.
 *                    A bash launcher reads it with `cat`, which is why it is a
 *                    bare path and not JSON.
 *   history.jsonl    every link / use / off event, one JSON object per line,
 *                    append-only. `history` and `use #n` are views over it.
 *
 * It is config rather than durable state. The user sets and clears it on
 * purpose, and losing it loses only the link. The launcher reads the `home`
 * file by name.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, appendFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { atomicWrite } from '@osdlc/etag-write'
import { systemDirs, type TieredDirs } from '@osdlc/config-layers/dirs'
import type { ToolSpec } from './spec.ts'

/**
 * The name of the file that holds the active link.
 * @experimental
 */
export const HOME_FILE = 'home'
/**
 * The name of the file that records link changes, one JSON line each.
 * @experimental
 */
export const HISTORY_FILE = 'history.jsonl'

/**
 * The kinds of change the history records: `link`, `use` and `off`.
 * @experimental
 */
export type HistoryKind = 'link' | 'use' | 'off'

/**
 * One line of the history file: when, what kind of change, and which checkout.
 * @experimental
 */
export interface HistoryEvent {
  /** ISO-8601 timestamp. */
  at: string
  event: HistoryKind
  /** The checkout the event selected; null for `off`. */
  checkout: string | null
  /** The checkout's git branch at the time, when readable. */
  branch?: string | null
  /** The checkout's git HEAD (short) at the time, when readable. */
  head?: string | null
  /** Free text a caller attached with `--label`. */
  label?: string
}

/**
 * Options for where a tool's link state is kept.
 * @experimental
 */
export interface StateOptions {
  /**
   * The directories to resolve against. Defaults to `spec.vendorDirs` on the
   * running system. Tests inject a rooted one so files go under a temp dir.
   */
  dirs?: TieredDirs
  /**
   * Where releases before 0.8 kept the state: macOS's native config home
   * (`~/Library/Application Support/<name>`). Defaults to that on macOS, and
   * to none elsewhere or when `dirs` is given. Tests inject a rooted one.
   */
  legacyDirs?: TieredDirs | null
}

/**
 * `<config>/<name>` for this tool, under the `xdg` convention:
 * `${XDG_CONFIG_HOME:-~/.config}/<name>` on Linux and macOS, `%APPDATA%\<name>`
 * on Windows. The bash launcher reads the same path.
 *
 * @experimental
 */
export function stateDir(spec: ToolSpec, opts: StateOptions = {}): string {
  // Pinned: `<PREFIX>_CONVENTION` must not move the file away from where the
  // bash launcher reads it.
  const dirs =
    opts.dirs ?? systemDirs(spec.vendorDirs, { convention: 'xdg', conventionFromEnv: false })
  return dirs.standalone(spec.name).config().path
}

/**
 * The link file a release before 0.8 wrote on macOS, when it is still there
 * and the current one is not. `dev status` then says how to move it. Null
 * anywhere else.
 * @internal
 */
export function legacyHomePath(spec: ToolSpec, opts: StateOptions = {}): string | null {
  const legacy =
    opts.legacyDirs !== undefined
      ? opts.legacyDirs
      : opts.dirs === undefined && process.platform === 'darwin'
        ? systemDirs(spec.vendorDirs, { convention: 'native', conventionFromEnv: false })
        : null
  if (legacy === null) return null
  const old = join(legacy.standalone(spec.name).config().path, HOME_FILE)
  if (old === homePath(spec, opts) || !existsSync(old) || existsSync(homePath(spec, opts))) {
    return null
  }
  return old
}

/**
 * The path of the file that holds a tool's active link.
 * @experimental
 */
export function homePath(spec: ToolSpec, opts: StateOptions = {}): string {
  return join(stateDir(spec, opts), HOME_FILE)
}

/**
 * The path of the history file for a tool.
 * @experimental
 */
export function historyPath(spec: ToolSpec, opts: StateOptions = {}): string {
  return join(stateDir(spec, opts), HISTORY_FILE)
}

/**
 * The active link on disk (trimmed), or null when unset or empty.
 *
 * @experimental
 */
export function readActive(spec: ToolSpec, opts: StateOptions = {}): string | null {
  let value: string
  try {
    value = readFileSync(homePath(spec, opts), 'utf-8').trim()
  } catch {
    // Absent, unreadable, or not a file (ENOENT, EACCES, EISDIR, ENOTDIR): no link. A bad
    // state path must not break `resolve`, which a launcher runs on every start.
    return null
  }
  return value.length > 0 ? value : null
}

/**
 * Save a checkout as the tool's active link.
 * @experimental
 */
export function writeActive(spec: ToolSpec, checkout: string, opts: StateOptions = {}): void {
  const path = homePath(spec, opts)
  mkdirSync(dirname(path), { recursive: true })
  // Atomic, so a launcher reading `home` never sees a truncated file.
  atomicWrite(path, `${checkout}\n`)
}

/**
 * Remove the active link. Returns whether one existed.
 *
 * @experimental
 */
export function clearActive(spec: ToolSpec, opts: StateOptions = {}): boolean {
  const path = homePath(spec, opts)
  const existed = existsSync(path)
  if (existed) rmSync(path, { force: true })
  return existed
}

/**
 * Add one event to the history file, creating the directory if needed.
 * @experimental
 */
export function appendHistory(spec: ToolSpec, event: HistoryEvent, opts: StateOptions = {}): void {
  const path = historyPath(spec, opts)
  mkdirSync(dirname(path), { recursive: true })
  appendFileSync(path, `${JSON.stringify(event)}\n`, 'utf-8')
}

/**
 * Every recorded event, oldest first. A line that is not a JSON object with
 * an `event` string is skipped rather than failing the read. The file is
 * append-only, and a partly written last line must not hide the rest.
 * @experimental
 */
export function readHistory(spec: ToolSpec, opts: StateOptions = {}): HistoryEvent[] {
  const path = historyPath(spec, opts)
  if (!existsSync(path)) return []
  const out: HistoryEvent[] = []
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (isHistoryEvent(parsed)) out.push(parsed)
  }
  return out
}

function isHistoryEvent(value: unknown): value is HistoryEvent {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v['at'] === 'string' &&
    (v['event'] === 'link' || v['event'] === 'use' || v['event'] === 'off') &&
    (typeof v['checkout'] === 'string' || v['checkout'] === null)
  )
}
