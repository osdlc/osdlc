/**
 * Syntax highlighting, applied as the last pass over hast.
 *
 * Deliberately fine-grained (`shiki/core` + the JS regex engine, no WASM, no
 * bundled-everything import): Shiki itself is dynamically imported the first
 * time a document actually contains a highlightable fence, and each language
 * grammar is loaded lazily on first sight. A note with no code costs nothing.
 *
 * Themes and grammars are reached through Shiki's `bundledThemes` /
 * `bundledLanguages` records rather than by importing a built specifier. A
 * bundler cannot see through a template literal, so `import(\`shiki/langs/${id}.mjs\`)`
 * survives the build as a bare specifier and a browser refuses to resolve it.
 * Each record entry is a static import behind a thunk, which a bundler does
 * see, so the code-splitting the design depends on still happens — one chunk
 * per theme, one per grammar. The records themselves are imported lazily too,
 * inside the loaders: a static import would put four hundred thunk definitions
 * in front of every reader, including the ones who never open a note with code.
 *
 * Two themes are loaded at once with `defaultColor: false`, so Shiki emits
 * `--shiki-light` / `--shiki-dark` custom properties and `theme.css` picks the
 * side to show from a `.dark` ancestor — no re-highlight on theme switch.
 *
 * Fences whose language is owned by another renderer (`mermaid`, `base`) are
 * left alone for the Vue layer to claim, as are unknown and absent languages.
 *
 * The first tokenization of a freshly loaded grammar comes out mis-scoped, so
 * the first fence per grammar is tokenized twice — see the double tokenize
 * below.
 */

import { visit } from 'unist-util-visit'
import type { HastRoot, HighlightPass } from '../types.ts'
import { fenceLang } from './fence-lang.ts'

/** Languages that belong to a block renderer, not to a syntax highlighter. */
export const RESERVED_FENCE_LANGS = new Set(['mermaid', 'base'])

export interface RehypeShikiOptions {
  /** Theme ids, looked up in Shiki's `bundledThemes`. */
  themes?: { light: string; dark: string }
  /** Fence languages to leave for a block renderer. */
  reservedLangs?: Iterable<string>
}

interface HastNode {
  type: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
  value?: string
  [key: string]: unknown
}

/** Loaded once per theme pair, then reused across every render. */
const highlighters = new Map<string, Promise<unknown>>()
const loadedLangs = new Map<string, Set<string>>()
/**
 * Grammars whose tokenizer has settled, per theme pair — see the double
 * tokenize in {@link rehypeShiki}.
 */
const settledLangs = new Map<string, Set<string>>()

/**
 * A loader from one of Shiki's records, own keys only. The records are plain
 * objects, so a fence named `constructor` would otherwise find `Object`, and
 * loading what it returns leaves a broken entry in the highlighter's registry
 * that fails every grammar loaded after it.
 */
function ownEntry(record: object, id: string): (() => Promise<any>) | undefined {
  if (!Object.hasOwn(record, id)) return undefined
  return (record as Record<string, (() => Promise<any>) | undefined>)[id]
}

async function getHighlighter(themes: { light: string; dark: string }): Promise<any> {
  const key = `${themes.light}|${themes.dark}`
  const cached = highlighters.get(key)
  if (cached) return cached

  const pending = (async () => {
    const { createHighlighterCore } = await import('shiki/core')
    const { createJavaScriptRegexEngine } = await import('shiki/engine/javascript')
    const { bundledThemes } = await import('shiki/themes')
    const theme = async (id: string) => {
      const load = ownEntry(bundledThemes, id)
      if (!load) throw new Error(`unknown Shiki theme: ${id}`)
      return load()
    }
    // Concurrently: this is the first-fence path, and the note does not paint
    // until it resolves, so two serial round trips cost twice what one does.
    // `Promise.all` subscribes to both, so an unknown id still rejects the pair
    // — the caller's plain-fence path — with no unhandled rejection left over.
    return createHighlighterCore({
      themes: await Promise.all([theme(themes.light), theme(themes.dark)]),
      langs: [],
      engine: createJavaScriptRegexEngine(),
    })
  })()

  // A rejection must not poison the pair forever: without this the failed
  // promise stays cached and every later render in the page awaits the same
  // rejection, so one bad load costs every note its fences.
  pending.catch(() => {
    if (highlighters.get(key) !== pending) return
    highlighters.delete(key)
    loadedLangs.delete(key)
    settledLangs.delete(key)
  })

  highlighters.set(key, pending)
  loadedLangs.set(key, new Set())
  settledLangs.set(key, new Set())
  return pending
}

