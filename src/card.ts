import { BuildState, Catalog, PlatformId } from './types';
import { BuildRequest, GeneratedFile } from './build';
import { PLATFORMS } from './platforms';
import { AppState, decodeState, withBuild, PLATFORM_IDS } from './state';
import { CardTexts, MovedSections, isReplaced, textOf } from './read';
import { TomlTable, readToml, tomlParams } from './toml';
import { Params, decodeTuning, query } from './url';

// A card as its dump tells: the files that show what is installed with their sizes, a folder with none,
// and the configs, the entries of hekate, the registry of the App Store and the trace as texts with their hashes
export interface CardDump {
	platform: PlatformId;
	made: string;
	files: {[path: string]: number};
	hashes: {[path: string]: string};
	texts: CardTexts;
}

// A path a dump may hold: from the root of the card, printable ASCII without the marks FAT keeps out of names
// and without a part going up or standing still. The scripts that make dumps write nothing else, a file made up by hand
// gets no further. The end of a list of the scripts, which no card names a file, is no path either
export const isCardPath = (path: string) =>
	/^[\x20-\x7e]+$/.test(path) && !/["\\:*?<>|]/.test(path) && !path.startsWith('/') && !path.startsWith("'@") &&
	path != 'CONSOLE_KITCHEN_EOF' && path.split('/').every((part, index, parts) => part != '..' && part != '.' && (part != '' || index == parts.length - 1));

// A tag of a release as releases name themselves: letters, digits and the marks of versions
export const isTag = (tag: string | undefined): tag is string => !!tag && /^[\w.+-]{1,64}$/.test(tag);

const lower = (path: string) => path.toLowerCase();

// Text of the base64 of a dump, as the bytes of UTF-8 it stands for
function fromBase64(data: string): string | undefined {
	try {
		return new TextDecoder('utf-8', { fatal: false }).decode(Uint8Array.from(atob(data), char => char.charCodeAt(0)));
	} catch {
		return undefined;
	}
}

// The dump in a file of the Console Kitchen, undefined unless it is one of a platform there is
export function readDump(table: TomlTable | undefined): CardDump | undefined {
	if (table?.kind != 'dump' || !PLATFORM_IDS.includes(table.platform as PlatformId)) return undefined;
	const entries = (value: unknown) => typeof value === 'object' && value !== null && !Array.isArray(value)
		? Object.entries(value as {[key: string]: unknown}).filter(([path]) => isCardPath(path))
		: [];
	const texts: CardTexts = {};
	for (const [path, value] of entries(table.texts)) {
		const base64 = typeof value === 'object' && value !== null ? (value as { base64?: unknown }).base64 : undefined;
		const text = typeof value === 'string' ? value : typeof base64 === 'string' ? fromBase64(base64) : undefined;
		if (text !== undefined) texts[path] = text;
	}
	return {
		platform: table.platform as PlatformId,
		made: typeof table.made === 'string' ? table.made : '',
		files: Object.fromEntries(entries(table.files).filter(([, size]) => typeof size === 'number' && size >= 0)) as CardDump['files'],
		hashes: Object.fromEntries(entries(table.hashes).filter(([, hash]) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash))) as CardDump['hashes'],
		texts
	};
}

// Lines of the trace the installers leave: the component, the release it came from and a file it put onto the card
export interface TraceLine {
	component: string;
	tag: string;
	path: string;
}

export function traceLines(dump: CardDump): TraceLine[] {
	const text = textOf(dump.texts, `${PLATFORMS[dump.platform].trace}/installed.tsv`) ?? '';
	return text.split(/\r?\n/).slice(1).flatMap(line => {
		const [component, tag, path] = line.split('\t');
		return component && path && isCardPath(path) ? [{ component, tag: tag ?? '', path }] : [];
	});
}

// Packages of the App Store a card has in its registry, with the files their manifests list
function registryPackages(dump: CardDump): {[name: string]: string[]} {
	const packages: {[name: string]: string[]} = {};
	for (const [path, text] of Object.entries(dump.texts)) {
		const [, name, file] = path.match(/^switch\/appstore\/\.get\/packages\/([^/]+)\/(info\.json|manifest\.install)$/i) ?? [];
		if (!name) continue;
		packages[name] ??= [];
		// A line of a manifest is a letter of what to do with a file and its path: `U: switch/app/app.nro`
		if (lower(file) == 'manifest.install') {
			packages[name].push(...text.split(/\r?\n/).map(line => line.replace(/^[A-Z]:\s*/, '').trim()).filter(isCardPath).filter(Boolean));
		}
	}
	return packages;
}

