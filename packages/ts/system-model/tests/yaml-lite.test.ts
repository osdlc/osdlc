import { describe, expect, test } from 'vitest'

import {
  BLOCK_SCALAR_VALUE,
  isDocumentMarker,
  leadingSpaces,
  matchKey,
  opensBlockScalar,
  plainScalarStart,
  prepass,
  scanLine,
  unquote,
  unquoteValue,
} from '../src/plugins/support/yaml-lite.ts'

const BOM = '\uFEFF'

/** The retained lines, minus the blanks, so a test can assert on structure only. */
function retained(text: string): string[] {
  return prepass(text)
    .lines.map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '')
}

describe('leadingSpaces', () => {
  test('counts spaces only', () => {
    expect(leadingSpaces('    x')).toBe(4)
    expect(leadingSpaces('x')).toBe(0)
    expect(leadingSpaces('')).toBe(0)
    // A tab is not indentation in YAML, so it is not counted as one here.
    expect(leadingSpaces('\tx')).toBe(0)
  })
})

describe('BOM', () => {
  test('a leading BOM is stripped so the first key matches', () => {
    const { lines } = prepass(`${BOM}services:\n  web:\n    image: nginx\n`)
    expect(lines[0]).toBe('services:')
    expect(matchKey(lines[0] ?? '', 0)).toEqual({ key: 'services', value: '' })
  })

  test('without the strip the first key would be unmatchable', () => {
    // Why the BOM strip exists: JS `\s` matches U+FEFF, so without the strip the
    // byte binds to the key and `services` never matches `services`.
    expect(matchKey(`${BOM}services:`, 0)?.key).not.toBe('services')
  })
})

describe('comments', () => {
  test('a `#` outside a string is stripped', () => {
    expect(scanLine('image: nginx # the web server').cleaned.trimEnd()).toBe('image: nginx')
  })

  test('a `#` inside a quoted string is not a comment', () => {
    expect(scanLine(`command: "echo #1"`).cleaned).toBe(`command: "echo #1"`)
    expect(scanLine("command: 'echo #1'").cleaned).toBe("command: 'echo #1'")
  })

  test('a `#` with no preceding space is part of the scalar', () => {
    expect(scanLine('tag: v1#2').cleaned).toBe('tag: v1#2')
  })
})

describe('anchors, aliases and merge keys', () => {
  test('an anchor is flagged', () => {
    expect(scanLine('base: &defaults').anchor).toBe(true)
  })

  test('an alias is flagged', () => {
    expect(scanLine('  image: *base').anchor).toBe(true)
  })

  test('a merge key is flagged', () => {
    const line = scanLine('  <<: *defaults')
    expect(line.merge).toBe(true)
    expect(line.anchor).toBe(true)
  })

  test('a `*` in a shell glob is not an alias', () => {
    // The case `plainScalarStart` exists for.
    const line = scanLine('    command: rm -rf *tmp')
    expect(line.anchor).toBe(false)
    expect(line.merge).toBe(false)
  })

  test('a `&` inside a plain scalar is not an anchor', () => {
    expect(scanLine('    command: make a &b').anchor).toBe(false)
  })

  test('an alias inside a flow collection is still flagged', () => {
    // A flow collection is a node indicator, so the value does not suppress
    // the scan. The alias still has to sit at a word boundary to be seen:
    // `[*web` reads as ordinary text, which is a known limit, not a goal.
    expect(scanLine('  ports: [ *web, 80 ]').anchor).toBe(true)
    expect(scanLine('  ports: [*web, 80]').anchor).toBe(false)
  })

  test('prepass aggregates over retained lines', () => {
    const out = prepass('base: &d\n  a: 1\nweb:\n  <<: *d\n')
    expect(out.anchor).toBe(true)
    expect(out.merge).toBe(true)
  })

  test('an anchor inside a block scalar body is not flagged', () => {
    const out = prepass(
      ['run: |', '  echo &notAnAnchor', '  echo *notAnAlias', 'name: ci', ''].join('\n'),
    )
    expect(out.anchor).toBe(false)
    expect(out.merge).toBe(false)
    expect(retained(out.lines.join('\n'))).toEqual(['run: |', 'name: ci'])
  })

  test('a merge key inside a block scalar body is not flagged', () => {
    const out = prepass(['run: |', '  <<: *defaults', 'name: ci', ''].join('\n'))
    expect(out.merge).toBe(false)
  })
})

describe('plainScalarStart', () => {
  test('a plain value suppresses the scan from the value onward', () => {
    expect(plainScalarStart('command: rm -rf *tmp')).toBe('command: '.length)
  })

  test('a node indicator does not suppress it', () => {
    expect(plainScalarStart('image: *base')).toBe(Infinity)
    expect(plainScalarStart('base: &defaults')).toBe(Infinity)
    expect(plainScalarStart('ports: [*a]')).toBe(Infinity)
    expect(plainScalarStart('run: |')).toBe(Infinity)
  })

  test('a bare key with no value has no plain scalar', () => {
    expect(plainScalarStart('services:')).toBe(Infinity)
  })
})

