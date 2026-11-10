# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

Use GitHub private vulnerability reporting on the repository: open the
[Security tab](https://github.com/osdlc/osdlc/security) and choose
"Report a vulnerability".

Include the version, a short description, and steps to reproduce. A minimal
code sample helps.

## Supported versions

Only the latest release gets security fixes. While the version is 0.x, that
is the latest minor release. Upgrade to it.

## What to expect

This is a small project. We aim to reply within a week. We will tell you
whether we accept the report and keep you updated until a fix is released.
We will credit you in the release notes if you want that.

## Known upstream advisory

`remark-math` depends on `katex@^0.16`, a release range with published KaTeX
advisories. That dependency is outside this package's control. This package's
optional `katex` peer is `^0.19.1`, so a host that renders math should install
that release; `remark-math` still installs its own copy for parsing, which this
package never renders with. The renderer leaves KaTeX's `trust` option unset,
so `\href`, `\url` and the other trust-gated commands stay off.
