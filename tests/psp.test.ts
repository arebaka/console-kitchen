import { I18N } from '@i18n';
import { describe, expect, it } from 'vitest';

import { resolveSelection } from '@/data';
import { CATALOG, PSP } from '@/platforms/psp';
import { decodeState, defaultState, encodeState, spellOut } from '@/state';
import { PspState } from '@/types';

// A PSP Go on an old firmware with every plugin, changed settings and plugins loading elsewhere
function customPsp(): PspState {
	const build = PSP.defaults();
	build.hardware = 'pspgo';
	build.firmware = '5.70';
	build.selectedComponentIDs = resolveSelection(CATALOG, [
		...build.selectedComponentIDs,
		'update661',
		'missyhud',
		'aemu',
		'remotejoylite',
		'tempgba',
	]);
	Object.assign(build.tuning.clock!, { game: 403, vsh: 222 });
	Object.assign(build.tuning.memory!, {
		highmem: 'auto',
		mscache: 'off',
		infernocache: 'off',
	});
	Object.assign(build.tuning.xmb!, { skiplogos: 'gameboot', region: 'jp' });
	build.tuning.ark!.variant = 'lite';
	build.tuning.aemu!.hotspot = 'Home, sweet home';
	build.plugins = { missyhud: ['vsh', 'game'], remotejoylite: [] };
	return build;
}

const codes = (build: PspState) =>
	PSP.validate(build, I18N.en).map(issue => `${issue.level}:${issue.code}`);

describe('PSP links', () => {
	const state = defaultState();
	state.platform = 'psp';
	state.builds.psp = customPsp();
	const link = encodeState(state);
	const query = spellOut(link);

	it('take the platform of the model', () => {
		expect(link).toMatch(/^h=[\w-]+&s=[\w-]+&f=[\w-]+&p=[\w-]+$/);
		expect(query).toMatch(/^hw=pspgo&fw=5\.70&sw=/);
		expect(decodeState(`?${link}`)).toEqual(state);
		expect(decodeState(`?${query}`)).toEqual(state);
	});

	it('spell plugins by their runlevels, an empty list for a plugin left off', () => {
		expect(query).toContain('plugin.missyhud=vsh,game');
		expect(query).toMatch(/plugin\.remotejoylite=(&|$)/);
	});

	it('ignore invalid runlevels and unknown plugins', () => {
		const decoded = decodeState(
			'?hw=psp1000&plugin.gclite=vsh,evil&plugin.aemu=always,game&plugin.nope=vsh&fw=9.99',
		);
		expect(decoded.platform).toBe('psp');
		expect(decoded.builds.psp).toEqual({
			...PSP.defaults(),
			hardware: 'psp1000',
		});
	});
});

describe('PSP validation', () => {
	it('updates an old firmware first', () => {
		const old = { ...PSP.defaults(), firmware: '6.35' };
		expect(codes(old)).toContain('error:firmwareUpdate');
		expect(
			PSP.validate(old, I18N.en).find(
				issue => issue.code == 'firmwareUpdate',
			)?.fixes,
		).toEqual([{ add: ['update661'] }]);
		expect(codes(customPsp())).not.toContain('error:firmwareUpdate');
	});

	it('leaves the update out of a PSP on 6.61', () => {
		const current = {
			...PSP.defaults(),
			selectedComponentIDs: resolveSelection(CATALOG, ['update661']),
		};
		expect(codes(current)).toContain('info:firmwareCurrent');
	});

	it('asks for the caches off for æmu', () => {
		const aemu = {
			...PSP.defaults(),
			selectedComponentIDs: resolveSelection(CATALOG, ['aemu']),
		};
		expect(codes(aemu)).toContain('warning:aemuCache');
		expect(codes(customPsp())).not.toContain('warning:aemuCache');
	});

	it('points at the overclock tester above 333 MHz', () => {
		expect(
			PSP.validate(customPsp(), I18N.en).find(
				issue => issue.code == 'overclock',
			)?.params,
		).toEqual({ mhz: '403' });
		expect(codes(PSP.defaults())).not.toContain('info:overclock');
	});
});

