import { listRow } from '@/data';
import type {
	ComponentCategory,
	ComponentInfo,
	ComponentSource,
	ComponentSources,
	Download,
	FirmwareStatus,
	FirmwareVersion,
	GithubAsset,
	HardwareRevision,
	ListField,
	Preset,
	Requirement,
	TuningGroup,
	TuningOption,
	TuningStep,
	Vocabulary,
} from '@/types';

// A row of a table: every cell is a string, an empty one where the row has nothing to say
export type Row = Record<string, string>;

// Sources of a component as the YAML spells them: a single asset or download may go without a list
type OneOrMany<T> = T | T[];
export interface SourcesEntry {
	appstore?: OneOrMany<string>;
	github?: OneOrMany<GithubAsset>;
	url?: OneOrMany<Download>;
	manual?: string;
	bundled?: string;
}

// Conditions of the options of a group, by option
export type Conditions = Record<string, Record<string, TuningOption['when']>>;

// What the cells of the tables may hold where a type allows only some values
const STATUSES: FirmwareStatus[] = ['stable', 'legacy', 'dead'];
const CATEGORIES: ComponentCategory[] = [
	'base',
	'payloads',
	'sysmodules',
	'overlays',
	'plugins',
	'tools',
	'installers',
	'saves',
	'mods',
	'amiibo',
	'themes',
	'media',
	'streaming',
	'emulators',
	'development',
];
const SOURCES: ComponentSource[] = [
	'appstore',
	'github',
	'url',
	'manual',
	'bundled',
];
const TRACKS: NonNullable<ComponentInfo['tracks']> = ['hos', 'atmosphere'];
export const REVISIONS: HardwareRevision[] = [
	'erista',
	'mariko',
	'oled',
	'lite',
	'psp1000',
	'psp2000',
	'psp3000',
	'pspgo',
	'pspstreet',
];
const STEPS: TuningStep[] = [
	'launch',
	'system',
	'security',
	'sysmodules',
	'overlays',
	'status_monitor',
	'dbi',
	'jksv',
	'amiibo',
	'plugins',
	'overclock',
];

// Drops what a row left empty, so an object only has the keys it has values for
export function compact<T extends object>(object: T): T {
	const kept = { ...object };
	for (const [key, value] of Object.entries(kept))
		if (value === undefined) Reflect.deleteProperty(kept, key);
	return kept;
}

// A cell of a column every row of the table has, empty or not: a table without it is a mistake
export function cellOf(row: Row, column: string): string {
	const value = row[column];
	if (value === undefined)
		throw new Error(`No column ${column} in the table`);
	return value;
}

// A cell that holds one of the values the type of its column allows
export function oneOf<T extends string>(
	values: readonly T[],
	cell: string | undefined,
): T {
	const value = values.find(item => item === cell);
	if (value === undefined)
		throw new Error(`Not one of ${values.join(', ')}: "${cell ?? ''}"`);
	return value;
}

// An empty cell has nothing to say
export const text = (cell: string | undefined): string | undefined =>
	cell === '' ? undefined : cell;

export function number(cell: string | undefined): number {
	const value = Number(cell);
	if (!cell || Number.isNaN(value))
		throw new Error(`Not a number: "${cell ?? ''}"`);
	return value;
}

// `1` sets a flag, an empty cell or `0` leaves it unset
export function flag(cell: string | undefined): boolean {
	if (cell == '1') return true;
	if (!cell || cell == '0') return false;
	throw new Error(`Not a flag: "${cell}"`);
}

// Values separated by commas
export const list = (cell: string | undefined): string[] | undefined =>
	cell ? cell.split(',') : undefined;

// A component, or any of the components separated by `|`
export const requirement = (cell: string): Requirement =>
	cell.includes('|') ? cell.split('|') : cell;

const many = <T>(value: OneOrMany<T> | undefined): T[] | undefined =>
	value === undefined ? undefined : ([] as T[]).concat(value);

export const firmware = (rows: Row[]): FirmwareVersion[] =>
	rows.map(row =>
		compact<FirmwareVersion>({
			version: cellOf(row, 'version'),
			date: new Date(cellOf(row, 'date')),
			status: oneOf(STATUSES, row.status),
			atmosphere: text(row.atmosphere),
			supported: row.supported ? new Date(row.supported) : undefined,
		}),
	);

// Components of a catalog: a row of the table each, with the sources of its downloads from the YAML next to the table
export const components = (
	rows: Row[],
	sources: Record<string, SourcesEntry>,
): ComponentInfo[] =>
	rows.map(row => {
		const id = cellOf(row, 'id');
		const from = sources[id] ?? {};
		return compact<ComponentInfo>({
			id,
			name: cellOf(row, 'name'),
			author: cellOf(row, 'author'),
			category: oneOf(CATEGORIES, row.category),
			link: text(row.link),
			version: cellOf(row, 'version'),
			size: number(row.size),
			released: text(row.released),
			logo: text(row.logo),
			source: oneOf(SOURCES, row.source),
			sources: compact<ComponentSources>({
				appstore: many(from.appstore),
				github: many(from.github),
				url: many(from.url),
				manual: from.manual,
				bundled: from.bundled,
			}),
			payload: text(row.payload),
			// Requirements are separated by commas and all have to be met
			requires: list(row.requires)?.map(requirement),
			replaces: list(row.replaces),
			conflicts_with: list(row.conflicts_with),
			tracks: list(row.tracks)?.map(item => oneOf(TRACKS, item)),
			hardware: list(row.hardware)?.map(item => oneOf(REVISIONS, item)),
			deprecated: flag(row.deprecated) || undefined,
			required: flag(row.required),
			risky: flag(row.risky) || undefined,
			plugin: row.plugin_path
				? { path: row.plugin_path, scope: list(row.plugin_scope) ?? [] }
				: undefined,
		});
	});

