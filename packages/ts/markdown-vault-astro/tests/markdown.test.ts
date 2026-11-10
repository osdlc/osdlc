import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parse as parseYaml } from 'yaml'
import { rewriteFile } from '../src/rewrite.ts'
import { fmAssetToUrl, fmUrlToAsset, imagesToEmbeds } from '../src/markdown.ts'
import type { AssetIndex } from '../src/assets.ts'

/** A stub index that mimics flat `_attachments` (every asset by basename). */
const flatIndex: AssetIndex = {
  resolve(target) {
    const file = target.split('#')[0]!.split('/').pop() ?? target
    return { vaultPath: `_attachments/${file}`, outSub: file, resolved: true }
  },
}

const toAstro = {
  direction: 'toAstro' as const,
  publicBase: '/_media',
  frontmatterAssets: ['cover'],
  assetIndex: flatIndex,
}
const toVault = {
  direction: 'toVault' as const,
  publicBase: '/_media',
  frontmatterAssets: ['cover'],
}

test('toAstro: embeds become images and copies are recorded', () => {
  const src = `---
title: "X"
cover: "[[a.jpg]]"
---

![[a.jpg]]

![[sub/b.png|A caption]]

[[Some Relation]] stays untouched.`
  const { text, copies } = rewriteFile(src, toAstro)
  assert.match(text, /cover: "\/_media\/a\.jpg"/)
  assert.match(text, /!\[a\.jpg\]\(\/_media\/a\.jpg\)/)
  assert.match(text, /!\[A caption\]\(\/_media\/b\.png\)/)
  assert.match(text, /\[\[Some Relation\]\] stays untouched\./)
  assert.deepEqual(copies.map((c) => c.destRel).sort(), ['a.jpg', 'b.png'])
})

test('toAstro: an embed in code stays as written', () => {
  const src = '~~~\n![[a.jpg]]\n~~~\n\n```\n![[b.png]]\n```\n\n`![[c.png]]` ![[d.png]]\n'
  const { text, copies } = rewriteFile(src, toAstro)
  assert.equal(
    text,
    '~~~\n![[a.jpg]]\n~~~\n\n```\n![[b.png]]\n```\n\n`![[c.png]]` ![d.png](/_media/d.png)\n',
  )
  assert.deepEqual(
    copies.map((c) => c.destRel),
    ['d.png'],
  )
})

test('toVault: images become embeds, relational wikilinks preserved', () => {
  const src = `---
title: "X"
cover: "/_media/a.jpg"
---

![](/_media/a.jpg)

![A caption](/_media/b.png)

[[Some Relation]] stays untouched.`
  const { text, copies } = rewriteFile(src, toVault)
  assert.match(text, /cover: "\[\[a\.jpg\]\]"/)
  assert.match(text, /!\[\[a\.jpg\]\]/)
  assert.match(text, /!\[\[b\.png\|A caption\]\]/)
  assert.match(text, /\[\[Some Relation\]\] stays untouched\./)
  assert.deepEqual(copies.map((c) => c.destRel).sort(), ['a.jpg', 'b.png'])
})

test('round-trip is stable for the body', () => {
  const original = `---
title: "Note"
cover: "/_media/cover.jpg"
---

Intro with [[A Link]].

![pic.jpeg](/_media/pic.jpeg)`
  const vault = rewriteFile(original, toVault).text
  const back = rewriteFile(vault, toAstro).text
  assert.equal(back, original)
})

test('external image URLs are left alone going toVault', () => {
  const src = `![ext](https://example.com/x.png)`
  const { text, copies } = rewriteFile(src, toVault)
  assert.equal(text, src)
  assert.deepEqual(copies, [])
})

test('a malformed percent sequence in an image src is left alone going toVault', () => {
  const src = `![chart](sale-50%.png)`
  const { text, copies } = rewriteFile(src, toVault)
  assert.equal(text, src)
  assert.deepEqual(copies, [])
})

test('a malformed percent sequence in a frontmatter asset value is left alone going toVault', () => {
  const src = `---
title: "X"
cover: "100%.png"
---

body`
  const { text } = rewriteFile(src, toVault)
  assert.match(text, /cover: "100%\.png"/)
})

