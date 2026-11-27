import picomatch from 'picomatch'

export type Matcher = (path: string) => boolean

/** Characters that make a glob more than plain text, braces and extglobs included. */
const GLOB_SYNTAX = /[*?[\]{}()!+@\\]/

/**
 * A path picomatch reads specially: a `.` or `..` segment, which `*` and
 * `**` do not match, or a trailing `/`. Such a path goes to picomatch.
 */
const UNUSUAL_PATH = /(?:^|\/)\.\.?(?:\/|$)|\/$/

/**
 * Text with no glob syntax that picomatch may still not match literally: a
 * `.` or `..` segment, an empty one, a leading or trailing `/`.
 */
const UNUSUAL_GLOB = /(?:^|\/)\.\.?(?:\/|$)|^\/|\/\/|\/$/

const isPlain = (text: string): boolean =>
  text !== '' && !GLOB_SYNTAX.test(text) && !UNUSUAL_GLOB.test(text)

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/**
 * `pre{a,b}post` as `preapost`, `prebpost`; a glob with no braces as
 * itself. Null for braces left to picomatch: nested, more than one group, a
 * range, one alternative, an empty one.
 */
function expandBraces(glob: string): string[] | null {
  if (!/[{}]/.test(glob)) return [glob]
  const m = /^([^{}]*)\{([^{}]*)\}([^{}]*)$/.exec(glob)
  if (m === null) return null
  const [, pre, list, post] = m as unknown as [string, string, string, string]
  const alternatives = list.split(',')
  if (alternatives.length < 2 || alternatives.some((a) => a === '' || a.includes('..'))) {
    return null
  }
  return alternatives.map((a) => `${pre}${a}${post}`)
}

/** The globs of a matcher sorted by the shape it tests them in. */
interface Shapes {
  /** `a/b.md`: the path itself. */
  paths: string[]
  /** `**\/name`: a file name at any depth. */
  names: string[]
  /** `**\/a/b.md`: a path ending, at any depth. */
  tails: string[]
  /** `**\/*.ext`: an ending of the file name. */
  endings: string[]
  /** `*.ext`: an ending of a path with no `/`. */
  rootEndings: string[]
  /** `**\/dir/**`: a run of whole segments anywhere in the path. */
  dirs: string[]
  /** `dir/**`: the path's first segments. */
  prefixes: string[]
}

type Shape = keyof Shapes

/** The {@link Shapes} entry a brace-free `glob` goes in, and the text it is tested by; null when it fits none. */
function shapeOf(glob: string): [Shape, string] | null {
  if (isPlain(glob)) return ['paths', glob]
  const inner = glob.startsWith('**/') && glob.endsWith('/**') ? glob.slice(3, -3) : null
  if (inner !== null && isPlain(inner)) return ['dirs', inner]
  const tail = glob.startsWith('**/') ? glob.slice(3) : null
  if (tail !== null && isPlain(tail)) return [tail.includes('/') ? 'tails' : 'names', tail]
  const ending = tail?.startsWith('*') === true ? tail.slice(1) : null
  if (ending !== null && isPlain(ending) && !ending.includes('/')) return ['endings', ending]
  const rootEnding = glob.startsWith('*') ? glob.slice(1) : null
  if (rootEnding !== null && isPlain(rootEnding) && !rootEnding.includes('/')) {
    return ['rootEndings', rootEnding]
  }
  const prefix = glob.endsWith('/**') ? glob.slice(0, -3) : null
  if (prefix !== null && isPlain(prefix)) return ['prefixes', prefix]
  return null
}

/**
 * One matcher for any of `globs`, matching as picomatch with `options`
 * does. The shapes that rules and `.gitattributes` use most are tested as
 * text, without picomatch's regular expressions: a plain path, `**\/name`,
 * `**\/*.ext`, `*.ext`, `**\/dir/**` and `dir/**`, with plain braces
 * expanded unless `options.nobrace`. Other globs go to picomatch.
 * `dot: true` is required because the text tests match dotfiles.
 */
export function compileGlobs(
  globs: readonly string[],
  options: picomatch.PicomatchOptions & { dot: true },
): Matcher {
  if (globs.length === 0) return () => false
  const shapes: Shapes = {
    paths: [],
    names: [],
    tails: [],
    endings: [],
    rootEndings: [],
    dirs: [],
    prefixes: [],
  }
  const others: string[] = []
  for (const glob of globs) {
    const expanded = options.nobrace === true ? [glob] : expandBraces(glob)
    const shaped = expanded?.map(shapeOf) ?? [null]
    if (!shaped.every((s) => s !== null)) {
      others.push(glob)
      continue
    }
    for (const [shape, text] of shaped) shapes[shape].push(text)
  }
  if (others.length === globs.length) return picomatch([...globs], options)
  const paths = new Set(shapes.paths)
  const names = new Set(shapes.names)
  const { endings, rootEndings } = shapes
  const tails = shapes.tails.map((t) => [t, `/${t}`] as const)
  const prefixes = shapes.prefixes.map((p) => [p, `${p}/`] as const)
  const dirs =
    shapes.dirs.length === 0
      ? null
      : new RegExp(`(?:^|/)(?:${shapes.dirs.map(escapeRegExp).join('|')})(?:/|$)`)
  const rest = others.length === 0 ? null : picomatch(others, options)
  let all: Matcher | undefined

  return (path) => {
    if (UNUSUAL_PATH.test(path)) return (all ??= picomatch([...globs], options))(path)
    if (paths.has(path)) return true
    const slash = path.lastIndexOf('/')
    if (names.size > 0 && names.has(path.slice(slash + 1))) return true
    // An ending holds no `/`, so it lies in the file name.
    for (const e of endings) if (path.endsWith(e)) return true
    if (slash < 0) for (const e of rootEndings) if (path.endsWith(e)) return true
    for (const [t, deep] of tails) if (path === t || path.endsWith(deep)) return true
    if (dirs?.test(path) === true) return true
    for (const [p, under] of prefixes) if (path === p || path.startsWith(under)) return true
    return rest?.(path) ?? false
  }
}
