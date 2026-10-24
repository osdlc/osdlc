---
'@osdlc/typed-git': patch
---

Fix two type errors under TypeScript 5.9. The emitted `outcome.d.ts` failed with TS2536, because `Soft<C>` used a key on `Triable<C>` that TS 5.x could not prove valid. The source failed with TS2322, because `Git.soft` and `AsyncGit.soft` inferred `this` instead of the class type. A new `typecheck:ts59` script checks the package under 5.9.
