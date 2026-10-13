# Console Kitchen

[Русская версия](README.RU.MD)

A builder of custom firmware setups for the Nintendo Switch and the PSP: Hekate and Atmosphère or ARK-5 with the chosen homebrew, configured down to single keys of their configs.

Console Kitchen is a static web app. It goes through the console, the software and every setting, then produces installers for Linux and macOS (`install.sh`) and Windows (`install.ps1`) along with a readme on the first boot. The installer lies in the root of the SD card or the Memory Stick and builds the setup right there from the latest releases, so nothing in a build is prepackaged. The whole build is kept in the page address: a link reproduces it, except passwords and uploaded images. The software is listed in full there, so a link keeps its build when the recommended selection changes. The link is short, such as `?h=JP&s=H&sm=JN`: it names the console, the software and the options by numbers, the options of everything that is set up in a param of its own. A link that spells them out, such as `?hw=oled&hos=23.0.0&sw=atmosphere,hekate`, is read as well, and so is a mix of both. Every console keeps a build of its own while another one is picked, and the page takes its look: the system UI of the Switch or the XMB of the PSP in the color of the month. The interface speaks English, Russian and Ukrainian.

## Nintendo Switch

**Revision.** Erista, Mariko, OLED or Lite. The revision decides how Hekate starts: from RCM or from a modchip that boots `payload.bin` in the root of the card. It also decides which tools make sense and how far overclocking goes. The console is drawn at its real size, as far as the browser can tell the density of the screen. On a screen narrower than the console the picture shrinks to fit.

**Firmware.** Every system version, with the Atmosphère release that supports it. A version Atmosphère does not support yet is an error, patches released before the support of the version are warned about.

**Software.** Components by purpose:

- core: Atmosphère, Hekate, sys-patch;
- sysmodules: MissionControl, sys-clk or Horizon OC, NX-FanControl, SaltyNX, ldn_mitm, sys-con, SysDVR, sys-ftpd-light, sys-tune, Fizeau and others;
- overlays: Tesla Menu or Ultrahand, Status Monitor, FPSLocker, ReverseNX-RT, the SysDVR and EdiZon overlays, noled, MasterVolume, BT_Audio-ovl, QuickNTP, ovl-sysmodules, the Ultrahand packages Alchemist and Memory Kit;
- utilities: Daybreak, Homebrew App Store, sphaira, AIO Switch Updater, NX-Shell, Linkalho, NX Activity Log and others;
- installers and dumpers: DBI with the DBIPatcher translations into 20+ languages, Tinfoil, Goldleaf, nxdumptool;
- saves: JKSV, Checkpoint, Neumann;
- cheats and mods: EdiZon SE, Breeze, SimpleModManager and SimpleModDownloader;
- Amiibo: emuiibo, Amiigo, AmiiboGenerator;
- themes and HOME menu: NXThemes Installer, Themezer, uLaunch;
- media: NXMP, Switchfin for Jellyfin, pPlay and others;
- game streaming: Moonlight, Akira, SkyNX, switch-remote-play;
- emulators: RetroArch, Flycast, PPSSPP, melonDS, NooDS, mGBA, pSNES, pNES, pFBNeo, ScummVM and others;
- development: sys-botbase, sys-gdbstub, Twili and others.

Presets (Minimal, Recommended, Everything) replace the selection, a component brings its dependencies along. Conflicts such as Tesla Menu and Ultrahand, overlaps such as JKSV and Checkpoint or RetroArch and the standalone emulators, components useless on the revision and abandoned ones are explained with fixes: a conflict or an overlap is solved by removing either side, a missing dependency by adding any of its alternatives. What a click brings also pops up as a notification, so it is seen on a phone too. Every component comes from the Homebrew App Store or from GitHub releases, whichever is fresher. Packages of the App Store are registered as installed, so the store on the console keeps updating them.

**Launch.** Entries of the Launch menu of Hekate. Boot modes: CFW on the emuMMC, CFW on the system NAND and the stock firmware. More emuMMCs boot from entries of their own by their folder (`emupath`), such as SD01 or RAW1. Every entry booting the system can override Exosphère keys for itself: blank PRODINFO (`cal0blank`), USB 3.0 (`usb3force`) and the boot config memory mode (`memmode`). Payloads: Fusée, Lockpick RCM, TegraExplorer, CommonProblemResolver, the HWFLY and Picofly toolboxes, each in its own entry. A component Hekate has something to load for, such as Horizon OC with its KIP and its secure monitor, adds its keys (`kip1`, `secmon`) to the entries booting CFW, and every such entry gets a twin in More configs (`bootloader/ini/`) that boots without them, for when they keep the system from starting. Autoboot takes any of them or stays in the menu, the boot screen delay and its countdown are set here too.

