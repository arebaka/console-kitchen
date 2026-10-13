import { describe, expect, it } from 'vitest';

import { resolveSelection } from '@/data';
import { BOOT_ENTRIES, CATALOG, COMPONENTS, SPARE_INI, SWITCH } from '@/platforms/switch';
import { I18N } from '@i18n';
import { TuningConfig } from '@/types';
import { BITMAPS, customBuild, encodeBitmaps } from './fixtures';

describe('build', () => {
	const result = SWITCH.build({ ...customBuild(), lang: 'en', t: I18N.en });
	const paths = result.configs.map(config => config.path);
	const config = (path: string) => result.configs.find(config => config.path == path)?.content;
	const installers = result.files.filter(file => file.path.startsWith('install.'));
	// Lines of a section of hekate_ipl.ini, up to the blank line before the next one
	const section = (name: string) => `\n${config('bootloader/hekate_ipl.ini')}`.split(`\n[${name}]\n`)[1]?.split('\n\n')[0].trim().split('\n');

	it('writes the Launch menu: boot modes, then payloads, autoboot by number', () => {
		const build = customBuild();
		const ini = config('bootloader/hekate_ipl.ini')!;
		const payloads = COMPONENTS.filter(comp => comp.payload && build.selectedComponentIDs.includes(comp.id));
		expect([...ini.matchAll(/^\[(.+)\]$/gm)].map(match => match[1])).toEqual(['config', 'CFW (emuMMC)', 'CFW (emuMMC SD01)', 'Stock', ...payloads.map(comp => comp.name)]);
		expect(ini).toMatch(/^autoboot=3$/m);
		expect(section('config')).toEqual(expect.arrayContaining(['bootwait=5', 'noticker=1', 'backlight=50']));
		for (const comp of payloads) {
			expect(ini).toContain(`payload=${comp.payload}`);
		}
	});

	it('boots another emuMMC by its folder and sets Exosphere keys per entry', () => {
		// Every emuMMC starts with the keys the catalog gives to the entry
		const emummc = Object.entries(BOOT_ENTRIES.find(entry => entry.id == 'emummc')!.keys).map(([key, value]) => `${key}=${value}`);
		expect(emummc).toEqual(expect.arrayContaining(['pkg3=atmosphere/package3', 'emummcforce=1']));
		expect(section('CFW (emuMMC)')).toEqual([...emummc, 'cal0blank=0', 'icon=bootloader/res/console_kitchen_emummc_hue.bmp']);
		expect(section('CFW (emuMMC SD01)')).toEqual([
			...emummc,
			'emupath=emuMMC/SD01',
			'usb3force=1',
			'memmode=1',
			'logopath=bootloader/res/console_kitchen_emummc-SD01_logo.bmp'
		]);
		expect(section('Stock')).toEqual(expect.arrayContaining(['logopath=bootloader/res/console_kitchen_stock_logo.bmp']));
		expect(result.files.find(file => file.path == 'README.md')?.content).toContain('**Launch → CFW (emuMMC SD01)**: `emuMMC/SD01`');
	});

	it('writes the configs of the selected components, whether their settings are changed or not', () => {
		expect(paths).toEqual(expect.arrayContaining([
			'config/tesla/config.ini',
			'config/sys-ftpd/config.ini',
			'config/MissionControl/missioncontrol.ini',
			'config/sys-clk/config.ini',
			'atmosphere/hosts/sysmmc.txt',
			// Nothing is changed in these
			'config/sys-patch/config.ini',
			'config/status-monitor/config.ini',
			'config/JKSV/JKSV.json'
		]));
	});

	it('writes only overclock profiles that change clocks', () => {
		expect(config('config/sys-clk/config.ini')).toContain('[0123456789ABCDEF]');
		expect(config('config/sys-clk/config.ini')).not.toContain('01007EF00011E000');
	});

	it('writes the FTP password into its config', () => {
		expect(config('config/sys-ftpd/config.ini')).toContain('hunter2');
	});

	it('writes the nogc patch only when it is set one way or the other', () => {
		const stratosphere = (nogc: string) => {
			const build = customBuild();
			build.tuning.stratosphere.nogc = nogc;
			return SWITCH.build({ ...build, lang: 'en', t: I18N.en }).configs.find(config => config.path == 'atmosphere/config/stratosphere.ini')?.content;
		};
		expect(stratosphere('auto')).toBeUndefined();
		expect(stratosphere('on')).toContain('nogc = 1');
		expect(stratosphere('off')).toContain('nogc = 0');
	});

	it('places images where hekate and Nyx look for them', () => {
		expect(result.assets.map(asset => asset.path)).toEqual([
			'bootloader/bootlogo.bmp',
			'bootloader/res/background.bmp',
			'bootloader/res/console_kitchen_emummc-SD01_logo.bmp',
			'bootloader/res/console_kitchen_stock_logo.bmp',
			'bootloader/res/console_kitchen_emummc_hue.bmp',
			'bootloader/res/console_kitchen_stock.bmp',
			'bootloader/res/console_kitchen_fusee_hue.bmp'
		]);
		expect(section('Stock')).toContain('icon=bootloader/res/console_kitchen_stock.bmp');
		expect(section('Fusee')).toContain('icon=bootloader/res/console_kitchen_fusee_hue.bmp');
	});

	it('points the page at the pictures of the gallery', () => {
		expect(result.assets.map(asset => asset.file)).toEqual([
			'appearance/bootlogo/hekate-a.png',
			undefined,
			undefined,
			'appearance/bootlogo/hekate-b.png',
			'appearance/icon/hekate-switch.png',
			undefined,
			'appearance/icon/hekate-payload.png'
		]);
	});

	it('embeds images into both installers', () => {
		const images = encodeBitmaps(BITMAPS);
		const { files } = SWITCH.build({
			...SWITCH.defaults(),
			appearance: { bootlogo: 'hekate-a', background: 'atmosphere-splash', logos: {}, icons: { emummc: 'hekate-switch' } },
			images,
			lang: 'en',
			t: I18N.en
		});
		for (const file of files.filter(file => file.path.startsWith('install.'))) {
			for (const [path, data] of Object.entries(images)) {
				expect(file.content).toContain(path);
				expect(file.content).toContain(data);
			}
		}
	});

	it('names assets after the options of their components', () => {
		const build = customBuild();
		const { files } = SWITCH.build({
			...build,
			selectedComponentIDs: resolveSelection(CATALOG, [...build.selectedComponentIDs, 'dbi_patcher']),
			tuning: { ...build.tuning, dbi_patcher: { language: 'ua' } },
			lang: 'en',
			t: I18N.en
		});
		for (const file of files.filter(file => file.path.startsWith('install.'))) {
			expect(file.content).toContain("'^translation_ua\\.bin$'");
			expect(file.content).toContain("'switch/DBI/translation.bin'");
			// The translated build of DBI lands over the original one
			expect(file.content.indexOf("'rashevskyv/DBIPatcher'")).toBeGreaterThan(file.content.indexOf("'rashevskyv/dbi'"));
		}
	});

	it('runs installers from the root of the card without arguments', () => {
		for (const file of installers) {
			expect(file.content).not.toMatch(/SdRoot E:|\[SD card root\]|path\/to/);
		}
		expect(result.files.find(file => file.path == 'README.md')?.content).toContain('`bash install.sh`');
	});
});

