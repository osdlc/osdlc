---
'@osdlc/frontmatter-lossless': minor
---

Add `newShape(opts?)`, with its options type `NewShapeOptions`: the
`NoteShape` for a new note, one with no source text to `split`. Both fences
end in `eol` (`'\n'` by default, or `'\r\n'`), and `bom` (default `false`)
adds a byte-order mark. `compose(yaml, body, newShape())` gives
`---\n<yaml>\n---\n<body>`. Pass the YAML text the way `split` returns it,
without the line break before the closing fence. Until now there was no
supported way to write a new note, because a `NoteShape` must not be built by
hand.
