export type PlatformId = 'switch' | 'psp';
export const PLATFORM_IDS: PlatformId[] = ['switch', 'psp'];

export type SwitchRevision = 'erista' | 'mariko' | 'oled' | 'lite';
export type PspRevision = 'psp1000' | 'psp2000' | 'psp3000' | 'pspgo' | 'pspstreet';
export type HardwareRevision = SwitchRevision | PspRevision;

export interface HardwareInfo {
	id: HardwareRevision;
	platform: PlatformId;
	name: string;
	codename: string;
	is_modchip_required: boolean;
	image: string;
	width: number; // in millimeters
	height: number; //in millimeters
	screen: number; // diagonal of the 16:9 display in inches
}

export type FirmwareStatus = 'stable' | 'legacy' | 'dead';

export interface FirmwareVersion {
	version: string;
	date: Date;
	status: FirmwareStatus;
	atmosphere?: string; // Atmosphere release supporting the HOS version
	supported?: Date;
}

export type ComponentCategory = 'base' | 'payloads' | 'sysmodules' | 'overlays' | 'plugins' | 'tools' | 'installers' | 'saves' | 'mods' | 'amiibo' | 'themes' | 'media' | 'streaming' | 'emulators' | 'development';
export type ComponentSource = 'appstore' | 'github' | 'url' | 'manual' | 'bundled';

// Asset of the latest GitHub release: an archive merged into the SD card or a single file
export interface GithubAsset {
	repo: string;
	asset: string; // regular expression matched against asset names
	root?: string; // archive directory that maps to the SD root
	into?: string; // SD directory the archive is extracted to
	path?: string; // destination on the SD card, turns the asset into a single file
	strip?: number; // leading folders its paths lose on the SD card, turns the asset into a tar unpacked straight onto the card
	modchip?: boolean; // only for revisions booted by a modchip
}

export interface Download {
	url: string;
	root?: string;
	into?: string;
	path?: string;
}

export interface ComponentSources {
	appstore?: string[]; // Homebrew App Store packages
	github?: GithubAsset[];
	url?: Download[];
	manual?: string; // page to download the component by hand
	bundled?: string; // component that already ships this one
}

export type Requirement = string | string[];

export interface ComponentInfo {
	id: string;
	name: string;
	author: string;
	category: ComponentCategory;
	link?: string; // param of a short link its settings go into, one for the components that are set up together
	version: string;
	size: number; // bytes to download
	released?: string;
	logo?: string;
	source: ComponentSource; // the fresher of the available sources, picked by bun run sync
	sources: ComponentSources;
	payload?: string; // SD path of the payload, it gets an entry in the Launch menu of hekate
	requires?: Requirement[]; // all have to be met, a nested list is met by any of its components
	replaces?: string[];
	conflicts_with?: string[];
	tracks?: ('hos' | 'atmosphere')[]; // has to be updated for every new HOS or Atmosphere release
	hardware?: HardwareRevision[]; // revisions the component is useful on
	deprecated?: boolean;
	required: boolean;
	risky?: boolean; // its note tells what may go wrong, the build warns about it too
	plugin?: CfwPlugin; // a CFW plugin the build lists in the plugins file of its platform
}

export interface CfwPlugin {
	path: string; // relative to the folder of the plugins file
	scope: string[]; // runlevels, such as `vsh` or `game`, empty to leave the plugin off
}

export interface Preset {
	id: string;
	components: string[];
}

export type TuningValue = boolean | number | string | string[] | string[][];
export type TuningStep = 'launch' | 'system' | 'security' | 'sysmodules' | 'overlays' | 'status_monitor' | 'dbi' | 'jksv' | 'amiibo' | 'plugins' | 'overclock';

interface TuningOptionBase {
	id: string;
	secret?: boolean; // never written into links
	when?: { [option: string]: TuningValue | TuningValue[] }; // active only while sibling options hold one of the listed value
}

export type TuningOption = TuningOptionBase & (
	| { type: 'toggle'; default: boolean }
	| { type: 'select'; values: (string | number)[]; default: string | number }
	| { type: 'multiselect'; values: string[]; default: string[]; min?: number; max?: number } // from `min` to `max` values at once, any number of them without the bounds
	| { type: 'range'; min: number; max: number; step: number; default: number }
	| { type: 'number'; min: number; max: number; default: number }
	| { type: 'text'; maxLength: number; default: string }
	| { type: 'hue'; default: number }
	| { type: 'color'; default: string }
	| { type: 'rgba4444'; default: string } // a color with its opacity, a hex digit per channel: #1117
	| { type: 'list'; fields: ListField[]; maxLength: number; max?: number; default: string[][] } // rows of a value per field, `max` of them at most
);

// A field of the rows of a list: a line of text, or a choice among its values, of one of them or of up to `max` at once
export interface ListField {
	id: string;
	values?: string[];
	max?: number;
}

export interface TuningGroup {
	id: string;
	step: TuningStep;
	link: string; // param of a short link the options go into, the one of the component they set up
	file: string; // SD path the group is written to, shown to the user
	section?: string; // section of the file the group is, where the file has one per component, such as an overlay in the list of Ultrahand
	requires?: Requirement[]; // components that have to be selected for the group to take effect: all of them, any of a nested list
	options: TuningOption[];
}

// Values of the options a build holds, by group and option
export type TuningConfig = { [group: string]: { [option: string]: TuningValue } };

