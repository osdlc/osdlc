/**
 * The `clean` subcommand: the three stores wayfinder keeps outside your
 * repositories (cache, trust, config). `--cache` and `--trust` also clear
 * the old waypost cache and trust store. An old store is listed only when it
 * holds something.
 *
 * ## Nothing is removed unless asked
 *
 * Bare `clean` only reports: what each store is, where it is, and whether
 * anything is in it. A `--dry-run` flag would put the safe behaviour behind a
 * flag people forget. Instead the flags name what to remove, and with no flag
 * nothing is removed.
 *
 * ## Why `--config` alone needs `--yes`
 *
 * The three stores are not equally easy to replace, and the check follows
 * that:
 *
 *   - The cache is derived. Deleting it costs one slow probe.
 *   - The trust store is consent. Deleting it means answering the trust
 *     question again for each repository. That is annoying, but nothing is lost.
 *   - The config is the only one a person wrote. Nothing regenerates it.
 *
 * So `--config` (and `--all`, which includes it) also needs `--yes`.
 *
 * ## What it will not touch
 *
 * Anything inside a repository. `wayfinder.config.json` is a project file that
 * belongs to whoever wrote it, not to this tool's data. Only paths under the
 * user's home (or their XDG overrides) are removed.
 *
 * `stdout`, `stderr`, `env` and `home` are injected, so a test cannot read or
 * delete the developer's real stores.
 */

import { readdir, rm, rmdir, stat } from 'node:fs/promises'
import { dirname } from 'node:path'

import { BIN } from './app.ts'
import { cacheDir, legacyCacheDir } from './cache.ts'
import { LEGACY_TRUST_STORE_TOOL, TRUST_STORE_TOOL, configLocations } from './config.ts'
import { EXIT, type CliIo } from '@osdlc/cli-tool'
import { homeDir, trustStoreDir } from '@osdlc/trust-repo'
import { jsonText } from './terminal-text.ts'

/** `CliIo` plus the environment this command needs injected. */
export interface CleanCommandIO extends CliIo {
  /** Defaults to `process.env`. Supplies the XDG overrides. */
  env?: Record<string, string | undefined>
  /** Defaults to `homeDir()` from `@osdlc/trust-repo`. The base for every non-XDG path. */
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
  // This command touches only the user config path, which does not depend on
  // the root. The project layer is out of scope. `home` is passed as the root
  // because the call needs one and no repository is involved.
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
      key: 'cache',
      flag: '--cache',
      what: 'stored probe results under the old waypost name',
      path: legacyCacheDir(env, home),
      file: false,
      legacy: true,
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
 * One store's entry in the `--json` document. It has the same shape whether
 * the run reported or removed (`removed` tells them apart), so a caller never
 * branches on which flags it passed.
 *
 * `bytes` is null when nothing is stored there. That is also how a store that
 * failed to be removed is told apart from one that had nothing to remove: the
 * failure has a size and `removed: false`.
 */
interface StoreReport {
  key: Store['key']
  flag: string
  what: string
  path: string
  bytes: number | null
  removed: boolean
}

/** A store's reported fields. `file` is internal and is left out. */
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
  const home = io.home ?? homeDir()
  const stores = storesFor(env, home)

  // A bare `clean` prints the report and removes nothing.
  if (parsed.chosen.size === 0) {
    const reports: StoreReport[] = []
    for (const store of stores) {
      const bytes = await weigh(store.path, store.file)
      if (store.legacy === true && bytes === null) continue
      reports.push(reportOf(store, bytes, false))
    }
    if (parsed.json) {
      io.stdout(`${jsonText({ stores: reports }, 2)}\n`)
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
      // A config file leaves its directory behind. Remove the directory when it
      // is now empty, and leave it when it is not, since a future version may
      // keep other files there.
      if (store.file) {
        const dir = dirname(store.path)
        try {
          if ((await readdir(dir)).length === 0) await rmdir(dir)
        } catch {
          // Not required. The file is gone, which is what was asked.
        }
      }
      reports.push(reportOf(store, size, true))
      if (!parsed.json) {
        io.stdout(`removed ${store.what} (${humanBytes(size)}) from ${store.path}\n`)
      }
      removed += 1
    } catch (err) {
      io.stderr(`${toolName}: could not remove ${store.path}: ${String(err)}\n`)
      // Record the failure and stop. A store that would not delete is a reason
      // to stop deleting the others.
      reports.push(reportOf(store, size, false))
      failed = true
      break
    }
  }

  // One document, printed once, so a --json caller parses a single object
  // whether the run finished or stopped on a failure.
  if (parsed.json) io.stdout(`${jsonText({ stores: reports }, 2)}\n`)
  if (failed) return EXIT.error

  if (removed > 0 && parsed.chosen.has('trust')) {
    // A side note, not the answer, so under --json it goes to stderr and
    // stdout stays one JSON object.
    const note = 'Trusted repositories will ask again the next time you read them.\n'
    if (parsed.json) io.stderr(note)
    else io.stdout(`\n${note}`)
  }
  return EXIT.ok
}
