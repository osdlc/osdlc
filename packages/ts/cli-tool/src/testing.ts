/**
 * `@osdlc/cli-tool/testing`: run an app in process and check its tree, for a
 * tool's own tests. Nothing here depends on a test runner. Each check returns
 * the problems it found, so `expect(checkApp(app)).toEqual([])` reads well.
 */

import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ErrorDocumentSchema, type App } from './command/index.ts'
import { captureContext, type CliContext } from './io.ts'

/**
 * What {@link runApp} returns.
 * @experimental
 */
export interface AppRun {
  exit: number
  out: string
  err: string
  /** stdout parsed as JSON. Throws when it is not JSON. */
  json<T = Record<string, unknown>>(): T
}

let scratch: { cwd: string; env: Record<string, string> } | undefined

/**
 * A scratch directory, made once per process: an empty `cwd` and a `home`
 * that every home and config variable points into.
 */
function sandbox(): { cwd: string; env: Record<string, string> } {
  if (scratch !== undefined) return scratch
  const root = mkdtempSync(join(tmpdir(), 'cli-tool-run-'))
  const home = join(root, 'home')
  const cwd = join(root, 'cwd')
  mkdirSync(home)
  mkdirSync(cwd)
  const env: Record<string, string> = {
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, '.config'),
    XDG_DATA_HOME: join(home, '.local', 'share'),
    XDG_STATE_HOME: join(home, '.local', 'state'),
    XDG_CACHE_HOME: join(home, '.cache'),
    APPDATA: join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: join(home, 'AppData', 'Local'),
  }
  if (process.env['PATH'] !== undefined) env['PATH'] = process.env['PATH']
  scratch = { cwd, env }
  return scratch
}

/**
 * Run `argv` against `app` with captured output.
 *
 * Without `overrides`, the run never sees the real home or the real working
 * directory: `cwd` is an empty scratch directory, and `env` holds only `PATH`
 * and `HOME`, `USERPROFILE`, the `XDG_*` homes, `APPDATA` and `LOCALAPPDATA`,
 * all pointing into a scratch home. The scratch directory is made once per
 * process and shared by every run that does not pass its own, so a test that
 * needs a clean store passes its own `env`.
 *
 * With `--json` or `--output json` in `argv`, a stdout that holds a JSON object is also checked
 * against the command's document schema, and the run throws when it does not
 * match. An error document is checked against `ErrorDocumentSchema`.
 * @experimental
 */
export async function runApp(
  app: App,
  argv: readonly string[],
  overrides: Partial<Omit<CliContext, 'io'>> = {},
): Promise<AppRun> {
  const box = sandbox()
  const ctx = captureContext({ cwd: box.cwd, env: { ...box.env }, ...overrides })
  const exit = await app.run(argv, ctx)
  const { out, err } = ctx.io
  const json =
    argv.includes('--json') ||
    argv.includes('--output=json') ||
    argv.some((word, i) => word === '--output' && argv[i + 1] === 'json')
  if (json && out.trimStart().startsWith('{') && !argv.includes('--version')) {
    const doc = JSON.parse(out) as { kind?: string }
    const checked =
      doc.kind === 'error'
        ? ErrorDocumentSchema.safeParse(doc)
        : contractFor(app, argv, doc.kind)?.safeParse(doc)
    if (checked !== undefined && !checked.success) {
      throw new Error(
        `${app.name} ${argv.join(' ')}: output does not match its schema: ${checked.error.message}`,
      )
    }
  }
  return {
    exit,
    out,
    err,
    json<T>() {
      return JSON.parse(out) as T
    },
  }
}

/**
 * The document contract for a run of `argv` that printed `kind`. Two commands
 * may share a kind, so among the paths with that kind, the one whose words
 * appear in `argv`, in order, the most of them, wins.
 */
