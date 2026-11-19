/**
 * The scheduled run: a launchd user agent that runs `host-cleaner --auto`.
 * Every `launchctl` call goes through the command seam. macOS only; a general
 * trigger service would run the same command.
 */

import { mkdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'

import { HostCleanerError } from './adapter.ts'

export const SCHEDULE_LABEL = 'dev.osdlc.host-cleaner'
export const DEFAULT_EVERY_HOURS = 6

export interface PlistSpec {
  label: string
  /** The command to run, one argument per entry. */
  program: readonly string[]
  everyHours: number
  /** Where launchd writes the command's stdout and stderr. */
  logFile: string
  /** launchd starts agents with a minimal PATH; the run needs git and gh. */
  path?: string | undefined
}

const escapeXml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** The agent's plist. Pure: the same spec renders the same text. */
export function renderPlist(spec: PlistSpec): string {
  const args = spec.program.map((a) => `    <string>${escapeXml(a)}</string>`).join('\n')
  const env =
    spec.path === undefined
      ? ''
      : `  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${escapeXml(spec.path)}</string>
  </dict>
`
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(spec.label)}</string>
  <key>ProgramArguments</key>
  <array>
${args}
  </array>
  <key>StartInterval</key>
  <integer>${Math.round(spec.everyHours * 3600)}</integer>
  <key>RunAtLoad</key>
  <false/>
${env}  <key>StandardOutPath</key>
  <string>${escapeXml(spec.logFile)}</string>
  <key>StandardErrorPath</key>
  <string>${escapeXml(spec.logFile)}</string>
</dict>
</plist>
`
}

/** `--every` as hours: a positive whole number. @throws HostCleanerError (`bad-input`) */
export function parseEvery(text: string | undefined): number {
  if (text === undefined) return DEFAULT_EVERY_HOURS
  if (!/^[1-9]\d*$/.test(text)) {
    throw new HostCleanerError('bad-input', `--every ${text} is not a whole number of hours`)
  }
  return Number(text)
}

export const plistPath = (home: string): string =>
  join(home, 'Library', 'LaunchAgents', `${SCHEDULE_LABEL}.plist`)

export interface ScheduleEnv {
  platform: string
  home: string
  uid: number
  launchctl: CommandRunner
  program: readonly string[]
  logFile: string
  path?: string | undefined
}

function requireMac(env: ScheduleEnv): void {
  if (env.platform !== 'darwin') {
    throw new HostCleanerError('bad-input', 'schedule is macOS only: it installs a launchd agent')
  }
}

const domain = (env: ScheduleEnv): string => `gui/${env.uid}`
const target = (env: ScheduleEnv): string => `${domain(env)}/${SCHEDULE_LABEL}`

const loaded = (env: ScheduleEnv): boolean =>
  env.launchctl.run(['print', target(env)], { cwd: env.home }).exitCode === 0

/** Write the plist and load it, replacing a loaded one. Returns the plist's path. */
export function installSchedule(env: ScheduleEnv, everyHours: number): string {
  requireMac(env)
  const file = plistPath(env.home)
  mkdirSync(join(env.home, 'Library', 'LaunchAgents'), { recursive: true })
  writeFileSync(
    file,
    renderPlist({
      label: SCHEDULE_LABEL,
      program: env.program,
      everyHours,
      logFile: env.logFile,
      path: env.path,
    }),
  )
  if (loaded(env)) env.launchctl.run(['bootout', target(env)], { cwd: env.home })
  const boot = env.launchctl.run(['bootstrap', domain(env), file], { cwd: env.home })
  if (boot.exitCode !== 0) {
    throw new HostCleanerError(
      'bad-input',
      `launchctl bootstrap failed: ${boot.stderr.trim() || boot.error || `exit ${boot.exitCode}`}`,
    )
  }
  return file
}

/** Unload the agent and remove its plist. Returns whether there was anything to remove. */
export function uninstallSchedule(env: ScheduleEnv): boolean {
  requireMac(env)
  const file = plistPath(env.home)
  const was = loaded(env)
  if (was) env.launchctl.run(['bootout', target(env)], { cwd: env.home })
  const had = existsSync(file)
  if (had) rmSync(file)
  return was || had
}

export interface ScheduleStatus {
  plist: string
  installed: boolean
  loaded: boolean
}

export function scheduleStatus(env: ScheduleEnv): ScheduleStatus {
  requireMac(env)
  const plist = plistPath(env.home)
  return { plist, installed: existsSync(plist), loaded: loaded(env) }
}
