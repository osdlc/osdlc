---
number: 23
title: Claims profile
detail: npm package
status: doing
type: functional
milestone: "[m-npm](../milestones/m-npm.md)"
after:
  - "[21 Release here](21%20Release%20here.md)"
  - "[36 Release 0.3.0](36%20Release%200.3.0.md)"
---

The claims profile. The example from task 4 is already in the right place. The profile's types are
open: a proposition's object can be any JSON value, and consumers add their own kinds. This follows
the downstream review in [osdlc/markdown#8](https://github.com/osdlc/markdown/issues/8). This task
adds the profile wrapper, a corpus with only types, as the package
`@osdlc/corpus-profile-claims`, versioned. The package is built at `profiles/claims/` as 0.1.0 in
[#15](https://github.com/osdlc/markdown/pull/15), and is not published. The claims example extends
it by path. Publishing it from this repo still needs `profiles/*` added to the workspace and the
owner staging the npm name once. The release setup from
[#10](https://github.com/osdlc/markdown/pull/10) has merged. Corpora then list it by package name
under `extends` in their root file and use `x-extends` instead of holding full copies.
harness-reference and the evidence project switch over. After 21 and 36: publishing from this repo
needs its release setup, and the profile is checked with a corpus-schema that knows `extends`. It no
longer waits on 31. The profile can ship with its statements using relative links and a pattern
check for evidence lines. When 31 lands, a new profile version switches them to `x-ref`. If the
copies start to drift before then, we could release the profile from osdlc/osdlc first. In progress in
[#15](https://github.com/osdlc/markdown/pull/15).
