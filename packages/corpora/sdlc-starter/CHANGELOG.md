# @osdlc/corpus-sdlc-starter

## 0.1.0

### Minor Changes

- e54b989: The first release of `@osdlc/corpus-sdlc-starter`: a starter knowledge base for an sdlc planning
  corpus, with two draft principles. Its types come from `@osdlc/corpus-profile-sdlc`, a peer
  dependency. A repo names the starter under `references` in its corpus's root file and cites its
  records by id, such as `"[[P-0002]]"`. `corpus-schema sync` writes the copy the wikilink needs, in
  `_references/`. It needs `@osdlc/corpus-schema` 0.3.0 or later. Licence `MIT OR Apache-2.0`.

### Patch Changes

- Updated dependencies [e54b989]
  - @osdlc/corpus-profile-sdlc@0.1.0