function contractFor(app: App, argv: readonly string[], kind: string | undefined) {
  const named = (path: readonly string[]): number => {
    let at = 0
    for (const word of path) {
      const found = argv.indexOf(word, at)
      if (found === -1) return -1
      at = found + 1
    }
    return path.length
  }
  let best: { path: string[]; score: number } | undefined
  for (const path of app.paths()) {
    try {
      const contract = app.documentContract(path)
      if (contract.shape['kind']?.safeParse(kind).success !== true) continue
    } catch {
      continue
    }
    const score = named(path)
    if (score >= 0 && (best === undefined || score > best.score)) best = { path, score }
  }
  return best === undefined ? undefined : app.documentContract(best.path)
}

/**
 * Problems with `app`'s tree that a test should fail on: help that does not
 * render at some path, or a `schema` document that does not render. Each
 * data command's output schema is checked when the app is declared.
 * @experimental
 */
export function checkApp(app: App): string[] {
  const problems: string[] = []
  for (const path of app.paths()) {
    const name = [app.name, ...path].join(' ')
    try {
      app.helpText(path, { full: true })
    } catch (err) {
      problems.push(`${name}: help does not render: ${(err as Error).message}`)
    }
  }
  try {
    JSON.stringify(app.schema())
  } catch (err) {
    problems.push(`${app.name} schema does not render: ${(err as Error).message}`)
  }
  return problems
}

/**
 * Every flag token in `text`: `--name` words and single-letter `-x`.
 * @experimental
 */
export function flagTokens(text: string): Set<string> {
  return new Set(text.match(/(?<![\w-])(?:--[A-Za-z][A-Za-z0-9-]*|-[A-Za-z](?![\w-]))/g) ?? [])
}

/**
 * Every flag spelling any command of `app` takes, from its help.
 * @experimental
 */
export function acceptedFlags(app: App): Set<string> {
  const out = new Set<string>()
  for (const path of app.paths()) {
    for (const flag of app.help(path, { depth: 0, full: true }).flags ?? []) {
      for (const token of flagTokens(flag.spelling)) out.add(token)
    }
  }
  return out
}

/**
 * Options for {@link checkGuide}.
 * @experimental
 */
export interface CheckGuideOptions {
  /** The words of the guide command. Default `['guide']`. */
  path?: readonly string[]
  /** Flags the prose may name that no command takes, such as another program's. */
  allow?: readonly string[]
}

/**
 * The checks every `guide` command should pass: each topic prints, the topic
 * list names every topic, an unknown topic exits 2, `--help` works, and the
 * prose names no flag that no command of the app takes.
 * @experimental
 */
export async function checkGuide(app: App, opts: CheckGuideOptions = {}): Promise<string[]> {
  const path = [...(opts.path ?? ['guide'])]
  const problems: string[] = []
  const list = await runApp(app, [...path, 'topics', '--json'])
  if (list.exit !== 0) return [`${path.join(' ')} topics exits ${list.exit}: ${list.err}`]
  const topics = list.json<{ topics: { id: string }[] }>().topics.map((t) => t.id)
  if (topics.length === 0) problems.push('the guide has no topics')
  const accepted = acceptedFlags(app)
  const allow = new Set(opts.allow ?? [])
  for (const id of topics) {
    const one = await runApp(app, [...path, id])
    if (one.exit !== 0 || one.out.trim() === '') {
      problems.push(`${path.join(' ')} ${id} exits ${one.exit} with ${one.out.length} bytes`)
      continue
    }
    for (const flag of flagTokens(one.out)) {
      if (!accepted.has(flag) && !allow.has(flag))
        problems.push(`topic ${id} names ${flag}, which no command takes`)
    }
  }
  const unknown = await runApp(app, [...path, 'no-such-topic'])
  if (unknown.exit !== 2) problems.push(`an unknown topic exits ${unknown.exit}, not 2`)
  const help = await runApp(app, [...path, '--help'])
  if (help.exit !== 0 || help.out.trim() === '')
    problems.push(`${path.join(' ')} --help exits ${help.exit}`)
  return problems
}
