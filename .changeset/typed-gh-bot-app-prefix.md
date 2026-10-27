---
'@osdlc/typed-gh': minor
---

Author logins also drop the `app/` prefix that gh's `--json` export puts on a bot author (`{"is_bot":true,"login":"app/osdlc-release"}`). So `prList`/`prView`, REST (`osdlc-release[bot]`) and GraphQL (`osdlc-release`) all give the same `login`, and the prefix marks the author as a bot. `normalizeAuthorLogin` strips it too. **Breaking:** a caller that matched `app/<name>` on `author.login` now sees `<name>`. To filter by a bot with `prList({ author })`, pass `app/<login>` or `<login>[bot]`: gh's `--author` does not match the bare form.
