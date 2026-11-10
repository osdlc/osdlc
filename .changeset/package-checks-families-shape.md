---
'@osdlc/package-checks': minor
---

The exported `Families` type is now `Map<string, { implementations: string[]; readers: string[] }>`, where it was `Map<string, string[]>`. This changes what `readFamilies` returns and the `families` option of `pick`. A caller that builds a `Families` map by hand wraps each list as `{ implementations, readers: [] }`. `readers` are the libraries whose tests read a family's suite without being twins of the reference: a change under a suite or any implementation still runs them, but a change under one reader runs no other.
