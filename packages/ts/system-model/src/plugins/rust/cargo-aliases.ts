/**
 * cargo aliases: the `[alias]` table of `.cargo/config.toml` files. An
 * `xtask` alias (`xtask = "run --package xtask --"`) is one of them.
 *
 * Cargo reads `.cargo/config.toml` (or the older `.cargo/config`) in the
 * directory it runs in and in every directory above, and merges them: for a
 * key set in two files, the deeper file wins. When one directory has both
 * names, cargo reads `.cargo/config`. Inside a workspace, cargo reads the
 * config files from the workspace root up, not those of member crates.
 *
 * So aliases are listed once per crate that is not a workspace member (a
 * workspace root or a crate of its own), merged from its directory up to the
 * repository root. The task runs in that directory, because cargo has no
 * stable flag that names a directory to read config from. Config in
 * `$CARGO_HOME` is outside the repository and not read. An alias named after
 * a built-in command is skipped, as cargo ignores it. An alias named after an
 * external command such as `clippy` or `fmt` is listed, as cargo runs it.
 */

import { parse as parseToml } from 'smol-toml'

import type { ProviderContext, RunnerContext } from '../../contract.ts'
import type { CargoFact } from '../../manifests.ts'
import type { Diagnostic, ProviderResult, Task } from '../../model.ts'
import { globMatches } from '../../roles.ts'
import type { RunnerRole } from '../../tool.ts'
import { dirOf, isTable, joinRel, looksPersistent, taskId } from '../support/shared.ts'

/** The config file names in one `.cargo/` directory, the one cargo prefers first. */
export const CONFIG_NAMES = ['config', 'config.toml']

const CHAIN = [
  { label: 'runner', hint: 'cargo runs the aliases its `.cargo/config.toml` files declare.' },
  {
    label: 'crate',
    hint: 'The directory cargo runs in: a workspace root or a crate outside any workspace.',
  },
  { label: 'alias', hint: 'The key under `[alias]`.' },
]

/**
 * cargo's built-in commands, which an alias cannot replace: the list in
 * cargo's `commands::builtin()` (cargo 0.100, Rust 1.95). `clippy`, `fmt` and
 * `miri` are not in it. They are external `cargo-*` binaries, and an alias
 * with one of those names wins over the binary.
 */
const BUILT_IN = new Set([
  'add',
  'bench',
  'build',
  'check',
  'clean',
  'config',
  'doc',
  'fetch',
  'fix',
  'generate-lockfile',
  'git-checkout',
  'help',
  'info',
  'init',
  'install',
  'locate-project',
  'login',
  'logout',
  'metadata',
  'new',
  'owner',
  'package',
  'pkgid',
  'publish',
  'read-manifest',
  'remove',
  'report',
  'run',
  'rustc',
  'rustdoc',
  'search',
  'test',
  'tree',
  'uninstall',
  'update',
  'vendor',
  'verify-project',
  'version',
  'yank',
])

interface Alias {
  command: string
  source: string
}

export const cargoAliasesRunner: RunnerRole = {
  kind: 'parse',
  chain: CHAIN,

  async collect(ctx: RunnerContext): Promise<ProviderResult> {
    const tasks: Task[] = []
    const diagnostics: Diagnostic[] = []
    const shadowed = new Map<string, Diagnostic>()
    const configs = await configFiles(ctx)
    const byDir = new Map<string, string>()
    for (const file of configs.sort()) {
      const dir = dirOf(dirOf(file))
      // `config` sorts first and is the one cargo reads when both exist.
      if (!byDir.has(dir)) byDir.set(dir, file)
    }
    const parsed = new Map<string, Record<string, Alias>>()
    for (const [dir, file] of byDir) parsed.set(dir, await readAliases(ctx, file, diagnostics))

    for (const dir of crateDirs(ctx)) {
      const merged: Record<string, Alias> = {}
      // Root first, so a deeper file overwrites what a shallower one set.
      for (const at of ancestors(dir).reverse()) Object.assign(merged, parsed.get(at) ?? {})
      for (const [name, alias] of Object.entries(merged).sort(([a], [b]) => (a < b ? -1 : 1))) {
        if (BUILT_IN.has(name)) {
          shadowed.set(`${alias.source}#${name}`, {
            severity: 'info',
            message: `alias ${name} names a built-in cargo command, which cargo runs instead`,
            source: alias.source,
          })
          continue
        }
        const argv = ['cargo', name]
        tasks.push({
          // The crate's manifest, not the config file, keeps the id unique
          // when one config serves several crates.
          id: taskId('cargo-aliases', joinRel(dir, 'Cargo.toml'), name),
          runner: 'cargo-aliases',
          path: ['cargo-aliases', dir, name],
          argv,
          cwd: dir,
          display: argv.join(' '),
          parameters: [],
          source: alias.source,
          origin: 'declared',
          detail: `cargo ${alias.command}`,
          tags: ['cargo-aliases', 'rust', dir],
          persistent: { value: looksPersistent(name), declared: false },
          executes: 'local',
        })
      }
    }
    diagnostics.push(...shadowed.values())
    return { status: tasks.length > 0 ? 'ok' : 'absent', tasks, diagnostics }
  },
}

