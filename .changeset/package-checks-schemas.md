---
"@osdlc/package-checks": minor
---

`package-checks ts` accepts a package's JSON Schemas, as S-package-shape-ts now allows. A schema export is any `exports` key or target under `./schemas/`, and it must be the plain `"./schemas/<name>.json": "./schemas/<name>.json"`: a target in another folder, a key outside `schemas/`, a target that is not the key, a pattern, a nested path or a conditions object fails the check. Every file the tarball ships under `schemas/` must be a `<name>.json` with that export, and every schema export must name a file the tarball ships. `shapeTs.schemaProblems` holds the check.
