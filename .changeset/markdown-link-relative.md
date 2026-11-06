---
'@osdlc/markdown-link': minor
---

**Breaking:** markdown link destinations are read as CommonMark reads an inline link, so more links are found. A title in `"…"`, `'…'` or `(…)` may follow the URL (`[a](a.md "Hint")`), parentheses that balance may sit in the URL (`[Notes](notes/Foo%20(beta).md)`), a `<…>` URL may hold spaces (`[c](<sp ace.md>)`), and whitespace may come around the URL and title. New: `BodyLink.title` holds a markdown link's title as written (`null` for none and for wikilinks), and `ScanOptions.allMarkdownLinks` reads every relative inline Markdown link whatever its target, such as a `.yaml` file or a folder. Matches the Rust crate's 0.9.0.
