import { BootEntry, BootMode, Catalog, Clocks, ComponentEntry, ComponentInfo, EntryOverride, FirmwareVersion, GalleryImage, LaunchConfig, LaunchEntry, LaunchKey, SwitchState } from '@/types';
import { compareVersions, getTuningDefaults, presetSelection } from '@/data';

import { APPEARANCE, FIRMWARE, LAUNCH, MODULES, OVERCLOCK, PRESETS, SOFTWARE, SYSTEMS, TUNING } from '@data/switch';

export { OVERCLOCK };
export const HOS_VERSIONS: FirmwareVersion[] = FIRMWARE;
export const COMPONENTS: ComponentInfo[] = SOFTWARE;
// Payloads are picked on the Launch step, the other categories on the Software one
export const CATALOG: Catalog = {
	platform: 'switch',
	components: COMPONENTS,
	categories: ['base', 'sysmodules', 'overlays', 'tools', 'installers', 'saves', 'mods', 'amiibo', 'themes', 'media', 'streaming', 'emulators', 'development'],
	presets: PRESETS,
	tuning: TUNING
};
export const BOOT_ENTRIES: BootEntry[] = LAUNCH;
// Other systems hekate boots, each in the menu with the component that brings it
export const SYSTEM_ENTRIES: ComponentEntry[] = SYSTEMS;
// Entries that are in the menu with a component, selected or not: the other systems, then a payload each
export const COMPONENT_ENTRIES: ComponentEntry[] = [
	...SYSTEM_ENTRIES,
	...COMPONENTS
		.filter(comp => comp.payload)
		.map(comp => ({ id: comp.id, name: comp.name, caption: 'Payloads', keys: { payload: comp.payload! }, component: comp.id }))
];
// Pictures lie in the folder of their target under their ID: appearance/icon/hekate-switch.png
export const GALLERY: GalleryImage[] = APPEARANCE.map(image => ({ ...image, file: `appearance/${image.target}/${image.id}.png` }));

// Versions newer than the last one some Atmosphere release added support for cannot boot CFW yet
const NEWEST_SUPPORTED_HOS = HOS_VERSIONS
	.filter(v => v.atmosphere)
	.reduce((max, v) => compareVersions(v.version, max) > 0 ? v.version : max, '0.0.0');

export const isHOSSupported = (version: string) => compareVersions(version, NEWEST_SUPPORTED_HOS) <= 0;

// A link without parameters builds the recommended preset
export function defaultBuild(): SwitchState {
	return {
		hardware: 'erista',
		firmware: '21.0.0',
		selectedComponentIDs: presetSelection(CATALOG, CATALOG.presets.find(preset => preset.id == 'base')!),
		tuning: getTuningDefaults(CATALOG.tuning),
		launch: { modes: ['emummc', 'sysmmc', 'stock'], emummcs: [], overrides: {}, autoboot: 'emummc' },
		overclock: [],
		appearance: { logos: {}, icons: {} }
	};
}

// Keys an entry sets over exosphere.ini and system_settings.ini, 0 or 1. A missing key keeps the configs
export const ENTRY_OVERRIDES: EntryOverride[] = ['cal0blank', 'usb3force', 'memmode'];

// Folders of emuMMCs as hekate names them (SD00, RAW1) or a user renames them. FAT ignores the case,
// so folders are kept in upper case and `sd01` never turns into a second entry of `SD01`
export const isEmuMMCFolder = (folder: string) => /^[A-Z0-9_-]{1,32}$/.test(folder);

// The file of More configs with the entries that boot CFW without what hekate loads for a component
export const SPARE_INI = 'bootloader/ini/console_kitchen.ini';

// The stock system boots without what hekate loads for CFW
const bootsCFW = (entry: LaunchEntry) => !entry.keys.stock;

// Components hekate has something to load for, among the given ones
const moduleComponents = (componentIDs: string[]) => COMPONENTS.filter(comp => comp.id in MODULES && componentIDs.includes(comp.id));

// Entries booting the system in their order: the emuMMC ones, sysMMC and stock. They carry the Exosphere keys set for them,
// and the ones booting CFW the keys of what hekate loads for the given components. Those keys come after `pkg3`:
// named before it, they would give way to what the package holds
function systemEntries(launch: LaunchConfig, componentIDs: string[]): LaunchEntry[] {
	const mode = (id: BootMode) => BOOT_ENTRIES.filter(entry => entry.id == id && launch.modes.includes(id));
	const emummc = BOOT_ENTRIES.find(entry => entry.id == 'emummc')!;
	const modules: LaunchKey = Object.assign({}, ...moduleComponents(componentIDs).map(comp => MODULES[comp.id]));

	return [
		...mode('emummc'),
		...launch.emummcs.map(folder => ({
			id: `emummc-${folder}`,
			name: `CFW (emuMMC ${folder})`,
			caption: emummc.caption,
			keys: { ...emummc.keys, emupath: `emuMMC/${folder}` }
		})),
		...mode('sysmmc'),
		...mode('stock')
	].map(entry => ({ ...entry, keys: { ...entry.keys, ...(bootsCFW(entry) ? modules : {}), ...launch.overrides[entry.id] } }));
}

// Entries of the Launch menu in their order: the ones booting the system, then what the selected components bring,
// their systems and their payloads
export function launchEntries(launch: LaunchConfig, selectedComponentIDs: string[]): LaunchEntry[] {
	return [
		...systemEntries(launch, selectedComponentIDs),
		...COMPONENT_ENTRIES
			.filter(entry => selectedComponentIDs.includes(entry.component))
			.map(({ component, ...entry }) => entry)
	];
}

// Entries of More configs: every entry booting CFW once more for each selected component hekate loads something for,
// without the keys of that component. They start the console when what the component loads does not let it boot,
// as after an update of Atmosphere. Such an entry keeps the id of the one it repeats, and so its logo and its icon
export function spareEntries(launch: LaunchConfig, selectedComponentIDs: string[]): LaunchEntry[] {
	return moduleComponents(selectedComponentIDs).flatMap(comp => systemEntries(launch, selectedComponentIDs.filter(id => id != comp.id))
		.filter(bootsCFW)
		.map(entry => ({ ...entry, name: `${entry.name} without ${comp.name}` })));
}

// Name of a known game, the title ID otherwise
export function gameName(id: string): string {
	return OVERCLOCK.games.find(game => game.id == id)?.name ?? id;
}

// A copy of the clocks of an overclock template, stock has none
export function templateClocks(template: string): Clocks {
	return { ...(OVERCLOCK.templates[template] ?? {}) };
}
