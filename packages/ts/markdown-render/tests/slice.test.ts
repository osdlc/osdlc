import { describe, expect, test } from 'vitest'
import {
  renderToHtml,
  sliceByBlockId,
  sliceByHeading,
  sliceEmbed,
  sourceHeadings,
} from '../src/index.ts'

const DOC = `# Top

intro text

## Section One

one body

### Deeper

deeper body

## Section Two

two body

A quoted paragraph. ^para

- item one
- item two ^item

> a block quote

^quote
`

describe('sliceByHeading', () => {
  test('takes the heading through everything before the next same-level heading', () => {
    const slice = sliceByHeading(DOC, 'Section One')
    expect(slice).toContain('## Section One')
    expect(slice).toContain('one body')
    expect(slice).toContain('### Deeper')
    expect(slice).toContain('deeper body')
    expect(slice).not.toContain('Section Two')
  })

  test('a deeper heading stops at the next heading of any shallower level', () => {
    const slice = sliceByHeading(DOC, 'Deeper')
    expect(slice).toContain('deeper body')
    expect(slice).not.toContain('Section Two')
  })

  test('the last section runs to the end of the document', () => {
    const slice = sliceByHeading(DOC, 'Section Two')
    expect(slice).toContain('two body')
    expect(slice).toContain('^quote')
  })

  test('heading matching ignores case and inline markup', () => {
    expect(sliceByHeading('## A **Bold** Head\n\nbody', 'a bold head')).toContain('body')
  })

  test('an unknown heading returns null', () => {
    expect(sliceByHeading(DOC, 'Nope')).toBeNull()
  })

  test('a trailing # with no space before it is part of the heading text', () => {
    const doc = '## Learn C#\n\nbody\n\n## Next'
    expect(sliceByHeading(doc, 'Learn C#')).toBe('## Learn C#\n\nbody')
    // Matching ignores punctuation, as Obsidian's does, so the link Obsidian
    // writes for this heading — `#` cannot sit in a link's heading text — finds it.
    expect(sliceByHeading(doc, 'Learn C')).toBe('## Learn C#\n\nbody')
    expect(sourceHeadings(doc)[0]?.heading).toBe('Learn C#')
  })

  test('a closing sequence of # after a space is not part of the heading text', () => {
    expect(sliceByHeading('## Title ##\n\nbody', 'Title')).toBe('## Title ##\n\nbody')
    expect(sliceByHeading('## Title ##   \n\nbody', 'Title')).toBe('## Title ##   \n\nbody')
  })
})

describe('an ATX heading may be indented up to three spaces', () => {
  test('as CommonMark has it; four spaces is code', () => {
    expect(sourceHeadings('  # T\n\n   ## U\n\n    # code\n')).toEqual([
      { heading: 'T', depth: 1, line: 1 },
      { heading: 'U', depth: 2, line: 3 },
    ])
    expect(sliceByHeading('- item\n  # Inside\n\ntext', 'Inside')).toBe('  # Inside\n\ntext')
  })
})

describe('ATX closing sequence', () => {
  const textOf = (line: string) => sourceHeadings(line)[0]?.heading
  const cases: Array<[string, string | undefined]> = [
    ['## foo ##', 'foo'],
    ['###   bar    ###', 'bar'],
    ['# foo ##################################', 'foo'],
    ['##### foo ##', 'foo'],
    ['### foo ###     ', 'foo'],
    ['### foo ### b', 'foo ### b'],
    ['# foo#', 'foo#'],
    ['### foo \\###', 'foo \\###'],
    ['## foo #\\##', 'foo #\\##'],
    ['# foo \\#', 'foo \\#'],
    ['# #', ''],
    ['## Learn C#', 'Learn C#'],
  ]
  test.each(cases)('%j reads as %j', (line, expected) => {
    expect(textOf(line)).toBe(expected)
  })
})

describe('sliceByBlockId', () => {
  test('a trailing marker yields its paragraph with the marker removed', () => {
    expect(sliceByBlockId(DOC, 'para')).toBe('A quoted paragraph.')
  })

  test('a marker on a list item yields the list block', () => {
    const slice = sliceByBlockId(DOC, 'item')
    expect(slice).toContain('- item one')
    expect(slice).toContain('- item two')
    expect(slice).not.toContain('^item')
  })

  test('a standalone marker yields the block above it', () => {
    expect(sliceByBlockId(DOC, 'quote')).toBe('> a block quote')
  })

  test('an unknown id returns null', () => {
    expect(sliceByBlockId(DOC, 'nope')).toBeNull()
  })
})

describe('sliceEmbed', () => {
  test('no fragment returns the whole document', () => {
    expect(sliceEmbed(DOC, {})).toBe(DOC)
  })

  test('a block id wins over a heading', () => {
    expect(sliceEmbed(DOC, { heading: 'Top', blockId: 'para' })).toBe('A quoted paragraph.')
  })
})

