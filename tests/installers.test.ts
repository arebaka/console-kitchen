import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { BuildResult, GeneratedFile, installerView, installers } from '@/build';
import { BUILD_FILE } from '@/toml';
import { presetSelection } from '@/data';
import { HARDWARE } from '@data';
import { CATALOG, SWITCH } from '@/platforms/switch';
import { CATALOG as PSP_CATALOG, PSP } from '@/platforms/psp';
import { I18N } from '@i18n';
import { BITMAPS, encodeBitmaps } from './fixtures';

// The installers are run for real where their tools are installed
const has = (command: string) => spawnSync('sh', ['-c', `command -v ${command}`]).status == 0;
const CAN_RUN_BASH = has('bash') && has('curl') && (has('unzip') || has('bsdtar') || has('python3'));

// Without components nothing is downloaded: the installers only write the configuration and the embedded images
const OFFLINE = {
	switch: SWITCH.build({
		...SWITCH.defaults(),
		selectedComponentIDs: [],
		appearance: { bootlogo: 'hekate-a', background: 'atmosphere-splash', logos: {}, icons: { emummc: 'hekate-switch' } },
		images: encodeBitmaps(BITMAPS),
		lang: 'en',
		t: I18N.en
	}),
	psp: PSP.build({ ...PSP.defaults(), selectedComponentIDs: [], lang: 'en', t: I18N.en })
};

// Every kind of download at once: App Store packages, GitHub archives and files, direct links, manual components
const EVERYTHING = {
	switch: SWITCH.build({
		...SWITCH.defaults(),
		hardware: 'mariko',
		selectedComponentIDs: presetSelection(CATALOG, CATALOG.presets.find(preset => preset.id == 'all')!),
		lang: 'en',
		t: I18N.en
	}),
	psp: PSP.build({
		...PSP.defaults(),
		firmware: '5.00',
		selectedComponentIDs: presetSelection(PSP_CATALOG, PSP_CATALOG.presets.find(preset => preset.id == 'all')!),
		lang: 'en',
		t: I18N.en
	})
};

// A config with lines that read as its end inside either installer, each followed by what would then run as a command,
// and with what a shell runs or fills in when it does not take the config as it is written.
// The installers have to write them all, the lines that read as the end moved off the start of their lines
const HOSTILE = {
	path: 'config/hostile.ini',
	content: '[list]\nCONSOLE_KITCHEN_EOF\ntouch pwned\n\'@; New-Item pwned\n\'@\nNew-Item pwned\nrun=$(touch pwned)`touch pwned`$(New-Item pwned)\nhome=$HOME\\\n',
	written: '[list]\n CONSOLE_KITCHEN_EOF\ntouch pwned\n \'@; New-Item pwned\n \'@\nNew-Item pwned\nrun=$(touch pwned)`touch pwned`$(New-Item pwned)\nhome=$HOME\\\n'
};
// The build the installers leave in the trace is written the same way, so it gets the same lines
const HOSTILE_FILES = installers({
	...installerView({ ...SWITCH.defaults(), selectedComponentIDs: [], lang: 'en', t: I18N.en }, HARDWARE[0], [], [HOSTILE], [], { dir: SWITCH.trace, build: HOSTILE.content }),
	title: 'a hostile config',
	card: 'SD card',
	console: 'Nintendo Switch'
});

const RUNS = Object.entries(OFFLINE) as [keyof typeof OFFLINE, BuildResult][];
const BUILDS = Object.entries(EVERYTHING).flatMap(([platform, result]) => [[`${platform} offline`, OFFLINE[platform as keyof typeof OFFLINE].files], [`${platform} everything`, result.files]] as const);
const script = (files: GeneratedFile[], path: string) => files.find(file => file.path == path)!.content;
const TRACES = { switch: SWITCH.trace, psp: PSP.trace };

// Every installer gets an empty directory standing for the card and runs there, as from the root of the card
const cards: string[] = [];
function card(file: string, content: string): string {
	const root = mkdtempSync(join(tmpdir(), 'console-kitchen-'));
	cards.push(root);
	writeFileSync(join(root, file), content);
	return root;
}
afterAll(() => cards.forEach(root => rmSync(root, { recursive: true, force: true })));

