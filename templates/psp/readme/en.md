# Console Kitchen: {{hardware}}, firmware {{firmware}}

Generated on {{date}}.

## Components

{{#components}}
- **{{name}}** {{version}}: {{description}}
{{/components}}
{{#hasManual}}

Download manually: {{#manual}}**{{.}}** {{/manual}}
{{/hasManual}}

## Installation

1. Connect the PSP to the computer: **Settings → USB Connection**. A card reader works too.
2. Put the installer into the root of the Memory Stick{{#go}} or of the internal storage of the PSP Go{{/go}} and run it there:
   - Linux and macOS: `bash install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
3. Eject the card safely and leave the USB mode.

The installer downloads everything right onto the card: files with the same names are overwritten, the rest of the card stays as it is. GitHub allows 60 anonymous API requests per hour, set `GITHUB_TOKEN` if you run the installer often.
{{#update}}

## System update

ARK-5 runs on the firmware 6.60 and 6.61, while the PSP has {{firmware}}. Charge the battery, connect the AC adapter and run **Game → Memory Stick → PSP Update ver 6.61** first.
{{/update}}

## ARK-5

1. Run **Game → Memory Stick → FasterARK**: it installs ARK-5 and boots it right away.
2. Run **CustomIPL** and install the cIPL, so ARK-5 boots with the console itself. Without the cIPL, run FasterARK again every time the PSP is turned off.

The settings of ARK-5 lie in `PSP/SAVEDATA/ARK_01234/SETTINGS.TXT`, the settings menu ARK adds to the XMB writes the same file.
{{#hasPlugins}}

## Plugins

`SEPLUGINS/PLUGINS.TXT` loads:

{{#plugins}}
- **{{name}}**: {{runlevels}}
{{/plugins}}
{{/hasPlugins}}
