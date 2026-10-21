import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { HARDWARE } from '@data';
import { I18N } from '@i18n';
import { afterAll, describe, expect, it } from 'vitest';

import {
	BuildRequest,
	GeneratedFile,
	installerView,
	installers,
} from '@/build';
import {
	CardDump,
	UpdatePlan,
	foreignItems,
	importDump,
	installedComponents,
	readDump,
	updatePlan,
} from '@/card';
import { PLATFORMS } from '@/platforms';
import { SWITCH } from '@/platforms/switch';
import { defaultState } from '@/state';
import { BUILD_FILE, DUMP_FILE, readToml } from '@/toml';
import { BuildState, PlatformId } from '@/types';

import { everythingState } from './fixtures';

const has = (command: string) =>
	spawnSync('sh', ['-c', `command -v ${command}`]).status == 0;
const request = <S extends BuildState>(build: S): BuildRequest<S> => ({
	...build,
	lang: 'en',
	t: I18N.en,
});
const sha256 = (text: string) =>
	createHash('sha256').update(text).digest('hex');
const configsOf = (platform: PlatformId, build: BuildState) =>
	Object.fromEntries(
		PLATFORMS[platform]
			.build(request(build))
			.configs.map(config => [config.path, config.content]),
	);

// A dump of a card a build was installed onto: the files of its components and its configs, without a trace
function dumpOf(
	platform: PlatformId,
	build: BuildState,
	texts: { [path: string]: string } = {},
): CardDump {
	const { catalog } = PLATFORMS[platform];
	const configs = { ...configsOf(platform, build), ...texts };
	return {
		platform,
		made: '2026-10-18T00:00:00Z',
		files: Object.fromEntries(
			build.selectedComponentIDs
				.flatMap(id => catalog.files[id] ?? [])
				.map(path => [path, 1]),
		),
		hashes: Object.fromEntries(
			Object.entries(configs).map(([path, text]) => [path, sha256(text)]),
		),
		texts: configs,
	};
}

