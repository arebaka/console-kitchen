import { parse, stringify } from 'smol-toml';

import { Catalog, TuningOption } from './types';
import { listRow } from './data';
import { Params } from './url';

// The file a build is exported to. The installers leave it on the card too, in the folder of the trace
export const BUILD_FILE = 'console-kitchen.toml';

// The file the dump scripts write next to themselves in the root of the card
export const DUMP_FILE = 'console-kitchen-dump.toml';

// Version of the format of the files, so a later one can still read them
const FORMAT = 1;

// Params of every platform that list several things, separated by commas: the software, the boot modes, the emuMMCs,
// the profiles of the overclock and the runlevels of a plugin
const isList = (key: string) => ['sw', 'boot', 'emummc', 'oc'].includes(key) || key.startsWith('plugin.');

export type TomlValue = string | number | boolean | TomlValue[];
export interface TomlTable { [key: string]: TomlValue | TomlTable }

const isTable = (value: unknown): value is TomlTable =>
	typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

// The option a param sets, if it sets one
function optionOf(catalog: Catalog, key: string): TuningOption | undefined {
	const group = catalog.tuning.find(group => key.startsWith(`${group.id}.`));
	return group?.options.find(option => key == `${group.id}.${option.id}`);
}

// A value as the file spells it: switches as booleans, numbers as numbers, what holds several values as an array,
// a list as an array of its rows, every row an array of its fields
function typed(option: TuningOption | undefined, key: string, raws: string[]): TomlValue {
	const [raw] = raws;
	if (!option) return isList(key) ? (raw ? raw.split(',') : []) : raw;
	switch (option.type) {
		case 'toggle':
			return raw == '1';
		case 'range':
		case 'number':
		case 'hue':
			return Number(raw);
		case 'select':
			return option.values.find(value => String(value) == raw) ?? raw;
		case 'multiselect':
			return raw ? raw.split(',') : [];
		case 'list':
			// An empty list is a param without a value
			return raws.filter(Boolean).map(row => listRow(row, option.fields.length)
				.map((cell, index) => option.fields[index].max === undefined ? cell : cell ? cell.split(',') : []));
		default:
			return raw;
	}
}

// A build as a file: the params of its link nested by the dots of their keys, `hekate.backlight` is `backlight` of `[hekate]`.
// Like a link it holds no passwords and no uploaded images
export function buildToml(catalog: Catalog, title: string, params: Params): string {
	const table: TomlTable = { kind: 'build', format: FORMAT, platform: catalog.platform };
	for (const key of new Set(params.map(([key]) => key))) {
		const path = key.split('.');
		let at = table;
		for (const part of path.slice(0, -1)) at = (at[part] ??= {}) as TomlTable;
		at[path.at(-1)!] = typed(optionOf(catalog, key), key, params.filter(([name]) => name == key).map(([, value]) => value));
	}
	return stringify(table);
}

// A file the Console Kitchen made, undefined unless it is one: a build or a dump of a card, of a format it reads
export function readToml(text: string): TomlTable | undefined {
	try {
		const table = parse(text);
		return isTable(table) && (table.kind == 'build' || table.kind == 'dump') && table.format == FORMAT ? table : undefined;
	} catch {
		return undefined;
	}
}

// A value as links spell it
const raw = (value: TomlValue): string =>
	typeof value === 'boolean' ? (value ? '1' : '0') : Array.isArray(value) ? value.map(raw).join(',') : String(value);

// The params of a link a build file holds, spelled the way a link spells them, so the platform reads them as it reads
// a link and keeps its defaults for whatever is invalid
export function tomlParams(catalog: Catalog, table: TomlTable, prefix = ''): Params {
	return Object.entries(table).flatMap(([name, value]): Params => {
		const key = `${prefix}${name}`;
		if (isTable(value)) return tomlParams(catalog, value, `${key}.`);
		if (optionOf(catalog, key)?.type != 'list') return [[key, raw(value)]];
		// A row of a list holds its fields separated by `=`, a field of several values holds them separated by commas
		const rows = Array.isArray(value) ? value : [value];
		return rows.length ? rows.map(row => [key, (Array.isArray(row) ? row : [row]).map(raw).join('=')]) : [[key, '']];
	});
}
