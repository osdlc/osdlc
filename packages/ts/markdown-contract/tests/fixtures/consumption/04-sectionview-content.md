## Summary

This decision adopts a generic TypeScript contract library for validating the
structure of our markdown documents. Frontmatter stays in Zod; section sequence
and nesting move to a combinator grammar; content leaves reuse Zod. The engine is
SDLC-agnostic and consumed as data per entity type.
^summary