# Contested names prefer the linking note's folder

## Decision

When a link target matches more than one file, the resolver picks one file
with these rules, in order:

1. An exact vault path wins over a partial match.
2. A candidate in the linking note's folder wins.
3. Otherwise the shortest full path wins, measured in characters, not in
   path segments.
4. A remaining tie is broken by a fixed path order that ignores case and
   accents, so the answer never depends on input order.

`LinkIndex::resolve_from` applies rule 2. `LinkIndex::resolve` has no linking
note, so it skips rule 2.

## Why

This is the behaviour table's rule order. The tests check each rule,
including the character count: `x/y/tie.md` beats
`long-folder/tie.md` though it has more segments.

## Consequences

- The same link can open different files from different notes. A caller that
  knows the linking note should use `resolve_from`.
- The folder rule lives in one public function, `prefer_in_folder`, so a tool
  that keeps its own candidate lists, such as a rename planner, decides
  contested names the same way the index does.