describe('document markers', () => {
  test('a real `---` at indent 0 sets multiDoc and truncates', () => {
    const out = prepass(['services:', '  web:', '---', 'services:', '  later:', ''].join('\n'))
    expect(out.multiDoc).toBe(true)
    expect(out.lines).toEqual(['services:', '  web:'])
    expect(out.scanned).toHaveLength(2)
  })

  test('`...` at indent 0 truncates too', () => {
    const out = prepass(['a: 1', '...', 'b: 2', ''].join('\n'))
    expect(out.multiDoc).toBe(true)
    expect(out.lines).toEqual(['a: 1'])
  })

  test('a marker with a trailing comment still counts', () => {
    // A plain `line.trim() === "---"` test would miss this.
    const out = prepass(['a: 1', '--- # second document', 'b: 2', ''].join('\n'))
    expect(out.multiDoc).toBe(true)
    expect(out.lines).toEqual(['a: 1'])
  })

  test('`---` on line 0 does NOT set multiDoc', () => {
    const out = prepass(['---', 'services:', '  web:', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    // The opener is retained like any other line; nothing after it is dropped.
    expect(retained(out.lines.join('\n'))).toEqual(['---', 'services:', '  web:'])
  })

  test('a trailing `---` with nothing after it does NOT set multiDoc', () => {
    // There is no later document, so nothing is missing. The content is still
    // truncated at the marker — there is nothing past it to keep.
    const out = prepass(['services:', '  web:', '---', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    expect(out.lines).toEqual(['services:', '  web:'])
  })

  test('a trailing `...` with nothing after it does NOT set multiDoc either', () => {
    const out = prepass(['tasks:', '  build:', '...', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    expect(out.lines).toEqual(['tasks:', '  build:'])
  })

  test('a marker followed by blank lines only does NOT set multiDoc', () => {
    const out = prepass(['a: 1', '---', '', '   ', '', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    expect(out.lines).toEqual(['a: 1'])
  })

  test('a marker followed by real content DOES set multiDoc and truncates', () => {
    // The trailing-marker rule must not go too far.
    const out = prepass(['a: 1', '---', '', 'b: 2', ''].join('\n'))
    expect(out.multiDoc).toBe(true)
    expect(out.lines).toEqual(['a: 1'])
  })

  test('a comment before `---` makes it the opener, not a separator', () => {
    const out = prepass(
      ['# my compose file', '', '---', 'services:', '  web:', '    image: nginx', ''].join('\n'),
    )
    expect(out.multiDoc).toBe(false)
    // Everything after the opener is retained; the comment cleans to blank.
    expect(retained(out.lines.join('\n'))).toEqual([
      '---',
      'services:',
      '  web:',
      '    image: nginx',
    ])
  })

  test('`---` then `---`: the first is the opener, the second a separator', () => {
    // Nothing follows the second marker, so multiDoc must be false. Exactly one
    // line is retained: the second marker is a separator, since an opener would
    // have been kept.
    const out = prepass(['---', '---', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    expect(out.lines).toEqual(['---'])
  })

  test('a comment-only tail after a marker does NOT set multiDoc', () => {
    // The check runs on the cleaned line, so a trailing comment is not a document.
    const out = prepass(
      ['services:', '  web:', '    image: nginx', '---', '# end of file', ''].join('\n'),
    )
    expect(out.multiDoc).toBe(false)
    expect(out.lines).toEqual(['services:', '  web:', '    image: nginx'])
  })

  test('a commented-out second document does NOT set multiDoc either', () => {
    const out = prepass(['services:', '  web:', '---', '# services:', '#   db:', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    expect(out.lines).toEqual(['services:', '  web:'])
  })

  test('a `%YAML` directive before `---` leaves the marker an opener', () => {
    // A directive is what YAML permits ahead of a directives-end marker, so it
    // is not document content and must not turn the `---` into a separator.
    const out = prepass(
      ['%YAML 1.2', '---', 'services:', '  web:', '    image: nginx', ''].join('\n'),
    )
    expect(out.multiDoc).toBe(false)
    expect(retained(out.lines.join('\n'))).toEqual([
      '%YAML 1.2',
      '---',
      'services:',
      '  web:',
      '    image: nginx',
    ])
  })

  test('isDocumentMarker requires column zero', () => {
    expect(isDocumentMarker('---')).toBe(true)
    expect(isDocumentMarker('--- foo')).toBe(true)
    expect(isDocumentMarker('...')).toBe(true)
    expect(isDocumentMarker('  ---')).toBe(false)
    expect(isDocumentMarker('----')).toBe(false)
    expect(isDocumentMarker('...foo')).toBe(false)
  })

  test('an indented `---` inside a `|` block scalar is content, not a separator', () => {
    const out = prepass(
      [
        'services:',
        '  web:',
        '    command: |',
        '      ---',
        '      echo hi',
        '  db:',
        '    image: postgres',
        '',
      ].join('\n'),
    )
    expect(out.multiDoc).toBe(false)
    expect(retained(out.lines.join('\n'))).toEqual([
      'services:',
      '  web:',
      '    command: |',
      '  db:',
      '    image: postgres',
    ])
  })

  test('the same inside a `>` block scalar', () => {
    const out = prepass(['a:', '  note: >', '    ---', '    folded text', 'b: 2', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    expect(retained(out.lines.join('\n'))).toEqual(['a:', '  note: >', 'b: 2'])
  })
})

describe('block scalars', () => {
  test('opensBlockScalar recognises the shapes prepass hands it', () => {
    expect(opensBlockScalar('run: |')).toBe(true)
    expect(opensBlockScalar('  - run: |-')).toBe(true)
    expect(opensBlockScalar('body: |2')).toBe(true)
    expect(opensBlockScalar('note: >-3')).toBe(true)
    expect(opensBlockScalar('body: |-2')).toBe(true)
    expect(opensBlockScalar('image: nginx')).toBe(false)
    expect(opensBlockScalar('services:')).toBe(false)
  })

  test('a header whose comment scanLine already stripped still opens one', () => {
    const out = prepass(['run: | # a script', '  ---', 'name: ci', ''].join('\n'))
    expect(out.multiDoc).toBe(false)
    expect(retained(out.lines.join('\n'))).toEqual(['run: |', 'name: ci'])
  })

  test('indentation indicators open a block scalar', () => {
    for (const header of ['|2', '>-3', '|-2']) {
      expect(BLOCK_SCALAR_VALUE.test(header)).toBe(true)
      const out = prepass(['  desc: ' + header, '      ---', '  other: x', ''].join('\n'))
      expect(out.multiDoc).toBe(false)
      expect(retained(out.lines.join('\n'))).toEqual(['  desc: ' + header, '  other: x'])
    }
  })

  test('a blank line inside a block scalar stays content', () => {
    const out = prepass(['run: |', '  one', '', '  two', 'name: ci', ''].join('\n'))
    expect(out.scanned.slice(1, 4).every((s) => s.blockScalar)).toBe(true)
    expect(out.scanned[4]?.blockScalar).toBe(false)
    expect(out.lines[4]).toBe('name: ci')
  })

  test('the body is blanked but keeps its index', () => {
    const out = prepass(['run: |', '  echo hi', 'name: ci', ''].join('\n'))
    expect(out.lines).toEqual(['run: |', '', 'name: ci', ''])
    expect(out.scanned.map((s) => s.blockScalar)).toEqual([false, true, false, false])
  })

  test('a sequence item block scalar masks its body', () => {
    const out = prepass(
      [
        'steps:',
        '  - run: |',
        '      echo hi',
        '      ---',
        '  - uses: actions/checkout@v4',
        '',
      ].join('\n'),
    )
    expect(out.multiDoc).toBe(false)
    expect(retained(out.lines.join('\n'))).toEqual([
      'steps:',
      '  - run: |',
      '  - uses: actions/checkout@v4',
    ])
  })
})

describe('unquote / unquoteValue', () => {
  test('unquote strips one matched pair and never returns undefined', () => {
    expect(unquote("  'push' ")).toBe('push')
    expect(unquote('"push"')).toBe('push')
    expect(unquote('push')).toBe('push')
    expect(unquote('')).toBe('')
    expect(unquote("'unbalanced")).toBe("'unbalanced")
  })

  test('unquoteValue treats empty as absent', () => {
    expect(unquoteValue('   ')).toBeUndefined()
  })

  test('unquoteValue does not return a block scalar header as a value', () => {
    for (const header of ['|', '>', '|-', '>+', '|2', '>-3', '|-2']) {
      expect(unquoteValue(header)).toBeUndefined()
    }
  })

  test('unquoteValue unquotes an ordinary value', () => {
    expect(unquoteValue(" 'build the app' ")).toBe('build the app')
    expect(unquoteValue('nginx:alpine')).toBe('nginx:alpine')
  })
})

describe('matchKey', () => {
  test('a quoted key', () => {
    expect(matchKey(`"on": [push]`, 0)).toEqual({ key: 'on', value: '[push]' })
    expect(matchKey("'on': [push]", 0)).toEqual({ key: 'on', value: '[push]' })
  })

  test('the value half keeps a `:` so a tag survives', () => {
    expect(matchKey('    image: nginx:alpine', 4)).toEqual({ key: 'image', value: 'nginx:alpine' })
  })

  test('a list item is not a key', () => {
    expect(matchKey('  - run: echo', 2)).toBeNull()
  })

  test('a bare key with no value', () => {
    expect(matchKey('services:', 0)).toEqual({ key: 'services', value: '' })
  })
})

describe('CRLF', () => {
  test('carriage returns do not survive the split', () => {
    const out = prepass('services:\r\n  web:\r\n    image: nginx\r\n')
    expect(out.lines).toEqual(['services:', '  web:', '    image: nginx', ''])
    expect(matchKey(out.lines[2] ?? '', 4)).toEqual({ key: 'image', value: 'nginx' })
  })

  test('a CRLF document separator still truncates', () => {
    const out = prepass('a: 1\r\n---\r\nb: 2\r\n')
    expect(out.multiDoc).toBe(true)
    expect(out.lines).toEqual(['a: 1'])
  })
})