test('toAstro: a non-_attachments embed keeps its sub-path and copies from there', () => {
  // Index reports the image lives at vault `diagrams/arch.png` (outside _attachments).
  const index: AssetIndex = {
    resolve: () => ({
      vaultPath: 'diagrams/arch.png',
      outSub: 'diagrams/arch.png',
      resolved: true,
    }),
  }
  const { text, copies } = rewriteFile('![[arch.png]]', { ...toAstro, assetIndex: index })
  assert.match(text, /!\[arch\.png\]\(\/_media\/diagrams\/arch\.png\)/)
  assert.deepEqual(copies, [{ srcRel: 'diagrams/arch.png', destRel: 'diagrams/arch.png' }])
})

/** An index that, like the real one, holds files with an extension and no notes. */
const fileIndex: AssetIndex = {
  resolve(target) {
    const file = target.split('#')[0]!.split('/').pop() ?? target
    const resolved = /\.[a-z0-9]+$/i.test(file) && !file.startsWith('missing')
    return { vaultPath: `_attachments/${file}`, outSub: file, resolved }
  },
}

test('toAstro: the embed kind comes from the target, and only images are rewritten', () => {
  const src = [
    '![[pic.png]]',
    '![[clip.mp4]]',
    '![[song.mp3]]',
    '![[doc.pdf|Spec]]',
    '![[Some Note]]',
    '![[Some Note#Part]]',
    '![[Some Note#^blk]]',
    '![[data.csv]]',
  ].join('\n\n')
  const { text, copies, missing } = rewriteFile(src, { ...toAstro, assetIndex: fileIndex })
  assert.equal(
    text,
    [
      '![pic.png](/_media/pic.png)',
      '![[clip.mp4]]',
      '![[song.mp3]]',
      '![[doc.pdf|Spec]]',
      '![[Some Note]]',
      '![[Some Note#Part]]',
      '![[Some Note#^blk]]',
      // A published file with no media extension is an image, as in the app.
      '![data.csv](/_media/data.csv)',
    ].join('\n\n'),
  )
  // Every media embed is still copied; a note embed names no file to copy.
  assert.deepEqual(
    copies.map((c) => c.destRel),
    ['pic.png', 'clip.mp4', 'song.mp3', 'doc.pdf', 'data.csv'],
  )
  assert.deepEqual(missing, [])
})

test('toAstro: a fragment on a media file does not make it a note', () => {
  // `#page=3` is Obsidian's PDF page syntax.
  const { text, copies } = rewriteFile('![[doc.pdf#page=3]]', { ...toAstro, assetIndex: fileIndex })
  assert.equal(text, '![[doc.pdf#page=3]]')
  assert.deepEqual(
    copies.map((c) => c.destRel),
    ['doc.pdf'],
  )
})

test('toAstro: each resolved media target is listed for the asset manifest', () => {
  const src = '![[pic.png]]\n\n![[clip.mp4|300]]\n\n![[Some Note]]\n\n![[missing.mp3]]'
  const { assets } = rewriteFile(src, { ...toAstro, assetIndex: fileIndex })
  assert.deepEqual(assets, { 'pic.png': 'pic.png', 'clip.mp4': 'clip.mp4' })
})

test('toAstro: a missing media file is reported; a missing note is not an asset', () => {
  const src = '![[missing.mp4]]\n\n![[missing.png]]\n\n![[No Such Note]]'
  const { text, copies, missing } = rewriteFile(src, { ...toAstro, assetIndex: fileIndex })
  assert.equal(text, '![[missing.mp4]]\n\n![missing.png](/_media/missing.png)\n\n![[No Such Note]]')
  assert.deepEqual(copies, [])
  assert.deepEqual(missing, ['missing.mp4', 'missing.png'])
})

