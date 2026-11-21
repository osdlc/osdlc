---
slug: xcode
category: sdk
vendor: Apple
homepage: https://developer.apple.com/xcode/
docs: https://developer.apple.com/documentation/xcode
open_source: false
platforms:
- macos
cli: xcodebuild
checked: '2026-11-21'
sources:
- '[Manage the locations of project-generated files in Xcode](../documents/Apple/Manage%20the%20locations%20of%20project-generated%20files%20in%20Xcode.md)'
- '[Xcode cleanup gist (chris-kobrzak)](../documents/GitHub%20gist/Xcode%20cleanup%20gist%20%28chris-kobrzak%29.md)'
- '[Xcode 14 Release Notes](../documents/Apple/Xcode%2014%20Release%20Notes.md)'
- '[Downloading and installing additional Xcode components](../documents/Apple/Downloading%20and%20installing%20additional%20Xcode%20components.md)'
- '[xcrun simctl cheatsheet (patriknyblad)](../documents/GitHub%20gist/xcrun%20simctl%20cheatsheet%20%28patriknyblad%29.md)'
- '[simctl gist (denisoliveira)](../documents/GitHub%20gist/simctl%20gist%20%28denisoliveira%29.md)'
---

Xcode is Apple's IDE and SDK for building apps for Apple platforms. It fills ~/Library/Developer with derived data (indexes and build products), archives, simulator devices and downloaded simulator runtimes, and device support symbol files.

## Open

- in use: No source documents how to tell that Xcode or the simulator is using DerivedData or simulator devices.
- build directories: No source names a default in-project build directory for Xcode; the legacy build/ folder (SYMROOT) is not documented in the fetched pages.
