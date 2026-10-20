# API reference

Generated from the TypeScript source of the three entry points, so it always matches
the shipped surface. Each module below has its own overview page listing its exports.

| Module | Layer | Import | Runtime deps |
|---|---|---|---|
| `@osdlc/intersect` | L1 path API | `import { intersects } from "@osdlc/intersect"` | none |
| `@osdlc/intersect/segments` | L0 core | `import { search } from "@osdlc/intersect/segments"` | none |
| `@osdlc/intersect/fs` | L2 filesystem | `import { filesInScope } from "@osdlc/intersect/fs"` | `tinyglobby` |

Start with `intersects`, `matches`, `overlapping`, and `witness` on the path API.
