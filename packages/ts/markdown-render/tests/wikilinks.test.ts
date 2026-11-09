import { describe, expect, test } from 'vitest'
import { html, vaultResolver } from './helpers.ts'
import {
  defaultDisplay,
  hastNode,
  remarkWikilinks,
  splitFragment,
  splitMarkdownLink,
  type LinkResolution,
  type MdNode,
  type RemarkWikilinksOptions,
} from '../src/index.ts'

const resolveLink = vaultResolver(['Note.md', 'Note', 'Folder/Other', 'diagram.png'])

describe('remarkWikilinks', () => {
  test('a bare link resolves to an anchor carrying its target and kind', async () => {
    const out = await html('See [[Note]].', { resolveLink })
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('data-wikilink="Note"')
    expect(out).toContain('data-kind="note"')
    expect(out).toContain('href="/vault/Note"')
    expect(out).toContain('>Note</a>')
  })

  test('an alias becomes the visible label, the target stays in data-wikilink', async () => {
    const out = await html('See [[Note|the note]].', { resolveLink })
    expect(out).toContain('data-wikilink="Note"')
    expect(out).toContain('>the note</a>')
  })

  test('a pathed link shows its last segment', async () => {
    const out = await html('See [[Folder/Other]].', { resolveLink })
    expect(out).toContain('data-wikilink="Folder/Other"')
    expect(out).toContain('>Other</a>')
  })

  test('a heading fragment lands on data-heading, not in the label', async () => {
    const out = await html('See [[Note#Some Heading]].', { resolveLink })
    expect(out).toContain('data-heading="Some Heading"')
    expect(out).not.toContain('data-block-id')
    expect(out).toContain('>Note</a>')
  })

  test('a block fragment lands on data-block-id', async () => {
    const out = await html('See [[Note#^abc123]].', { resolveLink })
    expect(out).toContain('data-block-id="abc123"')
    expect(out).not.toContain('data-heading')
  })

  test('heading and alias combine', async () => {
    const out = await html('See [[Folder/Other#Part|elsewhere]].', { resolveLink })
    expect(out).toContain('data-heading="Part"')
    expect(out).toContain('>elsewhere</a>')
  })

  test('a missing target gets wikilink-missing and no href', async () => {
    const out = await html('See [[Nowhere]].', { resolveLink })
    expect(out).toContain('class="wikilink wikilink-missing"')
    expect(out).toContain('data-kind="missing"')
    expect(out).not.toContain('href=')
  })

  test('a fragment-only link points at the current note', async () => {
    const out = await html('Jump to [[#Later]].', { resolveLink, notePath: 'Here.md' })
    expect(out).toContain('data-heading="Later"')
    expect(out).toContain('href="Here.md"')
    expect(out).toContain('>Later</a>')
  })

  test('links inside a fenced code block are NOT tokenized', async () => {
    const out = await html('```\n[[Note]]\n```', { resolveLink })
    expect(out).not.toContain('wikilink')
    expect(out).toContain('[[Note]]')
  })

  test('links inside inline code are NOT tokenized', async () => {
    const out = await html('Literal `[[Note]]` here.', { resolveLink })
    expect(out).not.toContain('wikilink')
    expect(out).toContain('<code>[[Note]]</code>')
  })

  test('an embed is left for remarkEmbeds', async () => {
    const out = await html('![[Note]]', { resolveLink })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('markdown-embed')
  })

  test('several links in one paragraph all tokenize', async () => {
    const out = await html('[[Note]] and [[Folder/Other]] and [[Nowhere]].', { resolveLink })
    expect(out.match(/class="wikilink/g)).toHaveLength(3)
  })

  test('surrounding text survives the splice', async () => {
    const out = await html('before [[Note]] after', { resolveLink })
    expect(out).toContain('before <a')
    expect(out).toContain('</a> after')
  })

  test('external targets keep their kind', async () => {
    const out = await html('[[somewhere]]', {
      resolveLink: () => ({ kind: 'external', path: 'https://example.com', display: 'site' }),
    })
    expect(out).toContain('data-kind="external"')
    expect(out).toContain('href="https://example.com"')
  })

  test('a bare URL inside a wikilink is claimed by GFM autolinking first', async () => {
    // Documented dialect deviation: GFM autolink literals are a parse-level
    // micromark extension, so `[[https://…]]` is already a link node before any
    // transformer runs. Obsidian has no such syntax either — external links are
    // written `[text](url)`.
    const out = await html('[[https://example.com]]', { resolveLink })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('<a href="https://example.com"')
  })

  test('an empty `[[]]` stays literal text rather than an invisible anchor', async () => {
    for (const source of ['[[]]', '[[ ]]', '[[|]]', '[[# ]]']) {
      const out = await html(`a ${source} b`, { notePath: 'Self.md' })
      expect(out).not.toContain('<a')
      expect(out).toContain(`a ${source} b`)
    }
  })

  test('an empty link whose blank alias carries markup stays literal too', async () => {
    // A visible alias still links to the current note; a blank one has nothing
    // to show, so it must not become an empty anchor through the straddle pass.
    const out = await html('a [[| *x*]] b', { notePath: 'Self.md' })
    expect(out).toContain('class="wikilink"')
    const blank = await html('a [[|` `]] b', { notePath: 'Self.md' })
    expect(blank).not.toContain('class="wikilink"')
    expect(blank).toContain('a [[|<code> </code>]] b')
  })

  test('a target ending in a slash still has a visible label', async () => {
    const out = await html('see [[Folder/]] here')
    expect(out).toMatch(/<a class="wikilink"[^>]*>Folder<\/a>/)
  })

  test('a `[[Note]]` that matches a reference definition is still a wikilink', async () => {
    const out = await html('See [[Note]].\n\n[Note]: https://example.com', { resolveLink })
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('data-wikilink="Note"')
    expect(out).not.toContain('https://example.com')
    expect(out).not.toContain('[')
  })

  test('a bracketed reference that cannot be a wikilink keeps its reference link', async () => {
    // `[[#]]` names nothing to link to; joining it would lose the reference.
    const label = '#'
    const out = await html(`See [[${label}]].\n\n[${label}]: https://example.com`, { resolveLink })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('<a href="https://example.com"')
  })
})

describe('buildNode seam', () => {
  /** Run the plugin over one paragraph, returning the paragraph's children. */
  function tokenize(body: string, options: RemarkWikilinksOptions): MdNode[] {
    const tree: MdNode = {
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'text', value: body }] }],
    }
    remarkWikilinks(options)(tree)
    return (tree.children as MdNode[])[0]!.children as MdNode[]
  }

  test('a custom builder swaps the emitted node and receives the parsed link', () => {
    const seen: unknown[] = []
    const children = tokenize('see [[Folder/Note#Part|elsewhere]] here', {
      resolveLink: vaultResolver(['Folder/Note']),
      buildNode: (link) => {
        seen.push(link)
        return hastNode('wikilinkSpan', 'span', { dataWikilink: link.target }, [
          { type: 'text', value: link.label },
        ])
      },
    })

    expect(seen).toEqual([
      {
        target: 'Folder/Note',
        rawTarget: 'Folder/Note',
        heading: 'Part',
        blockId: null,
        alias: 'elsewhere',
        rawAlias: 'elsewhere',
        label: 'elsewhere',
        resolution: {
          kind: 'note',
          path: '/vault/Folder/Note',
          display: 'elsewhere',
          heading: 'Part',
          blockId: undefined,
        },
      },
    ])
    expect(children.map((c) => c.type)).toEqual(['text', 'wikilinkSpan', 'text'])
    expect(children[1]!.data?.hName).toBe('span')
    expect(children[1]!.children?.[0]!.value).toBe('elsewhere')
  })

  test('a builder returning null leaves the matched text in place', () => {
    const children = tokenize('keep [[Literal]] as written', {
      buildNode: () => null,
    })
    expect(children).toHaveLength(1)
    expect(children[0]!.type).toBe('text')
    expect(children[0]!.value).toBe('keep [[Literal]] as written')
  })

  test('null and non-null builds interleave: the null match stays literal text', () => {
    const children = tokenize('[[Keep]] then [[Build]] end', {
      buildNode: (link) =>
        link.target === 'Keep' ? null : hastNode('wikilinkSpan', 'span', {}, []),
    })
    expect(children.map((c) => c.type)).toEqual(['text', 'wikilinkSpan', 'text'])
    expect(children[0]!.value).toBe('[[Keep]] then ')
    expect(children[2]!.value).toBe(' end')
  })

  test('a builder may fan one link out into several nodes', () => {
    const children = tokenize('[[Note]]', {
      buildNode: (link) => [
        { type: 'text', value: '→ ' },
        hastNode('wikilinkSpan', 'span', {}, [{ type: 'text', value: link.label }]),
      ],
    })
    expect(children.map((c) => c.type)).toEqual(['text', 'wikilinkSpan'])
  })

  test('unset, the seam emits exactly the default anchor contract', async () => {
    // Covered throughout the suite; pinned here so the seam's default is
    // explicit: no buildNode means wikilinkNode's <a class="wikilink">.
    const out = await html('[[Note]]', { resolveLink: vaultResolver(['Note']) })
    expect(out).toContain('<a class="wikilink"')
  })

  type BuildNodeLink = Parameters<NonNullable<RemarkWikilinksOptions['buildNode']>>[0]

  /** Collect the payloads a builder receives for `body`, leaving matches literal. */
  function capture(body: string): BuildNodeLink[] {
    const seen: BuildNodeLink[] = []
    tokenize(body, {
      buildNode: (link) => {
        seen.push(link)
        return null
      },
    })
    return seen
  }

  /** The single payload `body` is expected to produce. */
  function firstCapture(body: string): BuildNodeLink {
    const [link] = capture(body)
    if (!link) throw new Error(`no wikilink captured in: ${body}`)
    return link
  }

  test('a padded link delivers trimmed fields AND the verbatim captures', () => {
    const link = firstCapture('see [[  Note  |  alias  ]] here')
    expect(link.target).toBe('Note')
    expect(link.alias).toBe('alias')
    expect(link.rawTarget).toBe('  Note  ')
    expect(link.rawAlias).toBe('  alias  ')
  })

  test('no alias segment leaves rawAlias null', () => {
    const link = firstCapture('[[Note]]')
    expect(link.rawAlias).toBeNull()
  })

  test('an empty alias segment ([[x|]]) is rawAlias "", not null', () => {
    const link = firstCapture('[[x|]]')
    expect(link.rawAlias).toBe('')
    // Pinned current behavior: an empty alias trims away entirely — the
    // trimmed `alias` is null and the label falls back to the target.
    expect(link.alias).toBeNull()
    expect(link.label).toBe('x')
  })

  test('a whitespace-only target keeps its padding in rawTarget', () => {
    const link = firstCapture('[[   ]]')
    expect(link.rawTarget).toBe('   ')
    expect(link.target).toBe('')
    // Pinned current default-path behavior: an empty target takes the
    // fragment-only branch, and with no fragment the label is empty.
    expect(link.label).toBe('')
    expect(link.resolution.kind).toBe('note')
  })
})

