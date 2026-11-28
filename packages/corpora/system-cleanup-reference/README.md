# System cleanup reference

A cited record of where developer tools and apps keep data that can be reclaimed from disk, and
how to reclaim it safely: package managers, toolchain managers, build tools and SDKs, OS package
managers, local model runtimes and hubs, container runtimes and editors. Every value has a date
and a quoted source. workstation-cleaner's plugins are meant to be built from it ([#952](https://github.com/osdlc/osdlc/issues/952), [#991](https://github.com/osdlc/osdlc/issues/991)).

The record is one [corpus-schema](../../conformance/corpus-schema/SPEC.md)
corpus. Its types come from the [system cleanup profile](../../profiles/system-cleanup/README.md), which builds
on the [claims profile](../../profiles/claims/README.md). The
package is not published yet ([B-0001](docs/planning/backlog/B-0001-publish-the-system-cleanup-profile-and-reference.md)).

## Layout

- `corpus/system-cleanup-reference.corpus-schema.md`: the root file. It extends the system cleanup
  profile and uses all its types as they are (`uses: [system-cleanup/*]`), so no type folder holds a schema file.
- `corpus/stores/`: one record per tool or app, named after the product as the vendor writes it,
  such as `pnpm.md` or `LM Studio.md`. A `slug` is its stable key, and `category` says which
  workstation-cleaner plugin family covers it. `system: true` marks data that needs root to clean.
- `corpus/subjects/`: the six questions asked of every store, each with a `valueSchema`:

  | Slug | Question |
  | --- | --- |
  | `location/data-dirs` | Where its reclaimable data lives on each platform, and what deleting it costs (`re-download`, `rebuild` or `lost`) |
  | `location/override` | Which environment variables or settings move it |
  | `clean/command` | Its own command to reclaim space, and what each removes |
  | `inventory/command` | Which command lists what it holds, or its size |
  | `liveness/in-use` | Which processes or lock files show it is in use |
  | `project/build-dirs` | Which directories it makes inside a project, and the file that marks the project |

- `corpus/statements/`: one record per answer, in a folder per store, extending the claims
  statement with `store`, `subject`, `scope` and `status`.
- `corpus/study-results/`: one record per quote, in a folder per store, extending the claims
  study result with `kind`, `store`, `observed`, `locator` and `excerpt`.
- `corpus/documents/`: one record per page, in a folder per publisher.

A question no source settles has no statement; it is listed under "Open" in the store's body.

## How it was made

Each store was researched from its vendor's docs, man pages and source, preferring raw repository
files so a quote matches the source text. Every excerpt was then fetched again and checked against
the page text (tags stripped, entities decoded, whitespace collapsed); a quote that did not match
was dropped, and an answer left with no supporting quote became an open question. Quotes that
hold a Markdown link, or an example home folder under /home, were left out.

Strength follows the evidence as in the harness reference: source or help text is strong (S),
vendor docs or a changelog moderate (M), an issue or a third-party page weak (W).

Not covered yet: apk (Alpine's GitLab refuses automated fetches, so its quotes could not be
checked), and Windows paths for many stores, which their docs leave out. Each store's "Open"
section lists what is missing.

## Coverage

The strength of each current statement, by store and subject. A blank is an open question.