**CFW.** Settings of Hekate, Nyx and Atmosphère. Each is an actual key of their configs with the default of the developers:

- Hekate: backlight, power off on RTC wake, nogc, Hekate as the reboot payload, protected bootloader folder;
- Nyx: theme colors, home screen, backup verification, writable eMMC over USB, Joy-Con, BPMP clock;
- Atmosphère: error reports, USB 3.0, cheats, reboot after a crash, logs, saves on the SD card, applet memory;
- homebrew loader: the Album or any title with a held key, keys to start a game without mods or cheats.

**Security.** What the console tells Nintendo and what the secure monitor allows: DNS-MITM blocking of Nintendo servers on the emuMMC, the sysMMC or both, and in Exosphère blank PRODINFO, writing PRODINFO on the sysMMC, debug modes, the memory mode and the UART log.

**Modules, Overlays, Status Monitor, DBI, JKSV, Amiibo.** Settings of the selected components, each step shown once something selected has settings there. Sysmodules and overlays share a step for their kind, components with a lot to set have steps of their own:

- modules: where sys-patch applies its patches, MissionControl vibration, motion, the lights of DualSense and DualShock and the Bluetooth name and address of the console, every setting of sys-con: its mode, the USB devices it takes for controllers, their polling and the network controller, sys-tune volumes, repeat and the music played on start, sys-ftpd login, port and pause combo;
- overlays: the Tesla and Ultrahand combo, every setting of Ultrahand: its language, input, menus, widget, the switches of its theme and notifications, and its list of overlays, where every selected overlay gets its place, name, launch combo, arguments and launch modes;
- Status Monitor: its whole config, the combos and readings and the position, font sizes and colors of each of its modes;
- DBI: the language of its translation and its whole config: folders, lists, main menu, install checks and patches, MTP, FTP and HTTP servers, access point and book reader, network sources, shortcuts to folders and names of titles;
- JKSV: every setting of the save manager with its WebDAV server;
- Amiibo: the way Amiigo creates amiibo.

The config of every selected component is written whether its settings are changed or not, so the card ends up as the build says and what was set on the console is replaced. Each is a whole file made from its template: the one of sys-con goes with the profiles of controllers it ships.

**Overclock.** sys-clk profiles by title ID: a template (Stock, Balanced, Performance, Battery saver) or CPU, GPU and RAM clocks for every mode, docked, handheld and charging. Clocks above the limits sys-clk applies on the revision are pointed out.

**Appearance.** Boot screen, Nyx background and icons of the Launch entries, taken from the gallery of Hekate and Atmosphère art, the icons of Nichole Mattera and the own icon set of the Console Kitchen, or uploaded. The boot screen and the background are previewed on the screen of the chosen console in its real size, as Hekate and Nyx draw them. Every entry, payloads included, can take an icon and a boot screen of its own (`logopath`), which Hekate shows when autoboot starts that entry. Images are converted to the bitmaps Hekate expects and embedded into the installers. More pictures are linked from the GBAtemp threads where people share them.

**Build.** Issues of every step with their fixes, the installers, the readme and every generated file with syntax highlighting, to read before running anything.

## PSP

**Model.** PSP-1000, 2000, 3000, Go or Street, drawn at its real size as well.

**Firmware.** Every firmware from 1.00 to 6.61. ARK-5 runs on 6.60 and 6.61, an older PSP gets the official update to 6.61 from the servers of Sony along with the build, and the readme tells to run it first.

**Software.** ARK-5 as FasterARK, in the full package with the VSH menu, the Custom Launcher and the unbricking tools or in the lite one. Plugins: Game Categories Lite, missyhud, æmu for online play through PRO Online, RemoteJoyLite. CMFileManager, DaedalusX64, TempGBA4PSP-mod with the open BIOS of Cult-of-GBA. Everything comes from GitHub releases and direct links.

**CFW.** Settings of ARK-5, written to `SETTINGS.TXT` the way its own settings menu writes them: clocks in games and in the XMB up to 443 MHz, USB charging, extra memory, the caches of the Memory Stick and of ISO images, the Custom Launcher, logos and pictures of the XMB, the options of the PSP Go.

**Plugins.** Where every plugin loads: always, in the XMB, in games and homebrew, in PS1 games, several of them at once. The list goes to `SEPLUGINS/PLUGINS.TXT`, the plugin manager of ARK turns them on and off later.