describe('dumps of cards', () => {
	it.each(['switch', 'psp'] as const)(
		'bring back every config of the %s as the card has it, secrets too',
		platform => {
			const build = everythingState(platform).builds[platform];
			const { state } = importDump(
				defaultState(),
				dumpOf(platform, build),
			);
			expect(configsOf(platform, state.builds[platform])).toEqual(
				configsOf(platform, build),
			);
		},
	);

	it('read the configs edited on the console, keys of other sections and lines in other cases included', () => {
		const build = SWITCH.defaults();
		const dump = dumpOf('switch', build, {
			'bootloader/nyx.ini': '[config]\nthemecolor=200\nthemebg=2d2d2d\n',
			'atmosphere/config/system_settings.ini':
				'[atmosphere]\nenable_dns_mitm=u8!0x0\n[hbloader]\napplet_heap_size = u64!0x20000000\n',
			'config/ultrahand/config.ini':
				'[ultrahand]\nhide_clock=true\nkey_combo=L+R+DDOWN\ncurrent_theme=default\n',
		});
		const { state } = importDump(defaultState(), dump);
		const { tuning } = state.builds.switch;
		expect(tuning.nyx?.themecolor).toBe(200);
		expect(tuning.dns?.mode).toBe('off');
		expect(tuning.atmosphere?.applet_heap_size).toBe(512);
		expect(tuning.ultrahand?.show_clock).toBe(false);
		expect(tuning.tesla?.key_combo).toEqual(['L', 'R', 'DDOWN']);
	});

	it('take the console and the system from the trace, the components from the card', () => {
		const traced = {
			...SWITCH.defaults(),
			hardware: 'mariko' as const,
			firmware: '20.0.0',
		};
		const exported = PLATFORMS.switch
			.build(request(traced))
			.files.find(file => file.path == BUILD_FILE)!.content;
		const build = {
			...SWITCH.defaults(),
			selectedComponentIDs: [
				...SWITCH.defaults().selectedComponentIDs,
				'sys_clk',
			],
		};
		const { state } = importDump(
			defaultState(),
			dumpOf('switch', build, {
				[`${SWITCH.trace}/build.toml`]: exported,
			}),
		);
		expect(state.builds.switch.hardware).toBe('mariko');
		expect(state.builds.switch.firmware).toBe('20.0.0');
		expect(state.builds.switch.selectedComponentIDs).toContain('sys_clk');
	});

	it('tell the components by the files only they bring', () => {
		const { catalog } = PLATFORMS.switch;
		const dump = {
			...dumpOf('switch', SWITCH.defaults()),
			files: Object.fromEntries(
				['sys_clk', 'ultrahand']
					.flatMap(id => catalog.files[id])
					.map(path => [path, 1]),
			),
		};
		const installed = installedComponents(catalog, dump);
		expect(installed).toEqual(
			expect.arrayContaining(['sys_clk', 'ultrahand']),
		);
		// Tesla shares its loader and its menu with Ultrahand, the example overlay only it brings is missing
		expect(installed).not.toContain('ovlmenu');
		expect(installed).not.toContain('missioncontrol');
	});

	it('tell what other builds left, a sysmodule by its folder and the name of its toolbox', () => {
		const dump = dumpOf('switch', SWITCH.defaults(), {
			'atmosphere/contents/0100000000000ABC/toolbox.json':
				'{"name": "Foreign"}',
		});
		Object.assign(dump.files, {
			'atmosphere/contents/0100000000000ABC/exefs.nsp': 1,
			'atmosphere/contents/0100000000000ABC/flags/boot2.flag': 0,
			'switch/.overlays/foreign.ovl': 1,
			'atmosphere/exefs_patches/foreign_patches/': 0,
		});
		const items = foreignItems(PLATFORMS.switch.catalog, dump);
		expect(items).toEqual(
			expect.arrayContaining([
				{
					path: 'atmosphere/contents/0100000000000ABC/',
					kind: 'sysmodule',
					name: 'Foreign',
					enabled: true,
				},
				{
					path: 'switch/.overlays/foreign.ovl',
					kind: 'overlay',
					name: 'foreign.ovl',
				},
				{
					path: 'atmosphere/exefs_patches/foreign_patches/',
					kind: 'patches',
					name: 'foreign_patches',
				},
			]),
		);
		expect(items.map(item => item.path)).not.toContain(
			'atmosphere/package3',
		);
		expect(
			importDump(defaultState(), dump).snapshot.actions[
				'atmosphere/contents/0100000000000ABC/'
			],
		).toBe('disable');
	});

	it('keep every path that would leave the card or end a list of the scripts out of a dump', () => {
		const hostile = [
			'../outside.txt',
			'/etc/passwd',
			'switch/../../outside.txt',
			'switch/./x.nro',
			'C:/x.nro',
			'switch\\x.nro',
			'CONSOLE_KITCHEN_EOF',
			"'@x.nro",
			'line\nbreak.nro',
		];
		const keys = [...hostile, 'switch/fine.nro']
			.map(path => `${JSON.stringify(path)} = 1`)
			.join('\n');
		const dump = readDump(
			readToml(
				`kind = "dump"\nformat = 1\nplatform = "switch"\n\n[files]\n${keys}\n`,
			),
		)!;
		expect(Object.keys(dump.files)).toEqual(['switch/fine.nro']);
	});
});

