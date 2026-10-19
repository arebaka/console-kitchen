import type { BootEntry, BootMode, ComponentEntry, GalleryImage, ImageTarget, LaunchKey, OverclockData } from '@/types';
import { type Conditions, type Row, compact, components, files, firmware, flag, link, number, presets, text, tuning } from '@/parse';

import LINK_ROWS from './link.tsv';
import FIRMWARE_ROWS from './firmware.tsv';
import SOFTWARE_ROWS from './software/index.tsv';
import SOFTWARE_SOURCES from './software/sources.yaml';
import FILE_ROWS from './software/files.tsv';
import PRESET_ROWS from './presets.tsv';
import LAUNCH_ROWS from './launch/index.tsv';
import TUNING_ROWS from './tuning/index.tsv';
import TUNING_CONDITIONS from './tuning/when.yaml';
import APPEARANCE_ROWS from './appearance.tsv';
import CLOCK_FREQUENCIES from './overclock/frequencies.yaml';
import CLOCK_CAP_ROWS from './overclock/caps.tsv';
import CLOCK_TEMPLATES from './overclock/templates.yaml';
import GAME_ROWS from './overclock/games.tsv';

// Keys of the entries lie in files named after them, and so do the keys a component adds to the entries booting CFW
const LAUNCH_KEYS = import.meta.glob<LaunchKey>('./launch/*.yaml', { eager: true, import: 'default' });
// Options of the groups lie in tables, the index of the groups tells which: the tables of one component share its folder
// and are named there after the sections of its config
const TUNING_TABLES = import.meta.glob<Row[]>('./tuning/**/*.tsv', { eager: true, import: 'default' });

export const FIRMWARE = firmware(FIRMWARE_ROWS);
export const SOFTWARE = components(SOFTWARE_ROWS, SOFTWARE_SOURCES);
export const FILES = files(FILE_ROWS);
export const PRESETS = presets(PRESET_ROWS);
export const TUNING = tuning(TUNING_ROWS, path => TUNING_TABLES[`./tuning/${path}`], TUNING_CONDITIONS as Conditions);

export const LINK = link(LINK_ROWS);

const launchEntry = (row: Row) => compact({
	id: row.id,
	name: row.name,
	caption: row.caption,
	keys: LAUNCH_KEYS[`./launch/${row.id}.yaml`],
	logo: text(row.logo),
	icon: text(row.icon)
});

// Entries of the Launch menu that boot the system, with the keys of their sections
export const LAUNCH: BootEntry[] = LAUNCH_ROWS
	.filter(row => !row.component)
	.map(row => (Object.assign(launchEntry(row), { id: row.id as BootMode })));

// Entries that are in the menu with a component: the other systems hekate boots, such as a Linux
export const SYSTEMS: ComponentEntry[] = LAUNCH_ROWS
	.filter(row => row.component)
	.map(row => (Object.assign(launchEntry(row), { component: row.component })));

// What hekate has to load with CFW for a component, such as its KIP: the keys the component adds to the entries booting CFW.
// A file named after an entry holds the keys of that entry instead, whatever component shares the name
export const MODULES: {[component: string]: LaunchKey} = Object.fromEntries(SOFTWARE
	.filter(comp => `./launch/${comp.id}.yaml` in LAUNCH_KEYS && !LAUNCH_ROWS.some(row => row.id == comp.id))
	.map(comp => [comp.id, LAUNCH_KEYS[`./launch/${comp.id}.yaml`]]));

// Pictures of the gallery, their files are named after their targets and ids
export const APPEARANCE: Omit<GalleryImage, 'file'>[] = APPEARANCE_ROWS.map(row => compact({
	id: row.id,
	target: row.target as ImageTarget,
	hue: flag(row.hue) || undefined,
	author: row.author,
	license: row.license,
	url: row.url
}));

// What sys-clk is offered: the clocks to pick from, the caps it lowers them to on every revision,
// ready sets of clocks and the games to make profiles for
export const OVERCLOCK: OverclockData = {
	frequencies: CLOCK_FREQUENCIES as OverclockData['frequencies'],
	caps: Object.fromEntries(CLOCK_CAP_ROWS.map(({ clock, ...revisions }) => [
		clock,
		Object.fromEntries(Object.entries(revisions).map(([revision, cap]) => [revision, number(cap)]))
	])) as OverclockData['caps'],
	templates: CLOCK_TEMPLATES as OverclockData['templates'],
	games: GAME_ROWS.map(({ id, name }) => ({ id, name }))
};
