/**
 * `@osdlc/cli-tool/testing`: run an app in process and check its tree, for a
 * tool's own tests. Nothing here depends on a test runner. Each check returns
 * the problems it found, so `expect(checkApp(app)).toEqual([])` reads well.
 */

import type { App } from './command/index.ts'
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

/**
 * Run `argv` against `app` with captured output. With `--json` in `argv`,
 * a non-empty stdout is also checked against the command's document schema
 * and the run throws when it does not match.
 * @experimental
 */
export async function runApp(
  app: App,
  argv: readonly string[],
  overrides: Partial<Omit<CliContext, 'io'>> = {},
): Promise<AppRun> {
  const ctx = captureContext(overrides)
  const exit = await app.run(argv, ctx)
  const { out, err } = ctx.io
  if (argv.includes('--json') && out.trim() !== '' && !argv.includes('--version')) {
    const doc = JSON.parse(out) as { kind?: string }
    const path = app.paths().find((p) => {
      try {
        const contract = app.documentContract(p)
        return contract.shape['kind']?.safeParse(doc.kind).success === true
      } catch {
        return false
      }
    })
    if (path !== undefined) {
      const checked = app.documentContract(path).safeParse(doc)
      if (!checked.success) {
        throw new Error(
          `${app.name} ${argv.join(' ')}: output does not match its schema: ${checked.error.message}`,
        )
      }
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
 * Problems with `app`'s tree that a test should fail on: a data command
 * whose output has no JSON Schema, or help that does not render at some path.
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
  for (const entry of app.schema()) {
    if (entry.input === undefined) continue
    if (!entry.interactive && entry.output === undefined) {
      problems.push(`${entry.command}: no output schema`)
    }
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