// Horizon OC has hekate load a KIP and a secure monitor of its own with CFW
describe('what hekate loads for a component', () => {
	const build = (ids: string[]) => {
		const custom = customBuild();
		return SWITCH.build({ ...custom, selectedComponentIDs: resolveSelection(CATALOG, [...custom.selectedComponentIDs, ...ids]), lang: 'en', t: I18N.en });
	};
	const config = (result: ReturnType<typeof build>, path: string) => result.configs.find(config => config.path == path)?.content;
	const readme = (result: ReturnType<typeof build>) => result.files.find(file => file.path == 'README.md')?.content;
	// Lines of the sections of an ini of hekate by their names
	const sections = (ini: string): {[name: string]: string[]} => Object.fromEntries(ini.trim().split('\n\n').map(section => {
		const [header, ...lines] = section.split('\n');
		return [header.slice(1, -1), lines];
	}));
	const PACKAGE = 'pkg3=atmosphere/package3';
	const MODULES = ['kip1=atmosphere/kips/hoc.kip', 'secmon=atmosphere/exosphere.bin'];
	const ENTRIES = ['CFW (emuMMC)', 'CFW (emuMMC SD01)'];

	// Named before the package, a secure monitor gives way to the one the package holds
	it('goes into the entries booting CFW after the package, and the stock system boots without it', () => {
		const menu = sections(config(build(['horizon_oc']), 'bootloader/hekate_ipl.ini')!);
		for (const entry of ENTRIES) {
			expect(menu[entry], entry).toEqual(expect.arrayContaining([PACKAGE, ...MODULES]));
			for (const key of MODULES) {
				expect(menu[entry].indexOf(key), `${entry}: ${key}`).toBeGreaterThan(menu[entry].indexOf(PACKAGE));
			}
		}
		expect(menu.Stock.filter(line => /^(kip1|secmon)=/.test(line))).toEqual([]);
	});

	it('leaves every entry booting CFW in More configs once more without it, with the rest of its keys, its logo and its icon', () => {
		const result = build(['horizon_oc']);
		const menu = sections(config(result, 'bootloader/hekate_ipl.ini')!);
		const spare = sections(config(result, SPARE_INI)!);
		expect(Object.keys(spare)).toEqual(ENTRIES.map(entry => `${entry} without Horizon OC`));
		for (const entry of ENTRIES) {
			expect(spare[`${entry} without Horizon OC`], entry).toEqual(menu[entry].filter(line => !MODULES.includes(line)));
		}
		expect(spare['CFW (emuMMC) without Horizon OC']).toEqual(expect.arrayContaining(['cal0blank=0', 'icon=bootloader/res/console_kitchen_emummc_hue.bmp']));
		expect(spare['CFW (emuMMC SD01) without Horizon OC']).toEqual(expect.arrayContaining(['emupath=emuMMC/SD01', 'logopath=bootloader/res/console_kitchen_emummc-SD01_logo.bmp']));
		expect(readme(result)).toContain('- **CFW (emuMMC SD01) without Horizon OC**');
	});

	it('writes nothing of it for a build without such a component', () => {
		const result = build([]);
		expect(result.configs.map(config => config.path)).not.toContain(SPARE_INI);
		expect(config(result, 'bootloader/hekate_ipl.ini')).not.toMatch(/^(kip1|secmon)=/m);
		expect(readme(result)).not.toContain('More configs');
	});
});