// Files that tell a component is there: executables of the console, sysmodules, payloads, plugins, systems of hekate
const MARKER = /(\.(nro|ovl|nsp|kip|bin|bso|prx|pbp|ark)|\/package3|\/KERNEL)$/i;

// Components installed on a card: the ones the trace lists, unless every file of theirs that tells is gone,
// the packages of the App Store in its registry, and the ones a file only they bring tells,
// or all their telling files when they share them
export function installedComponents(catalog: Catalog, dump: CardDump): string[] {
	const present = new Set([...Object.keys(dump.files), ...Object.keys(dump.texts)].map(lower));
	const markers = (paths: string[]) => paths.filter(path => MARKER.test(path)).map(lower);
	const owners = new Map<string, number>();
	for (const paths of Object.values(catalog.files)) {
		for (const path of new Set(markers(paths))) owners.set(path, (owners.get(path) ?? 0) + 1);
	}

	const traced: {[component: string]: string[]} = {};
	for (const line of traceLines(dump)) (traced[line.component] ??= []).push(line.path);
	const packages = new Set(Object.keys(registryPackages(dump)).map(lower));

	return catalog.components.filter(comp => {
		if (traced[comp.id]) {
			const telling = markers(traced[comp.id]);
			if (telling.length === 0 || telling.some(path => present.has(path))) return true;
		}
		if (comp.sources.appstore?.some(name => packages.has(lower(name)))) return true;
		const telling = markers(catalog.files[comp.id] ?? []);
		const own = telling.filter(path => owners.get(path) == 1);
		return own.length > 0 ? own.some(path => present.has(path)) : telling.length > 0 && telling.every(path => present.has(path));
	}).map(comp => comp.id);
}

// What a card holds that no component of the catalog brings: a sysmodule with its folder, an overlay, an application,
// a payload, a KIP or a set of patches of another build, a plugin or a homebrew of the XMB
export type ForeignKind = 'sysmodule' | 'overlay' | 'app' | 'payload' | 'kip' | 'patches' | 'package' | 'plugin';

export interface ForeignItem {
	path: string; // the file, or the folder ending with a slash
	kind: ForeignKind;
	name: string;
	enabled?: boolean; // a sysmodule that starts with the system
}

const FOREIGN: [RegExp, ForeignKind][] = [
	[/^(atmosphere\/contents\/[0-9a-f]{16}\/)exefs\.nsp$/i, 'sysmodule'],
	[/^switch\/\.overlays\/[^/]+\.ovl$/i, 'overlay'],
	[/^switch\/(?:[^/]+\/)?[^/]+\.nro$/i, 'app'],
	[/^bootloader\/payloads\/[^/]+\.bin$/i, 'payload'],
	[/^atmosphere\/kips\/[^/]+\.kip$/i, 'kip'],
	[/^atmosphere\/(?:exefs|kip)_patches\/[^/]+\/$/i, 'patches'],
	[/^switch\/\.packages\/[^/]+\/$/i, 'package'],
	[/^seplugins\/(?:[^/]+\/)?[^/]+\.prx$/i, 'plugin'],
	[/^psp\/game\/[^/]+\/eboot\.pbp$/i, 'app']
];

export function foreignItems(catalog: Catalog, dump: CardDump): ForeignItem[] {
	const known = [
		...Object.values(catalog.files).flat(),
		...traceLines(dump).map(line => line.path),
		...Object.values(registryPackages(dump)).flat()
	].map(lower);
	const knownFiles = new Set(known);
	const isKnown = (path: string) => path.endsWith('/') ? known.some(file => file.startsWith(lower(path))) : knownFiles.has(lower(path));
	const files = new Set(Object.keys(dump.files).map(lower));

	return Object.keys(dump.files).flatMap((file): ForeignItem[] => {
		for (const [pattern, kind] of FOREIGN) {
			const match = file.match(pattern);
			if (!match || isKnown(file)) continue;
			if (kind != 'sysmodule') return [{ path: file, kind, name: file.replace(/\/$/, '').split('/').pop()! }];
			// A sysmodule goes by its folder and the name its toolbox.json gives it
			const folder = match[1];
			let name = folder.split('/')[2];
			try {
				name = String(JSON.parse(textOf(dump.texts, `${folder}toolbox.json`) ?? '{}').name ?? name);
			} catch {}
			return [{ path: folder, kind, name, enabled: files.has(lower(`${folder}flags/boot2.flag`)) }];
		}
		return [];
	});
}