// Ids of a list by the numbers short links name them with. A number is kept for good, by what the catalog no longer has too,
// so the links made before read the same
export function numbered(rows: Row[], name: string): string[] {
	const ids: string[] = [];
	for (const row of rows.filter(item => item.list == name))
		ids[number(row.code)] = cellOf(row, 'id');
	return ids;
}

// What short links of a platform name by numbers: system versions, components, the words of the values, and the params.
// The params are numbered apart for every param of a short link they are packed into, in the list named after it
export function link(rows: Row[]): Vocabulary {
	const lists = new Set(['firmware', 'software', 'words']);
	const params = [...new Set(rows.map(row => cellOf(row, 'list')))].filter(
		param => !lists.has(param),
	);
	return {
		firmware: numbered(rows, 'firmware'),
		software: numbered(rows, 'software'),
		words: numbered(rows, 'words'),
		keys: Object.fromEntries(
			params.map(param => [param, numbered(rows, param)]),
		),
	};
}

export const presets = (rows: Row[]): Preset[] =>
	rows.map(row => ({
		id: cellOf(row, 'id'),
		components: list(row.components) ?? [],
	}));

// Files the components put onto the card, a row per file
export function files(rows: Row[]): { [component: string]: string[] } {
	const byComponent: { [component: string]: string[] } = {};
	for (const row of rows)
		(byComponent[cellOf(row, 'id')] ??= []).push(cellOf(row, 'path'));
	return byComponent;
}

// Values of a select are numbers when every one of them reads as a number
function scalars(cells: string[]): (string | number)[] {
	return cells.every(cell => cell != '' && !Number.isNaN(Number(cell)))
		? cells.map(Number)
		: cells;
}

// An option of a config, its cells read by its type
function option(row: Row): TuningOption {
	const id = cellOf(row, 'id');

	switch (row.type) {
		case 'toggle':
			return { id, type: 'toggle', default: flag(row.default) };
		case 'select': {
			const values = scalars(list(row.values) ?? []);
			return {
				id,
				type: 'select',
				values,
				default:
					typeof values[0] === 'number'
						? number(row.default)
						: cellOf(row, 'default'),
			};
		}
		case 'multiselect': {
			// The bounds are on how many values are picked at once
			const picked = list(row.default) ?? [];
			const min = row.min ? number(row.min) : undefined;
			const max = row.max ? number(row.max) : undefined;
			if (picked.length < (min ?? 0) || picked.length > (max ?? Infinity))
				throw new Error(
					`Default of the option ${id} is out of its bounds: "${row.default}"`,
				);
			return {
				id,
				type: 'multiselect',
				values: list(row.values) ?? [],
				default: picked,
				min,
				max,
			};
		}
		case 'range':
			return {
				id,
				type: 'range',
				min: number(row.min),
				max: number(row.max),
				step: number(row.step),
				default: number(row.default),
			};
		case 'number':
			return {
				id,
				type: 'number',
				min: number(row.min),
				max: number(row.max),
				default: number(row.default),
			};
		case 'text':
			return {
				id,
				type: 'text',
				maxLength: number(row.maxLength),
				default: cellOf(row, 'default'),
			};
		case 'hue':
			return { id, type: 'hue', default: number(row.default) };
		case 'color':
			return { id, type: 'color', default: cellOf(row, 'default') };
		case 'rgba4444': {
			const color = cellOf(row, 'default');
			if (!/^#[0-9A-F]{4}$/.test(color))
				throw new Error(`Not a color of the option ${id}: "${color}"`);
			return { id, type: 'rgba4444', default: color };
		}
		case 'list': {
			// The fields of a row are named in the cell of values, one with alternatives is a choice among them: of one,
			// or of as many at once as the number after them tells. The default spells its rows the way links do:
			// fields of a row are separated by `=`
			const fields = (list(row.values) ?? []).map(field => {
				const [name = '', values, max] = field.split(':');
				return compact<ListField>({
					id: name,
					values: values?.split('|'),
					max: max ? number(max) : undefined,
				});
			});
			const rows = (list(row.default) ?? []).map(item =>
				listRow(item, fields.length),
			);
			return {
				id,
				type: 'list',
				fields,
				maxLength: number(row.maxLength),
				max: row.max ? number(row.max) : undefined,
				default: rows,
			};
		}
		default:
			throw new Error(
				`Unknown type of the option ${id}: "${row.type ?? ''}"`,
			);
	}
}

// Groups of options in the order of their index. Every group keeps its options in the table its row points at,
// in the one named after the group without that, conditions of the options come from the YAML next to the tables
export const tuning = (
	index: Row[],
	table: (path: string) => Row[] | undefined,
	conditions: Conditions | null,
): TuningGroup[] =>
	index.map(row => {
		const id = cellOf(row, 'id');
		const path = row.table || `${id}.tsv`;
		const rows = table(path);
		if (!rows)
			throw new Error(
				`No table ${path} with the options of the group ${id}`,
			);
		if (!row.link)
			throw new Error(
				`No param of a link for the options of the group ${id}`,
			);
		return compact<TuningGroup>({
			id,
			step: oneOf(STEPS, row.step),
			link: row.link,
			file: cellOf(row, 'file'),
			section: text(row.section),
			requires: list(row.requires)?.map(requirement),
			options: rows.map(item => {
				const read = option(item);
				return compact<TuningOption>({
					...read,
					when: conditions?.[id]?.[read.id],
					secret: flag(item.secret) || undefined,
				});
			}),
		});
	});
