/**
 * `git cat-file --batch` reads: many objects, byte-exact, in a few processes.
 *
 * The planner here is a generator that asks its driver to run git and gets
 * the stdout bytes back, so the sync client (`Git.catFileBatch`) and the async
 * one (`AsyncGit.catFileBatch`) share every line of the batching and parsing.
 * Each driver supplies the bytes runner behind `rawBytesChecked`.
 */

/** What one name resolved to. `bytes` are git's, never decoded. */
export type CatFileEntry =
  /** A blob with no NUL in its first 8000 bytes (git's own text test). */
  | { kind: 'text'; sha: string; size: number; bytes: Buffer }
  /** A blob with a NUL in its first 8000 bytes. */
  | { kind: 'binary'; sha: string; size: number; bytes: Buffer }
  /** A blob larger than `maxBytes`; its content was not read. */
  | { kind: 'too-large'; sha: string; size: number }
  /** A tree, commit or tag, such as `rev:dir`. Its content was not read. */
  | { kind: 'not-blob'; type: string; sha: string; size: number }
  /** No such object, or a short sha that names more than one. */
  | { kind: 'missing' }

/** Options for `catFileBatch` and `catFileBatchChunks`. */
export interface CatFileBatchOptions {
  /**
   * A blob larger than this many bytes comes back as `too-large`, and its
   * content is not read. Default `Infinity`.
   */
  maxBytes?: number | undefined
  /**
   * The most blob bytes one git process is asked for; the default is 64 MiB.
   * A blob larger than this still gets a process of its own, so set
   * `maxBytes` to bound it. Memory held at once is about this value.
   */
  chunkBytes?: number | undefined
}

/** One git run the planner needs. `input` is the object names, one per line. */
export interface CatFileRun {
  readonly type: 'run'
  readonly argv: string[]
  readonly input: string
  /** An output cap that fits the answer, so the runner's default never cuts it. */
  readonly maxOutputBytes: number | undefined
}

/** A group of finished entries the caller can use now. */
export interface CatFileChunk {
  readonly type: 'chunk'
  readonly entries: Map<string, CatFileEntry>
}

const DEFAULT_CHUNK_BYTES = 64 * 1024 * 1024
/** Names per `--batch-check` run: its output is a short line per name. */
const CHECK_NAMES = 10_000
/** More than a `<sha> <type> <size>\n` header and the `\n` after the content take. */
const OBJECT_OVERHEAD = 160
/** Git's binary test: a NUL in the first 8000 bytes. */
const BINARY_WINDOW = 8000

interface Found {
  name: string
  sha: string
  type: string
  size: number
}

function checkNames(names: readonly string[]): string[] {
  const unique = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || name === '' || /[\n\0]|\r$/.test(name)) {
      throw new TypeError(
        `typed-git: catFileBatch: a name must be a non-empty string with no newline, NUL or trailing CR (got ${JSON.stringify(name)})`,
      )
    }
    unique.add(name)
  }
  return [...unique]
}

function limit(option: string, value: number | undefined, fallback: number, zeroOk: boolean) {
  const n = value ?? fallback
  if (typeof n !== 'number' || Number.isNaN(n) || n < 0 || (!zeroOk && n === 0)) {
    throw new TypeError(
      `typed-git: catFileBatch: ${option} must be a ${zeroOk ? 'non-negative' : 'positive'} number (got ${JSON.stringify(n)})`,
    )
  }
  return n
}

/** The `--batch-check` answer for `names`, in order. */
function parseCheck(stdout: Buffer, names: readonly string[], out: Map<string, CatFileEntry>) {
  const lines = stdout.toString('utf8').split('\n')
  lines.pop() // after the last newline
  if (lines.length !== names.length) {
    throw new Error(
      `typed-git: catFileBatch: git answered ${lines.length} lines for ${names.length} names`,
    )
  }
  const found: Found[] = []
  lines.forEach((line, i) => {
    const name = names[i] as string
    if (line.endsWith(' missing') || line.endsWith(' ambiguous')) {
      out.set(name, { kind: 'missing' })
      return
    }
    const m = /^([0-9a-f]+) (\S+) (\d+)$/.exec(line)
    if (m === null) {
      throw new Error(`typed-git: catFileBatch: cannot read git's answer for ${name}: ${line}`)
    }
    found.push({ name, sha: m[1] as string, type: m[2] as string, size: Number(m[3]) })
  })
  return found
}

