# The wikilink fixture vault

A deliberately pathological Obsidian vault, checked in as data, that pins every
behaviour recorded in the Obsidian link-resolution research: its input → output
table for resolution, the addressing-forms table, and the frontmatter-fidelity
measurement. Those record what Obsidian *does* with a given vault and a given
reference — the oracle our resolver is held to, not a description of its
internals.

It exists because the original measurements were taken against a real
documentation vault, and one of the findings — a genuine `plugin.md` collision
across two folders — was later fixed as a defect. Fixing the corpus destroyed
the evidence. A corpus should be correct; a fixture should be pathological.
This is the fixture. Nothing here is anybody's real notes, so nothing here gets
tidied.

`tests/obsidian_differential.rs` is the only reader. It loads this directory
through `CARGO_MANIFEST_DIR`, so it does not care what the current working
directory is.

## How to read the tables

**What it exercises** is the behaviour the file is here for. **Correct answer**
is *Obsidian's* answer — this file documents intent, so it states what Obsidian
does even where `LinkIndex` does something else. Where the two differ, the test
that pins the difference is named `diverges_…` and says so in its own comment.
Do not read this README as a description of `LinkIndex`.

Path lengths quoted below are in characters, because Obsidian breaks a tie by
character length. `LinkIndex` follows that rule too, and did not always: it used
to compare path segments, which disagrees whenever a deep-but-short path
competes with a shallow-but-long one.

## Resolution

| File | What it exercises | Correct answer (Obsidian) |
|---|---|---|
| `capabilities/plugin.md` | Half of the basename collision. 22 characters. | `[[plugin]]` from inside `capabilities/` — group A prefixes it, so it wins there |
| `glossary/plugin.md` | The other half. 18 characters. | `[[plugin]]` from anywhere outside `capabilities/` — shortest path wins |
| `capabilities/from-capabilities.md` | A source note in a colliding folder writing `[[plugin]]`. The source-folder tie-break, and the whole reason this fixture exists. | `capabilities/plugin.md` |
| `glossary/from-glossary.md` | The same link written in the other colliding folder. | `glossary/plugin.md` |
| `root-source.md` | The same link written at the vault root. Root's folder is `""`, which every path starts with, so group B is empty and the tie-break degenerates to shortest path. Also holds the rooted and dangling forms. | `glossary/plugin.md` |
| `glossary/terms/unique-term.md` | A unique basename, three segments deep, so `unique-term`, `terms/unique-term` and `glossary/terms/unique-term` are three distinct keys. Step 5's fast path. | All three forms, from anywhere, resolve here; the source folder never enters it |
| `suffix/target.md` | `[[suffix/target]]` where a longer path also ends with `suffix/target.md`. An exact path settles it before any suffix match is considered. | `suffix/target.md` |
| `deeper/suffix/target.md` | The longer path that also ends with it. | Reachable only as `[[deeper/suffix/target]]` |
| `note.md` | A vault-root file, for the rooted form `[[/note]]`. Also the `.md`-retry pair member. | `[[note]]`, `[[note.md]]` and `[[/note]]` all land here |
| `glossary.md` | A note whose name is also a folder name. `uniqueFileLookup` holds files only. | `[[glossary]]` is this file, never the `glossary/` directory |
| `sibling.md` | Rung 0 of the relative ladder (vault root). | — |
| `relative/sibling.md` | Rung 1. | `[[../sibling]]` written in `relative/nested/from-here.md` |
| `relative/nested/sibling.md` | Rung 2. | `[[./sibling]]` written in `relative/nested/from-here.md` |
| `relative/nested/from-here.md` | The source note carrying `[[./sibling]]` and `[[../sibling]]`. Step 6 resolves both against *this note's* folder. | The two rungs above, and they are different files |
| `length-versus-depth-long-folder/tie.md` | 38 characters, 2 segments. | Loses: the tie-break is character length |
| `x/y/tie.md` | 10 characters, 3 segments. Segments are one letter each on purpose — the case needs a path that is deep and short at once. | `[[tie]]` resolves here. 10 < 38 |
| `aaa/tied.md` | 11 characters, 2 segments. | Undefined. See below |
| `zzz/tied.md` | 11 characters, 2 segments — a genuine tie under every rule Obsidian applies. | Undefined: `Array.prototype.sort` is stable, so the winner is whichever file entered the index first. Stable within a session, not across machines or a cache rebuild |
| *(no file)* | `[[nowhere]]`, written in `root-source.md` and embedded in `parsing/embeds.md`. | `null`. The link renders unresolved and appears in `unresolvedLinks` |