test('toAstro: a sized image is left for the build; a size is never alt text', () => {
  const src = '![[a.png|300]]\n\n![[b.png|300x200]]\n\n![[c.png|A caption|300]]\n\n![[d.png|A|b]]'
  const { text, copies } = rewriteFile(src, toAstro)
  assert.equal(
    text,
    '![[a.png|300]]\n\n![[b.png|300x200]]\n\n![[c.png|A caption|300]]\n\n![A|b](/_media/d.png)',
  )
  assert.deepEqual(
    copies.map((c) => c.destRel),
    ['a.png', 'b.png', 'c.png', 'd.png'],
  )
})

test('vault -> Astro -> vault keeps every embed as written', () => {
  const vault = [
    '![[q.png]]',
    '![[r.png|A caption]]',
    '![[p.png|300]]',
    '![[s.png|Caption|300]]',
    '![[clip.mp4]]',
    '![[doc.pdf#page=3]]',
    '![[Note#H]]',
    '![[Note#^blk]]',
  ].join('\n\n')
  const astro = rewriteFile(vault, { ...toAstro, assetIndex: fileIndex }).text
  assert.equal(rewriteFile(astro, toVault).text, vault)
})

test('toVault: an alt that is only the file name is not an alias', () => {
  const { text } = rewriteFile('![b.png](/_media/sub/b.png)\n\n![b](/_media/b.png)', toVault)
  assert.equal(text, '![[sub/b.png]]\n\n![[b.png|b]]')
})

test('toAstro: a non-image embed in code stays as written too', () => {
  const src = '`![[clip.mp4]]` and ![[clip.mp4]]\n\n```\n![[Some Note]]\n```\n'
  const { text, copies } = rewriteFile(src, { ...toAstro, assetIndex: fileIndex })
  assert.equal(text, src)
  assert.deepEqual(
    copies.map((c) => c.destRel),
    ['clip.mp4'],
  )
})

test('an asset name with parentheses survives vault -> Astro -> vault', () => {
  const vault = '![[Screenshot (1).png]]\n\n![[smile :).png]]'
  const astro = rewriteFile(vault, toAstro).text
  assert.equal(
    astro,
    '![Screenshot (1).png](/_media/Screenshot%20%281%29.png)\n\n![smile :).png](/_media/smile%20%3A%29.png)',
  )
  const back = rewriteFile(astro, toVault)
  assert.equal(back.text, vault)
  assert.deepEqual(
    back.copies.map((c) => c.srcRel),
    ['Screenshot (1).png', 'smile :).png'],
  )
})

test('toAstro: a frontmatter value already in published URL form is decoded before it is resolved', () => {
  const index: AssetIndex = {
    resolve: (t) => ({ vaultPath: `_attachments/${t}`, outSub: t, resolved: t === 'my img.png' }),
  }
  assert.deepEqual(fmAssetToUrl('/_media/my%20img.png', '/_media', index), {
    value: '/_media/my%20img.png',
    copy: { srcRel: '_attachments/my img.png', destRel: 'my img.png' },
    missing: null,
  })
})

test('toVault: a markdown image in a code fence or code span stays as written', () => {
  const src = '```md\n![x](/_media/a.png)\n```\n\n`![y](/_media/b.png)` ![z](/_media/c.png)\n'
  assert.deepEqual(imagesToEmbeds(src, '/_media'), {
    body: '```md\n![x](/_media/a.png)\n```\n\n`![y](/_media/b.png)` ![[c.png|z]]\n',
    assets: ['c.png'],
    embeds: [],
    links: [],
  })
})

test('toVault: media embeds the forward rewrite left in place are copied back too', () => {
  const src =
    '![[clip.mp4]]\n\n![[pic.png|300]]\n\n![[doc.pdf#page=2]]\n\n![[Some Note]]\n\n`![[code.mp4]]`'
  const { text, copies } = rewriteFile(src, toVault)
  assert.equal(text, src)
  assert.deepEqual(
    copies.map((c) => c.srcRel),
    ['clip.mp4', 'pic.png', 'doc.pdf'],
  )
  // The build manifest says where each one was published.
  const mapped = rewriteFile('![[clip.mp4]]', {
    ...toVault,
    mediaPath: (t) => (t === 'clip.mp4' ? 'media/clip.mp4' : null),
  })
  assert.deepEqual(mapped.copies, [{ srcRel: 'media/clip.mp4', destRel: 'media/clip.mp4' }])
})

