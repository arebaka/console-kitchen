import { I18N } from '@i18n';
import { parse } from 'smol-toml';
import { describe, expect, it } from 'vitest';

import { PLATFORMS } from '@/platforms';
import {
	AppState,
	decodeState,
	defaultState,
	encodeState,
	importBuild,
} from '@/state';
import { BUILD_FILE } from '@/toml';
import { PlatformId } from '@/types';

import { customState } from './fixtures';

// The file a build is exported to, as the page offers it
function exported(state: AppState): string {
	const build = {
		...state.builds[state.platform],
		lang: 'en' as const,
		t: I18N.en,
	};
	return PLATFORMS[state.platform]
		.build(build)
		.files.find(file => file.path == BUILD_FILE)!.content;
}

// A build of the platform with every component and every option other than its default
function everything(platform: PlatformId): AppState {
	const state = defaultState();
	state.platform = platform;
	const { catalog } = PLATFORMS[platform];
	const build = state.builds[platform];
	build.selectedComponentIDs = catalog.components.map(comp => comp.id);
	for (const group of catalog.tuning) {
		for (const option of group.options.filter(option => !option.secret)) {
			const tuning = build.tuning[group.id];
			if (option.type == 'toggle') tuning[option.id] = !option.default;
			if (option.type == 'range' || option.type == 'number')
				tuning[option.id] =
					option.default == option.max ? option.min : option.max;
			if (option.type == 'select')
				tuning[option.id] = [...option.values]
					.toReversed()
					.find(value => value != option.default)!;
			if (option.type == 'multiselect')
				tuning[option.id] = option.values.slice(
					-Math.min(option.max ?? 3, option.values.length),
				);
			if (option.type == 'text')
				tuning[option.id] = `${option.default}x`.slice(
					0,
					option.maxLength,
				);
			if (option.type == 'hue')
				tuning[option.id] = (option.default + 1) % 360;
			if (option.type == 'color') tuning[option.id] = '#123456';
			if (option.type == 'rgba4444') tuning[option.id] = '#1234';
			if (option.type == 'list')
				tuning[option.id] = [
					option.fields.map(field =>
						field.max
							? (field.values ?? []).slice(0, field.max).join('+')
							: (field.values?.at(-1) ?? 'x=y, z'),
					),
				];
		}
	}
	if (platform == 'psp') state.builds.psp.plugins = { missyhud: ['game'] };
	return state;
}

describe('build files', () => {
	it('bring the build back as its link does', () => {
		const state = customState();
		expect(importBuild(defaultState(), exported(state))).toEqual(
			decodeState(encodeState(state)),
		);
	});

	it.each(['switch', 'psp'] as const)(
		'hold every option of the %s',
		platform => {
			const state = everything(platform);
			expect(importBuild(defaultState(), exported(state))).toEqual(
				decodeState(encodeState(state)),
			);
		},
	);

	it('spell switches, numbers and lists as TOML does', () => {
		const table = parse(exported(customState())) as any;
		expect(table).toMatchObject({
			kind: 'build',
			format: 1,
			platform: 'switch',
			hw: 'erista',
			hos: '22.5.0',
			boot: ['emummc', 'stock'],
		});
		expect(table.hekate).toEqual({ backlight: 50 });
		expect(table.logo.noticker).toBe(true);
		expect(table.tesla.key_combo).toEqual(['ZL', 'ZR', 'DDOWN']);
		expect(table.launch['emummc-SD01']).toEqual({
			usb3force: '1',
			memmode: '1',
		});
		expect(table.sw).toContain('atmosphere');
	});

	it('keep secrets and uploaded images out', () => {
		// The header tells what the file leaves out
		const text = exported(customState())
			.split('\n')
			.filter(line => !line.startsWith('#'))
			.join('\n');
		expect(text).not.toContain('hunter2');
		expect(text).not.toContain('lesha');
		expect(text).not.toMatch(/password|upload/);
	});

	it('leave the build of the other platform as it is', () => {
		const state = everything('switch');
		const imported = importBuild(state, exported(everything('psp')))!;
		expect(imported.platform).toBe('psp');
		expect(imported.builds.switch).toBe(state.builds.switch);
	});

	it('read a file written by hand, the console of its platform when it names none', () => {
		const imported = importBuild(
			defaultState(),
			'kind = "build"\nformat = 1\nplatform = "psp"\nsw = ["ark", "missyhud"]\n',
		)!;
		expect(imported.platform).toBe('psp');
		expect(imported.builds.psp.hardware).toBe(
			PLATFORMS.psp.defaults().hardware,
		);
		expect(imported.builds.psp.selectedComponentIDs).toContain('missyhud');
	});

	it('take a text only as a single line, like a link', () => {
		const text =
			'kind = "build"\nformat = 1\nplatform = "switch"\nhw = "erista"\n[missioncontrol]\nhost_name = "switch\\nrm -rf ~"\n';
		expect(
			importBuild(defaultState(), text)!.builds.switch.tuning
				.missioncontrol.host_name,
		).toBe(PLATFORMS.switch.defaults().tuning.missioncontrol.host_name);
	});

	it.each([
		['text that is not TOML', 'not = toml = at all'],
		[
			'a dump of a card',
			'kind = "dump"\nformat = 1\nplatform = "switch"\n',
		],
		[
			'a format to come',
			'kind = "build"\nformat = 2\nplatform = "switch"\n',
		],
		['another platform', 'kind = "build"\nformat = 1\nplatform = "vita"\n'],
	])('turn down %s', (name, text) => {
		expect(importBuild(defaultState(), text)).toBeUndefined();
	});
});