`[[/glossary/plugin]]`, `[[/nowhere/plugin]]`, `[[/note]]` and
`[[/suffix/target]]` in `root-source.md` cover the rooted form: it matches by
exact path only, and a rooted miss is final — no suffix fallback, no basename
fallback. `[[/nowhere/plugin]]` is `null` in Obsidian.

`[[ary/plugin]]` and `[[made-up/unique-term]]` are asserted in the test file
rather than written into a note, because no author would write them. They cover
suffix matching being a raw string `endsWith` rather than a segment-aligned one:
`glossary/plugin.md` does end with `ary/plugin.md`, so Obsidian keeps it, while
`[[made-up/unique-term]]` suffix-matches nothing and is `null`.

## Parsing and Unicode

| File | What it exercises | Correct answer (Obsidian) |
|---|---|---|
| `note.md.md` | A filename that really ends in `.md.md`, beside a real `note.md`. | `[[note.md.md]]` is this file. `[[note.md]]` is `note.md`. Step 3's `.md` retry also lets `[[note.md]]` reach this file when `note.md` does not exist |
| `unicode/Привет` | Six two-byte Cyrillic characters, **no extension**. Byte 9 of the basename lands inside the fifth character. | Indexes and resolves as `[[Привет]]`. Any code slicing the last three bytes off this path to test for `.md` panics instead of mismatching — the defect this branch fixes |
| `unicode/a📝` | The same hazard with one four-byte character. | Indexes and resolves as `[[a📝]]` |
| `unicode/Café.md` | Precomposed `é` (U+00E9). | `[[Café]]` and `[[Cafe´]]` (decomposed) both resolve: Obsidian folds paths and link text to NFC before comparing |
| `unicode/ÉCOLE.md` | An uppercase non-ASCII name. | `[[école]]` resolves. Both sides are lowercased |
| `unicode/nbsp<U+00A0>name.md` | U+00A0 NO-BREAK SPACE inside a filename. | Obsidian folds U+00A0 in paths (`Ml`) **and** in link text (`WE`), so a link typed with either a plain space or U+00A0 resolves |
| `unicode/nnbsp<U+202F>name.md` | U+202F NARROW NO-BREAK SPACE inside a filename. | The path folds to a plain space; link text does **not** fold U+202F. So no link ever reaches this file. That asymmetry is Obsidian's own bug, recorded here rather than fixed |
| `parsing/pipes-and-sizes.md` | `[[target\|alias]]`; `![[img.png\|300x200]]`; `![[img.png\|alt text\|300]]`. | The target splits at the **first** `\|`; a size parses from the **last** segment matching `^\s*\d+\s*(?:x\s*\d+\s*)?$`. So `300x200` is a width and height, never a caption, and `alt text` in the middle stays a caption |
| `parsing/subpaths.md` | `[[note#heading]]`, `[[note#h#sub]]`, `[[note#^blockid]]`, `[[note\|alias#notaheading]]`, `[[#heading]]`, `[[#^blockid]]`, and the embed forms of each. | `parseLinktext` splits on the **first** `#` only. A same-file link (`[[#heading]]`) resolves to the containing note — step 0. A `#` after the first `\|` is part of the alias, not the subpath |
| `parsing/code-spans.md` | Wikilinks inside a fenced block, an inline span, a tilde fence, a double-backtick span, and an indented fence in a list item. Plus a multi-byte inline span. | Exactly one reference is harvested from this note: `glossary/terms/unique-term`. Obsidian's cache records nothing inside code, of any fence flavour |
| `parsing/markdown-links.md` | `[text](note.md)` and its neighbours: an `https:` URL, an `obsidian:` URI, a percent-encoded space, an angle-bracketed path holding a real space, `note.md.md`, a markdown image, and a markdown link to a PDF. | Obsidian caches a relative markdown link exactly like a wikilink. Absolute URLs are not references. `[doubled](note.md.md)` refers to `note.md.md`, not `note.md` |