test('toVault: reserved characters the forward rewrite encoded are decoded', () => {
  const vault = '![[Q&A, v1+2.png]]'
  const astro = rewriteFile(vault, toAstro).text
  assert.equal(astro, '![Q&A, v1+2.png](/_media/Q%26A%2C%20v1%2B2.png)')
  const back = rewriteFile(astro, toVault)
  assert.equal(back.text, vault)
  assert.deepEqual(back.copies, [{ srcRel: 'Q&A, v1+2.png', destRel: 'Q&A, v1+2.png' }])
  assert.deepEqual(fmUrlToAsset('/_media/Q%26A%2C%20v1%2B2.png', '/_media'), {
    value: '[[Q&A, v1+2.png]]',
    asset: 'Q&A, v1+2.png',
  })
})

test('frontmatter assets: only the top-level key is rewritten', () => {
  const nested = rewriteFile(
    '---\nseo:\n  cover: "https://cdn.example.com/og.png"\ncover: "[[hero.png]]"\n---\n\nbody',
    toAstro,
  )
  assert.equal(
    nested.text,
    '---\nseo:\n  cover: "https://cdn.example.com/og.png"\ncover: "/_media/hero.png"\n---\n\nbody',
  )
  assert.deepEqual(nested.copies, [{ srcRel: '_attachments/hero.png', destRel: 'hero.png' }])

  const scalar = rewriteFile(
    '---\ndescription: |\n  cover: none here\ncover: "[[hero.png]]"\n---\n\nbody',
    toAstro,
  )
  assert.equal(
    scalar.text,
    '---\ndescription: |\n  cover: none here\ncover: "/_media/hero.png"\n---\n\nbody',
  )
  assert.deepEqual(scalar.copies, [{ srcRel: '_attachments/hero.png', destRel: 'hero.png' }])
})

test('toVault: an alt that reads as a size is dropped, not turned into a size', () => {
  assert.equal(imagesToEmbeds('![300](/_media/pic.png)', '/_media').body, '![[pic.png]]')
  assert.equal(imagesToEmbeds('![Chart|200x100](/_media/pic.png)', '/_media').body, '![[pic.png]]')
  assert.equal(imagesToEmbeds('![a|b](/_media/pic.png)', '/_media').body, '![[pic.png|a|b]]')
})

test('a [[file.pdf]] link publishes its file both ways, like an embed', () => {
  const astro = rewriteFile('See [[report.pdf]] and [[Some Note]].', toAstro)
  assert.equal(astro.text, 'See [[report.pdf]] and [[Some Note]].')
  assert.deepEqual(astro.copies, [{ srcRel: '_attachments/report.pdf', destRel: 'report.pdf' }])
  assert.deepEqual(astro.assets, { 'report.pdf': 'report.pdf' })
  const published = (t: string) => astro.assets[t] ?? null
  assert.deepEqual(rewriteFile(astro.text, { ...toVault, mediaPath: published }).copies, [
    { srcRel: 'report.pdf', destRel: 'report.pdf' },
  ])
})

test('toVault: a media link the transform did not publish is not copied', () => {
  // an Astro-authored `[[photo.png]]` with no file behind it
  assert.deepEqual(rewriteFile('See [[photo.png]].', toVault).copies, [])
  assert.deepEqual(
    rewriteFile('See [[photo.png]].', { ...toVault, mediaPath: () => null }).copies,
    [],
  )
})

test('toVault: an encoded / in a src stays encoded in the embed', () => {
  assert.equal(imagesToEmbeds('![x](/_media/a%2Fb.png)', '/_media').body, '![[a%2Fb.png|x]]')
  assert.equal(fmUrlToAsset('/_media/a%2Fb.png', '/_media').value, '[[a%2Fb.png]]')
})