/** Reads `blobs`' headers and content, in order, from one `--batch` stdout. */
function parseContent(stdout: Buffer, blobs: readonly Found[]): Map<string, CatFileEntry> {
  const out = new Map<string, CatFileEntry>()
  let at = 0
  for (const b of blobs) {
    const eol = stdout.indexOf(0x0a, at)
    const header = eol < 0 ? '' : stdout.toString('utf8', at, eol)
    if (header !== `${b.sha} blob ${b.size}`) {
      throw new Error(
        `typed-git: catFileBatch: ${b.name} changed while it was read (expected "${b.sha} blob ${b.size}", got "${header}")`,
      )
    }
    const start = eol + 1
    const end = start + b.size
    if (end >= stdout.length) {
      throw new Error(`typed-git: catFileBatch: git's output for ${b.name} is cut short`)
    }
    const bytes = stdout.subarray(start, end)
    const binary = bytes.subarray(0, BINARY_WINDOW).includes(0)
    out.set(b.name, { kind: binary ? 'binary' : 'text', sha: b.sha, size: b.size, bytes })
    at = end + 1
  }
  return out
}

/** `entries` in the order of `names`, a repeated name once. */
export function inOrder(
  names: readonly string[],
  entries: Map<string, CatFileEntry>,
): Map<string, CatFileEntry> {
  const out = new Map<string, CatFileEntry>()
  for (const name of names) out.set(name, entries.get(name) as CatFileEntry)
  return out
}

/**
 * Plan the reads of `names`: `--batch-check` for their sizes, then `--batch`
 * for the blobs within `maxBytes`, grouped so a process is asked for about
 * `chunkBytes`. Yields a {@link CatFileRun} for the driver to run, which sends
 * back the stdout bytes, and a {@link CatFileChunk} for each group of finished
 * entries. The first chunk also holds every entry that needed no content read.
 */
export function* planCatFileBatch(
  names: readonly string[],
  opts: CatFileBatchOptions = {},
): Generator<CatFileRun | CatFileChunk, void, Buffer> {
  const unique = checkNames(names)
  const maxBytes = limit('maxBytes', opts.maxBytes, Infinity, true)
  const chunkBytes = limit('chunkBytes', opts.chunkBytes, DEFAULT_CHUNK_BYTES, false)

  const settled = new Map<string, CatFileEntry>()
  const wanted: Found[] = []
  for (let i = 0; i < unique.length; i += CHECK_NAMES) {
    const part = unique.slice(i, i + CHECK_NAMES)
    const stdout: Buffer = yield {
      type: 'run',
      argv: ['cat-file', '--batch-check'],
      input: part.join('\n') + '\n',
      maxOutputBytes: undefined,
    }
    for (const f of parseCheck(stdout, part, settled)) {
      if (f.type !== 'blob') {
        settled.set(f.name, { kind: 'not-blob', type: f.type, sha: f.sha, size: f.size })
      } else if (f.size > maxBytes) {
        settled.set(f.name, { kind: 'too-large', sha: f.sha, size: f.size })
      } else {
        wanted.push(f)
      }
    }
  }

  let group: Found[] = []
  let groupBytes = 0
  const groups: Found[][] = []
  for (const f of wanted) {
    if (group.length > 0 && groupBytes + f.size > chunkBytes) {
      groups.push(group)
      group = []
      groupBytes = 0
    }
    group.push(f)
    groupBytes += f.size
  }
  if (group.length > 0) groups.push(group)

  if (groups.length === 0) {
    yield { type: 'chunk', entries: settled }
    return
  }
  let first = true
  for (const g of groups) {
    const stdout: Buffer = yield {
      type: 'run',
      argv: ['cat-file', '--batch'],
      // By sha, so a ref that moves after the size check cannot change the object.
      input: g.map((f) => f.sha).join('\n') + '\n',
      maxOutputBytes: g.reduce((sum, f) => sum + f.size + OBJECT_OVERHEAD, 0),
    }
    const entries = parseContent(stdout, g)
    if (first) for (const [name, entry] of settled) entries.set(name, entry)
    first = false
    yield { type: 'chunk', entries }
  }
}
