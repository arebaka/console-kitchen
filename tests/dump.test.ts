import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse } from 'smol-toml';
import { afterAll, describe, expect, it } from 'vitest';

import { DUMP_FILE, dumpScripts } from '@/dump';

// The scripts are run for real where their shells are installed
const has = (command: string) => spawnSync('sh', ['-c', `command -v ${command}`]).status == 0;
const SCRIPTS = Object.fromEntries(dumpScripts().map(file => [file.path, file.content]));

// Cards made up of the files a dump reads, with what it has to leave out or write in base64
const SWITCH_CARD: {[path: string]: string} = {
	'payload.bin': 'hekate',
	'atmosphere/package3': 'package3',
	'atmosphere/contents/0100000000000352/exefs.nsp': 'emuiibo',
	'atmosphere/contents/0100000000000352/flags/boot2.flag': '',
	'atmosphere/contents/0100000000000352/toolbox.json': '{"name": "emuiibo", "tid": "0100000000000352"}',
	'atmosphere/contents/0100000000001000/romfs/lyt/common.szs': 'a theme, not a sysmodule',
	'atmosphere/exefs_patches/some_patches/patch.ips': 'patch',
	'bootloader/hekate_ipl.ini': "[config]\nautoboot=0\n\n[Atmosphere CFW]\nfss0=atmosphere/package3\n",
	'bootloader/ini/foreign.ini': "[Other build]\nfss0=atmosphere/package3\nicon=bootloader/res/it's'''here.bmp\n",
	'bootloader/payloads/TegraExplorer.bin': 'payload',
	'config/sys-clk/config.ini': '[values]\r\ntemp_log_interval_ms=0\r\n',
	'config/MissionControl/missioncontrol.ini': '[misc]\nname=Лёша\n',
	'console-kitchen/build.toml': 'kind = "build"\nformat = 1\nplatform = "switch"\n',
	'console-kitchen/installed.tsv': 'component\ttag\tpath\nemuiibo\t1.1.3\tatmosphere/contents/0100000000000352/exefs.nsp\n',
	'switch/appstore/.get/packages/Checkpoint/info.json': '{"version": "3.10.1"}',
	'switch/appstore/.get/packages/Checkpoint/manifest.install': 'U: switch/Checkpoint/Checkpoint.nro\n',
	'switch/Checkpoint/Checkpoint.nro': 'nro',
	'switch/Checkpoint/saves/backup.bin': 'a save, not an application',
	'switch/.overlays/ovlmenu.ovl': 'ovl',
	'switch/"quoted".nro': 'a name a card cannot hold',
	'Nintendo/Contents/registered/00/00.nca': 'never read',
	'install.sh': 'the installer',
	[DUMP_FILE]: 'an older dump'
};

const PSP_CARD: {[path: string]: string} = {
	'SEPLUGINS/PLUGINS.TXT': 'game, ms0:/SEPLUGINS/missyhud.prx, on\n',
	'SEPLUGINS/missyhud.prx': 'prx',
	'PSP/GAME/CMFileManager/EBOOT.PBP': 'pbp',
	'PSP/SAVEDATA/ARK_01234/SETTINGS.TXT': 'always, usbcharge, on\n',
	'PSP/SAVEDATA/ARK_01234/FLASH0.ARK': 'ark',
	'console-kitchen/build.toml': 'kind = "build"\nformat = 1\nplatform = "psp"\n'
};

// Every card is a directory of its own with the script in its root
const cards: string[] = [];
function card(files: {[path: string]: string}, script: string): string {
	const root = mkdtempSync(join(tmpdir(), 'console-kitchen-dump-'));
	cards.push(root);
	for (const [path, content] of Object.entries({ ...files, [script]: SCRIPTS[script] })) {
		mkdirSync(dirname(join(root, path)), { recursive: true });
		writeFileSync(join(root, path), content);
	}
	return root;
}
afterAll(() =>{  cards.forEach(root => rmSync(root, { recursive: true, force: true })); });

interface Dump {
	kind: string;
	format: number;
	platform: string;
	files: {[path: string]: number};
	hashes: {[path: string]: string};
	texts: {[path: string]: string | { base64: string }};
}

const text = (value: string | { base64: string }) => typeof value === 'string' ? value : Buffer.from(value.base64, 'base64').toString('utf8');
const sha256 = (content: string) => createHash('sha256').update(content).digest('hex');

const RUNS = [
	['dump.sh', (root: string) => execFileSync('bash', [join(root, 'dump.sh')], { cwd: tmpdir(), stdio: 'pipe' }), has('bash')],
	['dump.ps1', (root: string) => execFileSync('pwsh', ['-NoProfile', '-File', join(root, 'dump.ps1')], { cwd: tmpdir(), stdio: 'pipe' }), has('pwsh')]
] as const;