test('toVault: a src whose name no embed can hold stays an image, and its file is still copied', () => {
  // `[`, `]`, `|` and `#` break the `[[target|alias#fragment]]` syntax.
  const src = '![x](/_media/img%5B1%5D.png) ![y](/_media/a%7Cb%23c.png)'
  assert.deepEqual(imagesToEmbeds(src, '/_media'), {
    body: src,
    assets: ['img[1].png', 'a|b#c.png'],
    embeds: [],
    links: [],
  })
  assert.deepEqual(fmUrlToAsset('/_media/img%5B1%5D.png', '/_media'), {
    value: '/_media/img%5B1%5D.png',
    asset: 'img[1].png',
  })
})

test('frontmatter assets: a mapping indented as a whole still has its keys rewritten', () => {
  const res = rewriteFile(
    '---\n  cover: "[[hero.png]]"\n  seo:\n    cover: x\n---\n\nbody',
    toAstro,
  )
  assert.equal(res.text, '---\n  cover: "/_media/hero.png"\n  seo:\n    cover: x\n---\n\nbody')
})

test('toAstro: only a top-level frontmatter asset key is rewritten', () => {
  const src = '---\nmeta:\n  cover: other.png\ncover: img.png\n---\nbody\n'
  const { text, copies } = rewriteFile(src, toAstro)
  assert.equal(text, '---\nmeta:\n  cover: other.png\ncover: "/_media/img.png"\n---\nbody\n')
  assert.deepEqual(
    copies.map((c) => c.destRel),
    ['img.png'],
  )
})

test('a YAML null frontmatter asset value is left alone both ways', () => {
  for (const v of ['null', 'Null', 'NULL', '~']) {
    const src = `---\ncover: ${v}\n---\nbody\n`
    const astro = rewriteFile(src, toAstro)
    assert.equal(astro.text, src)
    assert.deepEqual(astro.copies, [])
    assert.deepEqual(astro.missing, [])
    assert.equal(rewriteFile(src, toVault).text, src)
  }
  // A quoted "null" is a string, not a null.
  assert.match(rewriteFile('---\ncover: "null"\n---\n', toAstro).text, /cover: "\/_media\/null"/)
})

test('a frontmatter asset value is read and written as a YAML scalar', () => {
  const fm = (text: string) => parseYaml(text.split('---\n')[1]!) as Record<string, unknown>
  const vault = (line: string) => rewriteFile(`---\n${line}\n---\nbody\n`, toVault).text
  const astro = (line: string) => rewriteFile(`---\n${line}\n---\nbody\n`, toAstro)

  // A trailing comment is not part of the value.
  assert.deepEqual(fm(vault('cover: "/_media/img.png" # hero')), { cover: '[[img.png]]' })
  const commented = astro('cover: "[[img.png]]" # hero')
  assert.deepEqual(fm(commented.text), { cover: '/_media/img.png' })
  assert.deepEqual(
    commented.copies.map((c) => c.destRel),
    ['img.png'],
  )
  assert.deepEqual(fm(astro('cover: [[img.png]] # hero').text), { cover: '/_media/img.png' })

  // A rewritten line keeps its trailing comment.
  const line = (text: string) => text.split('\n')[1]
  assert.equal(
    line(astro('cover: "[[img.png]]" # keep me').text),
    'cover: "/_media/img.png" # keep me',
  )
  assert.equal(
    line(astro("cover: '[[it''s.png]]'  # a 'q'").text),
    `cover: "/_media/it's.png"  # a 'q'`,
  )
  assert.equal(line(astro('cover: [[img.png]] # hero').text), 'cover: "/_media/img.png" # hero')
  assert.equal(line(vault('cover: "/_media/a\\"b.png" # x')), 'cover: "[[a\\"b.png]]" # x')

  // A value that is not rewritten keeps its line as written.
  for (const line of [`cover: 'say "hi"'`, 'cover: https://x.com/a\\b.png']) {
    assert.equal(vault(line), `---\n${line}\n---\nbody\n`)
  }

  // A rewritten value is escaped, so it parses back to what was meant.
  assert.deepEqual(fm(vault(`cover: '/_media/a"b.png'`)), { cover: '[[a"b.png]]' })
  assert.deepEqual(fm(vault('cover: "/_media/a\\\\b.png"')), { cover: '[[a\\b.png]]' })
})

