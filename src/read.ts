import { TuningGroup, TuningOption } from './types';
import type { ConfigSpec, GeneratedFile } from './build';
import { Params } from './url';

// Texts of a card by their paths, as a dump holds them
export interface CardTexts {
	[path: string]: string;
}

// A text of the card by its path, in any case: a card does not tell names in other cases apart
export function textOf(texts: CardTexts, path: string): string | undefined {
	if (path in texts) return texts[path];
	const key = Object.keys(texts).find(key => key.toLowerCase() == path.toLowerCase());
	return key === undefined ? undefined : texts[key];
}

// What the configs of a card stand for: the params of a link they hold, and the params of another build they replace,
// keys and prefixes ending with a dot. The options of the groups of a config take their defaults where the config
// is missing, as its program does, what else it covers goes once it is on the card, whatever it says
export interface CardReading {
	params: Params;
	replaced: string[];
}

export function readConfigs<R>(specs: ConfigSpec<R>[], groups: TuningGroup[], texts: CardTexts): CardReading {
	const params: Params = [];
	const replaced = new Set<string>();
	for (const spec of specs) {
		const prefixes = spec.prefixes ?? {};
		const own = groups.filter(group => group.file == spec.path || Object.values(prefixes).includes(group.id));
		own.forEach(group => replaced.add(`${group.id}.`));
		const text = textOf(texts, spec.path);
		if (text === undefined) continue;
		spec.covers?.forEach(key => replaced.add(key));
		const card = cardConfig(spec.template, spec.path, text, name => optionNamed(own, prefixes, name)?.option.type == 'list');
		const read = spec.read?.(card, texts) ?? [];
		const keys = new Set(read.map(([key]) => key));
		const found = [...read, ...cardParams(card, own, prefixes).filter(([key]) => !keys.has(key))];
		// A later config tells an option a config before it also holds, as Ultrahand copies its combo over the one of Tesla
		const later = new Set(found.map(([key]) => key));
		params.splice(0, params.length, ...params.filter(([key]) => !later.has(key)), ...found);
	}
	return { params, replaced: [...replaced] };
}

// Whether a key of a link is one of the replaced ones
export const isReplaced = (replaced: string[], key: string) => replaced.some(item => item.endsWith('.') ? key.startsWith(item) : key == item);

// Sections of an ini as the card has them: the line of the name and every line under it up to the next section,
// comments included and empty lines at the end left out
function rawSections(text: string): { name: string; text: string }[] {
	const sections: { name: string; lines: string[] }[] = [];
	for (const line of text.split(/\r?\n/)) {
		const header = line.trim().match(/^\[(.*)\]$/);
		if (header) sections.push({ name: header[1].trim(), lines: [line] });
		else sections.at(-1)?.lines.push(line);
	}
	return sections.map(({ name, lines }) => ({ name, text: lines.join('\n').trimEnd() }));
}

// Sections of a config that move into another file, by their names
export interface MovedSections {
	from: string;
	into: string;
	sections: string[];
}

// What moves when configs of a card are written again: their sections the Console Kitchen does not own go after
// what the file they move into holds already, a section that is there by its name stays as it is there
export function movedConfigs<R>(specs: ConfigSpec<R>[], texts: CardTexts, written: string[]): { configs: GeneratedFile[]; moved: MovedSections[] } {
	const configs: GeneratedFile[] = [];
	const moved: MovedSections[] = [];
	for (const spec of specs) {
		const text = textOf(texts, spec.path);
		if (!spec.moves || text === undefined || !written.includes(spec.path)) continue;
		const existing = textOf(texts, spec.moves.into) ?? '';
		const there = new Set(iniSections(existing).map(section => section.name));
		const sections = rawSections(text).filter(section => !spec.moves!.owns(section.name) && !there.has(section.name));
		if (sections.length === 0) continue;
		configs.push({ path: spec.moves.into, content: `${[existing.trimEnd(), ...sections.map(section => section.text)].filter(Boolean).join('\n\n')}\n` });
		moved.push({ from: spec.path, into: spec.moves.into, sections: sections.map(section => section.name) });
	}
	return { configs, moved };
}

// Lines of the configs of a card a build would lose writing them again, by config. A config the build does not write
// stays on the card as it is
export function uncoveredConfigs<R>(specs: ConfigSpec<R>[], texts: CardTexts, written: GeneratedFile[]): { path: string; lines: string[] }[] {
	return specs.flatMap(spec => {
		const text = textOf(texts, spec.path);
		const config = written.find(file => file.path == spec.path);
		const lines = text === undefined || !config ? [] : uncoveredLines(spec.path, text, config.content, spec.transient);
		return lines.length > 0 ? [{ path: spec.path, lines }] : [];
	});
}

// Lines of an ini by its sections, the lines before the first section in one without a name. Comments and empty lines
// are left out, a key keeps its first value, as the console programs read their configs
export interface IniSection {
	name: string;
	lines: string[];
	keys: {[key: string]: string};
}

