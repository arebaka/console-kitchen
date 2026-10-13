import { gzipSync } from 'node:zlib';

import { AppState, defaultState } from '@/state';
import { CATALOG, SWITCH, templateClocks } from '@/platforms/switch';
import { resolveSelection } from '@/data';
import { Issue, SwitchState } from '@/types';
import { I18N } from '@i18n';

// A build touching every kind of option, a secret, overclock profiles of every kind, launch extras and uploads
export function customBuild(): SwitchState {
	const build = SWITCH.defaults();
	build.hardware = 'erista';
	build.firmware = '22.5.0';
	build.selectedComponentIDs = resolveSelection(CATALOG, [
		...build.selectedComponentIDs.filter(id => id != 'dbi' && id != 'ovlmenu'),
		'sys_ftpd_light', 'missioncontrol', 'ultrahand', 'tinfoil', 'fusee'
	]);
	build.launch = {
		modes: ['emummc', 'stock'],
		emummcs: ['SD01'],
		overrides: { emummc: { cal0blank: 0 }, 'emummc-SD01': { usb3force: 1, memmode: 1 } },
		autoboot: 'stock'
	};
	Object.assign(build.tuning.logo, { bootwait: 5, noticker: true });
	build.tuning.hekate.backlight = 50;
	Object.assign(build.tuning.nyx, { themecolor: 200, themebg: '#123456' });
	build.tuning.dns.targets = ['emummc', 'sysmmc'];
	build.tuning.tesla.key_combo = ['ZL', 'ZR', 'DDOWN'];
	Object.assign(build.tuning.sys_ftpd_light, { user: 'lesha, the "user"', password: 'hunter2', port: 2121 });
	build.tuning.exosphere.log_baud_rate = 9600;
	build.tuning.missioncontrol.host_name = 'switch&co=1';
	build.overclock = [
		{ id: '0100F2C0115B6000', name: 'The Legend of Zelda: Tears of the Kingdom', template: 'performance', clocks: templateClocks('performance') },
		{ id: '0123456789ABCDEF', name: '0123456789ABCDEF', template: 'custom', clocks: { docked_cpu: 1785, handheld_gpu: 614 } },
		{ id: '01007EF00011E000', name: 'The Legend of Zelda: Breath of the Wild', template: 'stock', clocks: {} }
	];
	build.appearance = {
		bootlogo: 'hekate-a',
		background: 'upload',
		logos: { 'emummc-SD01': 'upload', stock: 'hekate-b' },
		icons: { emummc: 'hekate-switch', stock: 'upload', fusee: 'hekate-payload' }
	};
	return build;
}

// The page showing the custom build
export function customState(): AppState {
	const state = defaultState();
	state.builds.switch = customBuild();
	return state;
}

// Issues as `level:code:params` in Russian, the language with the most room for mistakes
export function issueCodes(build: SwitchState): string[] {
	return SWITCH.validate(build, I18N.ru).map((issue: Issue) => `${issue.level}:${issue.code}:${Object.values(issue.params).join('|')}`);
}

// Arbitrary bytes stand for the bitmaps: the installers only decode what the page encoded
export const BITMAPS: Record<string, Buffer> = {
	'bootloader/bootlogo.bmp': Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 7919) % 256)),
	'bootloader/res/console_kitchen_emummc_hue.bmp': Buffer.from(Array.from({ length: 147510 }, (_, i) => (i >> 5) % 256)),
	'bootloader/res/background.bmp': Buffer.alloc(3686454, 0x2d)
};

// The encoding of `encodeImage`: gzip, base64, lines of 76 characters
export function encodeBitmaps(bitmaps: Record<string, Buffer>): Record<string, string> {
	return Object.fromEntries(Object.entries(bitmaps).map(([path, data]) => [
		path,
		gzipSync(data).toString('base64').replace(/.{76}(?=.)/g, '$&\n')
	]));
}
