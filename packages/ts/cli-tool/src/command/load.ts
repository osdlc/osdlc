/**
 * The command tree from a directory of command files. The directory tree is
 * the command tree: `commands/config/get.ts` is `config get`.
 *
 * | File | Is |
 * |---|---|
 * | `<name>.ts` (or `.js`, `.mts`, `.mjs`) | the command `<name>`, its default export |
 * | `<name>/` | the group `<name>` |
 * | `<name>/index.ts` | the group's own declaration (a `defineGroup` with no commands), or a command that becomes the group's default |
 * | `index.ts` at the top | the root's group declaration, or the root's default command |
 * | a name starting with `_` or `.`, a `.d.ts`, a `.test.` or `.spec.` file | ignored, for helpers and tests |
 * | a symbolic link | ignored, so the tree cannot reach outside the directory |
 * | any other file (`.md`, `.json`, ...) | ignored |
 *
 * Only the directory passed in is read, and it must be a `file:` URL or an
 * absolute path, so the tree never depends on the process's working
 * directory. A command or group name is letters, digits, `-` and `_`, and does
 * not start with `-` or `_`; any other directory or module file name is an error.
 */

import { readdir } from 'node:fs/promises'
import { basename, extname, isAbsolute, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { isGroup, type Command, type Group, type Node } from './define.ts'

const EXTENSIONS = new Set(['.ts', '.mts', '.js', '.mjs'])

function ignored(name: string): boolean {
  return (
    name.startsWith('_') ||
    name.startsWith('.') ||
    name.endsWith('.d.ts') ||
    name.endsWith('.d.mts') ||
    /\.(test|spec)\.[mc]?[jt]s$/.test(name)
  )
}

/** A word a person can type as a command: letters, digits, `-` and `_`, starting with a letter or digit. */
const WORD = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function checkWord(word: string, file: string): void {
  if (!WORD.test(word)) {
    throw new Error(`command tree: ${file} is not a command name; use letters, digits, - and _`)
  }
}

function isNode(value: unknown): value is Node {
  return (
    typeof value === 'object' &&
    value !== null &&
    ((value as { type?: unknown }).type === 'command' ||
      (value as { type?: unknown }).type === 'group')
  )
}

/**
 * One file's command: its path in the tree and its default export.
 * @experimental
 */
export interface CommandFile {
  /** The words, such as `['config', 'get']`. The root's own `index` is `[]`. */
  path: readonly string[]
  /** For an `index` file: whether it declares its directory rather than a command of that name. */
  index: boolean
  node: Node
}

/**
 * Build the tree from a flat list of files, for a bundler that collects the
 * modules itself (`import.meta.glob`). {@link loadCommandTree} uses it too.
 * @experimental
 */
export function treeFromFiles(files: readonly CommandFile[], root: { summary: string }): Group {
  interface Draft {
    spec?: Group
    default?: Command
    commands: Map<string, Draft | Command>
  }
  const top: Draft = { commands: new Map() }
  const where = (path: readonly string[]): string => path.join('/') || '(root)'

  const dirOf = (path: readonly string[]): Draft => {
    let draft = top
    for (const word of path) {
      const next = draft.commands.get(word)
      if (next !== undefined && !('commands' in next && next.commands instanceof Map)) {
        throw new Error(`command tree: '${word}' is both a command file and a directory`)
      }
      const created: Draft = (next as Draft | undefined) ?? { commands: new Map() }
      draft.commands.set(word, created)
      draft = created
    }
    return draft
  }

  for (const file of files) {
    if (file.index) {
      const dir = dirOf(file.path)
      if (isGroup(file.node)) {
        if (Object.keys(file.node.commands).length > 0) {
          throw new Error(
            `command tree: ${where(file.path)}/index declares commands; give each its own file`,
          )
        }
        dir.spec = file.node
      } else dir.default = file.node
      continue
    }
    const parent = dirOf(file.path.slice(0, -1))
    const word = file.path[file.path.length - 1]!
    const existing = parent.commands.get(word)
    // A directory read first (it sorts before `<word>.ts`) has left a draft here.
    if (existing !== undefined && 'commands' in existing && existing.commands instanceof Map) {
      throw new Error(`command tree: '${word}' is both a command file and a directory`)
    }
    if (existing !== undefined) {
      throw new Error(`command tree: '${where(file.path)}' is declared twice`)
    }
    if (isGroup(file.node)) {
      throw new Error(`command tree: ${where(file.path)} exports a group; use a directory`)
    }
    parent.commands.set(word, file.node)
  }

  const build = (draft: Draft, path: readonly string[], summary?: string): Group => {
    const commands: Record<string, Node> = {}
    for (const [word, child] of draft.commands) {
      commands[word] =
        child instanceof Object && 'commands' in child && child.commands instanceof Map
          ? build(child as Draft, [...path, word])
          : (child as Command)
    }
    const groupSummary = draft.spec?.summary ?? draft.default?.summary ?? summary ?? ''
    if (groupSummary.trim() === '') {
      throw new Error(`command tree: ${where(path)} has no summary; add ${where(path)}/index`)
    }
    const order = draft.spec?.order ?? Object.keys(commands).sort()
    return {
      type: 'group',
      summary: groupSummary,
      ...(draft.spec?.description !== undefined ? { description: draft.spec.description } : {}),
      ...(draft.spec?.hidden === true ? { hidden: true } : {}),
      ...((draft.spec?.default ?? draft.default) !== undefined
        ? { default: (draft.spec?.default ?? draft.default)! }
        : {}),
      order,
      commands,
    }
  }
  return build(top, [], root.summary)
}

/**
 * Read the command files under `dir` and build the tree. Each file's default
 * export must be a command or, for an `index`, a group or a command.
 *
 * The files are imported, so this runs the tool's own modules. Call it with a
 * path relative to the calling module: `new URL('./commands/', import.meta.url)`.
 * @experimental
 */
export async function loadCommandTree(
  dir: string | URL,
  root: { summary: string },
): Promise<Group> {
  if (typeof dir === 'string' && !isAbsolute(dir)) {
    throw new Error(
      `command tree: '${dir}' is relative; pass new URL('./commands/', import.meta.url) or an absolute path`,
    )
  }
  const base = typeof dir === 'string' ? dir : fileURLToPath(dir)
  const files: CommandFile[] = []
  const visit = async (abs: string, path: readonly string[]): Promise<void> => {
    const entries = (await readdir(abs, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
    const seen = new Map<string, string>()
    for (const entry of entries) {
      if (ignored(entry.name)) continue
      if (entry.isDirectory()) {
        checkWord(entry.name, join(abs, entry.name))
        await visit(join(abs, entry.name), [...path, entry.name])
        continue
      }
      const ext = extname(entry.name)
      if (!entry.isFile() || !EXTENSIONS.has(ext)) continue
      const word = basename(entry.name, ext)
      checkWord(word, join(abs, entry.name))
      const other = seen.get(word)
      if (other !== undefined) {
        throw new Error(
          `command tree: ${join(abs, other)} and ${join(abs, entry.name)} declare the same command`,
        )
      }
      seen.set(word, entry.name)
      const mod = (await import(pathToFileURL(join(abs, entry.name)).href)) as { default?: unknown }
      if (!isNode(mod.default)) {
        throw new Error(
          `command tree: ${join(abs, entry.name)} has no default export from defineCommand or defineGroup`,
        )
      }
      const index = word === 'index'
      files.push({ path: index ? path : [...path, word], index, node: mod.default })
    }
  }
  await visit(base, [])
  return treeFromFiles(files, root)
}
