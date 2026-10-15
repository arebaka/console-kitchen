# Console Kitchen: {{hardware}}, Horizon OS {{hos}}

Generated on {{date}}.

## Components

{{#components}}
- **{{name}}** {{version}}: {{description}}
{{/components}}
{{#hasManual}}

Download manually: {{#manual}}**{{.}}** {{/manual}}
{{/hasManual}}

## Installation

1. Format the SD card as **FAT32**: the console supports exFAT, but it is prone to corruption.
2. Put the installer into the root of the SD card and run it there:
   - Linux and macOS: `bash install.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File install.ps1`
3. Eject the card safely and insert it into the console.

The installer downloads everything right onto the card: files with the same names are overwritten, the rest of the card stays as it is. GitHub allows 60 anonymous API requests per hour, set `GITHUB_TOKEN` if you run the installer often.

## First boot

{{#modchip}}
Turn the console on: the modchip boots `payload.bin` (Hekate) from the root of the SD card.
{{/modchip}}
{{^modchip}}
1. Turn the console off, slide an RCM jig into the right Joy-Con rail, hold **VOL+** and press **POWER**. The screen stays black: the console is in RCM mode.
2. Connect the console to a computer over USB and inject `hekate_ctcaer_*.bin` from the root of the SD card with TegraRcmGUI on Windows or fusee-launcher on Linux and macOS.
{{/modchip}}

Hekate starts{{#autoboot}} and boots **{{autoboot}}**, hold **VOL-** during the boot screen to get into the menu{{/autoboot}}.

## emuMMC

Keep the system NAND clean and run CFW from an emuMMC:

1. Create a NAND backup in hekate: **Tools → Backup eMMC**.
2. Create the emuMMC: **emuMMC → Create emuMMC → SD File**. **SD Partition** is faster, but requires **Tools → Partition SD Card** first.
3. Boot **Launch → CFW (emuMMC)**.
{{#hasEmummcs}}

More emuMMCs boot from entries of their own, each from its folder:

{{#emummcs}}
- **Launch → {{name}}**: `emuMMC/{{folder}}`
{{/emummcs}}

Create each of them the same way, Hekate names the folders itself: SD00, SD01 and on for files, RAW1 to RAW3 for partitions. **CFW (emuMMC)** boots the one chosen in **emuMMC → Change emuMMC**.
{{/hasEmummcs}}
{{#dnsBlock}}

Nintendo servers are blocked on {{dnsTargets}}: updates, eShop and online play don't work there.
{{/dnsBlock}}
{{#hasSystems}}

## Other systems

Hekate boots them from entries of their own instead of Horizon OS:

{{#systems}}
- **Launch → {{name}}**. {{note}}
{{/systems}}
{{/hasSystems}}
{{#hasSpares}}

## If CFW does not boot

What Hekate loads for some components is built for one Atmosphere release and may keep the system from starting after an update. **More configs** has entries that boot CFW without it:

{{#spares}}
- **{{.}}**
{{/spares}}
{{/hasSpares}}