describe('remarkWikilinks: the resolved path is scheme-checked', () => {
  // A resolver that calls anything with a scheme "external" —   // an app shipped — is enough to get an arbitrary URL out of plain
  // wikilink syntax, no raw HTML involved. `href` would then be stripped by
  // the sanitizer while `data-path` sailed through, and the host acts on
  // `data-path`.
  const schemeSniffing = (target: string): LinkResolution =>
    /^[a-z][a-z0-9+.-]*:/i.test(target)
      ? { kind: 'external', path: target, display: target }
      : { kind: 'note', path: `/vault/${target}`, display: target }

  test('a javascript: target reaches neither href nor data-path', async () => {
    const out = await html('[[javascript://%0aalert(document.domain)|Home]]', {
      resolveLink: schemeSniffing,
    })
    expect(out).toContain('class="wikilink wikilink-external"')
    expect(out).not.toContain('href=')
    expect(out).not.toContain('data-path')
    expect(out).toContain('>Home</a>')
  })

  test('a scheme obfuscated with a newline does not slip past', async () => {
    // Browsers strip tab/CR/LF anywhere in a URL before parsing, so this
    // navigates as `javascript:`. Built from a char code so the control
    // character survives this file intact.
    const obfuscated = `java${String.fromCharCode(10)}script:alert(1)`
    const out = await html('[[X]]', {
      resolveLink: () => ({ kind: 'external', path: obfuscated, display: 'X' }),
    })
    expect(out).not.toContain('data-path')
    expect(out).not.toContain('script:alert')
  })

  test('data:, vbscript: and file: targets are refused too', async () => {
    for (const target of ['data:text/html,evil', 'vbscript:msgbox', 'file:///etc/passwd']) {
      const out = await html(`[[${target}]]`, { resolveLink: schemeSniffing })
      expect(out).not.toContain('data-path')
    }
  })

  test('http, https and mailto still resolve to both attributes', async () => {
    // Written as a plain target with an external resolution, because GFM
    // autolinking claims a literal `[[https://…]]` before this plugin runs
    // (see the documented deviation above).
    for (const path of ['https://example.com/a', 'http://example.com/a', 'mailto:x@y.z']) {
      const out = await html('[[Elsewhere]]', {
        resolveLink: () => ({ kind: 'external', path, display: 'Elsewhere' }),
      })
      expect(out).toContain(`href="${path}"`)
      expect(out).toContain(`data-path="${path}"`)
    }
  })

  test('an ordinary vault path still resolves to both attributes', async () => {
    const out = await html('[[Note]]', { resolveLink })
    expect(out).toContain('href="/vault/Note"')
    expect(out).toContain('data-path="/vault/Note"')
  })

  test('a protocol-relative path is not treated as a vault path', async () => {
    const out = await html('[[x]]', {
      resolveLink: () => ({ kind: 'note', path: '//evil.example/x', display: 'x' }),
    })
    expect(out).not.toContain('evil.example')
  })
})

