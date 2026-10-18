---
'@osdlc/frontmatter-lossless': minor
---

`Split` has a new `unterminated` field. It is `true` when a note starts with a
valid opening fence (`---` and a line break, after an optional BOM) and no
closing `---` line follows. `yaml` is still `null` and `body` the whole text,
as before, so only a caller that wants to report the note as malformed needs
to read it. Until now such a caller had to repeat the opening-fence check
itself.