describe('plans of updates', () => {
	const before = {
		...SWITCH.defaults(),
		selectedComponentIDs: [
			...SWITCH.defaults().selectedComponentIDs,
			'sys_clk',
			'ovlmenu',
		],
	};
	const trace = `component\ttag\tpath\nsys_clk\t2.0.1\tatmosphere/contents/00FF0000636C6BFF/exefs.nsp\nhekate\tv6.5.4\tbootloader/update.bin\n`;
	const loaded = importDump(
		defaultState(),
		dumpOf('switch', before, { [`${SWITCH.trace}/installed.tsv`]: trace }),
	);
	const after = structuredClone(loaded.state.builds.switch);
	after.selectedComponentIDs = after.selectedComponentIDs.filter(
		id => id != 'sys_clk',
	);
	after.tuning.hekate!.backlight = 50;
	const plan = updatePlan(loaded.snapshot, request(after));

	it('remove the components that left the build without their configs', () => {
		expect(plan.removed).toEqual(['sys_clk']);
		const files = plan.remove.flatMap(item => item.files);
		expect(files).toContain(
			'atmosphere/contents/00FF0000636C6BFF/exefs.nsp',
		);
		expect(files).toContain('switch/.overlays/sys-clk-overlay.ovl');
		expect(files.filter(path => path.startsWith('config/'))).toEqual([]);
	});

	it('write the configs whose options changed and leave the others as the card has them', () => {
		// The section of sys-clk leaves the list of overlays of Ultrahand with it
		expect(plan.configs.map(config => config.path)).toEqual([
			'bootloader/hekate_ipl.ini',
			'config/ultrahand/overlays.ini',
		]);
		expect(plan.hashes['bootloader/hekate_ipl.ini']).toBe(
			loaded.snapshot.dump.hashes['bootloader/hekate_ipl.ini'],
		);
		expect(plan.unchanged).toContain(
			'atmosphere/config/system_settings.ini',
		);
		// The config of the removed sys-clk is not written and stays
		expect(plan.unchanged).not.toContain('config/sys-clk/config.ini');
	});

	it('check the release of a component the trace has one for', () => {
		expect(plan.tags.hekate).toBe('v6.5.4');
		expect(plan.tags.atmosphere).toBeUndefined();
	});

	it('move the entries of other builds into More configs instead of losing them with hekate_ipl.ini', () => {
		const ini = `${configsOf('switch', before)['bootloader/hekate_ipl.ini']!.trimEnd()}\n\n[Android]\n; kept as it is\npayload=bootloader/payloads/android.bin\n`;
		const moving = importDump(
			defaultState(),
			dumpOf('switch', before, { 'bootloader/hekate_ipl.ini': ini }),
		);
		const changed = structuredClone(moving.state.builds.switch);
		changed.tuning.hekate!.backlight = 50;
		const movingPlan = updatePlan(moving.snapshot, request(changed));
		expect(movingPlan.moved).toEqual([
			{
				from: 'bootloader/hekate_ipl.ini',
				into: 'bootloader/ini/console_kitchen_kept.ini',
				sections: ['Android'],
			},
		]);
		expect(
			movingPlan.configs.find(
				config =>
					config.path == 'bootloader/ini/console_kitchen_kept.ini',
			)?.content,
		).toBe(
			'[Android]\n; kept as it is\npayload=bootloader/payloads/android.bin\n',
		);
		expect(
			movingPlan.uncovered
				.flatMap(item => item.lines)
				.filter(line => line.includes('android')),
		).toEqual([]);

		// Moved once, the entry stays where it went
		const kept = importDump(
			defaultState(),
			dumpOf('switch', before, {
				'bootloader/hekate_ipl.ini': ini,
				'bootloader/ini/console_kitchen_kept.ini':
					'[Android]\npayload=x.bin\n',
			}),
		);
		expect(
			updatePlan(
				kept.snapshot,
				request({
					...kept.state.builds.switch,
					tuning: changed.tuning,
				}),
			).moved,
		).toEqual([]);
	});

	it('tell what the update does in the readme', () => {
		const readme = PLATFORMS.switch
			.build(request({ ...after, update: plan }))
			.files.find(file => file.path == 'README.md')!.content;
		expect(readme).toContain('## Update of the card');
		expect(readme).toContain(
			'- Removes sys-clk, their configs stay on the card',
		);
		expect(readme).toContain('`bootloader/hekate_ipl.ini`');
		expect(
			PLATFORMS.switch
				.build(request(after))
				.files.find(file => file.path == 'README.md')!.content,
		).not.toContain('## Update of the card');
	});

	it('download a component again whose tag would get out of its quotes in the scripts', () => {
		const hostile = `component\ttag\tpath\nhekate\tv1'; touch pwned; echo '$(touch pwned)\tbootloader/update.bin\n`;
		const hostileCard = importDump(
			defaultState(),
			dumpOf('switch', before, {
				[`${SWITCH.trace}/installed.tsv`]: hostile,
			}),
		);
		const hostilePlan = updatePlan(
			hostileCard.snapshot,
			request(hostileCard.state.builds.switch),
		);
		expect(hostilePlan.tags.hekate).toBeUndefined();
		const files = PLATFORMS.switch.build(
			request({
				...hostileCard.state.builds.switch,
				update: hostilePlan,
			}),
		).files;
		for (const path of ['update.sh', 'update.ps1'])
			expect(script(files, path), path).not.toContain('pwned');
	});

	it('give the scripts of the update to the build', () => {
		const files = PLATFORMS.switch
			.build(request({ ...after, update: plan }))
			.files.map(file => file.path);
		expect(files).toEqual(
			expect.arrayContaining([
				'install.sh',
				'install.ps1',
				'update.sh',
				'update.ps1',
			]),
		);
		expect(
			PLATFORMS.switch.build(request(after)).files.map(file => file.path),
		).not.toContain('update.sh');
	});
});

