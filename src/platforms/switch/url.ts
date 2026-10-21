import { HARDWARE, HARDWARE_CODES } from '@data';
import { LINK as CODES } from '@data/switch';

import { compareVersions } from '@/data';
import {
	ClockKey,
	Clocks,
	ImageTarget,
	LaunchConfig,
	LinkCodes,
	SwitchRevision,
	SwitchState,
	Vocabulary,
} from '@/types';
import {
	Params,
	byParam,
	decodeSelection,
	decodeTuning,
	encodeSelection,
	encodeTuning,
	tuningKeys,
	tuningParam,
	tuningWords,
} from '@/url';

import {
	BOOT_ENTRIES,
	CATALOG,
	CLOCK_MODES,
	CLOCK_MODULES,
	COMPONENTS,
	COMPONENT_ENTRIES,
	ENTRY_OVERRIDES,
	GALLERY,
	HOS_VERSIONS,
	OVERCLOCK,
	defaultBuild,
	gameName,
	isEmuMMCFolder,
	templateClocks,
} from './data';

const BOOT_MODES = BOOT_ENTRIES.map(entry => entry.id);

// Clocks a profile sets: of the processor, the graphics and the memory in every mode of the console
const CLOCK_KEYS = CLOCK_MODES.flatMap(mode =>
	CLOCK_MODULES.map((module): ClockKey => `${mode}_${module}`),
);

// Revisions of the console the table of the hardware has
const isRevision = (id: string | null): id is SwitchRevision =>
	HARDWARE.some(hw => hw.platform == 'switch' && hw.id == id);

// An image of the gallery by its id, undefined unless the gallery has it for the target
const galleryImage = (target: ImageTarget, id: string | null) =>
	id && GALLERY.some(item => item.target == target && item.id == id)
		? id
		: undefined;

// Entries booting the system, enabled or not: they keep overrides, logos and icons
const hosEntries = (launch: LaunchConfig) => [
	...BOOT_MODES,
	...launch.emummcs.map(folder => `emummc-${folder}`),
];

// Entries that are in the menu with their components, the other systems and the payloads: each can boot by itself
// and take a logo and an icon
const BROUGHT = COMPONENT_ENTRIES.map(entry => entry.id);

// The param of a short link a key goes into: the Launch menu with Hekate (l), the profiles of the overclock with sys-clk (c),
// the pictures on their own (a), an option with the rest of what its group sets up
function paramOf(key: string): string | undefined {
	if (
		['boot', 'emummc', 'autoboot'].includes(key) ||
		key.startsWith('launch.')
	)
		return 'l';
	if (key == 'oc') return 'c';
	if (key.startsWith('img.')) return 'a';
	return tuningParam(CATALOG.tuning, key);
}

// The numbers short links of the Switch name things by
export const LINK: LinkCodes = {
	...CODES,
	hardware: HARDWARE_CODES,
	firmwareKey: 'hos',
	paramOf,
};

// Everything links of the Switch name, to give it numbers: the system versions from the oldest, the software from what a build
// starts with, the words the values are made of and the params in the order links spell them
export function vocabulary(): Vocabulary {
	const entries = [...BOOT_MODES, ...BROUGHT];
	return {
		firmware: HOS_VERSIONS.map(v => v.version).toSorted(compareVersions),
		software: [
			...new Set([
				...defaultBuild().selectedComponentIDs,
				...COMPONENTS.map(comp => comp.id),
			]),
		],
		keys: byParam(
			[
				'boot',
				'emummc',
				'autoboot',
				...BOOT_MODES.flatMap(mode =>
					ENTRY_OVERRIDES.map(
						override => `launch.${mode}.${override}`,
					),
				),
				...tuningKeys(CATALOG.tuning),
				'oc',
				'img.bootlogo',
				'img.background',
				...entries.map(entry => `img.logo.${entry}`),
				...entries.map(entry => `img.icon.${entry}`),
			],
			paramOf,
		),
		words: [
			...tuningWords(CATALOG.tuning),
			...BOOT_MODES,
			'menu',
			...BROUGHT,
			...GALLERY.map(image => image.id),
			// What a profile of the overclock is made of apart from its game: links say the ID of a game as it is
			'stock',
			'custom',
			...Object.keys(OVERCLOCK.templates),
			...CLOCK_KEYS,
			// Keys of more emuMMCs have no numbers, so they are spelled in these words
			'launch',
			'img',
			'logo',
			'icon',
			...ENTRY_OVERRIDES,
		],
	};
}

