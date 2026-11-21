---
slug: visual-studio
category: editor
vendor: Microsoft
homepage: https://visualstudio.microsoft.com/
docs: https://learn.microsoft.com/en-us/visualstudio/
open_source: false
platforms:
- windows
cli: devenv
checked: '2026-11-21'
sources:
- '[Moving or disabling the package cache for Visual Studio 2017](../documents/Microsoft/Moving%20or%20disabling%20the%20package%20cache%20for%20Visual%20Studio%202017.md)'
- '[Disable or move the package cache - Visual Studio (Windows)](../documents/Microsoft/Disable%20or%20move%20the%20package%20cache%20-%20Visual%20Studio%20%28Windows%29.md)'
- '[Visual Studio 2022 clear local caches - Microsoft Q&A](../documents/Microsoft%20Q%26A/Visual%20Studio%202022%20clear%20local%20caches%20-%20Microsoft%20Q%26A.md)'
- '[Configure policies for enterprise deployments of Visual Studio](../documents/Microsoft/Configure%20policies%20for%20enterprise%20deployments%20of%20Visual%20Studio.md)'
- '[Use command-line parameters to install Visual Studio](../documents/Microsoft/Use%20command-line%20parameters%20to%20install%20Visual%20Studio.md)'
- '[Open Folder support for C++ build systems in Visual Studio](../documents/Microsoft/Open%20Folder%20support%20for%20C%2B%2B%20build%20systems%20in%20Visual%20Studio.md)'
- '[Options, Text Editor, C C++, Advanced](../documents/Microsoft/Options%2C%20Text%20Editor%2C%20C%20C%2B%2B%2C%20Advanced.md)'
- '[Is there any way to stop .vs from growing - Microsoft Q&A](../documents/Microsoft%20Q%26A/Is%20there%20any%20way%20to%20stop%20.vs%20from%20growing%20-%20Microsoft%20Q%26A.md)'
---

Visual Studio is Microsoft's Windows IDE, installed and serviced by the Visual Studio Installer. It fills disks with the installer's package cache under ProgramData, per-instance caches such as ComponentModelCache under LocalAppData, and a .vs folder inside each solution that holds IntelliSense and browsing databases.
