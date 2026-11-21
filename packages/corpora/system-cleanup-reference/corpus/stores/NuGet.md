---
slug: nuget
category: language-package-manager
vendor: Microsoft / .NET Foundation
homepage: https://www.nuget.org
docs: https://learn.microsoft.com/en-us/nuget/
repository: https://github.com/NuGet/NuGet.Client
license: Apache-2.0
open_source: true
platforms:
- macos
- linux
- windows
cli: dotnet nuget
checked: '2026-11-21'
sources:
- '[How to manage the global packages, cache, temp folders in NuGet](../documents/Microsoft/How%20to%20manage%20the%20global%20packages%2C%20cache%2C%20temp%20folders%20in%20NuGet.md)'
- '[dotnet nuget locals command](../documents/Microsoft/dotnet%20nuget%20locals%20command.md)'
---

NuGet is the package manager for .NET, used through the dotnet CLI, nuget.exe and Visual Studio. It fills disks with a global packages folder of every extracted package version ever restored, plus an HTTP cache, a temp folder and a plugins cache.

## Open

- in use: No source names the lock file or process to check; the docs only point at ConcurrencyUtilities.ExecuteWithFileLocked and say to delete .nupkg.metadata first.