// Files archives leave in the root of the card, the installers remove them. A directory of the user
// the installer is started from holds files with the same names, which have to stay
const LEFTOVERS = ['LICENSE.txt', 'README.txt', 'README.md'];
function elsewhere(): string {
	const home = mkdtempSync(join(tmpdir(), 'console-kitchen-home-'));
	cards.push(home);
	LEFTOVERS.forEach(file => writeFileSync(join(home, file), 'mine'));
	return home;
}

function expectCleaned(root: string, home: string, installer: string) {
	expect([installer, ...LEFTOVERS].filter(file => existsSync(join(root, file)))).toEqual([]);
	expect(LEFTOVERS.filter(file => existsSync(join(home, file)))).toEqual(LEFTOVERS);
}

function expectInstalled(root: string, platform: keyof typeof OFFLINE, result: BuildResult) {
	for (const asset of result.assets) {
		expect(readFileSync(join(root, asset.path)).equals(BITMAPS[asset.path]), asset.path).toBe(true);
	}
	for (const config of result.configs) {
		expect(readFileSync(join(root, config.path), 'utf8'), config.path).toBe(`${config.content.trimEnd()}\n`);
	}
	// The trace holds the build as the page exports it, without components it lists no files
	expect(readFileSync(join(root, TRACES[platform], 'build.toml'), 'utf8')).toBe(`${script(result.files, BUILD_FILE).trimEnd()}\n`);
	expect(readFileSync(join(root, TRACES[platform], 'installed.tsv'), 'utf8')).toBe('component\ttag\tpath\n');
}

describe.skipIf(!CAN_RUN_BASH)('install.sh', () => {
	it.each(RUNS)('writes the configuration and the images of %s next to itself', (platform, result) => {
		const root = card('install.sh', script(result.files, 'install.sh'));
		execFileSync('bash', [join(root, 'install.sh')], { cwd: root, stdio: 'pipe' });
		expectInstalled(root, platform, result);
	});

	it('cleans up the card, wherever it is started from', () => {
		const root = card('install.sh', script(OFFLINE.psp.files, 'install.sh'));
		LEFTOVERS.forEach(file => writeFileSync(join(root, file), 'junk'));
		const home = elsewhere();
		execFileSync('bash', [join(root, 'install.sh')], { cwd: home, stdio: 'pipe' });
		expectCleaned(root, home, 'install.sh');
	});

	it('writes a line that reads as the end of a config instead of running what follows it', () => {
		const root = card('install.sh', script(HOSTILE_FILES, 'install.sh'));
		execFileSync('bash', [join(root, 'install.sh')], { cwd: root, stdio: 'pipe' });
		expect(existsSync(join(root, 'pwned'))).toBe(false);
		expect(readFileSync(join(root, HOSTILE.path), 'utf8')).toBe(HOSTILE.written);
		expect(readFileSync(join(root, SWITCH.trace, 'build.toml'), 'utf8')).toBe(HOSTILE.written);
	});
});

// A tar goes straight onto the card without its top folder. The release and its archive are made up here,
// a stand-in for curl hands them over, so nothing is downloaded
describe.skipIf(!CAN_RUN_BASH || !has('tar'))('install.sh with a tar', () => {
	it('unpacks it onto the card without its top folder and leaves nothing else there', () => {
		const lakka = CATALOG.components.find(comp => comp.id == 'lakka')!;
		const files = installers({
			...installerView({ ...SWITCH.defaults(), selectedComponentIDs: [lakka.id], lang: 'en', t: I18N.en }, HARDWARE[0], [lakka], [], [], { dir: SWITCH.trace, build: '' }),
			title: 'a tar',
			card: 'SD card',
			console: 'Nintendo Switch'
		});
		const root = card('install.sh', script(files, 'install.sh'));

		const stage = mkdtempSync(join(tmpdir(), 'console-kitchen-tar-'));
		cards.push(stage);
		const release = join(stage, 'Lakka-Switch.aarch64-9.9');
		mkdirSync(join(release, 'lakka/storage'), { recursive: true });
		mkdirSync(join(release, 'bootloader/ini'), { recursive: true });
		writeFileSync(join(release, 'lakka/SYSTEM'), 'system');
		writeFileSync(join(release, 'bootloader/ini/Lakka.ini'), '[Lakka]\n');
		writeFileSync(join(release, 'CHANGELOG.md'), 'changes');
		execFileSync('tar', ['-cf', join(stage, 'release.tar'), '-C', stage, 'Lakka-Switch.aarch64-9.9']);
		// Asked about the latest release, the stand-in names its tag and the archive, asked for a download, it gives the archive
		mkdirSync(join(stage, 'bin'));
		writeFileSync(join(stage, 'bin/curl'), [
			'#!/usr/bin/env bash',
			'while [ $# -gt 1 ]; do [ "$1" = -o ] && target="$2"; shift; done',
			'case "$1" in',
			'	https://api.github.com/*) printf \'%s\\n\' \'"tag_name": "9.9",\' \'"browser_download_url": "https://example.invalid/Lakka-Switch.aarch64-9.9.tar"\' ;;',
			`	*) cp '${join(stage, 'release.tar')}' "$target" ;;`,
			'esac'
		].join('\n'), { mode: 0o755 });

		execFileSync('bash', [join(root, 'install.sh')], { cwd: root, stdio: 'pipe', env: { ...process.env, PATH: `${join(stage, 'bin')}:${process.env.PATH}` } });
		expect(readdirSync(root).sort()).toEqual(['bootloader', 'console-kitchen', 'lakka']);
		expect(readFileSync(join(root, 'lakka/SYSTEM'), 'utf8')).toBe('system');
		expect(existsSync(join(root, 'lakka/storage'))).toBe(true);
		expect(existsSync(join(root, 'bootloader/ini/Lakka.ini'))).toBe(true);
		// The trace lists the files of the archive with the tag of the release, not what the installer removes from the root
		const [header, ...lines] = readFileSync(join(root, SWITCH.trace, 'installed.tsv'), 'utf8').trimEnd().split('\n');
		expect(header).toBe('component\ttag\tpath');
		expect(lines.sort()).toEqual(['lakka\t9.9\tbootloader/ini/Lakka.ini', 'lakka\t9.9\tlakka/SYSTEM']);
	});
});

