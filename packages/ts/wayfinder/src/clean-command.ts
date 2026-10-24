/**
 * The `clean` subcommand: the three stores wayfinder keeps outside your
 * repositories (cache, trust, config). `--trust` also clears the old waypost
 * trust store, whose grants are still honoured; it is listed only when it
 * holds something.
 *
 * ## Nothing is removed unless asked
 *
 * Bare `clean` REPORTS: what each store is, where it is, and whether anything
 * is in it. A `--dry-run` flag would put the safe behaviour behind a flag people
 * forget, so instead the flags name what to remove, and no flag removes nothing.
 *
 * ## Why `--config` alone needs `--yes`
 *
 * The three stores are not equally replaceable, and the guard follows that
 * rather than being uniform for tidiness:
 *
 *   - the CACHE is derived. Deleting it costs one slow probe.
 *   - the TRUST store is consent. Deleting it costs re-answering a question
 *     you have already answered, per repository — annoying, not lossy.
 *   - the CONFIG is the only thing here a person WROTE. Nothing regenerates it.
 *
 * So `--config` (and `--all`, which includes it) additionally wants `--yes`.
 *
 * ## What it will not touch
 *
 * Anything inside a repository. `wayfinder.config.json` is a project file that
 * belongs to whoever wrote it, and a tool that deletes files from a checkout
 * because it was asked to clean its own data has misunderstood whose data it
 * is. Only paths under the user's home (or their XDG overrides) are candidates.
 *
 * Everything outside that is injected — `stdout`, `stderr`, `env`, `home` — so
 * a test cannot read or delete the developer's real stores.
 */

import { readdir, rm, rmdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname } from 'node:path'

import { BIN } from './app.ts'
import { cacheDir } from './cache.ts'
import { LEGACY_TRUST_STORE_TOOL, TRUST_STORE_TOOL, configLocations } from './config.ts'
import { EXIT, type CliIo } from '@osdlc/cli-tool'
import { trustStoreDir } from '@osdlc/trust-repo'

/** `CliIo` plus the environment this command needs injected. */
export interface CleanCommandIO extends CliIo {
  /** Defaults to `process.env`. Supplies the XDG overrides. */
  env?: Record<string, string | undefined>
  /** Defaults to `os.homedir()`. The base for every non-XDG path. */
  home?: string
}

/** One removable store. */
interface Store {
  key: 'cache' | 'trust' | 'config'
  flag: string
  what: string
  path: string
  /** A file rather than a directory: the user config. */
  file: boolean
  /** The old waypost store: reported only when it holds something. */
  legacy?: boolean
}

function usage(): string {
  return `${BIN} clean — remove the data this tool stores outside your repositories

usage: ${BIN} clean [options]

  (no options)        show each store, where it is, and whether it holds anything
  --cache             remove stored probe results (derived; costs one slow probe)
  --trust             forget which repositories you have trusted
  --config            remove your user configuration file (needs --yes)
  --all               all three (needs --yes)
  --yes               confirm removing something that cannot be regenerated
  --json              the same answer as one JSON object, for a script or agent
  -h, --help          this text

Nothing is removed without one of --cache, --trust, --config or --all.
Nothing inside a repository is ever touched: a project's own config file
belongs to that project, not to this tool.
`
}

/** Bytes under a path, or null when it does not exist. */
async function weigh(path: string, file: boolean): Promise<number | null> {
  try {
    const info = await stat(path)
    if (file) return info.size
    let total = 0
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const child = `${dir}/${entry.name}`
        if (entry.isDirectory()) await walk(child)
        else total += (await stat(child)).size
      }
    }
    await walk(path)
    return total
  } catch {
    return null
  }
}

function humanBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function storesFor(env: Record<string, string | undefined>, home: string): Store[] {
  // The root is irrelevant to the USER config path, which is what this command
  // touches; the project layer is deliberately out of scope. `home` stands in
  // so the call is well-formed without pretending a repository is involved.
  const user = configLocations(home, env, home).user
  return [
    {
      key: 'cache',
      flag: '--cache',
      what: 'stored probe results',
      path: cacheDir(env, home),
      file: false,
    },
    {
      key: 'trust',
      flag: '--trust',
      what: 'repositories you have trusted',
      path: trustStoreDir(TRUST_STORE_TOOL, env, home),
      file: false,
    },
    {
      key: 'trust',
      flag: '--trust',
      what: 'repositories you trusted under the old waypost name',
      path: trustStoreDir(LEGACY_TRUST_STORE_TOOL, env, home),
      file: false,
      legacy: true,
    },
    { key: 'config', flag: '--config', what: 'your user configuration', path: user, file: true },
  ]
}

/**
 * One store's entry in the `--json` document. The same shape whether the run
 * reported or removed — `removed` is what separates them — so a caller reads
 * one document and never branches on which flags it passed.
 *
 * `bytes` is null when nothing is stored there, which is also how a store that
 * FAILED to be removed is told apart from one that had nothing to remove: the
 * failure carries a size and `removed: false`.
 */