test('an asset name with reserved URL characters round-trips', () => {
  const vault = '---\ncover: "[[x,y.png]]"\n---\n![[a&b.png]]\n\n![[sub/c=d;e+f@g$.png]]\n'
  const astro = rewriteFile(vault, toAstro).text
  assert.match(astro, /!\[a&b\.png\]\(\/_media\/a%26b\.png\)/)
  const back = rewriteFile(astro, toVault)
  assert.equal(back.text, '---\ncover: "[[x,y.png]]"\n---\n![[a&b.png]]\n\n![[c=d;e+f@g$.png]]\n')
  assert.deepEqual(back.copies.map((c) => c.srcRel).sort(), [
    'a&b.png',
    'c=d;e+f@g$.png',
    'x,y.png',
  ])
})

test('toVault: an image in code stays as written', () => {
  const src =
    '```md\n![cover](/_media/cover.png)\n```\n\n`![x](/_media/y.png)` 😀 ![z](/_media/z.png)\n\n`😀` ![w `c`](/_media/w.png)\n'
  const { text, copies } = rewriteFile(src, toVault)
  assert.equal(
    text,
    '```md\n![cover](/_media/cover.png)\n```\n\n`![x](/_media/y.png)` 😀 ![[z.png|z]]\n\n`😀` ![[w.png|w `c`]]\n',
  )
  assert.deepEqual(
    copies.map((c) => c.srcRel),
    ['z.png', 'w.png'],
  )
})

test('frontmatter block scalars and other YAML structure stay byte-identical', () => {
  const fm = [
    'title: X',
    'cover: |',
    '  a.jpg',
    '  cover: [[a.jpg]]',
    'desc: >-',
    '  cover: a.jpg',
    '  b.jpg',
    '',
  ].join('\n')
  for (const key of ['cover', 'desc']) {
    for (const header of ['|', '|-', '>', '>-', '|2+']) {
      const src = `---\n${key}: ${header}\n  a.jpg\n  b.png\n---\nbody\n`
      const r = rewriteFile(src, { ...toAstro, frontmatterAssets: [key] })
      assert.equal(r.text, src, `${key}: ${header}`)
      assert.deepEqual(r.copies, [])
      assert.deepEqual(r.missing, [])
    }
  }
  const src = `---\n${fm}---\nbody\n`
  const r = rewriteFile(src, { ...toAstro, frontmatterAssets: ['cover', 'desc'] })
  assert.equal(r.text, src)
  assert.deepEqual(r.copies, [])
})

test('a real asset field still rewrites beside a block scalar', () => {
  const src = '---\ncover: "[[a.jpg]]"\ndesc: |\n  cover: a.jpg\n---\n'
  const r = rewriteFile(src, { ...toAstro, frontmatterAssets: ['cover', 'desc'] })
  assert.equal(r.text, '---\ncover: "/_media/a.jpg"\ndesc: |\n  cover: a.jpg\n---\n')
  assert.equal(r.copies.length, 1)
})

test('flow, anchored, aliased and tagged frontmatter values stay byte-identical', () => {
  const values = [
    '[a.png, b.png]',
    '{ file: a.png }',
    '&a x.png',
    '&anchor my photo.png',
    '&a |',
    '&a >-',
    '*a',
    '!!str x.png',
    '!!str >-',
    '!tag my photo.png',
    '!!str "x.png"',
  ]
  for (const value of values) {
    const tail = /[|>]-?$/.test(value) ? '  a.png\n' : ''
    const src = `---\ncover: ${value}\n${tail}---\nbody\n`
    for (const direction of [toAstro, toVault]) {
      const r = rewriteFile(src, { ...direction, frontmatterAssets: ['cover'] })
      assert.equal(r.text, src, `cover: ${value}`)
      assert.deepEqual(r.copies, [])
      assert.deepEqual(r.missing, [])
    }
  }
})