describe('sourceHeadings', () => {
  test('every heading, with its depth and 1-based line', () => {
    expect(sourceHeadings(DOC)).toEqual([
      { heading: 'Top', depth: 1, line: 1 },
      { heading: 'Section One', depth: 2, line: 5 },
      { heading: 'Deeper', depth: 3, line: 9 },
      { heading: 'Section Two', depth: 2, line: 13 },
    ])
  })

  test('the same fence rules the slicers apply', () => {
    const doc = ['# Real', '', '```bash', '# fake', '```'].join('\n')
    expect(sourceHeadings(doc)).toEqual([{ heading: 'Real', depth: 1, line: 1 }])
  })

  test('a source with no headings offers none', () => {
    expect(sourceHeadings('just prose\n')).toEqual([])
  })
})

describe('slicing is fence-aware', () => {
  // Slicing is deliberately pre-parse, so it has no parser to ask whether a
  // line is code. Both markers it looks for are ordinary characters inside a
  // fence, and both used to be taken at face value there.
  const FENCED = [
    '# Setup',
    '',
    'Run this:',
    '',
    '```bash',
    '# install deps',
    'bun install',
    '```',
    '',
    'Then you are done.',
    '',
    '# Next',
    '',
    'other section',
  ].join('\n')

  test('a # comment inside a fence is not a heading', () => {
    const out = sliceByHeading(FENCED, 'Setup')
    expect(out).toContain('bun install')
    expect(out).toContain('Then you are done.')
    expect(out).not.toContain('other section')
    // The fence the slice returns is balanced.
    expect((out ?? '').match(/```/g)).toHaveLength(2)
  })

  test('a heading inside a fence cannot be sliced to', () => {
    expect(sliceByHeading(FENCED, 'install deps')).toBeNull()
  })

  test('tilde fences count too', () => {
    const doc = ['# A', '', '~~~', '# tilde comment', '~~~', '', 'tail of A', '', '# B', 'b'].join(
      '\n',
    )
    expect(sliceByHeading(doc, 'A')).toContain('tail of A')
  })

  test('a longer fence may contain a shorter one', () => {
    const doc = ['# A', '', '````', '```', '# inner', '```', '````', '', 'tail', '', '# B'].join(
      '\n',
    )
    const out = sliceByHeading(doc, 'A')
    expect(out).toContain('tail')
    expect(out).not.toContain('# B')
  })

  test('an info string does not close a fence', () => {
    const doc = ['# A', '', '```', '# one', '```ts', '# two', '```', '', 'tail', '', '# B'].join(
      '\n',
    )
    const out = sliceByHeading(doc, 'A')
    expect(out).toContain('tail')
    expect(out).not.toContain('# B')
  })

  test('a ^id-looking line inside a fence does not claim the block reference', () => {
    const doc = [
      'Intro paragraph.',
      '',
      '```text',
      'not a block id ^fake',
      '```',
      '',
      'The real one. ^fake',
    ].join('\n')
    expect(sliceByBlockId(doc, 'fake')).toBe('The real one.')
  })

  test('a block that follows a fence does not swallow it', () => {
    const doc = ['```', 'code', '```', 'Right after the fence. ^id'].join('\n')
    expect(sliceByBlockId(doc, 'id')).toBe('Right after the fence.')
  })

  test('a standalone block-id marker after a blank line claims the whole fenced block above it', () => {
    const doc = ['```', 'code', '```', '', '^id'].join('\n')
    expect(sliceByBlockId(doc, 'id')).toBe(['```', 'code', '```'].join('\n'))
  })

  test('an unterminated fence swallows the rest, as a parser would', () => {
    const doc = ['# A', '', '```', '# not a heading', '', '# also not'].join('\n')
    const out = sliceByHeading(doc, 'A')
    expect(out).toContain('# also not')
  })
})

describe('the heading slicer follows the parser (review finding #7)', () => {
  test('a setext h1 owns its section', () => {
    const doc = ['Title', '=====', '', 'text', '', '# Next', 'x'].join('\n')
    expect(sliceByHeading(doc, 'Title')).toBe(['Title', '=====', '', 'text'].join('\n'))
  })

  test('a setext h2 ends at the next heading of the same depth', () => {
    const doc = ['A', '---', '', 'body', '', 'B', '---', 'other'].join('\n')
    expect(sliceByHeading(doc, 'A')).toBe(['A', '---', '', 'body'].join('\n'))
  })

  test('a setext h2 keeps the deeper ATX headings under it', () => {
    const doc = ['A', '---', '', '### sub', 'body', '', 'B', '---', 'x'].join('\n')
    expect(sliceByHeading(doc, 'A')).toContain('### sub')
  })

  test('a --- after a blank line is a thematic break, not a heading', () => {
    const doc = ['para', '', '---', '', '# A', 'x'].join('\n')
    expect(sliceByHeading(doc, 'para')).toBeNull()
  })

  test('a heading with a trailing block id matches on its text', () => {
    const doc = ['# A ^id', 'text', '', '# B', 'x'].join('\n')
    expect(sliceByHeading(doc, 'A')).toBe(['# A ^id', 'text'].join('\n'))
  })

  test('a heading with a markdown link matches on the link text', () => {
    const doc = ['# See [alias](Note.md)', 'text'].join('\n')
    expect(sliceByHeading(doc, 'See alias')).toContain('text')
  })

  test('an escaped character in a heading matches the literal', () => {
    const doc = ['# A \\* B', 'text'].join('\n')
    expect(sliceByHeading(doc, 'A * B')).toContain('text')
  })

  test('a body starting with --- keeps that line as content', () => {
    // Callers pass a body with frontmatter already split off, so a leading
    // `---` is a thematic break, never a frontmatter fence.
    const doc = ['---', '', '# Real', 'body'].join('\n')
    expect(sliceByHeading(doc, 'Real')).toBe(['# Real', 'body'].join('\n'))
    expect(sliceEmbed(doc, {})).toBe(doc)
    expect(sourceHeadings(['---', '# A', '---', '# B'].join('\n'))).toEqual([
      { heading: 'A', depth: 1, line: 2 },
      { heading: 'B', depth: 1, line: 4 },
    ])
    expect(sliceByBlockId(['---', 'para ^abc'].join('\n'), 'abc')).toBe('para')
    // The first line is not skipped: a `^id` on a line between two `---`
    // lines is a real reference.
    expect(sliceByBlockId(['---', 'id: x ^abc', '---', '', 'para'].join('\n'), 'abc')).toBe(
      'id: x\n---',
    )
  })
})

describe('CRLF sources slice the same as LF ones', () => {
  // remark accepts CRLF, so the renderer finds these headings and ids; a
  // slicer that splits on `\n` alone left a `\r` that no line regex matched.
  const CRLF = '# Intro\r\n\r\ntext\r\n\r\n## Setup\r\n\r\nsetup body ^blk\r\n\r\n## Other\r\nx\r\n'

  test('sliceByHeading finds a heading in a CRLF source', () => {
    expect(sliceByHeading(CRLF, 'Setup')).toBe('## Setup\r\n\r\nsetup body ^blk')
  })

  test('sliceByBlockId finds a block id in a CRLF source', () => {
    expect(sliceByBlockId(CRLF, 'blk')).toBe('setup body')
  })

  test('sourceHeadings lists the headings of a CRLF source', () => {
    expect(sourceHeadings(CRLF).map((found) => found.heading)).toEqual(['Intro', 'Setup', 'Other'])
  })
})

describe('a --- under a container line is a thematic break', () => {
  // CommonMark: a setext underline cannot follow a list item or a quote line.
  test('a list followed by --- invents no heading and keeps the section whole', () => {
    const doc = '# Top\n\n## Section\n\n- item a\n- item b\n---\n\nmore section text\n\n## Next\n'
    expect(sourceHeadings(doc).map((found) => found.heading)).toEqual(['Top', 'Section', 'Next'])
    expect(sliceByHeading(doc, 'Section')).toBe(
      '## Section\n\n- item a\n- item b\n---\n\nmore section text',
    )
  })

  test('a quote line followed by --- is not a heading', () => {
    expect(sourceHeadings('> quoted\n---\n')).toEqual([])
  })

  test('two thematic breaks in a row are not a heading', () => {
    // A body is no longer read as frontmatter, so `---` over `---` reached the
    // setext check; a thematic break holds no paragraph text to underline.
    expect(sourceHeadings('para\n\n---\n---\n')).toEqual([])
    expect(sourceHeadings('***\n---\n')).toEqual([])
  })
})

describe('slicing skips %% comments', () => {
  // `%%` spans the document, across headings and paragraphs, and the renderer
  // deletes everything between two markers. A heading inside one is not on
  // the page, so it is neither an embed target nor a section boundary.
  const NOTE = [
    '## Plan',
    '',
    'public text',
    '',
    '%%',
    '## Private',
    '',
    'secret notes ^secret',
    '%%',
    '',
    'more public text',
    '',
    '## Next',
    '',
    'x',
  ].join('\n')

  test('a commented-out heading cannot be embedded', () => {
    expect(sliceByHeading(NOTE, 'Private')).toBeNull()
  })

  test('a commented-out heading does not end the section above it', () => {
    expect(sliceByHeading(NOTE, 'Plan')).toContain('more public text')
  })

  test('sourceHeadings does not offer a commented-out heading', () => {
    expect(sourceHeadings(NOTE).map((found) => found.heading)).toEqual(['Plan', 'Next'])
  })

  test('a commented-out block id cannot be embedded', () => {
    expect(sliceByBlockId(NOTE, 'secret')).toBeNull()
  })

  test('%% inside inline code or escaped opens nothing', () => {
    const doc = ['# A', '', 'use `%%` here and \\%% too', '', '# B', '', 'b'].join('\n')
    expect(sourceHeadings(doc).map((found) => found.heading)).toEqual(['A', 'B'])
  })

  // `remarkComments` reads only mdast `text` nodes. Indented code and raw
  // HTML are not text, so a `%%` in either opens nothing on the page.
  test('%% inside an indented code block opens nothing', () => {
    const doc = '## Intro\n\n    printf("%%d")\n\n## Next\n\nn'
    expect(sourceHeadings(doc).map((found) => found.heading)).toEqual(['Intro', 'Next'])
    expect(sliceByHeading(doc, 'Next')).toBe('## Next\n\nn')
  })

  test('%% in indented code right under a heading or a rule opens nothing', () => {
    // Indented code cannot interrupt a paragraph, but nothing is open under a
    // heading or a thematic break, so the indented line there is code too. A
    // heading at the margin also closes a list above it.
    const docs: Array<[string, string[]]> = [
      ['# T\n    printf("%%d")\n\n## Next\n', ['T', 'Next']],
      ['- item\n# T\n    code %%\n# U', ['T', 'U']],
      ['para\n\n---\n    code %%\n\n## Next\n', ['Next']],
      ['para\n===\n    code %%\n\n## Next\n', ['para', 'Next']],
    ]
    for (const [doc, expected] of docs) {
      expect(sourceHeadings(doc).map((found) => found.heading)).toEqual(expected)
    }
  })

  test('a heading whose line closes the comment is still a heading', () => {
    // `remarkComments` removes what lies between the markers; the heading that
    // holds the closing one keeps its tail and renders.
    const doc = '## Plan\n\np %%\n\n## Gone\n\n## Shown %% tail\n\nt\n\n## After\n'
    expect(sourceHeadings(doc).map((found) => found.heading)).toEqual([
      'Plan',
      'Shown %% tail',
      'After',
    ])
    expect(sliceByHeading(doc, 'Plan')).toBe('## Plan\n\np %%\n\n## Gone')
  })

  test('a # line inside raw HTML or indented code is not a heading', () => {
    // The same lines that carry no comment marker carry no heading either.
    expect(sourceHeadings('<div>\n# T\n</div>\n\n# Real\n').map((f) => f.heading)).toEqual(['Real'])
    expect(sourceHeadings('# H\n    x\n===\n').map((f) => f.heading)).toEqual(['H'])
  })

  test('a line opening with an inline tag is a paragraph, not raw HTML', () => {
    // Only block-level tags, or a tag alone on its line, open an HTML block.
    const doc = '<b>Note</b> some text\n# Heading\nbody'
    expect(sourceHeadings(doc).map((f) => f.heading)).toEqual(['Heading'])
    expect(sliceByHeading(doc, 'Heading')).toBe('# Heading\nbody')
    expect(sliceByBlockId('intro\n\n<span>a</span> b\n## Sec\nbody ^blk', 'blk')).toBe('body')
    expect(
      sourceHeadings('## A\n\n<b>x</b> %%hidden\n\n## B\n%%\n## C\n').map((f) => f.heading),
    ).toEqual(['A', 'C'])
    expect(sourceHeadings('<span>\n# T\n\n# Real\n').map((f) => f.heading)).toEqual(['Real'])
  })

  test('%% inside raw HTML opens nothing', () => {
    const block = '## Intro\n\n<div title="%%">x</div>\n\n## Next\n\nn'
    const inline = '## Intro\n\ntext <span title="%%">x</span> more\n\n## Next\n\nn'
    const comment = '## Intro\n\n<!-- a %%\n\nb -->\n\n## Next\n\nn'
    for (const doc of [block, inline, comment]) {
      expect(sourceHeadings(doc).map((found) => found.heading)).toEqual(['Intro', 'Next'])
    }
  })

  test('%% in an autolink or an indented list paragraph is text, and opens a comment', () => {
    // An autolink's label and a list item's indented paragraph are both
    // `text` nodes, so these still hide what follows, as the renderer does.
    const autolink = '## Intro\n\n<https://x.test/%%>\n\n## Next\n\nn'
    expect(sourceHeadings(autolink).map((found) => found.heading)).toEqual(['Intro'])
    const list = '## Intro\n\n- item\n\n    %%\n\n## Hidden\n\n%%\n\n## Next\n\nn'
    expect(sourceHeadings(list).map((found) => found.heading)).toEqual(['Intro', 'Next'])
  })

  test('a block id that would be placed is still hidden by a comment', () => {
    // The marker ends its block (a blank line follows), so only the comment
    // skip keeps it from being embedded.
    expect(sliceByBlockId('%%\n\npara ^hidden\n\n%%\n\nafter', 'hidden')).toBeNull()
    expect(sliceByBlockId('para ^shown\n\n%%\n\nhidden\n\n%%', 'shown')).toBe('para')
  })

  test('a long line of backticks or unclosed tags scans in linear time', () => {
    // The comment scan masks inline code and HTML on every line. A backtracking
    // code-span regex took ~75s on 5000 backticks; an honest scan takes well
    // under a millisecond, so the ceiling below has orders of magnitude of
    // headroom either way.
    for (const run of ['`'.repeat(4000), '`` `'.repeat(1500), '<a '.repeat(4000)]) {
      const doc = `# A\n\ntext ${run}\n\n# B\n`
      const started = performance.now()
      expect(sourceHeadings(doc).map((found) => found.heading)).toEqual(['A', 'B'])
      expect(performance.now() - started).toBeLessThan(1000)
    }
  })

  test('an unclosed %% hides every heading after it', () => {
    const doc = ['# A', '', 'text %%', '', '# Hidden', '', 'h'].join('\n')
    expect(sourceHeadings(doc).map((found) => found.heading)).toEqual(['A'])
  })
})

describe('a block-id slice stops at a heading', () => {
  // A heading is a one-line block: it ends the paragraph above it and is not
  // part of the one below. The renderer puts the id on the paragraph alone.
  test('the heading directly above the paragraph is not part of the block', () => {
    expect(sliceByBlockId('## Usage\nRun the tool. ^blk\n', 'blk')).toBe('Run the tool.')
    expect(sliceByBlockId('# A\n## B\ntext ^blk', 'blk')).toBe('text')
  })

  test('a heading carrying the id is the block, not the paragraph above it', () => {
    expect(sliceByBlockId('para line\n## Heading ^h', 'h')).toBe('## Heading')
  })

  test('a setext heading above the paragraph is not part of the block', () => {
    expect(sliceByBlockId('Title\n---\ntext ^blk', 'blk')).toBe('text')
  })
})

describe('a standalone marker below a setext heading', () => {
  test('claims the whole heading, title and underline', () => {
    expect(sliceByBlockId('Title\n---\n\n^id', 'id')).toBe('Title\n---')
  })
})

describe('sliceByBlockId resolves only the ids the renderer assigns', () => {
  // `remarkBlockIds` takes a `^id` that ends its block's last text run, or a
  // marker paragraph of its own. Anywhere else it is literal text with no id.
  test('a marker mid-paragraph is not a block id', () => {
    expect(sliceByBlockId('line one ^abc\nline two\n', 'abc')).toBeNull()
  })

  test('a marker line under a paragraph, item or quote ends that block', () => {
    // The renderer lifts it from the end of the block's last text run.
    expect(sliceByBlockId('para line\n^abc\n', 'abc')).toBe('para line')
    expect(sliceByBlockId('- a\n- b\n^abc\n', 'abc')).toBe('- a\n- b')
    expect(sliceByBlockId('> q\n^abc\n', 'abc')).toBe('> q')
  })

  test('of several marker lines under a paragraph, only the last is an id', () => {
    expect(sliceByBlockId('para\n^abc\n^def\n', 'abc')).toBeNull()
    expect(sliceByBlockId('para\n^abc\n^def\n', 'def')).toBe('para\n^abc')
  })

  test('marker lines under a block with no lazy text are not ids', () => {
    expect(sliceByBlockId('# H\n^abc\n^def', 'def')).toBeNull()
    expect(sliceByBlockId('---\n^abc\n^def', 'def')).toBeNull()
    expect(sliceByBlockId('Title\n===\n^abc\n^def', 'def')).toBeNull()
    expect(sliceByBlockId('```\nx\n```\n^abc\n^def', 'def')).toBeNull()
    expect(sliceByBlockId('text\n***\n^abc\n^def', 'def')).toBeNull()
  })

  test('a marker line under a table is a row, not an id', () => {
    expect(sliceByBlockId('| a | b |\n| - | - |\n| 1 | 2 |\n^abc', 'abc')).toBeNull()
    expect(sliceByBlockId('| a | b |\n| - | - |\n| 1 | 2 | ^abc', 'abc')).toBeNull()
    expect(sliceByBlockId('| a | b |\n| - | - |\n| 1 | 2 |\n\n^abc', 'abc')).toBe(
      '| a | b |\n| - | - |\n| 1 | 2 |',
    )
  })

  test('a block-level HTML tag interrupts a paragraph and owns nothing', () => {
    expect(sliceByBlockId('text\n<div>\n^abc', 'abc')).toBeNull()
    expect(sliceByBlockId('text\n<!-- c -->\n^abc', 'abc')).toBeNull()
    expect(sliceByBlockId('para\n<span>x</span>\n^abc', 'abc')).toBe('para\n<span>x</span>')
    expect(sourceHeadings('text\n<div>\n# T\n\n# R').map((f) => f.heading)).toEqual(['R'])
  })

  test('a marker line under indented code stands alone and marks the code', () => {
    expect(sliceByBlockId('    code\n^abc', 'abc')).toBe('    code')
  })

  test('marker lines with no text above them, or under raw HTML, are not ids', () => {
    expect(sliceByBlockId('para\n\n^abc\n^def\n', 'def')).toBeNull()
    expect(sliceByBlockId('<div>\n^abc\n', 'abc')).toBeNull()
  })

  test('a marker mid-quote is not a block id', () => {
    expect(sliceByBlockId('> one ^abc\n> two\n', 'abc')).toBeNull()
  })

  test('a standalone marker with a line under it is not a block id', () => {
    // `^x\npara` is one paragraph, so the marker is text, not a marker paragraph.
    expect(sliceByBlockId('---\n^x\npara\n', 'x')).toBeNull()
    expect(sliceByBlockId('para\n\n^x\nmore\n', 'x')).toBeNull()
    expect(sliceByBlockId('para\n\n^x\n## H\n', 'x')).toBe('para')
  })

  test('a standalone marker with no block above it does not hide a later one', () => {
    expect(sliceByBlockId('^x\n\nreal ^x\n', 'x')).toBe('real')
    expect(sliceByBlockId('\n\n^x\n\nreal ^x\n', 'x')).toBe('real')
  })

  test('a later valid marker with the same id is still found', () => {
    expect(sliceByBlockId('line one ^abc\nline two\n\nreal ^abc\n', 'abc')).toBe('real')
  })

  test('a marker ending a block before a heading, a list item or a quote end still counts', () => {
    expect(sliceByBlockId('text ^a\n## Next\n', 'a')).toBe('text')
    expect(sliceByBlockId('- one ^a\n- two\n', 'a')).toBe('- one')
    expect(sliceByBlockId('> one ^a\n>\n> two\n', 'a')).toBe('> one')
    expect(sliceByBlockId('## H\n^a\n', 'a')).toBe('## H')
  })

  test('a marker on a heading line counts whatever follows the heading', () => {
    expect(sliceByBlockId('## Heading ^h\ntext right under it\n', 'h')).toBe('## Heading')
  })
})

describe('heading matching ignores punctuation, as Obsidian does', () => {
  // Obsidian matches a heading subpath on its text with punctuation replaced by
  // spaces, and writes links that way: `|`, `[`, `]` and `#` cannot appear in a
  // link's heading text at all.
  const doc = '## Step 1: Install\n\nrun it\n\n## A | B\n\npipe body'

  test('a colon in the heading does not have to be in the link', () => {
    expect(sliceByHeading(doc, 'Step 1 Install')).toBe('## Step 1: Install\n\nrun it')
  })

  test('a heading holding a pipe can be embedded', () => {
    expect(sliceByHeading(doc, 'A B')).toBe('## A | B\n\npipe body')
  })

  test('a heading that matches with its punctuation wins over a looser match', () => {
    // `C++` loosens to `c`; it must not take a link to `C` that matches `## C` exactly.
    const langs = '## C++\n\ncpp\n\n## C\n\nc'
    expect(sliceByHeading(langs, 'C')).toBe('## C\n\nc')
    expect(sliceByHeading(langs, 'C++')).toBe('## C++\n\ncpp')
  })
})

describe('a heading path reaches a subheading', () => {
  // Obsidian's `[[Note#Heading#Subheading]]`: each part is a heading deeper
  // than the one before, inside that one's section.
  const NOTE = '# Project\n\n## Status\n\nproj status\n\n# Other\n\n## Status\n\nother status'

  test('picks the subheading under the named parent', () => {
    expect(sliceByHeading(NOTE, 'Other#Status')).toBe('## Status\n\nother status')
    expect(sliceByHeading(NOTE, 'Project#Status')).toBe('## Status\n\nproj status')
  })

  test('a path resolves as a path before it is read as one heading', () => {
    // `#` loosens to a space, so `A#C` also matches `## A C`; Obsidian reads
    // the `#` as a separator, so the subheading under `A` is the target.
    const doc = '## A C\n\nwrong\n\n# A\n\n## C\n\nright'
    expect(sliceByHeading(doc, 'A#C')).toBe('## C\n\nright')
  })

  test('a heading spelled with a # still matches when no path does', () => {
    expect(sliceByHeading('## A#C\n\nlit', 'A#C')).toBe('## A#C\n\nlit')
  })

  test('a trailing # is part of one heading, not a one-part path', () => {
    // `C#` splits to the single part `C`; read as a path it loosely took an
    // earlier `## C` before the exact `## C#` was tried.
    expect(sliceByHeading('## C\n\nc\n\n## C#\n\ncs', 'C#')).toBe('## C#\n\ncs')
    expect(sliceByHeading('## Learn C\n\nc\n\n## Learn C#\n\ncs', 'Learn C#')).toBe(
      '## Learn C#\n\ncs',
    )
  })

  test('a subheading outside the parent section does not match', () => {
    expect(sliceByHeading('# A\n\na\n\n# B\n\n## C\n\nc', 'A#C')).toBeNull()
  })

  test('sliceEmbed takes the path as written in the embed', () => {
    expect(sliceEmbed(NOTE, { heading: 'Other#Status' })).toBe('## Status\n\nother status')
  })
})

describe('a note body that opens with a thematic break', () => {
  // Every caller passes the body, frontmatter already split off. There a
  // leading `---` is a horizontal rule, as remark renders it, not the opener
  // of a frontmatter block that hides everything up to the next `---`.
  const BODY = '---\n\n## Alpha\n\nalpha text ^a\n\n---\n\n## Beta\n'

  test('the headings between the rule and the next --- are found', () => {
    expect(sourceHeadings(BODY).map((found) => found.heading)).toEqual(['Alpha', 'Beta'])
    expect(sliceEmbed(BODY, { heading: 'Alpha' })).toBe('## Alpha\n\nalpha text ^a\n\n---')
  })

  test('a block id between the rule and the next --- is found', () => {
    expect(sliceEmbed(BODY, { blockId: 'a' })).toBe('alpha text')
  })
})

describe('the slicers follow the parser on block boundaries', () => {
  test('a --- under a list item or quote is a thematic break, not a setext underline', () => {
    const list = ['## A', '', '- x', '- y', '---', '', 'more under A', '', '## B', 'b'].join('\n')
    expect(sliceByHeading(list, 'A')).toBe(
      ['## A', '', '- x', '- y', '---', '', 'more under A'].join('\n'),
    )
    expect(sourceHeadings(list).map((found) => found.heading)).toEqual(['A', 'B'])

    const quote = ['## A', '> q', '---', 'rest', '## B'].join('\n')
    expect(sliceByHeading(quote, 'A')).toBe(['## A', '> q', '---', 'rest'].join('\n'))
  })

  test('CRLF sources slice the same as LF ones', () => {
    const lf = '# Intro\ntext\n\n## Setup\n\nstep one ^abc\n\n```\ncode\n```\n^fence\n\n# Next\nx'
    const crlf = lf.replace(/\n/g, '\r\n')
    expect(sourceHeadings(crlf)).toEqual(sourceHeadings(lf))
    expect(sliceByHeading(crlf, 'Setup')).toBe(sliceByHeading(lf, 'Setup')?.replace(/\n/g, '\r\n'))
    expect(sliceByBlockId(crlf, 'abc')).toBe('step one')
    expect(sliceByBlockId(crlf, 'fence')).toBe('```\r\ncode\r\n```')
  })

  test('an ATX heading indented by up to three spaces is a heading', () => {
    const doc = ['# A', 'alpha', '  # B', 'beta'].join('\n')
    expect(sliceByHeading(doc, 'A')).toBe(['# A', 'alpha'].join('\n'))
    expect(sliceByHeading(doc, 'B')).toBe(['  # B', 'beta'].join('\n'))
    expect(sourceHeadings('   ## Indented\na').map((found) => found.heading)).toEqual(['Indented'])
  })

  test('a block id slice stops at the heading or quote opener above its paragraph', () => {
    expect(sliceByBlockId('## Notes\nThe key point. ^key\n\nOther', 'key')).toBe('The key point.')
    expect(sliceByBlockId('Title\n---\nbody ^b', 'b')).toBe('body')
    expect(sliceByBlockId('Text\n> quote ^q', 'q')).toBe('> quote')
  })

  test('a block id slice takes only the fence directly above it', () => {
    const doc = ['intro', '', '```js', 'const a = 1', '```', '```py', 'b = 2', '```', '^code'].join(
      '\n',
    )
    expect(sliceByBlockId(doc, 'code')).toBe(['```py', 'b = 2', '```'].join('\n'))
  })
})

describe('the slicers follow the parser on what may interrupt a paragraph', () => {
  const titles = (doc: string) => sourceHeadings(doc).map((found) => [found.heading, found.depth])

  test('a list marker that cannot interrupt a paragraph is text, so --- under it is an underline', () => {
    // An ordered item numbered other than 1, or an empty bullet, continues the
    // paragraph above it; the renderer makes each of these an h2.
    expect(titles('In the year\n2024. was great\n---\n\nbody')).toHaveLength(1)
    expect(titles('Intro line\n3) not a list\n---')).toHaveLength(1)
    expect(titles('text\n* \n---')).toHaveLength(1)
  })

  test('a setext heading inside a list item is a heading', () => {
    expect(titles('- Foo\n  Bar\n  ---\n  baz')).toEqual([['Foo Bar', 2]])
    expect(titles('- Foo\n  ---')).toEqual([['Foo', 2]])
    expect(titles('1. Foo\n   ---')).toEqual([['Foo', 2]])
    // An unindented underline is outside the item: a thematic break.
    expect(titles('- Foo\nBar\n---')).toEqual([])
  })

  test('a block id slice stops only at a real underline, not at = or -- text', () => {
    expect(sliceByBlockId('=\nb ^x', 'x')).toBe('=\nb')
    expect(sliceByBlockId('intro\n\n--\nmore ^x', 'x')).toBe('--\nmore')
    expect(sliceByBlockId('a\n--\nb ^x', 'x')).toBe('b')
    expect(sliceByBlockId('-\nb ^x', 'x')).toBe('b')
  })

  test('a block id slice starts at a thematic break on the marked line', () => {
    // The renderer puts the id on the <hr> alone.
    expect(sliceByBlockId('para\n***\n^id', 'id')).toBe('***')
    // A `---` under text is a setext underline, so the heading stays whole.
    expect(sliceByBlockId('Title\n---\n^id', 'id')).toBe('Title\n---')
  })

  test('a CRLF slice keeps the source line endings', () => {
    const crlf = '# A\r\none\r\ntwo ^id\r\n\r\n# B\r\nx'
    expect(sliceByHeading(crlf, 'A')).toBe('# A\r\none\r\ntwo ^id')
    expect(sliceByBlockId('one\r\ntwo ^id', 'id')).toBe('one\r\ntwo')
  })
})

describe('sliceByBlockId finds an id exactly where the renderer assigns one', () => {
  const cases: Array<[string, string, string | null]> = [
    ['para line\n^abc', 'abc', 'para line'],
    ['- a\n- b\n^abc', 'abc', '- a\n- b'],
    ['> q\n^abc', 'abc', '> q'],
    ['text #tag\n^abc', 'abc', 'text #tag'],
    ['text %%c%%\n^abc', 'abc', 'text %%c%%'],
    ['para\n^abc\n^def', 'abc', null],
    ['para\n^abc\n^def', 'def', 'para\n^abc'],
    ['para\n\n^abc\n^def', 'def', null],
    ['<div>\n^abc', 'abc', null],
    ['# H\n^abc', 'abc', '# H'],
    ['# H\n^abc\n^def', 'def', null],
    ['---\n^abc', 'abc', '---'],
    ['---\n^abc\n^def', 'def', null],
    ['Title\n===\n^abc\n^def', 'def', null],
    ['```\nx\n```\n^abc\n^def', 'def', null],
    ['| a | b |\n| - | - |\n| 1 | 2 |\n^abc', 'abc', null],
    ['| a | b |\n| - | - |\n| 1 | 2 | ^abc', 'abc', null],
    ['| a | b |\n| - | - |\n| 1 | 2 |\n\n^abc', 'abc', '| a | b |\n| - | - |\n| 1 | 2 |'],
    ['a | b\n- | -\n^abc', 'abc', 'a | b\n- | -'],
    ['text\n<div>\n^abc', 'abc', null],
    ['text\n<pre>\nx\n</pre>\n^abc', 'abc', null],
    ['para\n<span>\n^abc', 'abc', 'para\n<span>'],
    ['    code\n^abc', 'abc', '    code'],
    ['# H\n    code\n^abc', 'abc', '    code'],
    ['> q\n> ^abc\n^def', 'def', '> q\n> ^abc'],
    ['1. a\n^abc\n^def', 'def', '1. a\n^abc'],
  ]
  test.each(cases)('%j #^%s', async (markdown, id, slice) => {
    const rendered = (await renderToHtml(markdown, {})).includes(`id="${id}"`)
    expect(sliceByBlockId(markdown, id) !== null).toBe(rendered)
    // `null` where the renderer assigns no id. A few slices (`para\n^abc` for #def,
    // `> q\n> ^abc`, `1. a\n^abc`) keep an earlier marker line that the renderer
    // treats differently; they are pinned as they are today.
    expect(sliceByBlockId(markdown, id)).toBe(slice)
  })
})

describe('headings the line scan must agree with the parser on', () => {
  test('a multi-line setext title is one heading from its first line', () => {
    const doc = '# Top\n\nintro\n\nFoo\nBar\n===\n\ntext'
    expect(sourceHeadings(doc)).toEqual([
      { heading: 'Top', depth: 1, line: 1 },
      { heading: 'Foo Bar', depth: 1, line: 5 },
    ])
    expect(sliceByHeading(doc, 'Foo Bar')).toBe('Foo\nBar\n===\n\ntext')
    expect(sliceByHeading(doc, 'Top')).toBe('# Top\n\nintro')
  })

  test('an empty ATX heading ends the section above it', () => {
    expect(sliceByHeading('## A\n\nx\n\n#\n\ny', 'A')).toBe('## A\n\nx')
  })

  test('a block id on a setext title keeps its underline', () => {
    expect(sliceByBlockId('Title ^x\n---\n\nbody', 'x')).toBe('Title\n---')
  })
})
