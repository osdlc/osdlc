---
'@osdlc/markdown-link': minor
---

**Breaking:** markdown link destinations are read much as CommonMark reads an inline link, so more links are found. A title in `"…"`, `'…'` or `(…)` may follow the URL (`[a](a.md "Hint")`), parentheses that balance may sit in the URL (`[Notes](notes/Foo%20(beta).md)`), a `<…>` URL may hold spaces (`[c](<sp ace.md>)`), and whitespace may come around the URL and title. A title and a `<…>` URL stay on one line. A Markdown link that is not kept is stepped over whole, so a `[[x]]` in its title is not a wikilink. Two links are no longer read: one with unbalanced parentheses in the URL, and one starting with `//`, which names a host. New: `BodyLink.title` holds a markdown link's title as written (`null` for none and for wikilinks), and `ScanOptions.allMarkdownLinks` reads every relative inline Markdown link whatever its target, such as a `.yaml` file or a folder. Matches the Rust crate's 0.9.0.