/** Every `.cargo/config` and `.cargo/config.toml`, at any depth. */
export async function configFiles(ctx: ProviderContext): Promise<string[]> {
  return (await ctx.files('.cargo/')).filter((f) => {
    const dir = dirOf(f)
    return (
      (dir === '.cargo' || dir.endsWith('/.cargo')) &&
      CONFIG_NAMES.includes(f.slice(dir.length + 1))
    )
  })
}

async function readAliases(
  ctx: RunnerContext,
  file: string,
  diagnostics: Diagnostic[],
): Promise<Record<string, Alias>> {
  const text = await ctx.readText(file)
  if (text === null) return {}
  let doc: unknown
  try {
    doc = parseToml(text)
  } catch (err) {
    const message = `parse failed: ${err instanceof Error ? err.message : String(err)}`
    diagnostics.push({ severity: 'warning', message, source: file })
    return {}
  }
  const table = isTable(doc) && isTable(doc['alias']) ? doc['alias'] : {}
  const out: Record<string, Alias> = {}
  for (const [name, value] of Object.entries(table)) {
    const command =
      typeof value === 'string'
        ? value
        : Array.isArray(value) && value.every((v) => typeof v === 'string')
          ? value.join(' ')
          : undefined
    if (command === undefined) {
      diagnostics.push({
        severity: 'warning',
        message: `alias ${name} is not a string or a list of strings, so it was skipped`,
        source: file,
      })
      continue
    }
    out[name] = { command, source: file }
  }
  return out
}

/** Directories of crates that are not workspace members, sorted. */
function crateDirs(ctx: RunnerContext): string[] {
  const facts = new Map<string, CargoFact>()
  for (const p of ctx.profile.packages) {
    if (p.manifests.cargo !== undefined) facts.set(p.dir, p.manifests.cargo)
  }
  return [...facts.keys()].filter((dir) => !isMember(dir, facts)).sort()
}

/**
 * Whether cargo treats the crate at `dir` as a member of a workspace above
 * it. A crate that declares `[workspace]` is its own root. Otherwise cargo
 * takes the nearest `[workspace]` root above that does not exclude it. A
 * root excludes it when its `exclude` holds a prefix of its path and
 * `members` does not list it.
 */
function isMember(dir: string, facts: ReadonlyMap<string, CargoFact>): boolean {
  if (facts.get(dir)?.workspace === true) return false
  for (const at of ancestors(dir).slice(1)) {
    const root = facts.get(at)
    if (root?.workspace !== true) continue
    const rel = at === '.' ? dir : dir.slice(at.length + 1)
    const excluded = (root.workspaceExclude ?? []).some((entry) => {
      const prefix = entry.replace(/^\.\//, '').replace(/\/+$/, '')
      return rel === prefix || rel.startsWith(`${prefix}/`)
    })
    if (!excluded || (root.workspaceMembers ?? []).some((glob) => globMatches(glob, rel))) {
      return true
    }
    // Excluded here: cargo goes on to the next `[workspace]` root above.
  }
  return false
}

/** `dir` and each directory above it, up to the root. */
function ancestors(dir: string): string[] {
  const out = [dir]
  for (let at = dir; at !== '.';) {
    at = dirOf(at)
    out.push(at)
  }
  return out
}