// The revision, the HOS version and the whole software selection always, so links keep their builds when recommendations change.
// Everything else only where it differs from the defaults
export function encode(build: SwitchState): Params {
	const defaults = defaultBuild();
	const params: Params = [];
	const set = (key: string, value: string) => params.push([key, value]);

	set('hw', build.hardware);
	set('hos', build.firmware);
	set('sw', encodeSelection(CATALOG, build.selectedComponentIDs));

	if (build.launch.modes.join() != defaults.launch.modes.join())
		set('boot', build.launch.modes.join(','));
	if (build.launch.emummcs.length > 0)
		set('emummc', build.launch.emummcs.join(','));
	if (build.launch.autoboot != defaults.launch.autoboot)
		set('autoboot', build.launch.autoboot);
	for (const [entry, keys] of Object.entries(build.launch.overrides)) {
		for (const [key, value] of Object.entries(keys))
			set(`launch.${entry}.${key}`, String(value));
	}

	params.push(...encodeTuning(CATALOG.tuning, build.tuning));

	// title.template or title.custom.key-mhz.key-mhz
	if (build.overclock.length > 0) {
		set(
			'oc',
			build.overclock
				.map(profile =>
					[
						profile.id,
						profile.template,
						...(profile.template == 'custom'
							? Object.entries(profile.clocks).map(
									([key, mhz]) => `${key}-${mhz}`,
								)
							: []),
					].join('.'),
				)
				.join(','),
		);
	}

	// Uploaded images cannot travel in a link
	const { bootlogo, background, logos, icons } = build.appearance;
	if (bootlogo && bootlogo != 'upload') set('img.bootlogo', bootlogo);
	if (background && background != 'upload') set('img.background', background);
	for (const [entry, image] of Object.entries(logos)) {
		if (image != 'upload') set(`img.logo.${entry}`, image);
	}
	for (const [entry, image] of Object.entries(icons)) {
		if (image != 'upload') set(`img.icon.${entry}`, image);
	}

	return params;
}

// The build a link describes, anything invalid keeps its default
export function decode(params: URLSearchParams): SwitchState {
	const build = defaultBuild();
	const get = (key: string) => params.get(key);

	const hardware = get('hw');
	if (isRevision(hardware)) build.hardware = hardware;

	const hos = get('hos');
	if (HOS_VERSIONS.some(v => v.version == hos)) build.firmware = hos!;

	build.selectedComponentIDs =
		decodeSelection(CATALOG, get('sw')) ?? build.selectedComponentIDs;

	// An empty list turns every boot mode off, a list of unknown ones means nothing
	const boot = get('boot')?.split(',').filter(Boolean);
	const modes = BOOT_MODES.filter(mode => boot?.includes(mode));
	if (boot && (boot.length === 0 || modes.length > 0))
		build.launch.modes = modes;

	const emummcs = get('emummc')?.split(',').filter(isEmuMMCFolder);
	if (emummcs) build.launch.emummcs = [...new Set(emummcs)];
	const entries = hosEntries(build.launch);

	// Autoboot takes the menu, an entry booting the system or one a component brings
	const autoboot = get('autoboot');
	if (
		autoboot == 'menu' ||
		entries.includes(autoboot!) ||
		BROUGHT.includes(autoboot!)
	) {
		build.launch.autoboot = autoboot!;
	}

	for (const [key, value] of params) {
		const [, entry, name] = key.match(/^launch\.(.+)\.(\w+)$/) ?? [];
		const override = ENTRY_OVERRIDES.find(item => item == name);
		if (
			entry !== undefined &&
			entries.includes(entry) &&
			override &&
			(value == '0' || value == '1')
		) {
			build.launch.overrides[entry] = {
				...build.launch.overrides[entry],
				[override]: Number(value),
			};
		}
	}

	decodeTuning(CATALOG.tuning, params, build.tuning);

	const oc = get('oc');
	if (oc) {
		for (const entry of oc.split(',')) {
			const [id = '', template = '', ...pairs] = entry.split('.');
			if (
				!/^[0-9A-F]{16}$/i.test(id) ||
				build.overclock.some(profile => profile.id == id.toUpperCase())
			)
				continue;
			if (
				template != 'custom' &&
				template != 'stock' &&
				!(template in OVERCLOCK.templates)
			)
				continue;
			const clocks: Clocks =
				template == 'custom' ? {} : templateClocks(template);
			for (const pair of pairs) {
				const [key, mhz] = pair.split('-');
				const clock = CLOCK_KEYS.find(item => item == key);
				if (clock && Number(mhz) > 0) clocks[clock] = Number(mhz);
			}
			build.overclock.push({
				id: id.toUpperCase(),
				name: gameName(id.toUpperCase()),
				template,
				clocks,
			});
		}
	}

	const images = (kind: 'logo' | 'icon', target: ImageTarget) =>
		Object.fromEntries(
			[...entries, ...BROUGHT].flatMap((entry): [string, string][] => {
				const id = galleryImage(target, get(`img.${kind}.${entry}`));
				return id ? [[entry, id]] : [];
			}),
		);
	build.appearance = {
		bootlogo: galleryImage('bootlogo', get('img.bootlogo')),
		background: galleryImage('background', get('img.background')),
		logos: images('logo', 'bootlogo'),
		icons: images('icon', 'icon'),
	};

	return build;
}