export function iniSections(text: string): IniSection[] {
	const sections: IniSection[] = [{ name: '', lines: [], keys: {} }];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.trim();
		if (!line || line.startsWith(';') || line.startsWith('#')) continue;
		const header = line.match(/^\[(.*)\]$/);
		if (header) {
			sections.push({ name: header[1].trim(), lines: [], keys: {} });
			continue;
		}
		const section = sections.at(-1)!;
		section.lines.push(line);
		const at = line.indexOf('=');
		if (at > 0) section.keys[line.slice(0, at).trim()] ??= line.slice(at + 1).trim();
	}
	return sections;
}

// A config as a card holds it, taken apart the way its template puts it together
export interface CardConfig {
	text: string;
	sections: IniSection[];
	values: {[name: string]: string}; // what the placeholders of the template stand for in the config
	rows: {[name: string]: {[field: string]: string}[]}; // the rows of every list of the template, their fields by name
	json?: unknown; // a config in JSON, parsed
}

// A part of a template line as a pattern: the text as it is, a placeholder as what it stands for,
// a block inside the line as something that may be missing
function linePattern(line: string): { pattern: RegExp; names: string[] } {
	const names: string[] = [];
	const source = line.split(/(\{\{[#^/]?[\w.]+\}\})/).map(part => {
		const tag = part.match(/^\{\{([#^/]?)([\w.]+)\}\}$/);
		if (!tag) return part.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
		if (tag[1] == '/') return ')?';
		if (tag[1]) return '(?:';
		names.push(tag[2]);
		return '(.*?)';
	}).join('');
	return { pattern: new RegExp(`^${source}$`), names };
}

// Where the placeholders of an ini template go: a key of a section, a line of its own such as `always, usbcharge, on`
// of ARK, or a row of a list block in its section. A section named by a placeholder repeats for a list, the config reads
// such sections itself, and so it does a line that is nothing but a placeholder
function templateParts(template: string, isList: (name: string) => boolean) {
	const keys: { section: string; key: string; pattern: RegExp; names: string[] }[] = [];
	const lines: { section: string; pattern: RegExp; names: string[] }[] = [];
	const lists: { section: string; name: string; pattern: RegExp; names: string[] }[] = [];
	const blocks: string[] = [];
	let section: string | undefined = '';
	for (const raw of template.split('\n')) {
		const line = raw.trim();
		const block = line.match(/^\{\{([#^/])([\w.]+)\}\}$/);
		if (block) {
			if (block[1] == '/') blocks.pop();
			else blocks.push(block[2]);
			continue;
		}
		if (!line || line.startsWith(';') || line.startsWith('#')) continue;
		const header = line.match(/^\[(.*)\]$/);
		if (header) {
			section = header[1].includes('{{') ? undefined : header[1];
			continue;
		}
		if (section === undefined) continue;
		const list = [...blocks].toReversed().find(isList);
		if (list) {
			lists.push({ section, name: list, ...linePattern(line) });
			continue;
		}
		const at = line.indexOf('=');
		if (at > 0 && !line.slice(0, at).includes('{{') && line.slice(at + 1).includes('{{')) {
			keys.push({ section, key: line.slice(0, at).trim(), ...linePattern(line.slice(at + 1).trim()) });
		} else if (line.includes('{{') && line.replaceAll(/\{\{[#^/]?[\w.]+\}\}/g, '').trim() != '') {
			lines.push({ section, ...linePattern(line) });
		}
	}
	return { keys, lines, lists };
}

// What the placeholders of a JSON template stand for: the values of the keys they fill in, as text
function jsonValues(template: string, json: unknown): {[name: string]: string} {
	const values: {[name: string]: string} = {};
	if (typeof json !== 'object' || json === null) return values;
	for (const line of template.replaceAll(/\{\{[#^/][\w.]+\}\}/g, '').split('\n')) {
		const [, key, name] = line.match(/^\s*"([^"]+)":\s*\{\{([\w.]+)\}\},?\s*$/) ?? [];
		const value = key === undefined ? undefined : (json as {[key: string]: unknown})[key];
		if (value !== undefined && value !== null && typeof value !== 'object') values[name] = String(value);
	}
	return values;
}

// A config of a card read through its template. `isList` tells the blocks of a template that are lists of rows
// from the ones that only show their lines when something is set
export function cardConfig(template: string, path: string, text: string, isList: (name: string) => boolean): CardConfig {
	if (path.endsWith('.json')) {
		let json: unknown;
		try {
			json = JSON.parse(text);
		} catch {
			json = undefined;
		}
		return { text, sections: [], values: jsonValues(template, json), rows: {}, json };
	}

	const sections = iniSections(text);
	const section = (name: string) => sections.find(item => item.name == name);
	const values: CardConfig['values'] = {};
	const rows: CardConfig['rows'] = {};
	const { keys, lines, lists } = templateParts(template, isList);
	for (const key of keys) {
		const value = section(key.section)?.keys[key.key];
		const match = value === undefined ? null : key.pattern.exec(value);
		key.names.forEach((name, index) => {
			if (match?.[index + 1] !== undefined) values[name] ??= match[index + 1];
		});
	}
	// A line of its own is the first one of its section that matches it
	for (const line of lines) {
		const match = section(line.section)?.lines.map(text => line.pattern.exec(text)).find(Boolean);
		line.names.forEach((name, index) => {
			if (match?.[index + 1] !== undefined) values[name] ??= match[index + 1];
		});
	}
	for (const list of lists) {
		const taken = new Set(keys.filter(key => key.section == list.section).map(key => key.key));
		rows[list.name] ??= [];
		for (const line of section(list.section)?.lines ?? []) {
			const at = line.indexOf('=');
			if (at > 0 && taken.has(line.slice(0, at).trim())) continue;
			const match = list.pattern.exec(line);
			if (match) rows[list.name].push(Object.fromEntries(list.names.map((name, index) => [name, match[index + 1] ?? ''])));
		}
	}
	return { text, sections, values, rows };
}

// A value of a config as links spell it, undefined unless the option can take it. Switches come as 1 and 0, true and false,
// on and off or u8 values of Atmosphere, numbers in decimal or hex, several values joined with plus signs or commas
export function optionRaw(option: TuningOption, text: string): string | undefined {
	const value = text.trim();
	switch (option.type) {
		case 'toggle':
			return /^(1|true|on|0x0*1)$/i.test(value) ? '1' : /^(0|false|off|0x0+)$/i.test(value) ? '0' : undefined;
		case 'range':
		case 'number':
		case 'hue': {
			const number = Number(value);
			return value != '' && Number.isFinite(number) ? String(number) : undefined;
		}
		case 'select': {
			const values = option.values.map(String);
			return values.find(item => item == value) ?? values.find(item => value != '' && Number(item) == Number(value));
		}
		case 'multiselect':
			return value.split(/[+,]/).map(item => item.trim()).filter(Boolean).join(',');
		case 'color':
			return /^#?[0-9a-f]{6}$/i.test(value) ? `#${value.replace('#', '').toLowerCase()}` : undefined;
		case 'list':
			return undefined;
		default:
			return value;
	}
}

// The option a name of a template sets: `prefix.id` the option of the group the prefix stands for,
// a plain name the option of that id in a group of the file
export function optionNamed(groups: TuningGroup[], prefixes: {[prefix: string]: string}, name: string) {
	const at = name.lastIndexOf('.');
	const candidates = at < 0 ? groups : groups.filter(group => group.id == prefixes[name.slice(0, at)]);
	const id = name.slice(at + 1);
	for (const group of candidates) {
		const option = group.options.find(option => option.id == id);
		if (option) return { group, option, key: `${group.id}.${option.id}` };
	}
	return;
}

// The params of a link the values and the rows of a config stand for
export function cardParams(card: CardConfig, groups: TuningGroup[], prefixes: {[prefix: string]: string} = {}): Params {
	const params: Params = [];
	for (const [name, value] of Object.entries(card.values)) {
		const named = optionNamed(groups, prefixes, name);
		const raw = named && optionRaw(named.option, value);
		if (raw !== undefined) params.push([named!.key, raw]);
	}
	for (const [name, rows] of Object.entries(card.rows)) {
		const named = optionNamed(groups, prefixes, name);
		const option = named?.option;
		if (!named || option?.type != 'list') continue;
		const { fields } = option;
		// A row holds its fields separated by `=`, a field of several values holds them separated by commas
		const cells = (row: {[field: string]: string}) => fields.map(field => {
			const cell = (row[field.id] ?? '').trim();
			return field.max === undefined ? cell : cell.split(/[+,]/).map(item => item.trim()).filter(Boolean).join(',');
		});
		params.push(...(rows.length > 0 ? rows.map(row => [named.key, cells(row).join('=')] as [string, string]) : [[named.key, ''] as [string, string]]));
	}
	return params;
}

// Lines of a config on the card that the config written again would not have: settings no option holds, or entries,
// sections and rows the Console Kitchen does not know. Keys the program writes for itself do not count
export function uncoveredLines(path: string, card: string, written: string, transient: string[] = []): string[] {
	if (path.endsWith('.json')) {
		try {
			const before = JSON.parse(card) as {[key: string]: unknown};
			const after = JSON.parse(written) as {[key: string]: unknown};
			return Object.entries(before)
				.filter(([key, value]) => !transient.includes(key) && JSON.stringify(value) != JSON.stringify(after[key]))
				.map(([key, value]) => `"${key}": ${JSON.stringify(value)}`);
		} catch {
			return [];
		}
	}
	const after = iniSections(written);
	return iniSections(card).flatMap(section => {
		const same = after.find(item => item.name == section.name);
		return section.lines
			.filter(line => {
				const at = line.indexOf('=');
				const key = at > 0 ? line.slice(0, at).trim() : undefined;
				if (key !== undefined && transient.includes(key)) return false;
				return key !== undefined && same?.keys[key] !== undefined ? same.keys[key] != line.slice(at + 1).trim() : !same?.lines.includes(line);
			})
			.map(line => section.name ? `[${section.name}] ${line}` : line);
	});
}
