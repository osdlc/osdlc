/**
 * What a diff did to a file: added, deleted, modified or renamed.
 */
export const FILE_STATUSES = ['added', 'deleted', 'modified', 'renamed'] as const
/**
 * One of {@link FILE_STATUSES}.
 */
export type FileStatus = (typeof FILE_STATUSES)[number]

/**
 * What git tracks at a path: a file's lines, a symlink's target, or a submodule's commit.
 *
 * @experimental
 */
export const ENTRY_KINDS = ['file', 'symlink', 'submodule'] as const
/**
 * One of {@link ENTRY_KINDS}.
 */
export type EntryKind = (typeof ENTRY_KINDS)[number]

/** A changed line: its text without the `+`/`-`, and its line number on its own side. */
export interface DiffLine {
  /** Without a trailing `\r`, which {@link cr} records instead. */
  text: string
  /** Present when the line ended in `\r` (a CRLF line ending). */
  cr?: true
  at: number
  /** Index of its block in {@link FileDiff.blocks}. */
  block: number
}

/** A run of removed lines and the added lines that replace them, with no context between. */
export interface DiffBlock {
  removed: DiffLine[]
  added: DiffLine[]
}

/**
 * One file of a unified diff: its paths, status and entry kind, and its added and removed lines,
 * also grouped into blocks.
 */
export interface FileDiff {
  /** The new path; for a deleted file, the path it had. */
  path: string
  /** The path before a rename, else null. */
  oldPath: string | null
  status: FileStatus
  entry: EntryKind
  /** Rename similarity in percent, else null. */
  similarity: number | null
  binary: boolean
  added: DiffLine[]
  removed: DiffLine[]
  blocks: DiffBlock[]
}

const UTF8 = new TextEncoder()

const HUNK = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/

const C_ESCAPES: Record<string, number> = {
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
  '\\': 0x5c,
  '"': 0x22,
}

/**
 * A name git wrote C-quoted (`"w\303\251\"rd.ts"`), decoded: `\n`-style and
 * three-digit octal escapes, the octal bytes read as UTF-8. Text not wrapped
 * in double quotes comes back unchanged.
 */
export function unquoteCPath(text: string): string {
  if (text.length < 2 || !text.startsWith('"') || !text.endsWith('"')) return text
  const bytes: number[] = []
  const inner = text.slice(1, -1)
  for (let i = 0; i < inner.length; i += 1) {
    const ch = String.fromCodePoint(inner.codePointAt(i)!)
    if (ch !== '\\') {
      bytes.push(...UTF8.encode(ch))
      i += ch.length - 1
      continue
    }
    const octal = /^[0-7]{1,3}/.exec(inner.slice(i + 1))
    if (octal !== null) {
      bytes.push(Number.parseInt(octal[0], 8))
      i += octal[0].length
      continue
    }
    const code = C_ESCAPES[inner[i + 1] ?? '']
    if (code === undefined) {
      bytes.push(0x5c)
    } else {
      bytes.push(code)
      i += 1
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes))
}

/**
 * The file a `+++ ` or `--- ` line names, or null for `/dev/null`. Undoes the
 * TAB git appends after a name with spaces and the C-quoting of an unusual
 * name, and strips the `a/` or `b/` prefix.
 */
export function diffHeaderPath(line: string): string | null {
  return headerName(line.slice('+++ '.length))
}

/** {@link diffHeaderPath} for the name after the `+++ ` or `--- `. */
function headerName(name: string): string | null {
  if (!name.startsWith('"')) {
    const tab = name.indexOf('\t')
    if (tab >= 0) name = name.slice(0, tab)
  } else {
    name = name.replace(/\t$/, '')
  }
  name = unquoteCPath(name)
  if (name === '/dev/null') return null
  return /^[ab]\//.test(name) ? name.slice(2) : name
}

/**
 * `<new>` out of `diff --git a/<old> b/<new>`, for a file with no `+++` line.
 * Git does not quote a name for its spaces, so when both halves are the same
 * path it is taken whole, even if it holds ` b/` itself.
 */
function gitHeaderPath(line: string): string | null {
  const quoted = line.lastIndexOf(' "b/')
  if (line.endsWith('"') && quoted >= 0) return unquoteCPath(line.slice(quoted + 1)).slice(2)
  const rest = line.slice('diff --git '.length)
  const half = (rest.length - 1) / 2
  if (
    Number.isInteger(half) &&
    rest.startsWith('a/') &&
    rest.slice(half, half + 3) === ' b/' &&
    rest.slice(2, half) === rest.slice(half + 3)
  ) {
    return rest.slice(half + 3)
  }
  const i = line.lastIndexOf(' b/')
  return i < 0 ? null : line.slice(i + 3)
}

