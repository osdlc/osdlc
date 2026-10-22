/**
 * `setPath` / `unsetPath` — span-preserving dotted-path edits over
 * `@osdlc/yaml-splice`. Every case asserts the exact output text: an edit
 * may touch only the edited value's line(s).
 */

import { describe, expect, test } from 'vitest'

import { setPath, unsetPath } from '../src/edit.ts'

const FIXTURE = `# Project config.   Odd  spacing is deliberate.

jobs:
  check:
    - make test     # the gate

service:   # request limits
  limits:
    pool:
      # How many requests run at once.
      size:       5
  max_queued: 20   # informational

  features:
    alpha: true
    beta:  false
site_dir: 'site'
`

describe('setPath', () => {
  test('a nested scalar: only that value changes, every other byte survives', () => {
    expect(setPath(FIXTURE, ['service', 'limits', 'pool', 'size'], 3)).toBe(
      FIXTURE.replace('size:       5', 'size: 3'),
    )
  })

  test('a doubly nested scalar keeps its sibling spacing and comments', () => {
    expect(setPath(FIXTURE, ['service', 'features', 'beta'], true)).toBe(
      FIXTURE.replace('beta:  false', 'beta: true'),
    )
  })

  test('a record entry value replaced with a list (the old trailing comment moves to the header line of the key)', () => {
    const out = setPath(FIXTURE, ['jobs', 'check'], ['make test', 'make lint'])
    expect(out).toBe(
      FIXTURE.replace(
        '  check:\n    - make test     # the gate\n',
        '  check:     # the gate\n    - make test\n    - make lint\n',
      ),
    )
  })

  test('a missing nested key is appended inside its parent block', () => {
    expect(setPath(FIXTURE, ['service', 'interval_seconds'], 60)).toBe(
      FIXTURE.replace('    beta:  false\n', '    beta:  false\n  interval_seconds: 60\n'),
    )
  })

  test('a missing top-level section is appended with its parents', () => {
    expect(setPath(FIXTURE, ['notify', 'author_notes'], 'summary')).toBe(
      `${FIXTURE}notify:\n  author_notes: summary\n`,
    )
  })

  test('a top-level scalar goes straight through yaml-splice', () => {
    expect(setPath(FIXTURE, ['site_dir'], 'docs/site')).toBe(
      FIXTURE.replace("site_dir: 'site'", 'site_dir: docs/site'),
    )
  })

  test('a flow-map parent is re-rendered as a whole section (fallback)', () => {
    const src = 'a: 1\nhost: { default: terminal }\nz: 2\n'
    expect(setPath(src, ['host', 'default'], 'cmux')).toBe('a: 1\nhost:\n  default: cmux\nz: 2\n')
  })

  test('a bare null parent gets its first key', () => {
    const src = 'service:\nz: 2\n'
    expect(setPath(src, ['service', 'size'], 2)).toBe('service:\n  size: 2\nz: 2\n')
  })

  test('a document without a trailing newline', () => {
    expect(setPath('o:\n  a: 1', ['o', 'a'], 2)).toBe('o:\n  a: 2')
  })

  test('an empty path segment is refused', () => {
    expect(() => setPath(FIXTURE, ['service', ''], 1)).toThrow(/invalid key path/)
  })
})

describe('unsetPath', () => {
  test('removes one nested key and nothing else', () => {
    expect(unsetPath(FIXTURE, ['service', 'max_queued'])).toBe(
      FIXTURE.replace('  max_queued: 20   # informational\n', ''),
    )
  })

  test('an absent key is a byte-identical no-op', () => {
    expect(unsetPath(FIXTURE, ['service', 'nope'])).toBe(FIXTURE)
    expect(unsetPath(FIXTURE, ['notify', 'author_notes'])).toBe(FIXTURE)
  })

  test('removing the last key of a block removes the emptied parent', () => {
    const src = 'a: 1\nmcp:\n  allow: [x]\nz: 2\n'
    expect(unsetPath(src, ['mcp', 'allow'])).toBe('a: 1\nz: 2\n')
  })

  test('a non-mapping parent leaves the text unchanged (nothing to descend into)', () => {
    // `a` is a scalar (`1`), not a mapping — `a.x` was never set, so there is
    // nothing to unset. (Previously this wiped the whole document to `""`:
    // `applyPlain` built a fresh `{}`, found it empty after the no-op delete,
    // and that `undefined` was read as "remove `a` entirely".)
    expect(unsetPath('a: 1\n', ['a', 'x'])).toBe('a: 1\n')
  })

  test('a non-mapping parent two levels deep also leaves the text unchanged', () => {
    const src = 'a:\n  b: 1\nz: 2\n'
    expect(unsetPath(src, ['a', 'b', 'x'])).toBe(src)
  })

  test('an ordinary nested unset still removes just the one key (regression guard)', () => {
    const src = 'a:\n  x: 1\n  y: 2\n'
    expect(unsetPath(src, ['a', 'x'])).toBe('a:\n  y: 2\n')
  })

  test('a comment block immediately preceding the removed section is left dangling (documented trade-off)', () => {
    // Span-preserving means comment-blind: the comment above `notify:` is
    // not part of that key's own span, so removing the section's one key
    // (which empties and removes `notify:` itself) leaves the comment
    // behind, now describing a setting that no longer exists.
    const src = `a: 1
# Explanatory comment about notify.
notify:
  author_notes: true
z: 2
`
    expect(unsetPath(src, ['notify', 'author_notes'])).toBe(
      `a: 1\n# Explanatory comment about notify.\nz: 2\n`,
    )
  })
})

describe('merge-key anchors (`<<: *anchor`)', () => {
  // A nested edit dedents the parent's lines into a standalone sub-document
  // (`spliceBlock`) to edit it in isolation, then re-indents the result back
  // in. When the sub-document merges in an anchor defined OUTSIDE the block
  // being extracted, that anchor is left behind — the cut-out fragment can no
  // longer resolve it. Rather than let that surface as the underlying
  // library's raw parse error (or an unhandled `ReferenceError` out of
  // `doc.toJS()`), `edit` detects it up front and throws a clear, actionable
  // `Error` naming the anchor — before anything is spliced, so the source
  // text is never touched.
  const EXTERNAL_ANCHOR = `defaults: &defaults
  a: 1
service:
  <<: *defaults
  mode: fast
`

  test('an alias whose anchor is defined outside the edited block throws a clear error', () => {
    expect(() => setPath(EXTERNAL_ANCHOR, ['service', 'mode'], 'slow')).toThrow(
      /'<<: \*defaults' inside it refers to an anchor defined outside that block/,
    )
  })

  test('the same holds for unsetPath, and the source is left untouched', () => {
    expect(() => unsetPath(EXTERNAL_ANCHOR, ['service', 'mode'])).toThrow(
      /'<<: \*defaults' inside it refers to an anchor defined outside that block/,
    )
  })

  test('an anchor defined and merged entirely within the edited block round-trips', () => {
    // Both `&features` and `<<: *features` live inside `service` here, so
    // dedenting `service` on its own keeps full context — no error, and
    // the merge key itself survives byte-for-byte.
    const src = `service:
  features: &features
    alpha: true
  extra:
    <<: *features
    x: 1
`
    expect(setPath(src, ['service', 'features', 'alpha'], false)).toBe(
      src.replace('alpha: true', 'alpha: false'),
    )
  })
})