// What an update does with a foreign item: keeps it, turns a sysmodule off by taking its flag away, or deletes it.
// What it takes off the card goes into the backup
export type ForeignAction = 'keep' | 'disable' | 'delete';

export const defaultAction = (item: ForeignItem): ForeignAction => item.kind == 'sysmodule' && item.enabled ? 'disable' : 'keep';

// A card loaded from its dump: the dump, the build the card stands for and what to do with the foreign items on it.
// It stays in the page: links never carry it
export interface CardSnapshot {
	dump: CardDump;
	base: BuildState;
	installed: string[];
	foreign: ForeignItem[];
	actions: {[path: string]: ForeignAction};
}

// The state with the build of the card, read as its trace and its configs tell: the trace for the console, the system
// and what no config holds, the configs for their options, the files for the components. Secrets come with the configs.
// Without a trace the console and the system stay the ones of the page
export function importDump(state: AppState, dump: CardDump): { state: AppState; snapshot: CardSnapshot } {
	const platform = PLATFORMS[dump.platform];
	const trace = textOf(dump.texts, `${platform.trace}/build.toml`);
	const table = trace === undefined ? undefined : readToml(trace);
	const base: Params = table?.kind == 'build' ? tomlParams(platform.catalog, table) : [];
	const reading = platform.readCard(dump.texts);
	const installed = installedComponents(platform.catalog, dump);
	const current = state.builds[dump.platform];

	const read = new Set(reading.params.map(([key]) => key));
	const kept = base.filter(([key]) => key != 'sw' && !read.has(key) && !isReplaced(reading.replaced, key));
	const params: Params = [
		...reading.params,
		['sw', installed.join(',')],
		...kept,
		...(kept.some(([key]) => key == 'hw') ? [] : [['hw', current.hardware] as [string, string]]),
		...(kept.some(([key]) => key == platform.link.firmwareKey) ? [] : [[platform.link.firmwareKey, current.firmware] as [string, string]])
	];
	const build = decodeState(query(params)).builds[dump.platform];
	decodeTuning(platform.catalog.tuning, new URLSearchParams(reading.params), build.tuning, true);

	const foreign = foreignItems(platform.catalog, dump);
	return {
		state: { ...state, platform: dump.platform, builds: withBuild(state.builds, dump.platform, build) },
		snapshot: { dump, base: structuredClone(build), installed, foreign, actions: Object.fromEntries(foreign.map(item => [item.path, defaultAction(item)])) }
	};
}

// What an update does to the card of a snapshot to make it the build: the components it installs, the release tags
// the trace has for them, so a fresh one is skipped, the files of the removed ones to delete, which never are configs,
// the configs it writes with the hashes they had at the dump, the ones it leaves as they are and the foreign items it takes off
export interface UpdatePlan {
	install: string[];
	added: string[]; // the components new to the card
	refreshed: string[]; // the ones on the card already, downloaded again when a newer release is out
	tags: {[component: string]: string};
	removed: string[];
	remove: { component: string; files: string[] }[];
	configs: GeneratedFile[];
	hashes: {[path: string]: string};
	unchanged: string[];
	moved: MovedSections[]; // sections of other builds the configs written again lose, moved into files of their own
	protect: string[]; // configs an archive does not overwrite
	images: boolean; // the appearance changed, so the images are written again
	disable: string[]; // folders of sysmodules
	delete: string[]; // files, and folders ending with a slash
	uncovered: { path: string; lines: string[] }[];
}