describe('wikilink helpers', () => {
  test('splitFragment distinguishes headings from block ids', () => {
    expect(splitFragment('Heading')).toEqual({ heading: 'Heading' })
    expect(splitFragment('^abc')).toEqual({ blockId: 'abc' })
    expect(splitFragment(undefined)).toEqual({})
  })

  test('defaultDisplay prefers the alias, then the last path segment', () => {
    expect(defaultDisplay('a/b/c', undefined, 'alias')).toBe('alias')
    expect(defaultDisplay('a/b/c', undefined, undefined)).toBe('c')
    expect(defaultDisplay('', 'Heading', undefined)).toBe('Heading')
    expect(defaultDisplay('Folder/', undefined, undefined)).toBe('Folder')
    expect(defaultDisplay('a/b/', undefined, undefined)).toBe('b')
  })
})

describe('remarkMarkdownLinks: a relative .md link is a note link', () => {
  // Obsidian writes these itself when "Use Markdown links" is on, and they
  // mean what `[[Note]]` means. As plain anchors they full-reloaded the app,
  // were resolved by the server rather than the vault, and had no way to show
  // a target that does not exist.
  test('a relative .md target resolves through the same resolver', async () => {
    const out = await html('[Alpha](Note.md)', { resolveLink })
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('data-wikilink="Note.md"')
    expect(out).toContain('data-kind="note"')
    expect(out).toContain('data-path="/vault/Note.md"')
    expect(out).toContain('>Alpha</a>')
  })

  test('a missing target is marked missing and carries no href', async () => {
    const out = await html('[Gone](Nowhere.md)', { resolveLink })
    expect(out).toContain('class="wikilink wikilink-missing"')
    expect(out).not.toContain('href=')
  })

  test('a rich label survives — unlike a wikilink alias, it can be markup', async () => {
    const out = await html('[**Bold** label](Note.md)', { resolveLink })
    expect(out).toContain('<strong>Bold</strong> label')
  })

  test('a #fragment becomes data-heading or data-block-id', async () => {
    expect(await html('[x](Note.md#Some%20Heading)', { resolveLink })).toContain(
      'data-heading="Some Heading"',
    )
    expect(await html('[x](Note.md#^abc)', { resolveLink })).toContain('data-block-id="abc"')
  })

  test('a percent-encoded target is decoded before it reaches the resolver', async () => {
    const seen: string[] = []
    await html('[x](My%20Note.md)', {
      resolveLink: (target) => {
        seen.push(target)
        return { kind: 'missing', display: target }
      },
    })
    expect(seen).toContain('My Note.md')
  })

  test('what it deliberately does not claim', async () => {
    // External URLs, host routes, in-note anchors and non-markdown files are
    // all still ordinary links.
    for (const url of [
      'https://example.com/x.md',
      '/apps/notes/Projects/Alpha.md',
      '#heading',
      'diagram.png',
      '//evil.example/x.md',
    ]) {
      const out = await html(`[x](${url})`, { resolveLink })
      expect(out).not.toContain('class="wikilink"')
    }
  })

  test('a reference-style note link is rewritten the same as the inline form', async () => {
    const out = await html('See [Alpha][a].\n\n[a]: Note.md#Heading', { resolveLink })
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('data-wikilink="Note.md"')
    expect(out).toContain('data-heading="Heading"')
    expect(out).toContain('>Alpha</a>')
    expect(out).not.toContain('href="Note.md')
  })

  test('a reference-style external link is still an ordinary link', async () => {
    const out = await html('See [x][a].\n\n[a]: https://example.com/x.md', { resolveLink })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('href="https://example.com/x.md"')
  })

  test('a javascript: destination is still stripped', async () => {
    const out = await html('[x](javascript:alert(1))', { resolveLink })
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('data-path')
  })

  test('splitMarkdownLink decodes a path with a stray percent sign', () => {
    expect(splitMarkdownLink('Q3%20100%.md')).toEqual({ target: 'Q3 100%.md', fragment: '' })
  })

  test('splitMarkdownLink is the whole claim rule', () => {
    expect(splitMarkdownLink('Note.md')).toEqual({ target: 'Note.md', fragment: '' })
    expect(splitMarkdownLink('a/b.markdown#c')).toEqual({ target: 'a/b.markdown', fragment: 'c' })
    expect(splitMarkdownLink('https://x/y.md')).toBeNull()
    expect(splitMarkdownLink('/y.md')).toBeNull()
    expect(splitMarkdownLink('#y')).toBeNull()
    expect(splitMarkdownLink('y.png')).toBeNull()
    expect(splitMarkdownLink('')).toBeNull()
  })
})

