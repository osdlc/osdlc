# Release brief

## Summary

This release consolidates the long-running migration work that has spanned the previous three
iterations, retiring the legacy line scanners, the duplicated frontmatter slicers, and the
hand-maintained alias tables that had accumulated across the entity package over many releases.
It introduces the combinator grammar as the single substrate for all structure validation, moves
every content assertion onto typed Zod leaves projected over positioned nodes, and unifies the
frontmatter and body planes behind one validation pass so that consumers receive a single ordered
findings list instead of three disjoint ones. Downstream tooling no longer reconstructs section
containment by hand, because the projection now hands back a fully positioned section tree, and the
typed object model exposes that same tree as navigable, column-typed views with source positions
preserved end to end.
^summary