// The scripts of an update made up by hand: they take off what they are told and only on the card, even when the plan
// asks for more, and they write the configs that still have the hashes of the dump
const PLAN: UpdatePlan = {
	install: [],
	added: [],
	refreshed: [],
	tags: {},
	removed: ['sys_clk'],
	remove: [
		{
			component: 'sys_clk',
			files: [
				'atmosphere/contents/00FF0000636C6BFF/exefs.nsp',
				'atmosphere/contents/00FF0000636C6BFF/flags/boot2.flag',
				'switch/.overlays/sys-clk-overlay.ovl',
				'switch/sys-clk-manager.nro',
				// None of these may go
				'../outside.txt',
				'Nintendo/Contents/registered/00.nca',
				'emuMMC/RAW1/raw_based',
				'config/sys-clk/config.ini',
				'console-kitchen/installed.tsv',
				'switch/../../outside.txt',
				'/tmp',
			],
		},
	],
	configs: [
		{
			path: 'bootloader/hekate_ipl.ini',
			content: '[config]\nbacklight=50\n',
		},
		{
			path: 'config/tesla/config.ini',
			content: '[tesla]\nkey_combo=L+R\n',
		},
	],
	hashes: {
		'bootloader/hekate_ipl.ini': sha256('[config]\nbacklight=100\n'),
		'config/tesla/config.ini': sha256('as dumped\n'),
	},
	unchanged: [],
	moved: [],
	protect: [],
	images: false,
	disable: ['atmosphere/contents/0100000000000ABC/'],
	delete: ['switch/.overlays/foreign.ovl'],
	uncovered: [],
};

const CARD: { [path: string]: string } = {
	'atmosphere/contents/00FF0000636C6BFF/exefs.nsp': 'sys-clk',
	'atmosphere/contents/00FF0000636C6BFF/flags/boot2.flag': '',
	'switch/.overlays/sys-clk-overlay.ovl': 'overlay',
	'switch/sys-clk-manager.nro': 'manager',
	'config/sys-clk/config.ini': '[values]\n',
	'atmosphere/contents/0100000000000ABC/exefs.nsp': 'foreign',
	'atmosphere/contents/0100000000000ABC/flags/boot2.flag': '',
	'switch/.overlays/foreign.ovl': 'foreign overlay',
	'bootloader/hekate_ipl.ini': '[config]\nbacklight=100\n',
	'config/tesla/config.ini': 'changed after the dump\n',
	'Nintendo/Contents/registered/00.nca': 'system',
	'emuMMC/RAW1/raw_based': 'emummc',
	'console-kitchen/installed.tsv':
		'component\ttag\tpath\nsys_clk\t2.0.1\tswitch/sys-clk-manager.nro\nhekate\tv6.5.4\tbootloader/update.bin\n',
	[DUMP_FILE]: 'the dump',
	'dump.sh': 'the dump script',
	'dump.ps1': 'the dump script',
};

const UPDATE = installers(
	{
		...installerView(
			request({ ...SWITCH.defaults(), selectedComponentIDs: [] }),
			HARDWARE[0]!,
			[],
			PLAN.configs,
			[],
			{ dir: SWITCH.trace, build: 'kind = "build"' },
			PLAN,
		),
		title: 'an update',
		card: 'SD card',
		console: 'Nintendo Switch',
	},
	'update',
);

const script = (files: GeneratedFile[], path: string) =>
	files.find(file => file.path == path)!.content;

