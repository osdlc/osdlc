---
'@osdlc/typed-gh': minor
---

`graphql` (experimental) reads a partial answer with `{ partial: true }`. Each page comes back as a `GraphqlPage`, its `data` with its `errors` (`GraphqlError`: `message`, `type`, `path`), so a batch of aliased lookups keeps the ones that worked when one is gone. gh exits 1 for such a response; the partial form reads it as the answer on the plain method, `try` and `soft`. It still fails when there is no `data` to read, when gh failed for another reason, or when `paginate` stopped at a page with errors that has a next page. `nodesAt(pages, path, { partial: true })` joins one connection across partial pages and returns `PartialNodes`: the nodes and every page's errors. Without `partial`, nothing changes. There is no page cap: `paginate` follows every page, and a caller that needs to stop early pages with `$endCursor` itself, as the README shows. The `try` and `soft` types now keep both overloads of an overloaded method.