interface StoreReport {
  key: Store['key']
  flag: string
  what: string
  path: string
  bytes: number | null
  removed: boolean
}

/** A store's reportable fields — `file` is an implementation detail, not an answer. */
function reportOf(store: Store, bytes: number | null, removed: boolean): StoreReport {
  return { key: store.key, flag: store.flag, what: store.what, path: store.path, bytes, removed }
}

interface Parsed {
  help: boolean
  yes: boolean
  json: boolean
  chosen: Set<Store['key']>
}

function parse(argv: string[]): Parsed | { error: string } {
  const chosen = new Set<Store['key']>()
  let help = false
  let yes = false
  let json = false
  for (const arg of argv) {
    switch (arg) {
      case '-h':
      case '--help':
        help = true
        break
      case '--yes':
        yes = true
        break
      case '--json':
        json = true
        break
      case '--cache':
        chosen.add('cache')
        break
      case '--trust':
        chosen.add('trust')
        break
      case '--config':
        chosen.add('config')
        break
      case '--all':
        chosen.add('cache').add('trust').add('config')
        break
      default:
        return { error: `unknown option: ${arg}` }
    }
  }
  return { help, yes, json, chosen }
}

export async function runCleanCommand(
  toolName: string,
  argv: string[],
  io: CleanCommandIO,
): Promise<number> {
  const parsed = parse(argv)
  if ('error' in parsed) {
    io.stderr(`${toolName}: ${parsed.error}\n\n${usage()}`)
    return EXIT.usage
  }
  if (parsed.help) {
    io.stdout(usage())
    return EXIT.ok
  }

  const env = io.env ?? process.env
  const home = io.home ?? homedir()
  const stores = storesFor(env, home)

  // The report. Also what a bare `clean` prints, which is why it is built
  // before anything is removed rather than inside the removal branch.
  if (parsed.chosen.size === 0) {
    const reports: StoreReport[] = []
    for (const store of stores) {
      const bytes = await weigh(store.path, store.file)
      if (store.legacy === true && bytes === null) continue
      reports.push(reportOf(store, bytes, false))
    }
    if (parsed.json) {
      io.stdout(`${JSON.stringify({ stores: reports }, null, 2)}\n`)
      return EXIT.ok
    }
    const lines: string[] = [`${toolName} stores three things outside your repositories:\n`]
    for (const report of reports) {
      const held = report.bytes === null ? 'nothing stored' : humanBytes(report.bytes)
      lines.push(`  ${report.flag.padEnd(9)} ${report.what}`)
      lines.push(`  ${' '.repeat(9)} ${report.path}  (${held})`)
    }
    lines.push(`\nPass a flag above to remove one, or --all for every one.`)
    lines.push(`Nothing was removed.\n`)
    io.stdout(lines.join('\n'))
    return EXIT.ok
  }

  if (parsed.chosen.has('config') && !parsed.yes) {
    io.stderr(
      `${toolName}: removing your user configuration needs --yes.\n` +
        `Nothing else here is written by hand, so nothing else asks.\n`,
    )
    return EXIT.usage
  }

  const reports: StoreReport[] = []
  let removed = 0
  let failed = false
  for (const store of stores) {
    if (!parsed.chosen.has(store.key)) continue
    const size = await weigh(store.path, store.file)
    if (size === null) {
      if (store.legacy === true) continue
      reports.push(reportOf(store, null, false))
      if (!parsed.json) io.stdout(`${store.what}: nothing stored at ${store.path}\n`)
      continue
    }
    try {
      await rm(store.path, { recursive: true, force: true })
      // A config file leaves its directory behind. Remove it when this was the
      // last thing in it, and leave it alone when it was not — the directory is
      // shared with anything else a future version puts there.
      if (store.file) {
        const dir = dirname(store.path)
        try {
          if ((await readdir(dir)).length === 0) await rmdir(dir)
        } catch {
          // Not ours to insist on. The file is gone, which is what was asked.
        }
      }
      reports.push(reportOf(store, size, true))
      if (!parsed.json) {
        io.stdout(`removed ${store.what} (${humanBytes(size)}) from ${store.path}\n`)
      }
      removed += 1
    } catch (err) {
      io.stderr(`${toolName}: could not remove ${store.path}: ${String(err)}\n`)
      // Recorded and then abandoned, exactly as before: a store that would not
      // delete is not a reason to keep deleting the others.
      reports.push(reportOf(store, size, false))
      failed = true
      break
    }
  }

  // One document, printed once, so a --json caller parses a single object
  // whether the run finished or stopped on a failure.
  if (parsed.json) io.stdout(`${JSON.stringify({ stores: reports }, null, 2)}\n`)
  if (failed) return EXIT.error

  if (removed > 0 && parsed.chosen.has('trust')) {
    // An aside rather than the answer, so under --json it goes to stderr and
    // leaves the document one object.
    const note = 'Trusted repositories will ask again the next time you read them.\n'
    if (parsed.json) io.stderr(note)
    else io.stdout(`\n${note}`)
  }
  return EXIT.ok
}
