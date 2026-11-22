---
id: D-05
type: decision
state: accepted
created: 2026-11-22
---

# D-05: Link resolution

## Decision

`createLinkResolver` resolves a target in this order, and `scanVault` and `createVaultIndex` use
it for every wikilink and embed:

1. An exact vault path. A target with no extension tries the `.md` note before a file of that bare
   name.
2. The extension rules. A target with an extension matches the file with that name and never a
   same-name note. A target with no extension matches a `.md` note, then a file with no extension,
   and never an attachment such as `note.png`.
3. The shortest path among files of the same name.

Matching ignores case. A folder-qualified target must match whole path segments, and stays
unresolved when no file in that folder matches. A relative target (`./sib`, `../b/note`) names
one path, joined onto the folder of the note it is written in, and stays unresolved when no file
is there or the path leaves the vault.

## Why

- This is how Obsidian resolves a link, so a vault reads the same here as in the application.
- A link that names an image must not land on a note of the same name, and the reverse.
- Falling back to a same-name file in another folder would hide a broken folder-qualified link.
- Shortest path is Obsidian's tie-break for a name that more than one file has.

## Consequences

- The Rust `markdown-corpus` crate resolves by its own rule, so the two can differ. See
  [D-04](D-04-planned-corpus-model.md).