describe.each(RUNS)('%s', (script, run, isRunnable) => {
	it.skipIf(!isRunnable)('dumps the files, the hashes and the texts of a Switch card', () => {
		const root = card(SWITCH_CARD, script);
		run(root);
		const dump = parse(readFileSync(join(root, DUMP_FILE), 'utf8')) as unknown as Dump;

		expect([dump.kind, dump.format, dump.platform]).toEqual(['dump', 1, 'switch']);
		expect(Object.keys(dump.files).sort()).toEqual([
			'atmosphere/contents/0100000000000352/exefs.nsp',
			'atmosphere/contents/0100000000000352/flags/boot2.flag',
			'atmosphere/contents/0100000000000352/toolbox.json',
			'atmosphere/exefs_patches/some_patches/',
			'atmosphere/package3',
			'bootloader/hekate_ipl.ini',
			'bootloader/ini/foreign.ini',
			'bootloader/payloads/TegraExplorer.bin',
			'payload.bin',
			'switch/.overlays/ovlmenu.ovl',
			'switch/Checkpoint/Checkpoint.nro'
		]);
		expect(dump.files['atmosphere/package3']).toBe(8);
		expect(dump.files['atmosphere/exefs_patches/some_patches/']).toBe(0);

		const texts = [
			'atmosphere/contents/0100000000000352/toolbox.json',
			'bootloader/hekate_ipl.ini',
			'bootloader/ini/foreign.ini',
			'config/MissionControl/missioncontrol.ini',
			'config/sys-clk/config.ini',
			'console-kitchen/build.toml',
			'console-kitchen/installed.tsv',
			'switch/appstore/.get/packages/Checkpoint/info.json',
			'switch/appstore/.get/packages/Checkpoint/manifest.install'
		];
		expect(Object.keys(dump.texts).sort()).toEqual(texts);
		expect(Object.keys(dump.hashes).sort()).toEqual(texts);
		for (const path of texts) {
			expect(text(dump.texts[path]), path).toBe(SWITCH_CARD[path]);
			expect(dump.hashes[path], path).toBe(sha256(SWITCH_CARD[path]));
		}
		// Plain ASCII stays readable, line breaks of Windows, other letters and three quotes in a row go in base64
		expect(typeof dump.texts['bootloader/hekate_ipl.ini']).toBe('string');
		expect(typeof dump.texts['config/sys-clk/config.ini']).toBe('object');
		expect(typeof dump.texts['config/MissionControl/missioncontrol.ini']).toBe('object');
		expect(typeof dump.texts['bootloader/ini/foreign.ini']).toBe('object');
	}, 60_000);

	it.skipIf(!isRunnable)('dumps the plugins, the homebrew and the settings of a PSP', () => {
		const root = card(PSP_CARD, script);
		run(root);
		const dump = parse(readFileSync(join(root, DUMP_FILE), 'utf8')) as unknown as Dump;

		expect(dump.platform).toBe('psp');
		expect(Object.keys(dump.files).sort()).toEqual([
			'PSP/GAME/CMFileManager/EBOOT.PBP',
			'PSP/SAVEDATA/ARK_01234/FLASH0.ARK',
			'PSP/SAVEDATA/ARK_01234/SETTINGS.TXT',
			'SEPLUGINS/PLUGINS.TXT',
			'SEPLUGINS/missyhud.prx'
		]);
		expect(Object.keys(dump.texts).sort()).toEqual(['PSP/SAVEDATA/ARK_01234/SETTINGS.TXT', 'SEPLUGINS/PLUGINS.TXT', 'console-kitchen/build.toml']);
		expect(text(dump.texts['SEPLUGINS/PLUGINS.TXT'])).toBe(PSP_CARD['SEPLUGINS/PLUGINS.TXT']);
	}, 60_000);

	it.skipIf(!isRunnable)('refuses a folder that is not the root of a card', () => {
		const root = card({ 'notes.txt': 'not a card' }, script);
		expect(() => run(root)).toThrow();
	}, 60_000);
});

describe.skipIf(!has('shellcheck'))('dump.sh under shellcheck', () => {
	it('has no findings', () => {
		const { stdout } = spawnSync('shellcheck', ['-S', 'style', '-f', 'gcc', '-'], { input: SCRIPTS['dump.sh'], encoding: 'utf8' });
		expect(stdout.trim().split('\n').filter(Boolean)).toEqual([]);
	});
});