// Software of a platform: its components, presets of them and options of their configs
export interface Catalog {
	platform: PlatformId;
	components: ComponentInfo[];
	categories: ComponentCategory[]; // picked on the Software step in this order, the others on steps of their own
	presets: Preset[];
	tuning: TuningGroup[];
	files: {[component: string]: string[]}; // what the releases of the components put onto the card, by `bun run sync`
}

// What links of a platform name, by the list it is numbered in. The tables in data/**/link.tsv give a number once and for good
export interface Vocabulary {
	firmware: string[]; // system versions
	software: string[]; // components
	words: string[]; // what the values of the params are made of
	keys: {[param: string]: string[]}; // params of a link spelled in full, by the param of a short link they are packed into
}

// What a short link names by numbers instead of spelling: the ids behind the numbers
export interface LinkCodes extends Vocabulary {
	hardware: string[]; // consoles of every platform
	firmwareKey: string; // the param a link spelled in full tells the system version in
	paramOf(key: string): string | undefined; // the param of a short link a param spelled in full is packed into
}

// What a build keeps on every platform: the console, its system version, the software and the options
export interface BuildState {
	hardware: HardwareRevision;
	firmware: string;
	selectedComponentIDs: string[];
	tuning: TuningConfig;
}

export type ClockModule = 'cpu' | 'gpu' | 'mem';
export type ClockMode = 'docked' | 'handheld' | 'handheld_charging' | 'handheld_charging_usb' | 'handheld_charging_official';
export type ClockKey = `${ClockMode}_${ClockModule}`;
export type Clocks = Partial<Record<ClockKey, number>>;

export interface OverclockData {
	frequencies: Record<ClockModule, number[]>;
	caps: Partial<Record<ClockKey, Record<SwitchRevision, number>>>; // sys-clk lowers requested clocks to these
	templates: Record<string, Clocks>;
	games: { id: string; name: string }[];
}

// sys-clk profile of a game, template turns into custom once any clock is edited by hand
export interface GameProfile {
	id: string; // title ID
	name: string;
	template: string;
	clocks: Clocks;
}

export type ImageTarget = 'bootlogo' | 'background' | 'icon';

export interface GalleryImage {
	id: string;
	target: ImageTarget;
	file: string; // public path of the image, in the orientation it is seen on screen, made of the target and the ID
	hue?: boolean; // white layout Nyx tints with the theme color
	author: string;
	license: string;
	url: string;
}

export type BootMode = 'emummc' | 'sysmmc' | 'stock';

export type LaunchKey = Record<string, string | number>;

// Section of hekate_ipl.ini, an entry of the Launch menu
export interface LaunchEntry {
	id: string; // boot mode, `emummc-<folder>` of another emuMMC, a payload component or an entry a component brings
	name: string; // name of the section, shown in the Launch menu
	caption: string; // caption of the group the section belongs to
	keys: LaunchKey;
	logo?: string; // SD paths of the boot logo and the icon the entry comes with, the ones picked for it take their place
	icon?: string;
}

// Entry booting the console in one of the modes
export type BootEntry = LaunchEntry & { id: BootMode };

// Entry that is in the menu with its component: another system to boot or a payload
export type ComponentEntry = LaunchEntry & { component: string };

// Exosphere keys an entry sets for itself, overriding exosphere.ini and system_settings.ini
export type EntryOverride = 'cal0blank' | 'usb3force' | 'memmode';

// Launch menu of hekate: the boot modes, more emuMMCs, then what the selected components bring: other systems and payloads
export interface LaunchConfig {
	modes: BootMode[];
	emummcs: string[]; // folders in emuMMC/ of more emuMMCs, each gets its own entry
	overrides: Record<string, Partial<Record<EntryOverride, 0 | 1>>>; // by entry, a missing key follows the configs
	autoboot: string; // an entry booted after the logo, `menu` to stay in the menu
}

// Gallery image ids or `upload` for an image picked from the disk
export interface AppearanceConfig {
	bootlogo?: string;
	background?: string;
	logos: Record<string, string>; // boot logos of entries, shown when hekate boots them by itself
	icons: Record<string, string>; // icons of entries in the Launch menu
}

// Images picked from the disk by `bootlogo`, `background`, `logo.<entry>` or `icon.<entry>`, kept only in this tab: links cannot carry them
export type Uploads = Record<string, { blob: Blob; url: string }>;

// Build of a Nintendo Switch: the Launch menu of hekate, sys-clk profiles and pictures on top of the common part
export interface SwitchState extends BuildState {
	hardware: SwitchRevision;
	launch: LaunchConfig;
	overclock: GameProfile[];
	appearance: AppearanceConfig;
}

// Build of a PSP: runlevels the plugins load in, by plugin, where they differ from the catalog
export interface PspState extends BuildState {
	hardware: PspRevision;
	plugins: Record<string, string[]>;
}

export type StepId = 'hardware' | 'firmware' | 'software' | 'launch' | 'system' | 'security' | 'sysmodules' | 'overlays' | 'status_monitor' | 'dbi' | 'jksv' | 'amiibo' | 'plugins' | 'overclock' | 'appearance' | 'build';

export type IssueLevel = 'error' | 'warning' | 'info';

// Components a fix adds or removes
export interface Fix {
	add?: string[];
	remove?: string[];
}

export interface Issue {
	level: IssueLevel;
	code: string;
	step: StepId;
	params: Record<string, string>;
	fixes?: Fix[]; // ways to resolve the issue, a button each
}