## Embeds and non-markdown

| File | What it exercises | Correct answer (Obsidian) |
|---|---|---|
| `snippet.md` | The transclusion target for `![[snippet]]`. | Obsidian expands the body, frontmatter excluded, into the embedding note |
| `assets/diagram.png` | A peer resource. A real 1×1 PNG, not a stub. | `![[assets/diagram.png]]` renders the image. `[[diagram]]` does **not** resolve — non-markdown targets must carry their extension, because a bare stem is looked up as `diagram.md` |
| `assets/board.canvas` | A live canvas view. | Renders as a canvas. The compiler refuses it by name rather than inlining anything |
| `scripts/check.py` | A code file. | Renders as a grey `file-embed` box. Never inlined — inlining would put content in the output that the author cannot see in the editor |
| `parsing/embeds.md` | All four of the above, plus a plain `[[snippet]]` written twice so that two identical references exist in one note, plus `![[nowhere]]`. | Embeds and links are distinct kinds with distinct caches. `![[nowhere]]` renders a click-to-create placeholder and is reported, not expanded |

`![[assets/doc.pdf#page=3]]` appears in `parsing/subpaths.md` with no matching
file: it is a parsing case, not a resolution case, and a PDF earns no place in
the fixture just to make one fragment resolve.

## Frontmatter fidelity

`frontmatter/hazards.md` is one note carrying every shape Obsidian's `yaml@2`
serialiser drops or rewrites the moment anything writes the block. All of them
also carry wikilinks, because frontmatter links are what this crate harvests
from frontmatter.

| Key in `frontmatter/hazards.md` | Shape | What Obsidian's serialiser does to it |
|---|---|---|
| the leading `#` line | YAML comment | **Dropped** |
| `related` | Flow list, single-quoted items | Rewritten to a block list |
| `single` | Single-quoted scalar | Requoted to double quotes (or unquoted where droppable) |
| `meta` | Nested mapping, two levels deep | **Round-trips byte-identically** — the one shape that survives |
| `plain` | Unquoted scalar | Unchanged |

Obsidian's `FrontmatterLinkCache` carries the full YAML key path, so the link
under `meta.deeper.rel` is addressable as `meta.deeper.rel`. Frontmatter links
are typed fields, not prose: they exist to be *found*, for rename rewriting, not
to be published.

## Cases that cannot be real files

Two rows of the research cannot be checked in as filenames that behave the same
on macOS, Linux and Windows. They are covered in `obsidian_differential.rs` by
building the path as a string rather than putting it on disk, and they are
listed here so nobody concludes they were skipped.

| Case | Why it cannot be a file | How it is covered |
|---|---|---|
| A **decomposed (NFD)** filename, e.g. `Cafe` + U+0301 | git on macOS defaults to `core.precomposeunicode=true`, which reads working-tree paths back as NFC. An NFD path in the index checks out as NFD bytes and is then reported as a deleted NFD file plus an untracked NFC one — a permanently dirty tree on one platform only. | `unicode/Café.md` is the real, precomposed half. The NFD half is a string passed to `LinkIndex::build` in the test |
| A vault containing **only** `note.md.md`, with no `note.md` | It is a property of a one-file vault, not of a file. | An inline single-path `LinkIndex::build` in the test |

Two more things are asserted in the test rather than written into a note, for
the reason given above: the raw-`endsWith` probes `[[ary/plugin]]` and
`[[made-up/unique-term]]`, and the footnote subpath `[[note#[^fn1]]]`, whose
inner `[` makes the whole reference malformed to a body scanner and reachable
only through `parse_inner`.

## Housekeeping

This README is itself a file in the vault and is indexed like any other — it is
the fixture's only mixed-case ASCII name, and the case-folding test uses it as
such. `[[readme]]` resolves to it.

Adding a file changes what `[[…]]` means everywhere in the vault. Before adding
one, check its basename and every suffix of its path against the tables above,
and give it a row. A file with no row does not belong here.