function entryOf(mode: string): EntryKind {
  if (mode.startsWith('120000')) return 'symlink'
  if (mode.startsWith('160000')) return 'submodule'
  return 'file'
}

function newFile(path: string): FileDiff {
  return {
    path,
    oldPath: null,
    status: 'modified',
    entry: 'file',
    similarity: null,
    binary: false,
    added: [],
    removed: [],
    blocks: [],
  }
}

type Side = 'removed' | 'added'

/** What each header line after `diff --git` sets, by the prefix it starts with. */
type Header = readonly [prefix: string, set: (value: string, file: FileDiff) => Partial<FileDiff>]
const HEADERS: readonly Header[] = [
  ['new file mode ', (v) => ({ status: 'added', entry: entryOf(v) })],
  ['deleted file mode ', (v) => ({ status: 'deleted', entry: entryOf(v) })],
  ['new mode ', (v) => ({ entry: entryOf(v) })],
  ['index ', (v) => (/ \d{6}$/.test(v) ? { entry: entryOf(v.slice(-6)) } : {})],
  ['similarity index ', (v) => ({ similarity: Number.parseInt(v, 10) })],
  ['rename from ', (v) => ({ status: 'renamed', oldPath: unquoteCPath(v) })],
  ['rename to ', (v) => ({ path: unquoteCPath(v) })],
  ['Binary files ', () => ({ binary: true })],
  ['GIT binary patch', () => ({ binary: true })],
  ['+++ ', (v, f) => ({ path: headerName(v) ?? f.path })],
  ['--- ', (v, f) => (f.status === 'deleted' ? { path: headerName(v) ?? f.path } : {})],
]

/**
 * Parses a unified diff of any context width into one record per file. Body
 * lines are counted against each hunk header, so a removed line whose text
 * starts with `-- ` is not taken for a file header. A line's text drops a
 * trailing `\r`, so converting a file from CRLF to LF changes no line's text;
 * `cr` keeps it for the languages where it matters.
 */
export function parseDiff(diff: string): FileDiff[] {
  const files: FileDiff[] = []
  let file: FileDiff | null = null
  let block: DiffBlock | null = null
  /** Body lines the hunk header promises on each side, and the next line number there. */
  const left = { removed: 0, added: 0 }
  const next = { removed: 0, added: 0 }

  for (const raw of diff.split('\n')) {
    if (file !== null && (left.removed > 0 || left.added > 0)) {
      if (raw.startsWith('\\')) continue
      const side: Side | null = raw[0] === '-' ? 'removed' : raw[0] === '+' ? 'added' : null
      if (side !== null && left[side] > 0) {
        // A changed line after context, or a removed line after added ones, starts a block.
        if (block === null || (side === 'removed' && block.added.length > 0)) {
          block = { removed: [], added: [] }
          file.blocks.push(block)
        }
        const cr = raw.endsWith('\r')
        const line: DiffLine = {
          text: cr ? raw.slice(1, -1) : raw.slice(1),
          ...(cr ? { cr: true as const } : {}),
          at: next[side],
          block: file.blocks.length - 1,
        }
        block[side].push(line)
        file[side].push(line)
        left[side] -= 1
        next[side] += 1
        continue
      }
      // A blank context line can reach us without its space, from tools that strip trailing whitespace.
      if ((raw[0] === ' ' || raw === '') && left.removed > 0 && left.added > 0) {
        block = null
        left.removed -= 1
        left.added -= 1
        next.removed += 1
        next.added += 1
        continue
      }
      // A body line the counts do not allow: stop trusting them and read it as a header.
      left.removed = 0
      left.added = 0
    }

    if (raw.startsWith('diff --git ')) {
      file = newFile(gitHeaderPath(raw) ?? '')
      block = null
      files.push(file)
      continue
    }
    if (file === null) continue
    const header = HEADERS.find(([prefix]) => raw.startsWith(prefix))
    if (header !== undefined) {
      Object.assign(file, header[1](raw.slice(header[0].length), file))
      continue
    }
    const m = HUNK.exec(raw)
    if (m !== null) {
      block = null
      next.removed = Number(m[1])
      left.removed = m[2] === undefined ? 1 : Number(m[2])
      next.added = Number(m[3])
      left.added = m[4] === undefined ? 1 : Number(m[4])
    }
  }
  for (const f of files) if (f.entry === 'file' && isSubmodulePointer(f)) f.entry = 'submodule'
  return files
}

/** A dirty submodule in the working tree has no `160000` mode line, only its pointer lines. */
function isSubmodulePointer(f: FileDiff): boolean {
  const lines = [...f.removed, ...f.added]
  return (
    lines.length > 0 &&
    lines.every((l) => /^Subproject commit [0-9a-f]{7,64}(?:-dirty)?$/.test(l.text))
  )
}