// Every card is a directory of its own in a directory of its own, with a file next to it the update may not reach
const roots: string[] = [];
function card(file: string, content: string): string {
	const parent = mkdtempSync(join(tmpdir(), 'console-kitchen-update-'));
	roots.push(parent);
	const root = join(parent, 'card');
	for (const [path, text] of Object.entries({ ...CARD, [file]: content })) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	writeFileSync(join(parent, 'outside.txt'), 'outside');
	return root;
}
afterAll(() => {
	roots.forEach(root => {
		rmSync(root, { recursive: true, force: true });
	});
});

function expectUpdated(root: string, output: string) {
	const [backup = ''] = readdirSync(join(root, 'backup')).map(name =>
		join(root, 'backup', name),
	);
	const moved = (path: string) =>
		!existsSync(join(root, path)) && existsSync(join(backup, path));

	for (const path of PLAN.remove[0]!.files.slice(0, 4))
		expect(moved(path), path).toBe(true);
	// The folders the files left empty go too
	expect(existsSync(join(root, 'atmosphere/contents/00FF0000636C6BFF'))).toBe(
		false,
	);
	for (const path of [
		'config/sys-clk/config.ini',
		'Nintendo/Contents/registered/00.nca',
		'emuMMC/RAW1/raw_based',
	]) {
		expect(readFileSync(join(root, path), 'utf8'), path).toBe(CARD[path]);
	}
	expect(readFileSync(join(root, '../outside.txt'), 'utf8')).toBe('outside');

	// A foreign sysmodule loses its flag, a foreign file goes
	expect(moved('atmosphere/contents/0100000000000ABC/flags/boot2.flag')).toBe(
		true,
	);
	expect(
		existsSync(
			join(root, 'atmosphere/contents/0100000000000ABC/exefs.nsp'),
		),
	).toBe(true);
	expect(moved('switch/.overlays/foreign.ovl')).toBe(true);

	// The config that still has the hash of the dump is written, its old version kept, the one changed since stays
	expect(readFileSync(join(root, 'bootloader/hekate_ipl.ini'), 'utf8')).toBe(
		'[config]\nbacklight=50\n',
	);
	expect(
		readFileSync(join(backup, 'bootloader/hekate_ipl.ini'), 'utf8'),
	).toBe('[config]\nbacklight=100\n');
	expect(readFileSync(join(root, 'config/tesla/config.ini'), 'utf8')).toBe(
		'changed after the dump\n',
	);
	expect(output).toContain('config/tesla/config.ini');

	// The trace loses the removed component, the dump and the scripts go
	expect(
		readFileSync(join(root, 'console-kitchen/installed.tsv'), 'utf8'),
	).toBe('component\ttag\tpath\nhekate\tv6.5.4\tbootloader/update.bin\n');
	for (const file of [
		DUMP_FILE,
		'dump.sh',
		'dump.ps1',
		'update.sh',
		'update.ps1',
	])
		expect(existsSync(join(root, file)), file).toBe(false);
}

describe.skipIf(!has('bash') || !has('curl'))('update.sh', () => {
	it('updates the card of the dump and nothing besides it', () => {
		const root = card('update.sh', script(UPDATE, 'update.sh'));
		const output = execFileSync('bash', [join(root, 'update.sh')], {
			cwd: tmpdir(),
			encoding: 'utf8',
		});
		expectUpdated(root, output);
	});
});

describe.skipIf(!has('pwsh'))('update.ps1', () => {
	it('updates the card of the dump and nothing besides it', () => {
		const root = card(
			'update.ps1',
			`\uFEFF${script(UPDATE, 'update.ps1')}`,
		);
		const output = execFileSync(
			'pwsh',
			['-NoProfile', '-File', join(root, 'update.ps1')],
			{ cwd: tmpdir(), encoding: 'utf8' },
		);
		expectUpdated(root, output);
	}, 60_000);
});