describe('PSP build', () => {
	const result = PSP.build({ ...customPsp(), lang: 'en', t: I18N.en });
	const config = (path: string) =>
		result.configs.find(item => item.path == path)?.content;
	const defaults = PSP.build({ ...PSP.defaults(), lang: 'en', t: I18N.en });

	it('writes the settings of ARK as its own menu does', () => {
		const settings = defaults.configs.find(
			item => item.path == 'PSP/SAVEDATA/ARK_01234/SETTINGS.TXT',
		)!.content;
		expect(settings.split('\n').slice(0, 21)).toEqual([
			'always, usbcharge, on',
			'always, cpuclock:333, on',
			'always, wpa2, on',
			'always, launcher, off',
			'always, highmem, off',
			'always, mscache:4k, on',
			'always, infernocache:lru, on',
			'always, disablepause, off',
			'always, oldplugin, on',
			'always, hibblock, on',
			'always, skiplogos, off',
			'always, hidepics, off',
			'always, hidemac, on',
			'always, hidedlc, on',
			'always, noled, off',
			'always, noumd, off',
			'always, deadef, off',
			'always, noanalog, off',
			'always, vitamute, on',
			'always, qaflags, on',
			'',
		]);
		expect(settings).toContain('ULUS10328 ULES00968, infernocache, off');
	});

	it('splits clocks of games and the XMB and spells modes', () => {
		const settings = config('PSP/SAVEDATA/ARK_01234/SETTINGS.TXT');
		expect(settings).toContain(
			'game, cpuclock:403, on\nvsh, cpuclock:222, on\n',
		);
		expect(settings).toContain('always, highmem:auto, on');
		expect(settings).toContain('always, mscache, off');
		expect(settings).toContain('always, skiplogos:gameboot, on');
		expect(settings).toContain('vsh, region_jp, on');
	});

	it('lists plugins in the order of the catalog with their runlevels', () => {
		expect(config('SEPLUGINS/PLUGINS.TXT')).toBe(
			[
				'vsh, gclite/category_lite.prx, on',
				'vsh game, missyhud.prx, on',
				'game, atpro.prx, on',
				'always, RemoteJoyLite/RemoteJoyLite.prx, off',
				'',
			].join('\n'),
		);
		expect(
			defaults.configs.find(item => item.path == 'SEPLUGINS/PLUGINS.TXT')
				?.content,
		).toBe('vsh, gclite/category_lite.prx, on\n');
	});

	it('writes the network of æmu only when it is set', () => {
		expect(config('SEPLUGINS/hotspot.txt')).toBe('Home, sweet home\n');
		expect(defaults.configs.map(({ path }) => path)).not.toContain(
			'SEPLUGINS/hotspot.txt',
		);
	});

	it('downloads the chosen package of ARK and leaves the App Store out', () => {
		for (const file of result.files.filter(({ path }) =>
			path.startsWith('install.'),
		)) {
			expect(file.content).toContain("'^FasterARK_psp_lite\\.zip$'");
			expect(file.content).toContain('PSP/GAME/UPDATE/EBOOT.PBP');
			expect(file.content).toContain('Memory Stick');
			expect(file.content).not.toMatch(/appstore/i);
		}
	});

	it('tells to update the firmware first in the readme', () => {
		const readme = result.files.find(
			file => file.path == 'README.md',
		)!.content;
		expect(readme).toContain('# Console Kitchen: PSP Go, firmware 5.70');
		expect(readme).toContain('PSP Update ver 6.61');
		expect(readme).toContain('- **missyhud**: XMB, Games and homebrew');
		expect(readme).toContain('- **RemoteJoyLite**: Off');
		expect(
			defaults.files.find(file => file.path == 'README.md')!.content,
		).not.toContain('PSP Update ver 6.61');
	});
});
