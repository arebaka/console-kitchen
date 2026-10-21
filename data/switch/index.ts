import {
	type Conditions,
	type Row,
	cellOf,
	compact,
	components,
	files,
	firmware,
	flag,
	link,
	number,
	oneOf,
	presets,
	text,
	tuning,
} from '@/parse';
import type {
	BootEntry,
	BootMode,
	ComponentEntry,
	GalleryImage,
	ImageTarget,
	LaunchKey,
	OverclockData,
	SwitchRevision,
} from '@/types';

import APPEARANCE_ROWS from './appearance.tsv';
import FIRMWARE_ROWS from './firmware.tsv';
import LAUNCH_ROWS from './launch/index.tsv';
import LINK_ROWS from './link.tsv';
import CLOCK_CAP_ROWS from './overclock/caps.tsv';
import CLOCK_FREQUENCIES from './overclock/frequencies.yaml';
import GAME_ROWS from './overclock/games.tsv';
import CLOCK_TEMPLATES from './overclock/templates.yaml';
import PRESET_ROWS from './presets.tsv';
import FILE_ROWS from './software/files.tsv';
import SOFTWARE_ROWS from './software/index.tsv';
import SOFTWARE_SOURCES from './software/sources.yaml';
import TUNING_ROWS from './tuning/index.tsv';
import TUNING_CONDITIONS from './tuning/when.yaml';

// Keys of the entries lie in files named after them, and so do the keys a component adds to the entries booting CFW
const LAUNCH_KEYS = import.meta.glob<LaunchKey>('./launch/*.yaml', {
	eager: true,
	import: 'default',
});
// Options of the groups lie in tables, the index of the groups tells which: the tables of one component share its folder
// and are named there after the sections of its config
const TUNING_TABLES = import.meta.glob<Row[]>('./tuning/**/*.tsv', {
	eager: true,
	import: 'default',
});

export const FIRMWARE = firmware(FIRMWARE_ROWS);
export const SOFTWARE = components(SOFTWARE_ROWS, SOFTWARE_SOURCES);
export const FILES = files(FILE_ROWS);
export const PRESETS = presets(PRESET_ROWS);
export const TUNING = tuning(
	TUNING_ROWS,
	path => TUNING_TABLES[`./tuning/${path}`],
	TUNING_CONDITIONS as Conditions,
);

export const LINK = link(LINK_ROWS);

// What the cells of the tables may hold where a type allows only some values
const MODES: BootMode[] = ['emummc', 'sysmmc', 'stock'];
const TARGETS: ImageTarget[] = ['bootlogo', 'background', 'icon'];

// An entry without a file of keys has none
const launchEntry = (row: Row) => {
	const id = cellOf(row, 'id');
	return compact({
		id,
		name: cellOf(row, 'name'),
		caption: cellOf(row, 'caption'),
		keys: LAUNCH_KEYS[`./launch/${id}.yaml`] ?? {},
		logo: text(row.logo),
		icon: text(row.icon),
	});
};

// Entries of the Launch menu that boot the system, with the keys of their sections
export const LAUNCH: BootEntry[] = LAUNCH_ROWS.filter(
	row => !row.component,
).map(row => ({ ...launchEntry(row), id: oneOf(MODES, row.id) }));

// Entries that are in the menu with a component: the other systems hekate boots, such as a Linux
export const SYSTEMS: ComponentEntry[] = LAUNCH_ROWS.filter(
	row => row.component,
).map(row => ({ ...launchEntry(row), component: cellOf(row, 'component') }));

// What hekate has to load with CFW for a component, such as its KIP: the keys the component adds to the entries booting CFW.
// A file named after an entry holds the keys of that entry instead, whatever component shares the name
export const MODULES: { [component: string]: LaunchKey } = Object.fromEntries(
	SOFTWARE.flatMap((comp): [string, LaunchKey][] => {
		const keys = LAUNCH_KEYS[`./launch/${comp.id}.yaml`];
		return keys && !LAUNCH_ROWS.some(row => row.id == comp.id)
			? [[comp.id, keys]]
			: [];
	}),
);

// Pictures of the gallery, their files are named after their targets and ids
export const APPEARANCE: Omit<GalleryImage, 'file'>[] = APPEARANCE_ROWS.map(
	row =>
		compact({
			id: cellOf(row, 'id'),
			target: oneOf(TARGETS, row.target),
			hue: flag(row.hue) || undefined,
			author: cellOf(row, 'author'),
			license: cellOf(row, 'license'),
			url: cellOf(row, 'url'),
		}),
);

// What sys-clk is offered: the clocks to pick from, the caps it lowers them to on every revision,
// ready sets of clocks and the games to make profiles for
export const OVERCLOCK: OverclockData = {
	frequencies: CLOCK_FREQUENCIES as OverclockData['frequencies'],
	caps: Object.fromEntries(
		CLOCK_CAP_ROWS.map((row): [string, Record<SwitchRevision, number>] => [
			cellOf(row, 'clock'),
			{
				erista: number(row.erista),
				mariko: number(row.mariko),
				oled: number(row.oled),
				lite: number(row.lite),
			},
		]),
	),
	templates: CLOCK_TEMPLATES as OverclockData['templates'],
	games: GAME_ROWS.map(row => ({
		id: cellOf(row, 'id'),
		name: cellOf(row, 'name'),
	})),
};