describe.skipIf(!has('shellcheck'))('install.sh under shellcheck', () => {
	// Findings come out as the difference, one per line
	it.each(BUILDS)('has no findings for the %s build', (name, files) => {
		const { stdout } = spawnSync('shellcheck', ['-S', 'style', '-f', 'gcc', '-'], { input: script(files, 'install.sh'), encoding: 'utf8' });
		expect(stdout.trim().split('\n').filter(Boolean)).toEqual([]);
	});
});

describe.skipIf(!has('pwsh'))('install.ps1', () => {
	// The page adds the byte order mark for Windows PowerShell
	it.each(RUNS)('writes the configuration and the images of %s next to itself', (platform, result) => {
		const root = card('install.ps1', `﻿${script(result.files, 'install.ps1')}`);
		execFileSync('pwsh', ['-NoProfile', '-File', join(root, 'install.ps1')], { cwd: root, stdio: 'pipe' });
		expectInstalled(root, platform, result);
	}, 60_000);

	it('cleans up the card, wherever it is started from', () => {
		const root = card('install.ps1', `﻿${script(OFFLINE.psp.files, 'install.ps1')}`);
		LEFTOVERS.forEach(file => writeFileSync(join(root, file), 'junk'));
		const home = elsewhere();
		execFileSync('pwsh', ['-NoProfile', '-File', join(root, 'install.ps1')], { cwd: home, stdio: 'pipe' });
		expectCleaned(root, home, 'install.ps1');
	}, 60_000);

	it('writes a line that reads as the end of a config instead of running what follows it', () => {
		const root = card('install.ps1', `﻿${script(HOSTILE_FILES, 'install.ps1')}`);
		execFileSync('pwsh', ['-NoProfile', '-File', join(root, 'install.ps1')], { cwd: root, stdio: 'pipe' });
		expect(existsSync(join(root, 'pwned'))).toBe(false);
		expect(readFileSync(join(root, HOSTILE.path), 'utf8')).toBe(HOSTILE.written);
		expect(readFileSync(join(root, SWITCH.trace, 'build.toml'), 'utf8')).toBe(HOSTILE.written);
	}, 60_000);

	it.each(BUILDS)('parses the %s build', (name, files) => {
		const path = join(card('install.ps1', script(files, 'install.ps1')), 'install.ps1');
		const errors = execFileSync('pwsh', ['-NoProfile', '-Command', [
			'$errors = $null',
			`[void][System.Management.Automation.Language.Parser]::ParseFile('${path}', [ref]$null, [ref]$errors)`,
			'$errors | ForEach-Object { "$($_.Extent.StartLineNumber): $($_.Message)" }'
		].join('; ')], { encoding: 'utf8' });
		expect(errors.trim()).toBe('');
	}, 60_000);
});
