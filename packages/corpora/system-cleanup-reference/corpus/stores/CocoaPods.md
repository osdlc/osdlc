---
slug: cocoapods
category: language-package-manager
vendor: CocoaPods
homepage: https://cocoapods.org
docs: https://guides.cocoapods.org
repository: https://github.com/CocoaPods/CocoaPods
license: MIT
open_source: true
platforms:
- macos
cli: pod
checked: '2026-11-21'
sources:
- '[CocoaPods config.rb](../documents/CocoaPods/CocoaPods%20config.rb.md)'
- '[Command-line Reference](../documents/CocoaPods/Command-line%20Reference.md)'
---

CocoaPods is a dependency manager for Swift and Objective-C Xcode projects. It keeps a download cache of pods in ~/Library/Caches/CocoaPods, spec repositories under ~/.cocoapods/repos, and installs each project's dependencies into a Pods directory next to the Podfile.

## Open

- in use: No source names a CocoaPods lock file or process to check before deleting its cache.