// An update skips a component the trace has the latest release of and downloads it when a newer one is out.
// The release and its archive are made up, a stand-in for curl hands them over, so nothing is downloaded
describe.skipIf(!has('bash') || !has('tar'))(
	'update.sh with a fresh component',
	() => {
		const lakka = PLATFORMS.switch.catalog.components.find(
			comp => comp.id == 'lakka',
		)!;
		const plan = (tag: string): UpdatePlan => ({
			...PLAN,
			install: ['lakka'],
			tags: { lakka: tag },
			removed: [],
			remove: [],
			configs: [],
			hashes: {},
			disable: [],
			delete: [],
		});
		const update = (tag: string) =>
			script(
				installers(
					{
						...installerView(
							request({
								...SWITCH.defaults(),
								selectedComponentIDs: ['lakka'],
							}),
							HARDWARE[0]!,
							[lakka],
							[],
							[],
							{ dir: SWITCH.trace, build: '' },
							plan(tag),
						),
						title: 'an update',
						card: 'SD card',
						console: 'Nintendo Switch',
					},
					'update',
				),
				'update.sh',
			);

		function run(tag: string): string {
			const stage = mkdtempSync(join(tmpdir(), 'console-kitchen-fresh-'));
			roots.push(stage);
			const release = join(stage, 'Lakka-Switch.aarch64-9.9');
			mkdirSync(join(release, 'lakka'), { recursive: true });
			writeFileSync(join(release, 'lakka/SYSTEM'), 'system');
			execFileSync('tar', [
				'-cf',
				join(stage, 'release.tar'),
				'-C',
				stage,
				'Lakka-Switch.aarch64-9.9',
			]);
			mkdirSync(join(stage, 'bin'));
			writeFileSync(
				join(stage, 'bin/curl'),
				[
					'#!/usr/bin/env bash',
					'while [ $# -gt 1 ]; do [ "$1" = -o ] && target="$2"; shift; done',
					'case "$1" in',
					'	https://api.github.com/*) printf \'%s\\n\' \'"tag_name": "9.9",\' \'"browser_download_url": "https://example.invalid/Lakka-Switch.aarch64-9.9.tar"\' ;;',
					`	*) cp '${join(stage, 'release.tar')}' "$target" ;;`,
					'esac',
				].join('\n'),
				{ mode: 0o755 },
			);
			const root = card('update.sh', update(tag));
			execFileSync('bash', [join(root, 'update.sh')], {
				cwd: root,
				stdio: 'pipe',
				env: {
					...process.env,
					PATH: `${join(stage, 'bin')}:${process.env.PATH}`,
				},
			});
			return root;
		}

		it('skips the component the trace has the latest release of', () => {
			expect(existsSync(join(run('9.9'), 'lakka/SYSTEM'))).toBe(false);
		});

		it('downloads the component once a newer release is out', () => {
			expect(readFileSync(join(run('9.8'), 'lakka/SYSTEM'), 'utf8')).toBe(
				'system',
			);
		});
	},
);

// The scripts of an update of a real plan: every component of the catalog, a part of them leaving the build
describe('scripts of an update of everything', () => {
	const everything = everythingState('switch').builds.switch;
	const loaded = importDump(defaultState(), dumpOf('switch', everything));
	const after = {
		...loaded.state.builds.switch,
		selectedComponentIDs:
			loaded.state.builds.switch.selectedComponentIDs.filter(
				id => id != 'missioncontrol',
			),
	};
	const files = PLATFORMS.switch.build(
		request({
			...after,
			update: updatePlan(loaded.snapshot, request(after)),
		}),
	).files;

	it.skipIf(!has('shellcheck'))('have no findings under shellcheck', () => {
		const { stdout } = spawnSync(
			'shellcheck',
			['-S', 'style', '-f', 'gcc', '-'],
			{ input: script(files, 'update.sh'), encoding: 'utf8' },
		);
		expect(stdout.trim().split('\n').filter(Boolean)).toEqual([]);
	});

	it.skipIf(!has('pwsh'))(
		'parse in PowerShell',
		() => {
			const path = join(
				mkdtempSync(join(tmpdir(), 'console-kitchen-parse-')),
				'update.ps1',
			);
			roots.push(dirname(path));
			writeFileSync(path, script(files, 'update.ps1'));
			const errors = execFileSync(
				'pwsh',
				[
					'-NoProfile',
					'-Command',
					[
						'$errors = $null',
						`[void][System.Management.Automation.Language.Parser]::ParseFile('${path}', [ref]$null, [ref]$errors)`,
						'$errors | ForEach-Object { "$($_.Extent.StartLineNumber): $($_.Message)" }',
					].join('; '),
				],
				{ encoding: 'utf8' },
			);
			expect(errors.trim()).toBe('');
		},
		60_000,
	);
});