| Store | Category | data dirs | override | clean | inventory | in use | project dirs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Bun | language-package-manager | M | M | M | M |  | M |
| Bundler | language-package-manager | M | M | M | M |  | M |
| Cargo | language-package-manager | M | M | M |  | S | M |
| CocoaPods | language-package-manager | S | S | M | M |  | S |
| Composer | language-package-manager | M | M | M | M |  | M |
| Conan | language-package-manager | S | S | M | M | M | S |
| conda | language-package-manager | S | M | M | M |  | M |
| Coursier | language-package-manager | M | M | M | M |  |  |
| Dart | language-package-manager | S | M | S |  |  | M |
| Deno | language-package-manager | S | S | M | M |  | M |
| Hex | language-package-manager | S | M | M | M |  |  |
| npm | language-package-manager | S | M | M | M |  | M |
| NuGet | language-package-manager | M | M | M | M |  | M |
| pip | language-package-manager | S | S | M | M |  |  |
| pnpm | language-package-manager | M | M | M | M |  | M |
| Poetry | language-package-manager | S | S | S | S |  | S |
| RubyGems | language-package-manager | M | M | M | M |  |  |
| uv | language-package-manager | M | M | M | M | M | M |
| vcpkg | language-package-manager | M | M | M | M |  | M |
| Yarn | language-package-manager | S | S | M | M |  | M |
| asdf | toolchain-manager | S | M | M | M | S |  |
| Go | toolchain-manager | M | M | M | M |  |  |
| Kotlin Native | toolchain-manager | S | S |  |  |  |  |
| mise | toolchain-manager | S | S | M | M | S |  |
| nvm | toolchain-manager | S | M | S | S | M |  |
| proto | toolchain-manager | M | M | M | M |  |  |
| pyenv | toolchain-manager | S | S | S | S |  |  |
| rustup | toolchain-manager | S | M | S | S |  |  |
| Volta | toolchain-manager | S | M | S | S | S |  |
| Apache Maven | build-tool | M | M | M |  | M | M |
| Bazel | build-tool | M | M | M | M | M | M |
| Cabal | build-tool | M | M | M | M |  | M |
| ccache | build-tool | M | M | M | M |  |  |
| Gradle | build-tool | M | M | M |  | M | M |
| Mix | build-tool | M | M | M | M |  | M |
| sbt | build-tool | M | M | M | M | M | M |
| Stack | build-tool | M | M | M | M | M | M |
| Swift Package Manager | build-tool | S | S | M |  |  | M |
| Android SDK | sdk | M | M | M | M |  | M |
| Flutter | sdk | S |  | S |  | S | M |
| NET SDK | sdk | M | M | M | M | M | M |
| Xcode | sdk | M | M | M | M |  |  |
| Zig | sdk | S | S |  | S |  | S |
| APT | os-package-manager | M | M | M | M | M |  |
| DNF | os-package-manager | M | M | M |  |  |  |
| Flatpak | os-package-manager | M | M | M | M | M |  |
| Homebrew | os-package-manager | M | M | M | M |  |  |
| Nix | os-package-manager | M | M | M | M | M |  |
| pacman | os-package-manager | M | M | M | M | M |  |
| Snap | os-package-manager | M | M | M | M | M |  |
| GPT4All | model-runtime | S | S |  |  |  |  |
| Jan | model-runtime | M | M | M | M | M |  |
| llama.cpp | model-runtime | S | S | S | M | S |  |
| LM Studio | model-runtime | M | M | M | M | M |  |
| Ollama | model-runtime | S | S | S | M | M |  |
| Hugging Face Hub | model-hub | M | M | M | M | S |  |
| Docker | container-runtime | M | M | M | M | M |  |
| Podman | container-runtime | S | S | S | S |  |  |
| Android Studio | editor | M | M | M | M |  |  |
| Cursor | editor | M | M | M | M |  |  |
| Eclipse IDE | editor | S | M | M | M | M |  |
| JetBrains IDEs | editor | M | M | M |  |  |  |
| Neovim | editor | M | M | M | M |  |  |
| Sublime Text | editor | M |  | M | M | M |  |
| Visual Studio | editor | M | M | M |  | W | M |
| Visual Studio Code | editor | S | S | M | M |  |  |
| Zed | editor | S | S | M |  | S |  |
| Claude Code | app | M | M | M |  |  |  |

## Checking it

From the repository root, with corpus-schema built by `tools/build-corpus-schema.sh`:

```sh
sh tools/validate-strict.sh packages/corpora/system-cleanup-reference/corpus
sh tools/leak-check.sh
```

`.github/workflows/profiles.yml` runs both on every pull request, with the other profiles and
corpora.