describe('dialect syntax inside a markdown link (review finding #4)', () => {
  const nested = vaultResolver(['Note'])

  test('a wikilink inside link text stays literal and the outer link survives', async () => {
    const out = await html('[see [[Note]] here](https://example.com)', { resolveLink: nested })
    expect(out).toContain('>see [[Note]] here</a>')
    expect(out).not.toContain('class="wikilink"')
  })

  test('a wikilink nested in emphasis inside link text stays literal', async () => {
    const out = await html('[see *[[Note]]* here](https://example.com)', { resolveLink: nested })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('[[Note]]')
  })

  test('a wikilink in a markdown image alt stays literal', async () => {
    const out = await html('![alt [[Note]]](https://example.com/x.png)', { resolveLink: nested })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('alt [[Note]]')
  })

  test('a wikilink outside the link still tokenizes', async () => {
    const out = await html('[see](https://example.com) and [[Note]]', { resolveLink: nested })
    expect(out).toContain('class="wikilink"')
  })
})

describe('an alias carrying markup (review finding #11)', () => {
  // remark parses `*key*` into an `emphasis` node before any dialect plugin
  // runs, so no single text node holds both `[[` and `]]` and the first pass
  // is blind to it. Obsidian renders the markup.

  test('emphasis inside an alias renders inside the anchor', async () => {
    const out = await html('See [[Note|the *key* idea]].', { resolveLink })
    expect(out).toContain('data-wikilink="Note"')
    expect(out).toContain('href="/vault/Note"')
    expect(out).toContain('>the <em>key</em> idea</a>')
    expect(out).not.toContain('[[')
  })

  test('strong inside an alias renders inside the anchor', async () => {
    const out = await html('See [[Note|the **key** idea]].', { resolveLink })
    expect(out).toContain('>the <strong>key</strong> idea</a>')
  })

  test('inline code inside an alias renders inside the anchor', async () => {
    const out = await html('See [[Note|the `key` idea]].', { resolveLink })
    expect(out).toContain('>the <code>key</code> idea</a>')
  })

  test('a heading fragment survives an aliased link with markup', async () => {
    const out = await html('See [[Note#Heading|an *aliased* heading link]].', { resolveLink })
    expect(out).toContain('data-heading="Heading"')
    expect(out).toContain('data-wikilink="Note"')
    expect(out).toContain('>an <em>aliased</em> heading link</a>')
  })

  test('surrounding text survives the splice', async () => {
    const out = await html('before [[Note|a *rich* alias]] after', { resolveLink })
    expect(out).toContain('before <a')
    expect(out).toContain('</a> after')
  })

  test('the resolver and the builder still see the alias as plain text', () => {
    const seen: string[] = []
    // A link that crosses nodes is placed by the source offsets the parse gave
    // each node, so the tree carries them and the file carries the source.
    const at = (offset: number) => ({ line: 1, column: offset + 1, offset })
    const span = (start: number, end: number) => ({ start: at(start), end: at(end) })
    const source = '[[Note|the *key* idea]]'
    const tree: MdNode = {
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            { type: 'text', value: '[[Note|the ', position: span(0, 11) },
            {
              type: 'emphasis',
              position: span(11, 16),
              children: [{ type: 'text', value: 'key', position: span(12, 15) }],
            },
            { type: 'text', value: ' idea]]', position: span(16, 23) },
          ],
        },
      ],
    }
    remarkWikilinks({
      resolveLink: vaultResolver(['Note']),
      buildNode: (link) => {
        seen.push(link.label, link.resolution.display ?? '', String(link.alias))
        return null
      },
    })(tree, { value: source })
    expect(seen).toEqual(['the key idea', 'the key idea', 'the key idea'])
  })

  test('a plain link and a plain alias are untouched (regression pins)', async () => {
    const bare = await html('See [[Note]].', { resolveLink })
    expect(bare).toContain('>Note</a>')
    const aliased = await html('See [[Note|plain alias]].', { resolveLink })
    expect(aliased).toContain('>plain alias</a>')
    expect(aliased).toContain('data-wikilink="Note"')
  })

  test('an unterminated link with markup in it stays literal', async () => {
    const out = await html('See [[Note|the *key* idea.', { resolveLink })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('[[Note|the <em>key</em> idea.')
  })

  test('markup in the target half keeps the whole link literal', async () => {
    // Only the alias may carry markup — the target is path syntax.
    const out = await html('See [[No*t*e|alias]].', { resolveLink })
    expect(out).not.toContain('class="wikilink"')
  })

  test('an embed with a markup alias is left for remarkEmbeds', async () => {
    const out = await html('![[Note|an *embedded* alias]]', { resolveLink })
    expect(out).not.toContain('class="wikilink"')
    expect(out).not.toContain('data-wikilink')
  })

  test('a nested link inside the alias keeps the whole thing literal', async () => {
    // An anchor inside an anchor is what SKIP_SUBTREES exists to prevent.
    const out = await html('See [[Note|see [x](https://example.com) here]].', { resolveLink })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('[[Note|see ')
  })

  test('an alias with markup inside a markdown link stays literal', async () => {
    const out = await html('[see [[Note|a *rich* alias]] here](https://example.com)', {
      resolveLink,
    })
    expect(out).not.toContain('class="wikilink"')
    expect(out).toContain('[[Note|a ')
  })

  test('two markup aliases in one paragraph both tokenize', async () => {
    const out = await html('[[Note|a *first* one]] and [[Note|a *second* one]]', { resolveLink })
    expect(out.match(/class="wikilink"/g)).toHaveLength(2)
    expect(out).toContain('>a <em>first</em> one</a>')
    expect(out).toContain('>a <em>second</em> one</a>')
  })

  test('a long markup alias tokenizes, with no cap on its length', async () => {
    const out = await html(`[[Note|*x* ${'a'.repeat(5000)}]]`, { resolveLink })
    expect(out).toContain('class="wikilink"')
    expect(out).toContain('<em>x</em>')
  })

  describe('code rules, as the scanner reads a document', () => {
    test('a wikilink after a fenced code block inside a list item is a link', async () => {
      const out = await html('1. item\n   ```\n   code\n   ```\n   see [[Note]]\n', { resolveLink })
      expect(out).toContain('data-wikilink="Note"')
    })

    test('a link inside a code span in a table cell is not a link', async () => {
      const out = await html('| a | b |\n| - | - |\n| `[[Note]]` | [[Note]] |\n', { resolveLink })
      expect(out.match(/data-wikilink="Note"/g)?.length).toBe(1)
      expect(out).toContain('<code>[[Note]]</code>')
    })

    test('a backslash-escaped bang is a literal ! then a link', async () => {
      const out = await html('\\![[Note]]', { resolveLink })
      expect(out).toContain('!<a')
      expect(out).toContain('data-wikilink="Note"')
      expect(out).not.toContain('class="embed')
    })
  })
})