/** Load one grammar on demand; a language Shiki does not ship stays plain. */
async function ensureLang(key: string, highlighter: any, lang: string): Promise<boolean> {
  const loaded = loadedLangs.get(key)!
  if (loaded.has(lang)) return true
  // Loading one grammar pulls its embedded languages in with it, so a lang can
  // arrive here already present.
  if (highlighter.getLoadedLanguages().includes(lang)) {
    loaded.add(lang)
    return true
  }
  try {
    const { bundledLanguages } = await import('shiki/langs')
    // The record resolves aliases (`ts` and `typescript` are both keys). A
    // language Shiki does not ship is simply absent, which is the plain-fence
    // path — the same one a failed load takes.
    const load = ownEntry(bundledLanguages, lang)
    if (!load) return false
    await highlighter.loadLanguage(await load())
    loaded.add(lang)
    return true
  } catch {
    return false
  }
}

/** Rehype plugin: highlight `<pre><code class="language-…">` blocks. */
export function rehypeShiki(options: RehypeShikiOptions = {}): HighlightPass {
  const themes = options.themes ?? { light: 'github-light', dark: 'github-dark' }
  const reserved = new Set(options.reservedLangs ?? RESERVED_FENCE_LANGS)
  const key = `${themes.light}|${themes.dark}`

  return async (tree: HastRoot) => {
    const jobs: Array<{
      pre: HastNode
      lang: string
      source: string
      /** The fence's own text ended in a newline that `source` does not carry. */
      trailingNewline: boolean
    }> = []

    visit(tree as never, 'element', (node: HastNode) => {
      if (node.tagName !== 'pre') return
      const code = node.children?.find(
        (child) => child.type === 'element' && child.tagName === 'code',
      )
      if (!code) return
      const lang = fenceLang(code)
      if (!lang || reserved.has(lang)) {
        // Tag the fence so the host can route it (mermaid, base, …).
        if (lang) {
          node.properties ??= {}
          node.properties.dataLang = lang
        }
        return
      }
      // Every fence's text ends in a newline, and handing that to Shiki buys an
      // extra empty line at the bottom of the block — so it comes off here and
      // goes back on after highlighting.
      const raw = textOf(code)
      const source = raw.replace(/\n$/, '')
      if (!source) return
      jobs.push({ pre: node, lang, source, trailingNewline: raw !== source })
    })

    if (!jobs.length) return

    let highlighter: any
    try {
      highlighter = await getHighlighter(themes)
    } catch {
      // Shiki did not load. Degrade the way every other failure here does —
      // plain fences, tagged with their language — rather than rejecting out
      // of the pipeline, which would replace the whole note with an error.
      for (const job of jobs) {
        job.pre.properties ??= {}
        job.pre.properties.dataLang = job.lang
      }
      return
    }

    for (const job of jobs) {
      if (!(await ensureLang(key, highlighter, job.lang))) {
        job.pre.properties ??= {}
        job.pre.properties.dataLang = job.lang
        continue
      }
      const settled = settledLangs.get(key)!
      let root: HastNode
      try {
        const tokenize = (): HastNode =>
          highlighter.codeToHast(job.source, {
            lang: job.lang,
            themes,
            defaultColor: false,
          })
        root = tokenize()
        // The JS regex engine's FIRST tokenization of a grammar comes out
        // wrong — under `github-light-high-contrast` a freshly loaded `ts`
        // colours `return` as `#702C00` instead of the keyword `#A0111F` —
        // and every pass after it is right. So the first fence a grammar sees
        // is tokenized twice and the second pass is the one that ships. The
        // two calls sit together with no `await` between them, which is what
        // makes this hold: nothing can interleave and spend the settling
        // pass on someone else's fence.
        if (!settled.has(job.lang)) {
          root = tokenize()
          settled.add(job.lang)
        }
      } catch {
        continue
      }
      const highlighted = root.children?.find(
        (child) => child.type === 'element' && child.tagName === 'pre',
      )
      if (!highlighted) continue

      // Shiki's `<pre>` properties replace the fence's, so everything the
      // pipeline stamped there has to be carried across by hand: the source
      // mapping, the language, and the block anchor a `^block-id` minted.
      const preserved = { ...job.pre.properties }
      job.pre.properties = { ...highlighted.properties }
      for (const prop of ['dataLine', 'id', 'dataBlockId'] as const) {
        if (preserved[prop] !== undefined) job.pre.properties[prop] = preserved[prop]
      }
      job.pre.properties.dataLang = job.lang
      job.pre.children = highlighted.children ?? []

      // Put the stripped newline back inside the `<code>`, so a highlighted
      // fence carries the same text as an unhighlighted one. Without it the
      // block and the copy button both come out one trailing line short —
      // visible whenever the fence body ends in a blank line.
      if (job.trailingNewline) {
        const codeEl = job.pre.children.find(
          (child) => child.type === 'element' && child.tagName === 'code',
        )
        const host = codeEl ?? job.pre
        host.children = [...(host.children ?? []), { type: 'text', value: '\n' }]
      }
    }
  }
}

function textOf(node: HastNode): string {
  if (node.type === 'text') return String(node.value ?? '')
  return (node.children ?? []).map(textOf).join('')
}
