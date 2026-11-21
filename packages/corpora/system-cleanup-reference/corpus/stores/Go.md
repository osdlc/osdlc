---
slug: go
category: toolchain-manager
vendor: Google (The Go Authors)
homepage: https://go.dev
docs: https://pkg.go.dev/cmd/go
repository: https://github.com/golang/go
license: BSD-3-Clause
open_source: true
platforms:
- macos
- linux
- windows
cli: go
checked: '2026-11-21'
sources:
- '[go command - cmd go](../documents/The%20Go%20Authors/go%20command%20-%20cmd%20go.md)'
- '[Go os package](../documents/The%20Go%20Authors/Go%20os%20package.md)'
- '[Go Modules Reference](../documents/The%20Go%20Authors/Go%20Modules%20Reference.md)'
---

The go command builds Go programs and manages module dependencies. It fills disks with a build cache (go-build in the user cache directory) and a module cache of downloaded, read-only module sources under GOPATH/pkg/mod, which has no size limit and is never pruned automatically.

## Open

- in use: No documented lock file or daemon marks the Go caches as in use; only the go process itself (and tools such as gopls) use them.
- build directories: No source names a project-local build directory for Go; `go build` writes only the final binary to the working directory, and vendor/ is usually committed source, not a cache.