export function updatePlan(snapshot: CardSnapshot, request: BuildRequest): UpdatePlan {
	const { dump, base, installed } = snapshot;
	const platform = PLATFORMS[dump.platform];
	const { catalog } = platform;
	const written = platform.build({ ...request, update: undefined }).configs;
	const before = platform.build({ ...request, ...base, update: undefined }).configs;
	const onCard = (path: string) => textOf(dump.texts, path) !== undefined;

	// A config is written when the card lacks it or its options changed since the dump, the rest stays as the card has it
	const changed = written.filter(config => !onCard(config.path) || before.find(item => item.path == config.path)?.content != config.content);
	const unchanged = written.filter(config => !changed.includes(config)).map(config => config.path);

	// Files of a removed component, as its trace, its package of the App Store and the catalog list them. What a component
	// staying in the build also brings, configs and the trace stay
	const trace = traceLines(dump);
	const registry = registryPackages(dump);
	const staying = new Set(request.selectedComponentIDs.flatMap(id => [
		...catalog.files[id] ?? [],
		...trace.filter(line => line.component == id).map(line => line.path)
	]).map(lower));
	const isConfig = (path: string) => lower(path).startsWith('config/') || platform.configPaths.some(config => lower(config) == lower(path))
		|| lower(path).startsWith(`${lower(platform.trace)}/`);
	const remove = installed.filter(id => !request.selectedComponentIDs.includes(id)).map(id => {
		const comp = catalog.components.find(item => item.id == id)!;
		const packages = (comp.sources.appstore ?? []).filter(name => registry[name]);
		const files = [...new Set([
			...trace.filter(line => line.component == id).map(line => line.path),
			...packages.flatMap(name => [...registry[name], `switch/appstore/.get/packages/${name}/info.json`, `switch/appstore/.get/packages/${name}/manifest.install`]),
			...catalog.files[id] ?? []
		])].filter(path => !isConfig(path) && !staying.has(lower(path))).toSorted();
		return { component: id, files };
	});

	// Components installed before take the tags of their releases from the trace, a component of several releases
	// is fresh only when all of them are. A tag goes into the scripts between quotes, so it is only taken when it is
	// made of what tags are made of, a component with another one is downloaded again
	const tags: {[component: string]: string} = {};
	for (const id of request.selectedComponentIDs.filter(id => installed.includes(id))) {
		const own = [...new Set(trace.filter(line => line.component == id).map(line => line.tag))];
		if (own.length == 1 && isTag(own[0])) tags[id] = own[0];
	}

	// Uploaded images cannot be told from the ones on the card, so with one the images are written again
	const appearance = (build: BuildState) => JSON.stringify((build as { appearance?: unknown }).appearance ?? null);
	const images = appearance(base) != appearance(request) || appearance(request).includes('"upload"');

	// Sections of other builds in the configs written again move into files of their own instead of going with them,
	// so they are no lines the update loses
	const moves = platform.moveCard(dump.texts, changed.map(config => config.path));
	const configs = [...changed, ...moves.configs];
	const isMoved = (path: string, line: string) => moves.moved.some(move => move.from == path && move.sections.some(name => line.startsWith(`[${name}] `)));
	const uncovered = platform.uncoveredCard(request, dump.texts)
		.filter(item => changed.some(config => config.path == item.path))
		.map(item => (Object.assign(item, { lines: item.lines.filter((line) => !isMoved(item.path, line)) })))
		.filter(item => item.lines.length);

	const { actions, foreign } = snapshot;
	return {
		install: request.selectedComponentIDs,
		added: request.selectedComponentIDs.filter(id => !installed.includes(id)),
		refreshed: request.selectedComponentIDs.filter(id => installed.includes(id)),
		tags,
		removed: remove.map(item => item.component),
		remove: remove.filter(item => item.files.length),
		protect: platform.configPaths,
		images,
		configs,
		hashes: Object.fromEntries(configs.flatMap(config => {
			const key = Object.keys(dump.hashes).find(path => lower(path) == lower(config.path));
			return key ? [[config.path, dump.hashes[key]]] : [];
		})),
		unchanged,
		moved: moves.moved,
		disable: foreign.filter(item => actions[item.path] == 'disable' && item.kind == 'sysmodule').map(item => item.path),
		delete: foreign.filter(item => actions[item.path] == 'delete').map(item => item.path),
		uncovered
	};
}