describe('configs of modules, overlays and applications', () => {
	// Configs by path of the recommended build with more components and changed options of their groups
	const configs = (ids: string[], changes: TuningConfig) => {
		const build = SWITCH.defaults();
		const { configs } = SWITCH.build({
			...build,
			selectedComponentIDs: resolveSelection(CATALOG, [...build.selectedComponentIDs, ...ids]),
			tuning: { ...build.tuning, ...Object.fromEntries(Object.entries(changes).map(([group, options]) => [group, { ...build.tuning[group], ...options }])) },
			lang: 'en',
			t: I18N.en
		});
		return Object.fromEntries(configs.map(config => [config.path, config.content]));
	};
	const lines = (content: string) => content.trim().split('\n');
	// Keys of an INI file by its sections
	const sections = (content: string): Record<string, Record<string, string>> => Object.fromEntries(content.trim().split('\n\n').map(section => {
		const [header, ...keys] = section.split('\n');
		return [header.slice(1, -1), Object.fromEntries(keys.map(key => key.split('=')))];
	}));
	const options = (group: string) => CATALOG.tuning.find(item => item.id == group)!.options.map(option => option.id);
	const PATHS = [
		'config/ultrahand/config.ini', 'config/ultrahand/overlays.ini', 'config/status-monitor/config.ini', 'config/sys-tune/config.ini', 'config/sys-con/config.ini',
		'config/JKSV/JKSV.json', 'config/JKSV/webdav.json', 'config/amiigo/settings.json', 'switch/DBI/dbi.config'
	];

	it('writes them for the selected components with nothing changed too, all but the WebDAV server that is not set', () => {
		expect(Object.keys(configs(['sys_tune', 'sys_con', 'amiigo'], {})).filter(path => PATHS.includes(path)).sort())
			.toEqual(PATHS.filter(path => path != 'config/JKSV/webdav.json').sort());
	});

	it('writes nothing for a component that is not selected', () => {
		const paths = Object.keys(configs([], { sys_tune: { shuffle: true }, sys_con: { mode: 'mitm' }, amiigo: { categoryMode: 2 } }));
		expect(paths.filter(path => ['config/sys-tune/config.ini', 'config/sys-con/config.ini', 'config/amiigo/settings.json'].includes(path))).toEqual([]);
	});

	it('writes every setting of Ultrahand in the order it keeps them, what it shows as what it hides', () => {
		const { ultrahand } = sections(configs([], {
			ultrahand: { default_lang: 'uk', hold_duration: 1500, show_clock: false, datetime_format: '%H:%M' }
		})['config/ultrahand/config.ini']);
		// Ultrahand saves its keys sorted, so the config reads line by line against the one of a console
		expect(Object.keys(ultrahand)).toEqual([...options('ultrahand').map(option => option.replace('show_', 'hide_')), 'key_combo'].sort());
		expect(ultrahand).toMatchObject({
			key_combo: 'L+DDOWN+RS',
			default_lang: 'uk',
			hold_duration: '1500',
			datetime_format: '%H:%M',
			hide_clock: 'true',
			hide_battery: 'true',
			hide_packages: 'false',
			swipe_to_open: 'true',
			extended_widget_backdrop: 'false'
		});
	});

	it('writes the combo of the overlay menu into the config of Ultrahand too, as it reads its own first', () => {
		const picked = configs([], { tesla: { key_combo: ['ZL', 'ZR', 'DDOWN'] } });
		expect(picked['config/tesla/config.ini']).toContain('key_combo=ZL+ZR+DDOWN');
		expect(picked['config/ultrahand/config.ini']).toContain('\nkey_combo=ZL+ZR+DDOWN\n');
		// Without buttons the combo is left to the menu
		const none = configs([], { tesla: { key_combo: [] } });
		expect(none['config/tesla/config.ini']).toBeUndefined();
		expect(none['config/ultrahand/config.ini']).not.toContain('key_combo');
	});

	it('writes the list of overlays of Ultrahand, a section for every selected overlay by the name of its file', () => {
		const ini = sections(configs(['fps_locker'], {
			ultrahand_status_monitor: {
				priority: 3, star: true, use_launch_args: true, launch_args: '--microOverlay', key_combo: ['ZL', 'ZR', 'DUP'],
				// A mode without a name is being filled in yet, one without a combo keeps its place in the lists
				modes: [['Micro', 'L+R+DDOWN', '--microOverlay'], ['', 'ZL+ZR+L', '--nameless'], ['Other', '', '--other']]
			},
			ultrahand_fps_locker: { hide: true, custom_name: 'FPS' }
		})['config/ultrahand/overlays.ini']);
		// The recommended build has Status Monitor and sys-clk, sections go in the order of the catalog
		expect(Object.keys(ini)).toEqual(['Status-Monitor-Overlay.ovl', 'FPSLocker.ovl', 'sys-clk-overlay.ovl']);
		expect(ini['Status-Monitor-Overlay.ovl']).toEqual({
			priority: '3', star: 'true', hide: 'false', use_launch_args: 'true', launch_args: '--microOverlay', custom_name: '', custom_version: '',
			key_combo: 'ZL+ZR+DUP', force_support: 'false', mode_args: '(--microOverlay, --other)', mode_combos: '(L+R+DDOWN, )', mode_labels: '(Micro, Other)'
		});
		expect(ini['FPSLocker.ovl']).toEqual({
			priority: '20', star: 'false', hide: 'true', use_launch_args: 'false', launch_args: '', custom_name: 'FPS', custom_version: '', key_combo: '', force_support: 'false'
		});
	});

	it('writes the list of overlays only for Ultrahand', () => {
		const paths = (ids: string[]) => SWITCH.build({ ...SWITCH.defaults(), selectedComponentIDs: resolveSelection(CATALOG, ids), lang: 'en', t: I18N.en })
			.configs.map(config => config.path);
		expect(paths(['ultrahand', 'status_monitor'])).toContain('config/ultrahand/overlays.ini');
		expect(paths(['ultrahand'])).not.toContain('config/ultrahand/overlays.ini');
		expect(paths(['ovlmenu', 'status_monitor'])).not.toContain('config/ultrahand/overlays.ini');
	});

	it('writes the volumes of sys-tune as parts of one and its path from the root of the card', () => {
		const ini = (changes: TuningConfig[string]) => lines(configs(['sys_tune'], { sys_tune: changes })['config/sys-tune/config.ini']);
		expect(ini({ volume: 35, shuffle: true, load_path: 'sdmc:/music/' }))
			.toEqual(['[config]', 'shuffle=1', 'repeat=1', 'volume=0.35', 'global_volume=1', 'load_path=/music/', '', '[title]', 'default=1']);
		expect(ini({ title_default: false })).toEqual(['[config]', 'shuffle=0', 'repeat=1', 'volume=1', 'global_volume=1', '', '[title]', 'default=0']);
	});

	it('writes the settings of sys-con ahead of the profiles of controllers it ships', () => {
		const ini = configs(['sys_con'], { sys_con: { discovery_mode: 1, discovery_vidpid: '054c-*, 057e-2009', auto_add_controller: false } })['config/sys-con/config.ini'];
		expect(ini).toContain('\n[default]\n');
		expect(ini).not.toContain('{{');
		expect(lines(ini.slice(0, ini.indexOf('\n\n')))).toEqual([
			'[global]',
			'mode=hiddbg',
			'polling_timeout_ms=10',
			'polling_thread_priority=41',
			'log_level=3',
			'discovery_mode=1',
			'discovery_vidpid=054c-*,057e-2009',
			'auto_add_controller=0',
			'network_controller=0',
			'network_controller_port=56789'
		]);
	});

	it('writes the config of Status Monitor with a section of every mode, each with all of its settings', () => {
		const SECTIONS = {
			'status-monitor': 'status_monitor',
			full: 'status_monitor_full',
			mini: 'status_monitor_mini',
			micro: 'status_monitor_micro',
			'fps-counter': 'status_monitor_fps_counter',
			'fps-graph': 'status_monitor_fps_graph',
			game_resolutions: 'status_monitor_game_resolutions'
		};
		const content = configs([], {
			status_monitor: { touch_screen: false, key_combo: ['ZL', 'ZR'] },
			status_monitor_mini: { show: ['CPU', 'FPS'], background_color: '#000F' },
			status_monitor_fps_graph: { layer_height_align: 'bottom' }
		})['config/status-monitor/config.ini'];
		const ini = sections(content);

		expect(Object.keys(ini)).toEqual(Object.keys(SECTIONS));
		for (const [section, group] of Object.entries(SECTIONS)) {
			expect(Object.keys(ini[section]).sort(), section).toEqual(options(group).sort());
		}
		// A key without its option would be written empty
		expect(content).not.toMatch(/=$|\{\{/m);
		expect(ini['status-monitor']).toMatchObject({ key_combo: 'ZL+ZR', touch_screen: 'false', motion_control: 'true', battery_time_left_refreshrate: '60' });
		expect(ini.mini).toMatchObject({ show: 'CPU+FPS', background_color: '#000F', cat_color: '#FFFF', handheld_font_size: '15' });
		expect(ini.micro).toMatchObject({ show: 'CPU+GPU+RAM+BRD+FAN+FPS', cat_color: '#FCCF' });
		expect(ini['fps-graph']).toMatchObject({ layer_height_align: 'bottom', perfect_line_color: '#0C0F' });
		expect(ini.game_resolutions.refresh_rate).toBe('10');
	});

	it('writes a setting of a mode of Status Monitor into the section of the mode', () => {
		expect(configs([], { status_monitor_game_resolutions: { refresh_rate: 30 } })['config/status-monitor/config.ini']).toContain('[game_resolutions]\nrefresh_rate=30\n');
	});

	it('writes the Bluetooth section of MissionControl only for a name or an address', () => {
		const ini = (changes: TuningConfig[string]) => configs(['missioncontrol'], { missioncontrol: changes })['config/MissionControl/missioncontrol.ini'];
		expect(ini({ host_address: '04:20:69:04:20:69' })).toContain('[bluetooth]\nhost_address=04:20:69:04:20:69\n\n[misc]');
		expect(ini({ enable_rumble: false })).not.toContain('[bluetooth]');
		expect(ini({ dualsense_adaptive_trigger_travel: 40 })).toContain('dualsense_adaptive_trigger_travel=40');
	});

	it('writes the config of DBI with every setting of its sections, each into its own', () => {
		const SECTIONS = {
			General: 'dbi_general',
			Album: 'dbi_album',
			Filtering: 'dbi_filtering',
			ActivityLog: 'dbi_activity_log',
			MainMenu: 'dbi_main_menu',
			Applications: 'dbi_applications',
			Install: 'dbi_install',
			MTP: 'dbi_mtp',
			FTP: 'dbi_ftp',
			HTTP: 'dbi_http',
			'Access point': 'dbi_access_point',
			'MTP Storages': 'dbi_mtp_storages',
			FB2: 'dbi_fb2',
			'Disabled titles to check for updates': 'dbi_disabled_titles_to_check_for_updates'
		};
		const content = configs([], {
			dbi_general: { ExitToHomeScreen: true, AppSorting: ['Size', 'Name'], SavesFolder: '', CustomDNS: '1.1.1.1' },
			dbi_mtp: { TurnOffScreen: true },
			dbi_ftp: { Port: 2121 },
			dbi_access_point: { UseAP: true, SSID: 'deck', Password: 'hunter22' },
			dbi_fb2: { Theme: 'Night', Orientation: 90 }
		})['switch/DBI/dbi.config'];
		// Keys of the config by its sections, the commented examples of its lists left out
		const ini: {[section: string]: {[key: string]: string}} = {};
		let section = '';
		for (const line of content.split('\n')) {
			const [, header] = line.match(/^\[(.+)\]$/) ?? [];
			const [, key, value] = line.match(/^([^;=]+?) ?= ?(.*)$/) ?? [];
			if (header) ini[section = header] = {};
			else if (key) ini[section][key] = value;
		}
		// The storages of MTP are numbered and spelled with spaces: `5: SD Card install`
		const plain = (key: string) => key.replace(/^\d: | /g, '').toLowerCase();
		// A list is the rows of its section, not a key of it
		const settings = (group: string) => CATALOG.tuning.find(item => item.id == group)!.options.filter(option => option.type != 'list').map(option => option.id);

		for (const [name, group] of Object.entries(SECTIONS)) {
			expect(Object.keys(ini[name]).map(plain), name).toEqual(settings(group).map(plain));
		}
		expect(content).not.toContain('{{');
		// A folder left empty stays the one DBI ships with
		expect(ini.General).toMatchObject({ ExitToHomeScreen: 'true', AppSorting: 'Size,Name', SavesFolder: 'sdmc:/switch/DBI/saves', CustomDNS: '1.1.1.1', TimeShow: 'true' });
		expect(ini.MTP).toMatchObject({ TurnOffScreen: 'true', AddBaseUpdate: 'false', BufferSize: '512' });
		expect(ini.FTP).toMatchObject({ TurnOffScreen: 'false', Port: '2121' });
		expect(ini.HTTP.Port).toBe('1234');
		expect(ini['Access point']).toEqual({ UseAP: 'true', SSID: 'deck', Password: 'hunter22', Use5GHz: 'false', Hidden: 'false' });
		expect(ini['MTP Storages']).toMatchObject({ '1: SD Card': 'true', '9: Gamecard': 'false' });
		expect(ini.FB2).toEqual({ Theme: 'Night', Hyphenation: 'true', Orientation: '90' });
		// The lists go with the rows DBI ships until they are changed
		expect(ini['Network sources']).toEqual({});
		expect(ini['Local sources']).toEqual({ DBILogs: 'sdmc:/switch/DBI/logs' });
		expect(ini['MTP custom storages']).toEqual({ DBILogs: 'sdmc:/switch/DBI/logs' });
		expect(lines(content)).toContain('010072400E04A000; Pokemon Cafe Mix');
	});

	it('leaves the DNS servers of DBI out until they are set', () => {
		expect(configs([], {})['switch/DBI/dbi.config']).not.toContain('CustomDNS');
	});

	it('writes the lists of DBI a line per row, the rows without a name left out', () => {
		const rows = lines(configs([], {
			dbi_network_sources: { sources: [['Home server', 'ApacheHTTP', 'http://192.168.1.47/Nintendo/Switch/?a=b'], ['', 'FTP', 'ftp://192.168.1.24/']] },
			dbi_local_sources: { sources: [['Homebrew', 'sdmc:/switch'], [' Logs ', 'sdmc:/switch/DBI/logs']] },
			dbi_mtp_custom_storages: { storages: [] },
			dbi_title_name_override: { names: [['010023901191c000', 'Naheulbeuk']] },
			dbi_disabled_titles_to_check_for_updates: { titles: [['010072400e04a000', ''], ['0100F2C0115B6000', 'TotK']] }
		})['switch/DBI/dbi.config']);
		expect(rows).toEqual(expect.arrayContaining([
			'Home server=ApacheHTTP|http://192.168.1.47/Nintendo/Switch/?a=b',
			'Homebrew=sdmc:/switch',
			'Logs=sdmc:/switch/DBI/logs',
			// Titles go by their IDs in upper case, a note follows its ID only when there is one
			'010023901191C000=Naheulbeuk',
			'010072400E04A000',
			'0100F2C0115B6000; TotK'
		]));
		expect(rows.filter(row => row.includes('ftp://192.168.1.24/') || row.startsWith('DBILogs='))).toEqual([]);
	});

	// A row of a list starts a line of its config, and a line is all it takes to end the config inside an installer
	it('keeps a row of a list from ending its config inside the installers', () => {
		const build = SWITCH.defaults();
		const { files } = SWITCH.build({
			...build,
			tuning: {
				...build.tuning,
				dbi_local_sources: { sources: [['\'@', 'x'], ['\'@; New-Item pwned', 'x']] },
				dbi_disabled_titles_to_check_for_updates: { BlockAllTitlesWithLFS: true, titles: [['CONSOLE_KITCHEN_EOF', ''], ['X', 'touch pwned']] }
			},
			lang: 'en',
			t: I18N.en
		});
		const sh = lines(files.find(file => file.path == 'install.sh')!.content);
		const ps1 = lines(files.find(file => file.path == 'install.ps1')!.content);
		// The rows are written, only not from the start of their lines
		expect(sh).toEqual(expect.arrayContaining([' CONSOLE_KITCHEN_EOF', 'X; touch pwned', ' \'@=x', ' \'@; New-Item pwned=x']));
		expect(sh.filter(line => line == 'CONSOLE_KITCHEN_EOF').length).toBe(sh.filter(line => line.endsWith('<< \'CONSOLE_KITCHEN_EOF\'')).length);
		expect(ps1.filter(line => line.startsWith('\'@')).length).toBe(ps1.filter(line => line.endsWith('@\'')).length);
	});

	it('writes the locations of DBI into a file of their own, a section per location, only when there are some', () => {
		const file = (locations: string[][]) => configs([], { dbi_locations: { locations } })['switch/DBI/dbi.locations'];
		expect(file([])).toBeUndefined();
		expect(file([['', 'FTP', 'ftp://192.168.1.24/']])).toBeUndefined();
		expect(lines(file([['Home', 'ApacheHTTP', 'http://192.168.1.47/'], ['', 'FTP', ''], ['NAS', 'SFTP', 'sftp://me:hunter2@nas/']]))).toEqual([
			'[Location_0]', 'Name=Home', 'Type=ApacheHTTP', 'URL=http://192.168.1.47/',
			'[Location_1]', 'Name=NAS', 'Type=SFTP', 'URL=sftp://me:hunter2@nas/'
		]);
	});

	it('writes the config of DBI instead of downloading the one of its release', () => {
		const build = SWITCH.defaults();
		const { files } = SWITCH.build({ ...build, lang: 'en', t: I18N.en });
		for (const file of files.filter(file => file.path.startsWith('install.'))) {
			expect(file.content).toContain("'switch/DBI/dbi.config'");
			expect(file.content).not.toContain('dbi\\.config');
		}
		const { configs } = SWITCH.build({ ...build, selectedComponentIDs: resolveSelection(CATALOG, []), lang: 'en', t: I18N.en });
		expect(configs.map(config => config.path)).not.toContain('switch/DBI/dbi.config');
	});

	it('writes every setting of JKSV as valid JSON, switches as numbers', () => {
		const json = JSON.parse(configs([], { jksv: { ExportToZip: false, UIAnimationScaling: 1.25, WorkingDirectory: 'sdmc:/saves "of mine"' } })['config/JKSV/JKSV.json']);
		expect(Object.keys(json)).toEqual(CATALOG.tuning.find(group => group.id == 'jksv')!.options.map(option => option.id));
		expect(json).toMatchObject({ WorkingDirectory: 'sdmc:/saves "of mine"', ExportToZip: 0, HoldForDeletion: 1, ZipCompressionLevel: 6, UIAnimationScaling: 1.25 });
	});

	it('writes the WebDAV server of JKSV only when it is set, the login only when it is given', () => {
		const webdav = (options: TuningConfig[string]) => configs([], { jksv_webdav: options })['config/JKSV/webdav.json'];
		expect(JSON.parse(webdav({ origin: 'https://dav.example.com', basepath: '/saves/', username: 'me', password: 'hunter2' })))
			.toEqual({ origin: 'https://dav.example.com', basepath: 'saves', username: 'me', password: 'hunter2' });
		expect(JSON.parse(webdav({ origin: 'https://dav.example.com' }))).toEqual({ origin: 'https://dav.example.com' });
		expect(webdav({ username: 'me', password: 'hunter2' })).toBeUndefined();
	});

	it('writes the settings of Amiigo as it reads them', () => {
		const json = JSON.parse(configs(['amiigo'], { amiigo: { categoryMode: 2, saveAmiiboImages: true } })['config/amiigo/settings.json']);
		expect(json).toEqual({ categoryMode: 2, useRandomisedUUID: false, saveAmiiboImages: true });
	});
});