**Build.** The same as for the Switch.

## Installation

1. Format the SD card as FAT32, the Memory Stick in the PSP itself.
2. Put `install.sh` or `install.ps1` into the root of the card and run it there:

   ```sh
   bash install.sh
   ```

   ```powershell
   powershell -ExecutionPolicy Bypass -File install.ps1
   ```

3. Boot the console as the readme of the build says.

Files with the same names are overwritten, the rest of the card stays. The installer needs `curl` and `unzip`, `bsdtar` or `python3` on Linux and macOS, PowerShell 5.1 or newer on Windows. GitHub allows 60 anonymous API requests per hour, `GITHUB_TOKEN` lifts the limit. Keys and games are never downloaded, the only firmware is the official update of the PSP from the servers of Sony.

## Development

```sh
bun install
bun run dev       # development server
bun run build     # static site in dist/
bun run start     # builds the site and serves it the way it is published
bun run test      # unit tests, installers run where bash, pwsh and shellcheck are installed
bun run test:ui   # every step in headless Chrome
bun run check     # types, unit tests, build and UI tests in a row
bun run sync      # versions, sizes, sources and logos of the catalogs
bun run number    # numbers for what the catalogs got new, short links name things by them
```

The project runs on [Bun](https://bun.sh). Unit tests are started with `bun run test`: `bun test` would start the test runner of Bun itself instead of Vitest, and that one cannot read the catalogs, which Vite loads.

Catalogs live in `data/` and templates of the generated files in `templates/`, with a directory per platform in both, such as `data/switch/`. A catalog is a set of TSV tables with a row per console, system version, component or option. The options of a config lie in a table named after their group in `tuning/`, or in the one the `table` cell of the group points at: the tables of one component share its folder and are named there after the sections of its config, such as `status_monitor/fps-counter.tsv`. Groups with the same options point at one table and name the section of the file each of them is in the `section` cell, as the overlays in the list of Ultrahand do. Several values in a cell are separated by commas, alternatives by `|`, and a flag is set with `1`. An option of the `list` type holds rows: its cell of values names the fields of a row, a field with alternatives after a colon is a choice among them, such as `Name,Type:FTP|SFTP,URL`, a number after one more colon lets the field hold that many of them at once, such as `combo:L|R|ZL|ZR:4`, and the rows it starts with separate their fields with `=`. What does not fit a table lies in YAML next to it: the sources of the components, the conditions of the options, the keys of the Launch entries and, in a file named after the component, the keys it adds to the entries booting CFW, the clocks and the templates of the overclock. Texts of the page live in `i18n/`, a folder of YAML files per language: `index.yaml` holds the page itself, the folders of the platforms hold the texts of their components and options. Styles live in `styles/`. Logos, photos and the gallery live in `public/`. SVG sources of the gallery icons, the set of the Console Kitchen and the icons of Nichole Mattera fitted into the icon of Nyx, live in `art/icons/` and are rendered into the gallery with `rsvg-convert -w 192 -h 192 art/icons/<id>.svg -o public/appearance/icon/<id>.png`.

Short links name things by numbers, which the tables `data/link.tsv` and `data/<platform>/link.tsv` keep: a row per console, system version, component, word the values are made of and param of a link spelled in full. The place of a row in the catalog does not matter, so the catalogs are edited freely. A number is given once and for good: `bun run number` adds rows for everything new, and `bun run sync` does it too, while the existing rows are never changed, removed or given to something else, or every link made before would say something different. The row of what the catalog no longer has stays. A renamed id keeps its links when its row is renamed along. In the page address `h` is the number of the console times 256 plus the number of its system version, and `s` holds a bit per component, six components to a character from the lowest numbers. Everything else goes into a param per thing that is set up: `l` for the Launch menu with Hekate and Nyx, `f` for Atmosphère with its DNS, Exosphère and sys-patch, `c` for the overclock with sys-clk, `a` for the pictures, and one for every component together with its overlay and its section in the list of Ultrahand, such as `sm` for Status Monitor. The `link` cell of a component and of a group of options names that param, and the keys of a param are numbered in the list of `link.tsv` named after it. Such a param holds a record per changed option: the number of its key and its value, which is 0 or 1, a number, a word by its number, the ID of a game or a text. The format is described in `src/link.ts`. What has no number yet is spelled out, so a link is right even before `bun run number` is run, only longer.

## License

The code is under the [MIT license](LICENSE). Logos, photos and the gallery belong to their owners, see [`public/LICENSE`](public/LICENSE). Console Kitchen is not affiliated with Nintendo or Sony.
